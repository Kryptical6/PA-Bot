import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
  EmbedBuilder,
  Colors,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  Interaction,
  TextChannel,
} from 'discord.js';
import { isSPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import {
  generateTrainingPost,
  buildPostEmbed,
  buildDenyReasonSelect,
  buildCategorySelect,
  TRAIN_CATEGORIES,
  GeneratedPost,
} from '../../services/postTrainService';

// ─── SLASH COMMAND ────────────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('senior-post-train')
  .setDescription('Senior training mode: correct AI decisions to improve the training system (SPA and above)')
  .addSubcommand(sub => sub
    .setName('start')
    .setDescription('Start a senior training session in your DMs')
  )
  .addSubcommand(sub => sub
    .setName('corrections')
    .setDescription('View submitted corrections')
    .addStringOption(o => o
      .setName('category')
      .setDescription('Filter by category (leave blank for all)')
      .setRequired(false)
      .addChoices(
        { name: 'For Hire (FH)',           value: 'fh'             },
        { name: 'Looking For Developer',   value: 'lfd'            },
        { name: 'Skill Role Applications', value: 'skill_role'     },
        { name: 'Sell Creations',          value: 'sell_creations' },
        { name: 'Investor Posts',          value: 'investors'      },
        { name: 'Roblox Advertising',      value: 'advertising'    },
        { name: 'Reviews',                 value: 'reviews'        },
      )
    )
  )
  .addSubcommand(sub => sub
    .setName('remove')
    .setDescription('Remove a correction by ID')
    .addIntegerOption(o => o
      .setName('id')
      .setDescription('The correction ID to remove')
      .setRequired(true)
    )
  );

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) {
    await i.reply({ embeds: [errorEmbed('This command is available to SPA and above only.')], ephemeral: true });
    return;
  }

  const sub = i.options.getSubcommand();

  if (sub === 'start') {
    const existing = await sql`
      SELECT 1 FROM post_train_senior_sessions
      WHERE user_id = ${i.user.id} AND status = 'active'
    `;
    if (existing.length > 0) {
      await i.reply({
        embeds: [new EmbedBuilder()
          .setColor(Colors.Orange)
          .setTitle('Session Already Active')
          .setDescription('You already have an active senior training session in your DMs.')
          .setTimestamp()],
        ephemeral: true,
      });
      return;
    }

    try {
      await i.user.createDM();
      await i.user.send({
        embeds: [new EmbedBuilder()
          .setColor(Colors.Blue)
          .setTitle('Senior Post Training')
          .setDescription(
            `Welcome to **Senior Post Training**.\n\n` +
            `You will be shown AI-generated training posts one at a time. ` +
            `For each post, select what the **correct** action should be.\n\n` +
            `If your answer differs from the AI's, or the AI asks for clarification, ` +
            `a modal will open for you to explain your reasoning. ` +
            `Your corrections are saved and injected into the AI's system prompt to improve accuracy.\n\n` +
            `Select a category to begin.`
          )
          .setTimestamp()],
        components: [buildCategorySelect()],
      });

      await i.reply({
        embeds: [new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle('Check your DMs')
          .setDescription('A DM has been sent to start your senior training session.')
          .setTimestamp()],
        ephemeral: true,
      });
    } catch {
      await i.reply({
        embeds: [errorEmbed('Could not send you a DM. Please enable DMs from server members and try again.')],
        ephemeral: true,
      });
    }
  }

  else if (sub === 'corrections') {
    await i.deferReply({ ephemeral: true });
    const category = i.options.getString('category') ?? null;

    const rows = category
      ? await sql`SELECT * FROM post_train_corrections WHERE category = ${category} AND active = true ORDER BY created_at DESC LIMIT 20`
      : await sql`SELECT * FROM post_train_corrections WHERE active = true ORDER BY created_at DESC LIMIT 20`;

    if (rows.length === 0) {
      await i.editReply({ embeds: [new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('No Corrections Found')
        .setDescription('No corrections have been submitted yet.')
        .setTimestamp()] });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle('Senior Training Corrections')
      .setDescription(`${rows.length} correction(s) found.`)
      .setTimestamp();

    for (const r of rows) {
      const categoryLabel = TRAIN_CATEGORIES[r.category] ?? r.category;
      embed.addFields({
        name: `ID ${r.id} - ${categoryLabel} - <@${r.submitted_by}>`,
        value: [
          `**AI said:** ${r.ai_action}`,
          `**Correct:** ${r.correct_action}${r.denial_reason ? ` (${r.denial_reason})` : ''}`,
          `**Reasoning:** ${r.thought_process.slice(0, 200)}${r.thought_process.length > 200 ? '...' : ''}`,
        ].join('\n'),
      });
    }

    await i.editReply({ embeds: [embed] });
  }

  else if (sub === 'remove') {
    await i.deferReply({ ephemeral: true });
    const id = i.options.getInteger('id', true);
    const [row] = await sql`SELECT * FROM post_train_corrections WHERE id = ${id}`;
    if (!row) {
      await i.editReply({ embeds: [errorEmbed(`No correction found with ID ${id}.`)] });
      return;
    }
    await sql`UPDATE post_train_corrections SET active = false WHERE id = ${id}`;
    await i.editReply({ embeds: [new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('Correction Removed')
      .setDescription(`Correction #${id} has been deactivated.`)
      .setTimestamp()] });
  }
}

// ─── INTERACTION HANDLER ──────────────────────────────────────────────────────
// Called from interactionHandler.ts for spt_ prefixed interactions and
// pt_category_select on senior sessions (detected by checking active senior session)

export async function handleSeniorPostTrainInteraction(i: Interaction): Promise<void> {
  if (i.isStringSelectMenu()) {
    if (i.customId === 'spt_deny_sel') { await handleSeniorDenySelect(i); return; }
  }
  if (!i.isButton() && !i.isModalSubmit()) return;

  const id = (i as any).customId as string;
  const [prefix, ...rest] = id.split(':');

  if (prefix === 'spt_action')    { await handleSeniorAction(i as ButtonInteraction, rest);   return; }
  if (prefix === 'spt_deny_open') { await handleSeniorDenyOpen(i as ButtonInteraction, rest); return; }
  if (prefix === 'spt_continue')  { await handleSeniorContinue(i as ButtonInteraction, rest); return; }
  if (prefix === 'spt_end')       { await handleSeniorEnd(i as ButtonInteraction, rest);      return; }
  if (prefix === 'spt_thought_modal') { await handleThoughtModal(i as ModalSubmitInteraction, rest); return; }
  if (prefix === 'spt_deny_thought_modal') { await handleDenyThoughtModal(i as ModalSubmitInteraction, rest); return; }
}

// Checks if the user has an active senior session — used by interactionHandler
// to route pt_category_select to the senior flow instead of the normal flow
export async function hasSeniorSession(userId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM post_train_senior_sessions
    WHERE user_id = ${userId} AND status = 'active'
  `;
  return rows.length > 0;
}

// Called when a user with an active senior session picks a category
export async function handleSeniorCategorySelect(i: StringSelectMenuInteraction): Promise<void> {
  const category = i.values[0];
  const label    = TRAIN_CATEGORIES[category] ?? category;

  await i.update({
    embeds: [new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle('Generating post...')
      .setDescription(`Category: **${label}**`)
      .setTimestamp()],
    components: [],
  });

  // Close any stale active session first
  await sql`
    UPDATE post_train_senior_sessions SET status = 'ended', ended_at = NOW()
    WHERE user_id = ${i.user.id} AND status = 'active'
  `;

  const [session] = await sql`
    INSERT INTO post_train_senior_sessions (user_id, category, status)
    VALUES (${i.user.id}, ${category}, 'active')
    RETURNING *
  `;

  const post = await generateTrainingPost(category);
  if (!post) {
    await i.editReply({ embeds: [errorEmbed('Failed to generate post. Try again.')], components: [] });
    await sql`UPDATE post_train_senior_sessions SET status = 'ended', ended_at = NOW() WHERE id = ${session.id}`;
    return;
  }

  await sql`
    UPDATE post_train_senior_sessions SET last_post_data = ${JSON.stringify(post)}::jsonb WHERE id = ${session.id}
  `;

  await i.editReply({
    embeds: [buildSeniorPostEmbed(post, session.id, 'AI Answer: Not yet judged')],
    components: buildSeniorActionRows(session.id, post.category),
  });
}

// ─── ACTION HANDLERS ──────────────────────────────────────────────────────────

async function handleSeniorAction(i: ButtonInteraction, rest: string[]): Promise<void> {
  const [sessionIdStr, action] = rest;
  const sessionId = parseInt(sessionIdStr, 10);

  const [session] = await sql`SELECT * FROM post_train_senior_sessions WHERE id = ${sessionId} AND user_id = ${i.user.id} AND status = 'active'`;
  if (!session) { await i.reply({ embeds: [errorEmbed('Session not found.')], ephemeral: true }); return; }

  const post: GeneratedPost = session.last_post_data;

  // Disable buttons immediately
  const disabledRows = buildSeniorActionRows(sessionId, post.category).map(row => {
    (row.components as any[]).forEach((btn: any) => { if (typeof btn.setDisabled === 'function') btn.setDisabled(true); });
    return row;
  });
  await i.update({ components: disabledRows });

  const aiAction = post.correct_action;

  if (action === aiAction) {
    // Senior agrees with AI — ask them to confirm reasoning anyway (brief modal)
    await i.followUp({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('You agreed with the AI')
        .setDescription(
          `**AI decision:** ${actionLabel(aiAction)}\n` +
          `**Your decision:** ${actionLabel(action)}\n\n` +
          `**AI explanation:** ${post.explanation}\n\n` +
          `You can add a note to reinforce this reasoning, or continue to the next post.`
        )
        .setTimestamp()],
      components: [buildSeniorContinueRow(sessionId, true)],
    });
  } else {
    // Senior disagrees — open modal for thought process
    await i.followUp({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Orange)
        .setTitle('You disagreed with the AI')
        .setDescription(
          `**AI decision:** ${actionLabel(aiAction)}\n` +
          `**Your decision:** ${actionLabel(action)}\n\n` +
          `**AI explanation:** ${post.explanation}\n\n` +
          `Please explain your reasoning so the AI can learn from this correction.`
        )
        .setTimestamp()],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`spt_thought_modal:${sessionId}:${action}`)
          .setLabel('Add Reasoning')
          .setStyle(ButtonStyle.Primary),
      )],
    });
  }
}

async function handleSeniorDenyOpen(i: ButtonInteraction, rest: string[]): Promise<void> {
  const sessionId = parseInt(rest[0], 10);
  const [session] = await sql`SELECT * FROM post_train_senior_sessions WHERE id = ${sessionId} AND user_id = ${i.user.id} AND status = 'active'`;
  if (!session) { await i.reply({ embeds: [errorEmbed('Session not found.')], ephemeral: true }); return; }

  const post: GeneratedPost = session.last_post_data;

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle('Select Denial Reason')
      .setDescription('Choose the denial reason that applies to this post.')
      .setTimestamp()],
    components: [await buildSeniorDenyReasonSelect(sessionId, post.category)],
    ephemeral: true,
  });
}

async function handleSeniorDenySelect(i: StringSelectMenuInteraction): Promise<void> {
  const [, sessionIdStr] = i.customId.split(':');
  const sessionId  = parseInt(sessionIdStr, 10);
  const chosenLabel = i.values[0];

  const [session] = await sql`SELECT * FROM post_train_senior_sessions WHERE id = ${sessionId} AND user_id = ${i.user.id} AND status = 'active'`;
  if (!session) { await i.update({ embeds: [errorEmbed('Session not found.')], components: [] }); return; }

  const post: GeneratedPost = session.last_post_data;
  const aiAction = post.correct_action;
  const seniorAction = 'deny';

  await i.update({ components: [] });

  if (seniorAction === aiAction) {
    // AI also said deny — ask if they want to add a note about the reason or just continue
    await i.followUp({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('You agreed with the AI')
        .setDescription(
          `**AI decision:** ${actionLabel(aiAction)}\n` +
          `**Your decision:** Deny - ${chosenLabel}\n\n` +
          `**AI explanation:** ${post.explanation}\n\n` +
          `You can add a note or continue to the next post.`
        )
        .setTimestamp()],
      components: [buildSeniorContinueRow(sessionId, true)],
    });
  } else {
    // Disagreement — open thought process modal
    await i.followUp({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Orange)
        .setTitle('You disagreed with the AI')
        .setDescription(
          `**AI decision:** ${actionLabel(aiAction)}\n` +
          `**Your decision:** Deny - ${chosenLabel}\n\n` +
          `**AI explanation:** ${post.explanation}\n\n` +
          `Please explain your reasoning so the AI can learn from this.`
        )
        .setTimestamp()],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`spt_deny_thought_modal:${sessionId}:${encodeReasonLabel(chosenLabel)}`)
          .setLabel('Add Reasoning')
          .setStyle(ButtonStyle.Primary),
      )],
    });
  }
}

// Thought process modal for non-deny actions
async function handleThoughtModal(i: ModalSubmitInteraction, rest: string[]): Promise<void> {
  // This is triggered by the "Add Reasoning" button
  // The button just opens the modal — the modal customId carries the action
}

// Opens the thought modal from the "Add Reasoning" button
export async function openThoughtModal(i: ButtonInteraction, rest: string[]): Promise<void> {
  const [sessionIdStr, seniorAction] = rest;
  await i.showModal({
    customId: `spt_thought_modal:${sessionIdStr}:${seniorAction}`,
    title: 'Your Reasoning',
    components: [
      { type: 1, components: [{ type: 4, customId: 'thought', label: 'Why is this the correct action?', style: 2, required: true, minLength: 10, maxLength: 1000, placeholder: 'Explain the rule that applies and why your answer is correct...' }] },
    ],
  });
}

// Handles the modal submission for non-deny corrections
async function handleThoughtModalSubmit(i: ModalSubmitInteraction, rest: string[]): Promise<void> {
  const [sessionIdStr, seniorAction] = rest;
  const sessionId   = parseInt(sessionIdStr, 10);
  const thought     = i.fields.getTextInputValue('thought').trim();

  await i.deferReply({ ephemeral: true });

  const [session] = await sql`SELECT * FROM post_train_senior_sessions WHERE id = ${sessionId} AND user_id = ${i.user.id}`;
  if (!session) { await i.editReply({ embeds: [errorEmbed('Session not found.')] }); return; }

  const post: GeneratedPost = session.last_post_data;

  await sql`
    INSERT INTO post_train_corrections
      (session_id, submitted_by, category, post_body, ai_action, correct_action, denial_reason, thought_process)
    VALUES
      (${sessionId}, ${i.user.id}, ${post.category}, ${post.description}, ${post.correct_action}, ${seniorAction}, null, ${thought})
  `;

  await i.editReply({ embeds: [new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle('Correction Saved')
    .setDescription(`Your correction has been recorded and will be used to improve the training AI.\n\n**Correct action:** ${actionLabel(seniorAction)}\n**Your reasoning:** ${thought}`)
    .setTimestamp()] });

  // Show continue row in DM
  try {
    const dm = await i.client.users.fetch(i.user.id);
    const dmChannel = await dm.createDM();
    await dmChannel.send({ components: [buildSeniorContinueRow(sessionId, false)] });
  } catch { /* silent */ }
}

// Handles the modal submission for deny corrections (includes denial reason label)
async function handleDenyThoughtModal(i: ModalSubmitInteraction, rest: string[]): Promise<void> {
  const [sessionIdStr, encodedReason] = rest;
  const sessionId    = parseInt(sessionIdStr, 10);
  const denialReason = decodeReasonLabel(encodedReason);
  const thought      = i.fields.getTextInputValue('thought').trim();

  await i.deferReply({ ephemeral: true });

  const [session] = await sql`SELECT * FROM post_train_senior_sessions WHERE id = ${sessionId} AND user_id = ${i.user.id}`;
  if (!session) { await i.editReply({ embeds: [errorEmbed('Session not found.')] }); return; }

  const post: GeneratedPost = session.last_post_data;

  await sql`
    INSERT INTO post_train_corrections
      (session_id, submitted_by, category, post_body, ai_action, correct_action, denial_reason, thought_process)
    VALUES
      (${sessionId}, ${i.user.id}, ${post.category}, ${post.description}, ${post.correct_action}, 'deny', ${denialReason}, ${thought})
  `;

  await i.editReply({ embeds: [new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle('Correction Saved')
    .setDescription(`Correction recorded.\n\n**Correct action:** Deny - ${denialReason}\n**Your reasoning:** ${thought}`)
    .setTimestamp()] });

  try {
    const dm = await i.client.users.fetch(i.user.id);
    const dmChannel = await dm.createDM();
    await dmChannel.send({ components: [buildSeniorContinueRow(sessionId, false)] });
  } catch { /* silent */ }
}

async function handleSeniorContinue(i: ButtonInteraction, rest: string[]): Promise<void> {
  const sessionId = parseInt(rest[0], 10);
  const [session] = await sql`SELECT * FROM post_train_senior_sessions WHERE id = ${sessionId} AND user_id = ${i.user.id} AND status = 'active'`;
  if (!session) { await i.update({ embeds: [errorEmbed('Session not found.')], components: [] }); return; }

  await i.update({
    embeds: [new EmbedBuilder().setColor(Colors.Blue).setTitle('Generating next post...').setTimestamp()],
    components: [],
  });

  const post = await generateTrainingPost(session.category);
  if (!post) {
    await i.editReply({ embeds: [errorEmbed('Failed to generate post. Please try again.')], components: [] });
    return;
  }

  await sql`UPDATE post_train_senior_sessions SET last_post_data = ${JSON.stringify(post)}::jsonb WHERE id = ${sessionId}`;

  await i.editReply({
    embeds: [buildSeniorPostEmbed(post, sessionId, 'AI Answer: Not yet judged')],
    components: buildSeniorActionRows(sessionId, post.category),
  });
}

async function handleSeniorEnd(i: ButtonInteraction, rest: string[]): Promise<void> {
  const sessionId = parseInt(rest[0], 10);
  await sql`UPDATE post_train_senior_sessions SET status = 'ended', ended_at = NOW() WHERE id = ${sessionId} AND user_id = ${i.user.id}`;

  const [countRow] = await sql`SELECT COUNT(*) as c FROM post_train_corrections WHERE session_id = ${sessionId}`;

  await i.update({
    embeds: [new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('Session Ended')
      .setDescription(`Session complete. You submitted **${countRow.c} correction(s)** this session.\n\nThank you — your corrections will be used to improve the training AI.`)
      .setTimestamp()],
    components: [],
  });
}

// ─── ROUTING HELPER ───────────────────────────────────────────────────────────
// Called by interactionHandler for any spt_ button/modal

export async function routeSeniorInteraction(i: Interaction): Promise<void> {
  const id = (i as any).customId as string;
  if (!id) return;

  const [prefix, ...rest] = id.split(':');

  if (i.isButton()) {
    if (prefix === 'spt_action')    { await handleSeniorAction(i, rest);   return; }
    if (prefix === 'spt_deny_open') { await handleSeniorDenyOpen(i, rest); return; }
    if (prefix === 'spt_continue')  { await handleSeniorContinue(i, rest); return; }
    if (prefix === 'spt_end')       { await handleSeniorEnd(i, rest);      return; }
    if (prefix === 'spt_thought_modal')      { await openThoughtModal(i, rest); return; }
    if (prefix === 'spt_deny_thought_modal') { await openDenyThoughtModal(i, rest); return; }
  }

  if (i.isStringSelectMenu() && prefix === 'spt_deny_sel') {
    await handleSeniorDenySelect(i); return;
  }

  if (i.isModalSubmit()) {
    if (prefix === 'spt_thought_modal')      { await handleThoughtModalSubmit(i, rest); return; }
    if (prefix === 'spt_deny_thought_modal') { await handleDenyThoughtModal(i, rest);   return; }
  }
}

async function openDenyThoughtModal(i: ButtonInteraction, rest: string[]): Promise<void> {
  const [sessionIdStr, encodedReason] = rest;
  await i.showModal({
    customId: `spt_deny_thought_modal:${sessionIdStr}:${encodedReason}`,
    title: 'Your Reasoning',
    components: [
      { type: 1, components: [{ type: 4, customId: 'thought', label: 'Why is Deny the correct action?', style: 2, required: true, minLength: 10, maxLength: 1000, placeholder: 'Explain which rule was broken and why this post should be denied...' }] },
    ],
  });
}

// ─── BUILD HELPERS ────────────────────────────────────────────────────────────

function buildSeniorPostEmbed(post: GeneratedPost, sessionId: number, aiLabel: string): EmbedBuilder {
  const categoryDisplay = post.category
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' > ');

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(post.title)
    .setDescription(post.description);

  if (post.payment) embed.addFields({ name: 'Payment', value: post.payment });

  embed.addFields(
    { name: 'About This User', value: [
        `<@000000000000000000>`,
        `RoDevs Member since ${post.member_since}`,
        post.scam_logs === 0 ? 'No scam logs found.' : `**${post.scam_logs} scam log${post.scam_logs > 1 ? 's' : ''} found.**`,
      ].join('\n') },
    { name: 'Reviews',  value: post.has_reviews ? 'See profile.' : 'None found.', inline: true },
    { name: 'Category', value: categoryDisplay, inline: true },
    { name: 'Post ID',  value: post.post_id,    inline: true },
  );

  embed.setFooter({ text: `Senior Training  |  Session ${sessionId}  |  ${post.difficulty.charAt(0).toUpperCase() + post.difficulty.slice(1)}` })
    .setTimestamp();

  return embed;
}

function buildSeniorActionRows(sessionId: number, category: string): ActionRowBuilder<ButtonBuilder>[] {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`spt_action:${sessionId}:approve`).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`spt_action:${sessionId}:request_pof`).setLabel('Request Proof of Funds').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`spt_deny_open:${sessionId}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`spt_end:${sessionId}`).setLabel('End Session').setStyle(ButtonStyle.Secondary),
  )];
}

async function buildSeniorDenyReasonSelect(sessionId: number, category: string) {
  const { getDenialReasons } = await import('../../services/postTrainService');
  const reasons = await getDenialReasons(category);
  const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } = await import('discord.js');
  return new ActionRowBuilder<any>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`spt_deny_sel:${sessionId}`)
      .setPlaceholder('Select the denial reason...')
      .addOptions(
        reasons.map(r =>
          new StringSelectMenuOptionBuilder()
            .setLabel(r.label.slice(0, 100))
            .setValue(r.label.slice(0, 100))
            .setDescription(r.message.slice(0, 100))
        )
      )
  );
}

function buildSeniorContinueRow(sessionId: number, includeSkip: boolean): ActionRowBuilder<ButtonBuilder> {
  const btns = [
    new ButtonBuilder().setCustomId(`spt_continue:${sessionId}`).setLabel('Next Post').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`spt_end:${sessionId}`).setLabel('End Session').setStyle(ButtonStyle.Secondary),
  ];
  return new ActionRowBuilder<ButtonBuilder>().addComponents(...btns);
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    approve:     'Approve',
    deny:        'Deny',
    request_pof: 'Request Proof of Funds',
  };
  return map[action] ?? action;
}

// Discord customId safe encoding for denial reason labels (they can contain special chars)
function encodeReasonLabel(label: string): string {
  return Buffer.from(label).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function decodeReasonLabel(encoded: string): string {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  try { return Buffer.from(padded, 'base64').toString('utf8'); } catch { return encoded; }
}
