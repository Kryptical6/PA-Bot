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
// Called from interactionHandler.ts for any interaction whose customId
// starts with "pt_" or is "pt_category_select".
export async function handlePostTrainInteraction(i: Interaction): Promise<void> {
  if (i.isStringSelectMenu() && i.customId === 'pt_category_select') {
    await handleCategorySelect(i);
    return;
  }

  if (!i.isButton()) return;

  const [prefix, ...rest] = i.customId.split(':');

  if (prefix === 'pt_action')   { await handleAction(i, rest);   return; }
  if (prefix === 'pt_continue') { await handleContinue(i, rest); return; }
  if (prefix === 'pt_end')      { await handleEnd(i, rest);      return; }
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
    components: buildPostActionRows(session.id),
  });
}

// ACTION BUTTON PRESSED
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

  // Disable all action buttons to prevent double-answering
  const disabledRows = buildPostActionRows(sessionId).map(row => {
    row.components.forEach((btn: any) => btn.setDisabled(true));
    return row;
  });

  await i.update({ components: disabledRows });

  await i.followUp({
    embeds: [buildFeedbackEmbed(post, action, correct, score, total)],
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
    components: buildPostActionRows(sessionId),
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
