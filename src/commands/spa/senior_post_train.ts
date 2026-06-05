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
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonInteraction,
  ModalSubmitInteraction,
  Interaction,
} from 'discord.js';
import { isSPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import {
  generateTrainingPost,
  buildCategorySelect,
  getDenialReasons,
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
            `Select the correct action for each post.\n\n` +
            `After each answer you will see the AI's decision and explanation. ` +
            `Use the **Override AI Answer** button at any time to correct the AI ` +
            `and provide your reasoning — this gets saved and improves future generations.\n\n` +
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
      const catLabel = TRAIN_CATEGORIES[r.category] ?? r.category;
      embed.addFields({
        name: `ID ${r.id} - ${catLabel} - <@${r.submitted_by}>`,
        value: [
          `**AI said:** ${actionLabel(r.ai_action)}`,
          `**Correct:** ${actionLabel(r.correct_action)}${r.denial_reason ? ` - ${r.denial_reason}` : ''}`,
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

// ─── SENIOR SESSION HELPERS ───────────────────────────────────────────────────

export async function hasSeniorSession(userId: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM post_train_senior_sessions WHERE user_id = ${userId} AND status = 'active'`;
  return rows.length > 0;
}

export async function handleSeniorCategorySelect(i: StringSelectMenuInteraction): Promise<void> {
  const category = i.values[0];

  await i.update({
    embeds: [new EmbedBuilder().setColor(Colors.Blue).setTitle('Generating post...').setTimestamp()],
    components: [],
  });

  await sql`UPDATE post_train_senior_sessions SET status = 'ended', ended_at = NOW() WHERE user_id = ${i.user.id} AND status = 'active'`;

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

  await sql`UPDATE post_train_senior_sessions SET last_post_data = ${JSON.stringify(post)}::jsonb WHERE id = ${session.id}`;

  await i.editReply({
    embeds: [buildSeniorPostEmbed(post, session.id)],
    components: buildSeniorActionRows(session.id),
  });
}

// ─── MAIN ROUTING ENTRY POINT ─────────────────────────────────────────────────

export async function routeSeniorInteraction(i: Interaction): Promise<void> {
  const id = (i as any).customId as string;
  if (!id) return;

  const [prefix, ...rest] = id.split(':');

  if (i.isButton()) {
    if (prefix === 'spt_action')        { await handleSeniorAction(i, rest);      return; }
    if (prefix === 'spt_deny_open')     { await handleSeniorDenyOpen(i, rest);    return; }
    if (prefix === 'spt_continue')      { await handleSeniorContinue(i, rest);    return; }
    if (prefix === 'spt_end')           { await handleSeniorEnd(i, rest);         return; }
    if (prefix === 'spt_override_open') { await handleOverrideOpen(i, rest);      return; }
    if (prefix === 'spt_thought_btn')   { await openThoughtModal(i, rest);        return; }
    if (prefix === 'spt_deny_thought_btn') { await openDenyThoughtModal(i, rest); return; }
  }

  if (i.isStringSelectMenu()) {
    if (prefix === 'spt_deny_sel')         { await handleSeniorDenySelect(i, rest);   return; }
    if (prefix === 'spt_override_action')  { await handleOverrideActionSelect(i, rest); return; }
    if (prefix === 'spt_override_deny_sel') { await handleOverrideDenySelect(i, rest);  return; }
  }

  if (i.isModalSubmit()) {
    if (prefix === 'spt_thought_modal')      { await handleThoughtModalSubmit(i, rest); return; }
    if (prefix === 'spt_deny_thought_modal') { await handleDenyThoughtModal(i, rest);   return; }
  }
}

// ─── ACTION BUTTONS ───────────────────────────────────────────────────────────

async function handleSeniorAction(i: ButtonInteraction, rest: string[]): Promise<void> {
  const [sessionIdStr, action] = rest;
  const sessionId = parseInt(sessionIdStr, 10);

  const [session] = await sql`SELECT * FROM post_train_senior_sessions WHERE id = ${sessionId} AND user_id = ${i.user.id} AND status = 'active'`;
  if (!session) { await i.reply({ embeds: [errorEmbed('Session not found.')], ephemeral: true }); return; }

  const post: GeneratedPost = session.last_post_data;

  // Disable the main action buttons
  const disabledRows = buildSeniorActionRows(sessionId).map(row => {
    (row.components as any[]).forEach((btn: any) => { if (typeof btn.setDisabled === 'function') btn.setDisabled(true); });
    return row;
  });
  await i.update({ components: disabledRows });

  const aiAction = post.correct_action;
  const agreed   = action === aiAction;

  await i.followUp({
    embeds: [buildAnswerEmbed(post, action, aiAction, agreed)],
    components: [buildPostAnswerRow(sessionId)],
    ephemeral: true,
  });
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
    components: [await buildDenyReasonSelect(sessionId, post.category, 'spt_deny_sel')],
    ephemeral: true,
  });
}

async function handleSeniorDenySelect(i: StringSelectMenuInteraction, rest: string[]): Promise<void> {
  const sessionId   = parseInt(rest[0], 10);
  const chosenLabel = i.values[0];

  const [session] = await sql`SELECT * FROM post_train_senior_sessions WHERE id = ${sessionId} AND user_id = ${i.user.id} AND status = 'active'`;
  if (!session) { await i.update({ embeds: [errorEmbed('Session not found.')], components: [] }); return; }

  const post: GeneratedPost = session.last_post_data;
  const aiAction = post.correct_action;
  const agreed   = aiAction === 'deny';

  await i.update({ components: [] });

  await i.followUp({
    embeds: [buildAnswerEmbed(post, `deny:${chosenLabel}`, aiAction, agreed)],
    components: [buildPostAnswerRow(sessionId)],
    ephemeral: true,
  });
}

// ─── OVERRIDE FLOW ────────────────────────────────────────────────────────────
// "Override AI Answer" button on the post answer ephemeral
// Step 1: pick the correct action from a select
// Step 2a: if deny - pick denial reason then open thought modal
// Step 2b: if approve/request_pof - open thought modal directly

async function handleOverrideOpen(i: ButtonInteraction, rest: string[]): Promise<void> {
  const sessionId = parseInt(rest[0], 10);

  const actionSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`spt_override_action:${sessionId}`)
      .setPlaceholder('What is the correct action?')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('Approve').setValue('approve'),
        new StringSelectMenuOptionBuilder().setLabel('Deny').setValue('deny'),
        new StringSelectMenuOptionBuilder().setLabel('Request Proof of Funds').setValue('request_pof'),
      )
  );

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle('Override AI Answer')
      .setDescription('Select the correct action for this post. You will then be asked to explain your reasoning.')
      .setTimestamp()],
    components: [actionSelect],
    ephemeral: true,
  });
}

async function handleOverrideActionSelect(i: StringSelectMenuInteraction, rest: string[]): Promise<void> {
  const sessionId    = parseInt(rest[0], 10);
  const correctAction = i.values[0];

  if (correctAction === 'deny') {
    const [session] = await sql`SELECT * FROM post_train_senior_sessions WHERE id = ${sessionId} AND user_id = ${i.user.id}`;
    if (!session) { await i.update({ embeds: [errorEmbed('Session not found.')], components: [] }); return; }
    const post: GeneratedPost = session.last_post_data;

    await i.update({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Orange)
        .setTitle('Select Denial Reason')
        .setDescription('Select the denial reason that applies to this post.')
        .setTimestamp()],
      components: [await buildDenyReasonSelect(sessionId, post.category, 'spt_override_deny_sel')],
    });
  } else {
    // approve or request_pof — go straight to thought modal
    await i.showModal({
      customId: `spt_thought_modal:${sessionId}:${correctAction}`,
      title: 'Override Reasoning',
      components: [
        { type: 1, components: [{ type: 4, customId: 'thought', label: 'Why is this the correct action?', style: 2, required: true, minLength: 10, maxLength: 1000, placeholder: 'Cite the specific rule and explain why your answer is correct...' }] },
      ],
    });
  }
}

async function handleOverrideDenySelect(i: StringSelectMenuInteraction, rest: string[]): Promise<void> {
  const sessionId    = parseInt(rest[0], 10);
  const denialReason = i.values[0];

  await i.showModal({
    customId: `spt_deny_thought_modal:${sessionId}:${encodeReasonLabel(denialReason)}`,
    title: 'Override Reasoning',
    components: [
      { type: 1, components: [{ type: 4, customId: 'thought', label: 'Why is Deny the correct action?', style: 2, required: true, minLength: 10, maxLength: 1000, placeholder: 'Cite the specific rule that was broken and why Deny is correct...' }] },
    ],
  });
}

// ─── THOUGHT MODALS ───────────────────────────────────────────────────────────

// Button-triggered modal openers (for the "Add Reasoning" path on disagreement)
export async function openThoughtModal(i: ButtonInteraction, rest: string[]): Promise<void> {
  const [sessionIdStr, seniorAction] = rest;
  await i.showModal({
    customId: `spt_thought_modal:${sessionIdStr}:${seniorAction}`,
    title: 'Your Reasoning',
    components: [
      { type: 1, components: [{ type: 4, customId: 'thought', label: 'Why is this the correct action?', style: 2, required: true, minLength: 10, maxLength: 1000, placeholder: 'Cite the specific rule and explain why your answer is correct...' }] },
    ],
  });
}

export async function openDenyThoughtModal(i: ButtonInteraction, rest: string[]): Promise<void> {
  const [sessionIdStr, encodedReason] = rest;
  await i.showModal({
    customId: `spt_deny_thought_modal:${sessionIdStr}:${encodedReason}`,
    title: 'Your Reasoning',
    components: [
      { type: 1, components: [{ type: 4, customId: 'thought', label: 'Why is Deny the correct action?', style: 2, required: true, minLength: 10, maxLength: 1000, placeholder: 'Cite the rule broken and explain why Deny is correct...' }] },
    ],
  });
}

// Modal submissions
async function handleThoughtModalSubmit(i: ModalSubmitInteraction, rest: string[]): Promise<void> {
  const [sessionIdStr, seniorAction] = rest;
  const sessionId = parseInt(sessionIdStr, 10);
  const thought   = i.fields.getTextInputValue('thought').trim();

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
    .setDescription(
      `Correction recorded and will improve future AI generations.\n\n` +
      `**Correct action:** ${actionLabel(seniorAction)}\n` +
      `**Your reasoning:** ${thought}`
    )
    .setTimestamp()] });
}

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
    .setDescription(
      `Correction recorded and will improve future AI generations.\n\n` +
      `**Correct action:** Deny - ${denialReason}\n` +
      `**Your reasoning:** ${thought}`
    )
    .setTimestamp()] });
}

// ─── CONTINUE / END ───────────────────────────────────────────────────────────

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
    embeds: [buildSeniorPostEmbed(post, sessionId)],
    components: buildSeniorActionRows(sessionId),
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
      .setDescription(`Session complete. You submitted **${countRow.c} correction(s)** this session.\n\nThank you — your corrections improve the training AI.`)
      .setTimestamp()],
    components: [],
  });
}

// ─── BUILD HELPERS ────────────────────────────────────────────────────────────

function buildSeniorPostEmbed(post: GeneratedPost, sessionId: number): EmbedBuilder {
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
    { name: 'Category', value: categoryDisplay,                                   inline: true },
    { name: 'Post ID',  value: post.post_id,                                      inline: true },
  );

  embed.setFooter({ text: `Senior Training  |  Session ${sessionId}  |  ${post.difficulty.charAt(0).toUpperCase() + post.difficulty.slice(1)}` })
    .setTimestamp();

  return embed;
}

function buildSeniorActionRows(sessionId: number): ActionRowBuilder<ButtonBuilder>[] {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`spt_action:${sessionId}:approve`).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`spt_action:${sessionId}:request_pof`).setLabel('Request Proof of Funds').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`spt_deny_open:${sessionId}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`spt_end:${sessionId}`).setLabel('End Session').setStyle(ButtonStyle.Secondary),
  )];
}

// The ephemeral that shows after answering — shows AI vs your answer + override button
function buildAnswerEmbed(post: GeneratedPost, yourActionRaw: string, aiAction: string, agreed: boolean): EmbedBuilder {
  const [yourAction, yourDenyLabel] = yourActionRaw.includes(':') ? yourActionRaw.split(':') : [yourActionRaw, null];
  const yourDisplay = yourAction === 'deny' && yourDenyLabel ? `Deny - ${yourDenyLabel}` : actionLabel(yourAction);
  const aiDisplay   = actionLabel(aiAction);

  return new EmbedBuilder()
    .setColor(agreed ? Colors.Green : Colors.Orange)
    .setTitle(agreed ? 'You agreed with the AI' : 'You disagreed with the AI')
    .addFields(
      { name: 'Your Answer', value: yourDisplay,        inline: true },
      { name: 'AI Answer',   value: aiDisplay,          inline: true },
      { name: 'AI Explanation', value: post.explanation },
    )
    .setFooter({ text: 'Use "Override AI Answer" if the AI is wrong, or continue to the next post.' })
    .setTimestamp();
}

// The row shown on the answer ephemeral — always includes Override button
function buildPostAnswerRow(sessionId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`spt_override_open:${sessionId}`)
      .setLabel('Override AI Answer')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`spt_continue:${sessionId}`)
      .setLabel('Next Post')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`spt_end:${sessionId}`)
      .setLabel('End Session')
      .setStyle(ButtonStyle.Secondary),
  );
}

async function buildDenyReasonSelect(sessionId: number, category: string, customIdPrefix: string) {
  const reasons = await getDenialReasons(category);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${customIdPrefix}:${sessionId}`)
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

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    approve:     'Approve',
    deny:        'Deny',
    request_pof: 'Request Proof of Funds',
  };
  return map[action] ?? action;
}

function encodeReasonLabel(label: string): string {
  return Buffer.from(label).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function decodeReasonLabel(encoded: string): string {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  try { return Buffer.from(padded, 'base64').toString('utf8'); } catch { return encoded; }
}
