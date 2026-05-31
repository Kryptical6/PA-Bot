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
      .setDescription(
        `Category: **${label}**\n\nPlease wait a moment.\n\n` +
        `Note: the Suspend action is not available in training because post examples are not generated ` +
        `and therefore cannot be checked for free models, stolen assets, or AI-generated content. ` +
        `In training, suspected AI content is treated as a standard denial.`
      )
      .setTimestamp()],
    components: [],
  });

  const session = await createSession(i.user.id, category);
  const post    = await generateTrainingPost(category);

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
    components: buildPostActionRows(session.id, post.category) as any,
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

  const correct          = action === post.correct_action;
  const { score, total } = await recordAnswer(sessionId, correct);

  // Disable all action buttons
  const disabledRows = buildPostActionRows(sessionId, post.category).map(row => {
    (row.components as any[]).forEach((btn: any) => {
      if (typeof btn.setDisabled === 'function') btn.setDisabled(true);
    });
    return row;
  });

  await i.update({ components: disabledRows as any });

  await i.followUp({
    embeds: [buildFeedbackEmbed(post, action, null, correct, score, total)],
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

  // Scoring:
  // Correct if: (a) correct_action is "deny" AND chosen label loosely matches the violation
  // We match by checking if the violation string (from AI) is contained in the label or vice versa,
  // or if correct_action is simply "deny" - we give credit for picking any denial reason
  // since the trainee already correctly identified it as a deny.
  // If correct_action is "approve" or "request_pof", deny is wrong regardless of reason.
  const correct = post.correct_action === 'deny';
  const { score, total } = await recordAnswer(sessionId, correct);

  // Dismiss the ephemeral reason picker
  await i.update({ components: [] });

  // Edit the original DM message to show disabled action buttons
  try {
    const disabledRows = buildPostActionRows(sessionId, post.category).map(row => {
      (row.components as any[]).forEach((btn: any) => {
        if (typeof btn.setDisabled === 'function') btn.setDisabled(true);
      });
      return row;
    });
    // The interaction that opened the select was ephemeral, so we follow up to the DM
    await i.followUp({
      embeds: [buildFeedbackEmbed(post, 'deny', chosenLabel, correct, score, total)],
      components: [buildContinueRow(sessionId)],
    });
  } catch { /* silent */ }
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

  const post = await generateTrainingPost(session.category);

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
    components: buildPostActionRows(sessionId, post.category) as any,
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
