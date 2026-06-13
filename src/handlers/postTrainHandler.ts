import {
  Interaction,
  EmbedBuilder,
  Colors,
  StringSelectMenuInteraction,
  ButtonInteraction,
} from 'discord.js';
import {
  generateTrainingPost,
  buildPostEmbed,
  buildPostActionRows,
  buildDenyReasonSelect,
  buildFeedbackEmbed,
  buildContinueRow,
  buildSummaryEmbed,
  buildCategorySelect,
  createSession,
  getActiveSession,
  getShownScenarioIds,
  endSession,
  savePostToSession,
  recordAnswer,
  TRAIN_CATEGORIES,
  GeneratedPost,
} from '../services/postTrainService';

// ENTRY POINT
// Called from interactionHandler.ts for customIds starting with "pt_" or equal to "pt_category_select".
export async function handlePostTrainInteraction(i: Interaction): Promise<void> {
  if (i.isStringSelectMenu()) {
    if (i.customId === 'pt_category_select') { await handleCategorySelect(i); return; }
    if (i.customId.startsWith('pt_deny_sel:')) { await handleDenySelect(i); return; }
  }

  if (!i.isButton()) return;

  const [prefix, ...rest] = i.customId.split(':');

  if (prefix === 'pt_action')    { await handleAction(i, rest);   return; }
  if (prefix === 'pt_deny_open') { await handleDenyOpen(i, rest); return; }
  if (prefix === 'pt_continue')  { await handleContinue(i, rest); return; }
  if (prefix === 'pt_end')       { await handleEnd(i, rest);      return; }
}

// CATEGORY SELECTED - create session and send first post
async function handleCategorySelect(i: StringSelectMenuInteraction): Promise<void> {
  const category = i.values[0];
  const label    = TRAIN_CATEGORIES[category] ?? category;

  await i.update({
    embeds: [new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle('Generating your first post...')
      .setDescription(`Category: **${label}**\n\nPlease wait a moment.`)
      .setTimestamp()],
    components: [],
  });

  const session = await createSession(i.user.id, category);
  const post    = await generateTrainingPost(category, getShownScenarioIds(session));

  if (!post) {
    await i.editReply({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle('Generation Failed')
        .setDescription('Failed to generate a training post. Please try `/post-train` again.')
        .setTimestamp()],
      components: [],
    });
    await endSession(session.id);
    return;
  }

  await savePostToSession(session.id, post);

  await i.editReply({
    embeds: [buildPostEmbed(post, 0, 0)],
    components: await buildPostActionRows(session.id, post.category) as any,
  });
}

// APPROVE or REQUEST_POF button pressed
async function handleAction(i: ButtonInteraction, rest: string[]): Promise<void> {
  const [sessionIdStr, action] = rest;
  const sessionId = parseInt(sessionIdStr, 10);

  const session = await getActiveSession(i.user.id);
  if (!session || session.id !== sessionId) {
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Red)
        .setDescription('This session is no longer active or does not belong to you.')],
      ephemeral: true,
    });
    return;
  }

  const post: GeneratedPost | null = session.last_post_data ?? null;
  if (!post) {
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Red)
        .setDescription('Could not find the current post. Please end this session and start a new one.')],
      ephemeral: true,
    });
    return;
  }

  const answerAction = action === 'approve_message' ? 'approve' : action;
  const correct      = answerAction === post.correct_action;
  const { score, total } = await recordAnswer(sessionId, correct);

  const disabledRows = await buildPostActionRows(sessionId, post.category, true);

  await i.update({ components: disabledRows as any });

  await i.followUp({
    embeds: [buildFeedbackEmbed(post, answerAction, null, correct, score, total)],
    components: [buildContinueRow(sessionId)],
  });
}

// DENY button pressed - show the denial reason select filtered to this post's category
async function handleDenyOpen(i: ButtonInteraction, rest: string[]): Promise<void> {
  const sessionId = parseInt(rest[0], 10);

  const session = await getActiveSession(i.user.id);
  if (!session || session.id !== sessionId) {
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Red)
        .setDescription('This session is no longer active or does not belong to you.')],
      ephemeral: true,
    });
    return;
  }

  const post: GeneratedPost | null = session.last_post_data ?? null;
  if (!post) {
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Red)
        .setDescription('Could not find the current post. Please end this session and start a new one.')],
      ephemeral: true,
    });
    return;
  }

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle('Select Denial Reason')
      .setDescription('Choose the denial reason that applies to this post.')
      .setTimestamp()],
    components: [await buildDenyReasonSelect(sessionId, post.category)],
    ephemeral: true,
  });
}

// DENIAL REASON SELECTED - score the answer
async function handleDenySelect(i: StringSelectMenuInteraction): Promise<void> {
  const sessionId = parseInt(i.customId.split(':')[1], 10);
  const chosenLabel = i.values[0];

  const session = await getActiveSession(i.user.id);
  if (!session || session.id !== sessionId) {
    await i.update({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Red)
        .setDescription('This session is no longer active.')],
      components: [],
    });
    return;
  }

  const post: GeneratedPost | null = session.last_post_data ?? null;
  if (!post) {
    await i.update({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Red)
        .setDescription('Could not find the current post.')],
      components: [],
    });
    return;
  }

  const acceptedLabels = post.correct_denial_labels?.length
    ? post.correct_denial_labels
    : post.violation
    ? [post.violation]
    : [];
  const correct = post.correct_action === 'deny'
    && acceptedLabels.some(label => label.toLowerCase() === chosenLabel.toLowerCase());
  const { score, total } = await recordAnswer(sessionId, correct);
  const disabledRows = await buildPostActionRows(sessionId, post.category, true);

  await i.update({ components: disabledRows as any });

  await i.followUp({
    embeds: [buildFeedbackEmbed(post, 'deny', chosenLabel, correct, score, total)],
    components: [buildContinueRow(sessionId)],
  });
}

// CONTINUE BUTTON - generate next post
async function handleContinue(i: ButtonInteraction, rest: string[]): Promise<void> {
  const sessionId = parseInt(rest[0], 10);

  const session = await getActiveSession(i.user.id);
  if (!session || session.id !== sessionId) {
    await i.update({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Red)
        .setDescription('This session is no longer active.')],
      components: [],
    });
    return;
  }

  await i.update({
    embeds: [new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle('Generating next post...')
      .setDescription('Please wait a moment.')
      .setTimestamp()],
    components: [],
  });

  const post = await generateTrainingPost(session.category, getShownScenarioIds(session));

  if (!post) {
    await i.editReply({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle('Generation Failed')
        .setDescription('Failed to generate a post. Please try `/post-train` again.')
        .setTimestamp()],
      components: [],
    });
    await endSession(sessionId);
    return;
  }

  await savePostToSession(sessionId, post);

  await i.editReply({
    embeds: [buildPostEmbed(post, session.score, session.total)],
    components: await buildPostActionRows(sessionId, post.category) as any,
  });
}

// END BUTTON
async function handleEnd(i: ButtonInteraction, rest: string[]): Promise<void> {
  const sessionId = parseInt(rest[0], 10);

  const session = await getActiveSession(i.user.id);
  if (!session || session.id !== sessionId) {
    await i.update({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Red)
        .setDescription('This session is no longer active.')],
      components: [],
    });
    return;
  }

  await endSession(sessionId);

  await i.update({
    embeds: [buildSummaryEmbed(session.score, session.total, i.user.id)],
    components: [],
  });
}
