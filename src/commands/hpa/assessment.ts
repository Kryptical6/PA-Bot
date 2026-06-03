import {
  ChatInputCommandInteraction, SlashCommandBuilder, GuildMember,
  EmbedBuilder, Colors, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ActionRowBuilder, ComponentType, ButtonBuilder, ButtonStyle
} from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { finalizeAssessment } from '../../services/assessmentService';
import { safeDM } from '../../services/dmService';

function parseDuration(s: string): number | null {
  const m = s.trim().match(/^(\d+)(h|d)$/i);
  if (!m) return null;
  return parseInt(m[1]) * (m[2].toLowerCase() === 'h' ? 3600000 : 86400000);
}

export const data = new SlashCommandBuilder()
  .setName('assessment')
  .setDescription('Manage assessments (HPA only)')

  .addSubcommand(sub => sub.setName('create')
    .setDescription('Create a new assessment')
    .addStringOption(o => o.setName('title').setDescription('Assessment title').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Time limit e.g. 2h or 1d').setRequired(true))
    .addIntegerOption(o => o.setName('pass_threshold').setDescription('Pass percentage (default 70)').setMinValue(1).setMaxValue(100))
    .addStringOption(o => o.setName('description').setDescription('Briefing shown to PA before questions'))
    .addBooleanOption(o => o.setName('restricted').setDescription('Restrict to specific users only?')))

  .addSubcommand(sub => sub.setName('delete')
    .setDescription('Delete an assessment and all its data')
    .addIntegerOption(o => o.setName('assessment_id').setDescription('Assessment ID').setRequired(true)))

  .addSubcommand(sub => sub.setName('publish')
    .setDescription('Publish or unpublish an assessment')
    .addIntegerOption(o => o.setName('assessment_id').setDescription('Assessment ID').setRequired(true))
    .addBooleanOption(o => o.setName('published').setDescription('True to publish, false to unpublish').setRequired(true)))

  .addSubcommand(sub => sub.setName('restrict')
    .setDescription('Grant or remove access for a restricted assessment')
    .addIntegerOption(o => o.setName('assessment_id').setDescription('Assessment ID').setRequired(true))
    .addUserOption(o => o.setName('user').setDescription('User to allow or remove').setRequired(true))
    .addBooleanOption(o => o.setName('allow').setDescription('True to allow, false to remove').setRequired(true)))

  .addSubcommand(sub => sub.setName('list')
    .setDescription('List all assessments with their IDs and status'))

  .addSubcommand(sub => sub.setName('questions')
    .setDescription('View all questions for an assessment')
    .addIntegerOption(o => o.setName('assessment_id').setDescription('Assessment ID').setRequired(true)))

  .addSubcommand(sub => sub.setName('add_question')
    .setDescription('Add a question to an assessment')
    .addIntegerOption(o => o.setName('assessment_id').setDescription('Assessment ID').setRequired(true))
    .addBooleanOption(o => o.setName('scripting').setDescription('Is this a scripting-only question?').setRequired(true)))

  .addSubcommand(sub => sub.setName('edit_question')
    .setDescription('Edit an existing question')
    .addIntegerOption(o => o.setName('question_id').setDescription('Question ID').setRequired(true)))

  .addSubcommand(sub => sub.setName('delete_question')
    .setDescription('Delete a question')
    .addIntegerOption(o => o.setName('question_id').setDescription('Question ID').setRequired(true)))

  .addSubcommand(sub => sub.setName('results')
    .setDescription('View assessment results for a user')
    .addUserOption(o => o.setName('user').setDescription('Staff member').setRequired(true))
    .addIntegerOption(o => o.setName('assessment_id').setDescription('Filter by assessment ID (optional)')))

  .addSubcommand(sub => sub.setName('sessions')
    .setDescription('View all in-progress assessment sessions'))

  .addSubcommand(sub => sub.setName('force_stop')
    .setDescription('Force stop a user\'s active assessment session and submit what they have so far')
    .addUserOption(o => o.setName('user').setDescription('The user whose session to stop').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for force stopping (sent to the user)').setRequired(true)));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;

  const sub = i.options.getSubcommand();

  // ─── CREATE ───────────────────────────────────────────────────────────────
  if (sub === 'create') {
    await i.deferReply({ ephemeral: true });
    const title      = i.options.getString('title', true);
    const dur        = i.options.getString('duration', true);
    const threshold  = i.options.getInteger('pass_threshold') ?? 70;
    const desc       = i.options.getString('description') ?? null;
    const restricted = i.options.getBoolean('restricted') ?? false;

    const ms = parseDuration(dur);
    if (!ms) { await i.editReply({ embeds: [errorEmbed('Invalid duration. Use `2h` or `1d`.')] }); return; }

    const [result] = await sql`
      INSERT INTO assessments (title, description, deadline_ms, pass_threshold, restricted, created_by)
      VALUES (${title}, ${desc}, ${ms}, ${threshold}, ${restricted}, ${i.user.id})
      RETURNING id
    `;
    await i.editReply({ embeds: [successEmbed('Assessment Created', [
      `**${title}** created with ID **#${result.id}**`,
      `Duration: ${dur} | Pass: ${threshold}%${restricted ? ' | Restricted' : ''}`,
      ``,
      `Next steps:`,
      `• Add questions: \`/assessment add_question assessment_id:${result.id}\``,
      `• Bulk import: \`/import_assessment_questions assessment_id:${result.id}\``,
      `• Publish when ready: \`/assessment publish assessment_id:${result.id} published:true\``,
    ].join('\n'))] });
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────
  else if (sub === 'delete') {
    await i.deferReply({ ephemeral: true });
    const id = i.options.getInteger('assessment_id', true);
    const [a] = await sql`SELECT * FROM assessments WHERE id = ${id}`;
    if (!a) { await i.editReply({ embeds: [errorEmbed(`Assessment #${id} not found.`)] }); return; }

    const [qCount] = await sql`SELECT COUNT(*) as c FROM assessment_questions WHERE assessment_id = ${id}`;
    const [rCount] = await sql`SELECT COUNT(*) as c FROM assessment_results WHERE assessment_id = ${id}`;

    // Confirm button
    const confirmBtn = new ButtonBuilder().setCustomId(`assess_delete_confirm:${id}`).setLabel('Yes, Delete').setStyle(ButtonStyle.Danger);
    const cancelBtn  = new ButtonBuilder().setCustomId('assess_delete_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary);
    const msg = await i.editReply({
      embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Confirm Delete').setDescription(
        `Delete **${a.title}** (ID: #${id})?\n\nThis will permanently remove:\n• ${qCount.c} question(s)\n• ${rCount.c} result(s)\n• All sessions and retake requests`
      ).setTimestamp()],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, cancelBtn)],
    });

    const btn = await msg.awaitMessageComponent({ componentType: ComponentType.Button, filter: b => b.user.id === i.user.id, time: 30_000 }).catch(() => null);
    if (!btn || btn.customId === 'assess_delete_cancel') {
      await i.editReply({ embeds: [successEmbed('Cancelled', 'Delete cancelled.')], components: [] }); return;
    }
    await btn.deferUpdate();
    await sql`DELETE FROM assessments WHERE id = ${id}`;
    await i.editReply({ embeds: [successEmbed('Deleted', `**${a.title}** and all associated data has been deleted.`)], components: [] });
  }

  // ─── PUBLISH ──────────────────────────────────────────────────────────────
  else if (sub === 'publish') {
    await i.deferReply({ ephemeral: true });
    const id        = i.options.getInteger('assessment_id', true);
    const published = i.options.getBoolean('published', true);
    const [a] = await sql`SELECT * FROM assessments WHERE id = ${id}`;
    if (!a) { await i.editReply({ embeds: [errorEmbed(`Assessment #${id} not found.`)] }); return; }

    if (published) {
      const [count] = await sql`SELECT COUNT(*) as c FROM assessment_questions WHERE assessment_id = ${id} AND is_scripting = false`;
      if (parseInt(count.c) === 0) { await i.editReply({ embeds: [errorEmbed('Cannot publish with no main questions. Add questions first.')] }); return; }
    }

    await sql`UPDATE assessments SET published = ${published} WHERE id = ${id}`;
    await i.editReply({ embeds: [successEmbed('Updated', `**${a.title}** is now **${published ? 'published' : 'unpublished'}**.`)] });
  }

  // ─── RESTRICT ─────────────────────────────────────────────────────────────
  else if (sub === 'restrict') {
    await i.deferReply({ ephemeral: true });
    const id    = i.options.getInteger('assessment_id', true);
    const user  = i.options.getUser('user', true);
    const allow = i.options.getBoolean('allow', true);
    const [a] = await sql`SELECT * FROM assessments WHERE id = ${id}`;
    if (!a) { await i.editReply({ embeds: [errorEmbed(`Assessment #${id} not found.`)] }); return; }

    if (allow) {
      await sql`INSERT INTO assessment_allowed_users (assessment_id, user_id) VALUES (${id}, ${user.id}) ON CONFLICT DO NOTHING`;
      await sql`UPDATE assessments SET restricted = true WHERE id = ${id}`;
      await i.editReply({ embeds: [successEmbed('Access Granted', `<@${user.id}> can now access **${a.title}**.`)] });
    } else {
      await sql`DELETE FROM assessment_allowed_users WHERE assessment_id = ${id} AND user_id = ${user.id}`;
      await i.editReply({ embeds: [successEmbed('Access Removed', `<@${user.id}> removed from **${a.title}**.`)] });
    }
  }

  // ─── LIST ─────────────────────────────────────────────────────────────────
  else if (sub === 'list') {
    await i.deferReply({ ephemeral: true });
    const assessments = await sql`SELECT a.*, (SELECT COUNT(*) FROM assessment_questions WHERE assessment_id = a.id) as q_count FROM assessments a ORDER BY a.created_at DESC`;

    if (assessments.length === 0) { await i.editReply({ embeds: [errorEmbed('No assessments found.')] }); return; }

    const embed = new EmbedBuilder().setColor(Colors.Blue).setTitle('All Assessments').setTimestamp();
    for (const a of assessments) {
      const status = a.published ? 'Published' : 'Draft';
      const restricted = a.restricted ? ' | Restricted' : '';
      embed.addFields({
        name: `#${a.id} — ${a.title}`,
        value: `${status}${restricted} | ${a.q_count} question(s) | Pass: ${a.pass_threshold}% | Duration: ${a.deadline_ms / 3600000}h`,
      });
    }
    await i.editReply({ embeds: [embed] });
  }

  // ─── QUESTIONS ────────────────────────────────────────────────────────────
  else if (sub === 'questions') {
    await i.deferReply({ ephemeral: true });
    const id = i.options.getInteger('assessment_id', true);
    const [a] = await sql`SELECT * FROM assessments WHERE id = ${id}`;
    if (!a) { await i.editReply({ embeds: [errorEmbed(`Assessment #${id} not found.`)] }); return; }

    const qs = await sql`SELECT * FROM assessment_questions WHERE assessment_id = ${id} ORDER BY created_at ASC`;
    if (qs.length === 0) { await i.editReply({ embeds: [errorEmbed(`No questions in **${a.title}**.`)] }); return; }

    const embed = new EmbedBuilder().setColor(Colors.Blue).setTitle(`Questions — ${a.title}`).setFooter({ text: `${qs.length} question(s) | ID: #${id}` }).setTimestamp();
    for (const q of qs.slice(0, 15)) {
      embed.addFields({
        name: `Q#${q.id} — \`${q.post_id}\`${q.is_scripting ? ' [Scripting]' : ''}`,
        value: `Answer: **${q.correct_answer}**${q.correct_reason ? ` | Reason: ${q.correct_reason.slice(0, 80)}` : ''}${q.context ? `\nContext: ${q.context.slice(0, 80)}` : ''}`,
      });
    }
    if (qs.length > 15) embed.setDescription(`Showing first 15 of ${qs.length} questions.`);
    await i.editReply({ embeds: [embed] });
  }

  // ─── ADD QUESTION ─────────────────────────────────────────────────────────
  else if (sub === 'add_question') {
    const assessmentId = i.options.getInteger('assessment_id', true);
    const isScripting  = i.options.getBoolean('scripting', true);
    const [a] = await sql`SELECT id FROM assessments WHERE id = ${assessmentId}`;
    if (!a) { await i.reply({ embeds: [errorEmbed(`Assessment #${assessmentId} not found.`)], ephemeral: true }); return; }

    await i.showModal({
      customId: `create_q:${assessmentId}:${isScripting}`,
      title: `Add Question — Assessment #${assessmentId}`,
      components: [
        { type: 1, components: [{ type: 4, customId: 'post_id', label: 'Post ID', style: 1, required: true, maxLength: 200 }] },
        { type: 1, components: [{ type: 4, customId: 'correct_answer', label: 'Correct Answer', style: 1, required: true, maxLength: 20, placeholder: 'approve / deny / suspend / request_pof' }] },
        { type: 1, components: [{ type: 4, customId: 'correct_reason', label: 'Expected Reason (shown in results)', style: 2, required: false, maxLength: 500 }] },
        { type: 1, components: [{ type: 4, customId: 'context', label: 'Context shown to PA (optional)', style: 2, required: false, maxLength: 500 }] },
      ]
    });
  }

  // ─── EDIT QUESTION ────────────────────────────────────────────────────────
  else if (sub === 'edit_question') {
    const qId = i.options.getInteger('question_id', true);
    const [q] = await sql`SELECT * FROM assessment_questions WHERE id = ${qId}`;
    if (!q) { await i.reply({ embeds: [errorEmbed(`Question #${qId} not found.`)], ephemeral: true }); return; }

    await i.showModal({
      customId: `edit_q:${qId}`,
      title: `Edit Question #${qId}`,
      components: [
        { type: 1, components: [{ type: 4, customId: 'post_id', label: 'Post ID', style: 1, required: true, value: q.post_id, maxLength: 200 }] },
        { type: 1, components: [{ type: 4, customId: 'correct_answer', label: 'Correct Answer', style: 1, required: true, value: q.correct_answer, maxLength: 20 }] },
        { type: 1, components: [{ type: 4, customId: 'correct_reason', label: 'Expected Reason', style: 2, required: false, value: q.correct_reason ?? '', maxLength: 500 }] },
        { type: 1, components: [{ type: 4, customId: 'context', label: 'Context (optional)', style: 2, required: false, value: q.context ?? '', maxLength: 500 }] },
      ]
    });
  }

  // ─── DELETE QUESTION ──────────────────────────────────────────────────────
  else if (sub === 'delete_question') {
    await i.deferReply({ ephemeral: true });
    const qId = i.options.getInteger('question_id', true);
    const [q] = await sql`SELECT * FROM assessment_questions WHERE id = ${qId}`;
    if (!q) { await i.editReply({ embeds: [errorEmbed(`Question #${qId} not found.`)] }); return; }
    await sql`DELETE FROM assessment_questions WHERE id = ${qId}`;
    await i.editReply({ embeds: [successEmbed('Deleted', `Question #${qId} (Post: \`${q.post_id}\`) deleted.`)] });
  }

  // ─── RESULTS ──────────────────────────────────────────────────────────────
  else if (sub === 'results') {
    await i.deferReply({ ephemeral: true });
    const target = i.options.getUser('user', true);
    const aId    = i.options.getInteger('assessment_id');

    const results = aId
      ? await sql`SELECT r.*, a.title FROM assessment_results r JOIN assessments a ON r.assessment_id = a.id WHERE r.user_id = ${target.id} AND r.assessment_id = ${aId} ORDER BY r.completed_at DESC`
      : await sql`SELECT r.*, a.title FROM assessment_results r JOIN assessments a ON r.assessment_id = a.id WHERE r.user_id = ${target.id} ORDER BY r.completed_at DESC LIMIT 10`;

    if (results.length === 0) { await i.editReply({ embeds: [errorEmbed(`No results found for <@${target.id}>.`)] }); return; }

    const embed = new EmbedBuilder().setColor(Colors.Blue).setTitle(`Results — ${target.username}`).setThumbnail(target.displayAvatarURL()).setTimestamp();
    for (const r of results) {
      const score  = r.hpa_override_score ?? r.score;
      const passed = r.hpa_override_passed ?? r.passed;
      const note   = r.hpa_reviewed ? '' : ' *(pending review)*';
      embed.addFields({
        name: `${r.title} — <t:${Math.floor(new Date(r.completed_at).getTime() / 1000)}:D>${note}`,
        value: `**${score}/${r.total}** (${r.percentage}%) — ${passed ? '✅ Pass' : '❌ Fail'}`,
      });
    }
    await i.editReply({ embeds: [embed] });
  }

  // SESSIONS
  else if (sub === 'sessions') {
    await i.deferReply({ ephemeral: true });
    const sessions = await sql`SELECT s.*, a.title FROM assessment_sessions s JOIN assessments a ON s.assessment_id = a.id ORDER BY s.started_at DESC`;
    const embed = new EmbedBuilder().setColor(Colors.Orange).setTitle('Active Sessions').setTimestamp();
    if (sessions.length === 0) { embed.setDescription('No active sessions.'); }
    else {
      embed.setDescription(sessions.map((s: any) =>
        `<@${s.user_id}> — **${s.title}** — Q${s.current_index + 1} — Expires <t:${Math.floor(new Date(s.deadline).getTime() / 1000)}:R>`
      ).join('\n'));
    }
    await i.editReply({ embeds: [embed] });
  }

  // FORCE STOP
  else if (sub === 'force_stop') {
    await i.deferReply({ ephemeral: true });
    const target = i.options.getUser('user', true);
    const reason = i.options.getString('reason', true).trim();

    const sessions = await sql`
      SELECT s.*, a.title, a.pass_threshold FROM assessment_sessions s
      JOIN assessments a ON s.assessment_id = a.id
      WHERE s.user_id = ${target.id}
      ORDER BY s.started_at DESC
    `;

    if (sessions.length === 0) {
      await i.editReply({ embeds: [errorEmbed(`<@${target.id}> has no active assessment session.`)] });
      return;
    }

    const session = sessions[0];

    // Count how many questions they have answered so far
    const responses = await sql`SELECT COUNT(*) as c FROM assessment_responses WHERE session_id = ${session.id}`;
    const answered  = parseInt(responses[0].c);

    // Finalize using the existing service - this runs AI marking and sends to HPA review exactly as normal
    await finalizeAssessment(i.client, target.id, session.id, session.has_scripting ?? false);

    // DM the user explaining what happened
    await safeDM(i.client, target.id, new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle('Assessment Force Stopped')
      .setDescription(
        `Your assessment session for **${session.title}** has been stopped by HPA.\n\n` +
        `**Reason:** ${reason}\n\n` +
        `Your answers so far (${answered} question${answered !== 1 ? 's' : ''}) have been submitted and will be marked. ` +
        `You will receive your result once HPA has reviewed it.`
      )
      .setTimestamp(),
      'assessment force stopped'
    );

    await i.editReply({ embeds: [new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('Session Force Stopped')
      .addFields(
        { name: 'User',        value: `<@${target.id}>`,  inline: true },
        { name: 'Assessment',  value: session.title,       inline: true },
        { name: 'Answered',    value: `${answered} question${answered !== 1 ? 's' : ''}`, inline: true },
        { name: 'Reason',      value: reason },
      )
      .setDescription('The session has been submitted for AI marking and will appear in the HPA review channel as normal.')
      .setTimestamp(),
    ]});
  }
}
