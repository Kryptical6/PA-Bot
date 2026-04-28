import { Interaction, ChatInputCommandInteraction, GuildMember, TextChannel, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { sql } from '../database/client';
import { config } from '../config';
import { isHPA, isSPA } from '../utils/permissions';
import { successEmbed, errorEmbed, warningEmbed, pendingLogEmbed, infoEmbed } from '../utils/embeds';
import { safeDM, dmUser } from '../services/dmService';
import { checkEscalation } from '../services/escalationService';
import { updateLogTracker } from '../services/logTrackerService';
import { closeVote } from '../services/voteService';
import { sendQuestion, sendScriptingQuestions, finalizeAssessment, sendFinalResult } from '../services/assessmentService';

// Import all commands
import * as help from '../commands/shared/help';
import * as myLogs from '../commands/shared/my_logs';
import * as appeal from '../commands/shared/appeal';
import * as tag from '../commands/shared/tag';
import * as tagSearch from '../commands/shared/tag_search';
import * as paAssessment from '../commands/shared/pa_assessment';
import * as logMistake from '../commands/spa/log_mistake';
import * as staffProfile from '../commands/spa/staff_profile';
import * as staffOverview from '../commands/spa/staff_overview';
import * as lookupPost from '../commands/spa/lookup_post';
import * as warnUser from '../commands/spa/warn_user';
import * as createVote from '../commands/spa/create_vote';
import * as listAssessments from '../commands/spa/list_assessments';
import * as createTag from '../commands/spa/create_tag';
import * as editTag from '../commands/spa/edit_tag';
import * as deleteTag from '../commands/spa/delete_tag';
import * as forceStrike from '../commands/hpa/force_strike';
import * as manageLog from '../commands/hpa/manage_log';
import * as setEscalation from '../commands/hpa/set_escalation';
import * as recalcEscalation from '../commands/hpa/recalculate_escalation';
import * as notifyUser from '../commands/hpa/notify_user';
import * as bulkActions from '../commands/hpa/bulk_actions';
import * as manageLogTracker from '../commands/hpa/manage_log_tracker';
import * as createAssessment from '../commands/hpa/create_assessment';
import * as createAssessmentQ from '../commands/hpa/create_assessment_question';
import * as editAssessmentQ from '../commands/hpa/edit_assessment_question';
import * as deleteAssessmentQ from '../commands/hpa/delete_assessment_question';
import * as publishAssessment from '../commands/hpa/publish_assessment';
import * as restrictAssessment from '../commands/hpa/restrict_assessment';
import * as viewResults from '../commands/hpa/view_assessment_results';
import * as viewSessions from '../commands/hpa/view_active_sessions';
import * as approveRetake from '../commands/hpa/approve_retake';

const commands: Record<string, { execute: (i: ChatInputCommandInteraction) => Promise<void> }> = {
  help, my_logs: myLogs, appeal, tag, tag_search: tagSearch, pa_assessment: paAssessment,
  log_mistake: logMistake, staff_profile: staffProfile, staff_overview: staffOverview,
  lookup_post: lookupPost, warn_user: warnUser, create_vote: createVote,
  list_assessments: listAssessments, create_tag: createTag, edit_tag: editTag, delete_tag: deleteTag,
  force_strike: forceStrike, manage_log: manageLog, set_escalation: setEscalation,
  recalculate_escalation: recalcEscalation, notify_user: notifyUser, bulk_actions: bulkActions,
  manage_log_tracker: manageLogTracker, create_assessment: createAssessment,
  create_assessment_question: createAssessmentQ, edit_assessment_question: editAssessmentQ,
  delete_assessment_question: deleteAssessmentQ, publish_assessment: publishAssessment,
  restrict_assessment: restrictAssessment, view_assessment_results: viewResults,
  view_active_sessions: viewSessions, approve_retake: approveRetake,
};

export async function handleInteraction(interaction: Interaction): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = commands[interaction.commandName];
      if (cmd) await cmd.execute(interaction);

    } else if (interaction.isButton()) {
      await handleButton(interaction as any);

    } else if (interaction.isStringSelectMenu()) {
      await handleSelect(interaction as any);

    } else if (interaction.isModalSubmit()) {
      await handleModal(interaction as any);
    }
  } catch (err) {
    console.error('Interaction error:', err);
    try {
      const msg = { content: '❌ An error occurred.', ephemeral: true };
      if ((interaction as any).replied) return;
      if ((interaction as any).deferred) await (interaction as any).editReply(msg);
      else if ((interaction as any).reply) await (interaction as any).reply(msg);
    } catch { /* silent */ }
  }
}

// ─── BUTTON HANDLER ───────────────────────────────────────────────────────────
async function handleButton(i: any): Promise<void> {
  const [action, ...rest] = i.customId.split(':');

  // Pending log review
  if (action === 'log_approve') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }
    const pendingId = parseInt(rest[0]);
    const [pending] = await sql`SELECT * FROM pending_logs WHERE id = ${pendingId}`;
    if (!pending) { await i.reply({ embeds: [errorEmbed('Pending log not found.')], ephemeral: true }); return; }

    const mistakeBtn = new ButtonBuilder().setCustomId(`log_as:mistake:${pendingId}`).setLabel('Log as Mistake').setStyle(ButtonStyle.Primary);
    const strikeBtn  = new ButtonBuilder().setCustomId(`log_as:strike:${pendingId}`).setLabel('Log as Strike').setStyle(ButtonStyle.Danger);
    await i.reply({ content: 'Log as **Mistake** or **Strike**?', components: [new ActionRowBuilder<ButtonBuilder>().addComponents(mistakeBtn, strikeBtn)], ephemeral: true });
  }

  else if (action === 'log_as') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) return;
    const type = rest[0] as 'mistake' | 'strike';
    const pendingId = parseInt(rest[1]);
    const [pending] = await sql`SELECT * FROM pending_logs WHERE id = ${pendingId}`;
    if (!pending) { await i.update({ content: '❌ Not found.', components: [] }); return; }

    const exp = new Date(); exp.setDate(exp.getDate() + config.expiry.defaultDays);
    await sql`INSERT INTO logs (user_id, type, reason, post_id, logged_by, date, expires_at) VALUES (${pending.user_id}, ${type}, ${pending.reason}, ${pending.post_id}, ${pending.logged_by}, ${pending.date}, ${exp.toISOString()})`;
    await sql`DELETE FROM pending_logs WHERE id = ${pendingId}`;

    // Delete the original review embed
    try { await i.message.delete(); } catch { /* silent */ }

    // DM logger
    await safeDM(i.client, pending.logged_by, successEmbed('Log Approved', `Your log against <@${pending.user_id}> was approved.`), 'log approved');

    // DM user if strike
    if (type === 'strike') {
      await safeDM(i.client, pending.user_id, warningEmbed('Strike Issued', `You received a strike.\n\n**Reason:** ${pending.reason}\n**Date:** ${pending.date}`), 'strike');
    }

    if (type === 'mistake') await checkEscalation(i.client, pending.user_id);
    await updateLogTracker(i.client);
    await i.update({ content: `✅ Logged as **${type}**.`, components: [] });
  }

  else if (action === 'log_deny') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }
    const pendingId = parseInt(rest[0]);
    await i.showModal({
      customId: `modal_deny_log:${pendingId}`,
      title: 'Deny Log',
      components: [{ type: 1, components: [{ type: 4, customId: 'reason', label: 'Reason for denial', style: 2, required: true, minLength: 5, maxLength: 500 }] }]
    });
    try { await i.message.delete(); } catch { /* silent */ }
  }

  else if (action === 'log_edit') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }
    const pendingId = parseInt(rest[0]);
    const [pending] = await sql`SELECT * FROM pending_logs WHERE id = ${pendingId}`;
    if (!pending) { await i.reply({ embeds: [errorEmbed('Not found.')], ephemeral: true }); return; }
    await i.showModal({
      customId: `modal_edit_pending:${pendingId}`,
      title: 'Edit Pending Log Reason',
      components: [{ type: 1, components: [{ type: 4, customId: 'reason', label: 'Updated reason', style: 2, required: true, value: pending.reason, maxLength: 1000 }] }]
    });
  }

  // Appeals
  else if (action === 'appeal_approve') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }
    const appealId = parseInt(rest[0]);
    const [ap] = await sql`SELECT * FROM appeals WHERE id = ${appealId}`;
    if (!ap) { await i.reply({ embeds: [errorEmbed('Appeal not found.')], ephemeral: true }); return; }

    await sql`DELETE FROM logs WHERE id = ${ap.log_id}`;
    await sql`UPDATE appeals SET status = 'approved' WHERE id = ${appealId}`;
    await safeDM(i.client, ap.user_id, successEmbed('Appeal Approved', 'Your appeal was approved and the mistake has been removed.'), 'appeal approved');
    try { await i.message.delete(); } catch { /* silent */ }
    await i.reply({ embeds: [successEmbed('Approved', `Appeal #${appealId} approved.`)], ephemeral: true });
  }

  else if (action === 'appeal_deny') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }
    const appealId = parseInt(rest[0]);
    await sql`UPDATE appeals SET status = 'denied' WHERE id = ${appealId}`;
    try { await i.message.delete(); } catch { /* silent */ }
    await i.reply({ embeds: [successEmbed('Denied', `Appeal #${appealId} denied.`)], ephemeral: true });
  }

  // Votes
  else if (action === 'vote_cast') {
    const voteId = parseInt(rest[0]);
    const [vote] = await sql`SELECT * FROM votes WHERE id = ${voteId}`;
    if (!vote || vote.status === 'closed') { await i.reply({ embeds: [errorEmbed('This vote is no longer active.')], ephemeral: true }); return; }
    if (new Date(vote.deadline) <= new Date()) { await closeVote(i.client, voteId); await i.reply({ embeds: [errorEmbed('Vote expired.')], ephemeral: true }); return; }

    const guild = i.guild!;
    const candidates = (await guild.members.fetch()).filter((m: GuildMember) => m.roles.cache.has(vote.role_id) && m.id !== i.user.id);
    if (candidates.size === 0) { await i.reply({ embeds: [errorEmbed('No eligible candidates.')], ephemeral: true }); return; }

    const select = new StringSelectMenuBuilder().setCustomId(`vote_select:${voteId}`).setPlaceholder('Select a candidate')
      .addOptions(candidates.map((m: GuildMember) => new StringSelectMenuOptionBuilder().setLabel(m.displayName).setValue(m.id)));

    const components: any[] = [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)];

    if (vote.anonymity === 'flexible') {
      components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`vote_anon:${voteId}`).setLabel('Vote Anonymously').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`vote_pub:${voteId}`).setLabel('Vote Publicly').setStyle(ButtonStyle.Secondary),
      ));
    }

    await i.reply({ content: 'Select your candidate:', components, ephemeral: true });
  }

  // Assessment buttons
  else if (action === 'assess') {
    const sessionId  = parseInt(rest[0]);
    const questionId = parseInt(rest[1]);
    const answer     = rest[2];

    const [session] = await sql`SELECT * FROM assessment_sessions WHERE id = ${sessionId}`;
    if (!session || session.user_id !== i.user.id) { await i.reply({ embeds: [errorEmbed('Session not found.')], ephemeral: true }); return; }
    if (new Date(session.deadline) <= new Date()) {
      await sql`DELETE FROM assessment_sessions WHERE id = ${sessionId}`;
      await i.update({ embeds: [errorEmbed('Session expired.')], components: [] });
      return;
    }

    if (answer === 'deny' || answer === 'suspend') {
      await i.showModal({
        customId: `modal_assess:${sessionId}:${questionId}:${answer}`,
        title: `${answer.charAt(0).toUpperCase() + answer.slice(1)} - Reason`,
        components: [{ type: 1, components: [{ type: 4, customId: 'reason', label: 'Reason', style: 2, required: true, minLength: 5, maxLength: 500 }] }]
      });
      return;
    }

    await submitAssessmentAnswer(i, sessionId, questionId, answer, null, session);
  }

  else if (action === 'scripting') {
    const sessionId = parseInt(rest[0]);
    const choice    = rest[1];
    const [session] = await sql`SELECT * FROM assessment_sessions WHERE id = ${sessionId}`;
    if (!session || session.user_id !== i.user.id) return;
    await i.update({ components: [] });
    if (choice === 'yes') await sendScriptingQuestions(i.client, i.user.id, sessionId, session.assessment_id);
    else await finalizeAssessment(i.client, i.user.id, sessionId, false);
  }

  // Retake requests
  else if (action === 'retake_approve') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }
    const reqId = parseInt(rest[0]);
    const [req] = await sql`SELECT r.*, a.title FROM retake_requests r JOIN assessments a ON r.assessment_id = a.id WHERE r.id = ${reqId}`;
    if (!req) { await i.reply({ embeds: [errorEmbed('Request not found.')], ephemeral: true }); return; }
    await sql`UPDATE retake_requests SET status = 'approved' WHERE id = ${reqId}`;
    await sql`DELETE FROM assessment_sessions WHERE user_id = ${req.user_id} AND assessment_id = ${req.assessment_id}`;
    await safeDM(i.client, req.user_id, successEmbed('Retake Approved', `Your retake for **${req.title}** has been approved. Use \`/pa_assessment\` to begin.`), 'retake approved');
    await i.update({ components: [] });
    await i.followUp({ embeds: [successEmbed('Approved', `Retake approved for <@${req.user_id}>.`)], ephemeral: true });
  }

  else if (action === 'retake_deny') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }
    const reqId = parseInt(rest[0]);
    const [req] = await sql`SELECT r.*, a.title FROM retake_requests r JOIN assessments a ON r.assessment_id = a.id WHERE r.id = ${reqId}`;
    if (!req) { await i.reply({ embeds: [errorEmbed('Request not found.')], ephemeral: true }); return; }
    await sql`UPDATE retake_requests SET status = 'denied' WHERE id = ${reqId}`;
    await safeDM(i.client, req.user_id, warningEmbed('Retake Denied', `Your retake request for **${req.title}** has been denied.`), 'retake denied');
    await i.update({ components: [] });
    await i.followUp({ embeds: [successEmbed('Denied', `Retake denied for <@${req.user_id}>.`)], ephemeral: true });
  }

  else if (action === 'retake_reason') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }
    const reqId = parseInt(rest[0]);
    const [req] = await sql`SELECT r.*, a.title FROM retake_requests r JOIN assessments a ON r.assessment_id = a.id WHERE r.id = ${reqId}`;
    if (!req) { await i.reply({ embeds: [errorEmbed('Request not found.')], ephemeral: true }); return; }
    await safeDM(i.client, req.user_id, infoEmbed('Retake Request', `HPA is asking: **Why do you want to retake ${req.title}?**\n\nPlease contact your HPA directly with your reason.`), 'retake reason request');
    await i.reply({ embeds: [successEmbed('Asked', `<@${req.user_id}> has been asked to provide a reason via DM.`)], ephemeral: true });
  }

  else if (action === 'review_confirm') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }
    const resultId = parseInt(rest[0]);
    const [result] = await sql`SELECT * FROM assessment_results WHERE id = ${resultId}`;
    if (!result) { await i.reply({ embeds: [errorEmbed('Result not found.')], ephemeral: true }); return; }
    await sql`UPDATE assessment_results SET hpa_reviewed = true WHERE id = ${resultId}`;
    await i.update({ components: [] });
    await sendFinalResult(i.client, result.user_id, resultId);
    await i.followUp({ embeds: [successEmbed('Confirmed', `Result sent to <@${result.user_id}>.`)], ephemeral: true });
  }

  else if (action === 'review_override') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }
    const resultId = parseInt(rest[0]);
    await i.showModal({
      customId: `modal_override:${resultId}`,
      title: 'Override Result',
      components: [
        { type: 1, components: [{ type: 4, customId: 'score', label: 'New Score (number)', style: 1, required: false, maxLength: 5 }] },
        { type: 1, components: [{ type: 4, customId: 'passed', label: 'Pass? (yes/no)', style: 1, required: false, maxLength: 3 }] },
        { type: 1, components: [{ type: 4, customId: 'feedback', label: 'Feedback for user (optional)', style: 2, required: false, maxLength: 1000 }] },
      ]
    });
  }

  else if (action === 'view_details') {
    const resultId = parseInt(rest[0]);
    const [result] = await sql`SELECT r.*, a.title FROM assessment_results r JOIN assessments a ON r.assessment_id = a.id WHERE r.id = ${resultId}`;
    if (!result || result.user_id !== i.user.id) { await i.reply({ embeds: [errorEmbed('Not found.')], ephemeral: true }); return; }

    const responses = await sql`
      SELECT r.*, q.post_id, q.correct_answer, q.keywords
      FROM assessment_responses r JOIN assessment_questions q ON r.question_id = q.id
      WHERE r.session_id = ${result.session_id} ORDER BY r.answered_at ASC
    `;

    const embed = new EmbedBuilder().setColor(Colors.Blue).setTitle(`📊 Detailed Results - ${result.title}`).setTimestamp();
    responses.slice(0, 10).forEach((r: any, idx: number) => {
      const ok = r.override_correct ?? r.is_correct;
      embed.addFields({ name: `Q${idx + 1}: \`${r.post_id}\` ${ok ? '✅' : '❌'}`, value: [`Your answer: **${r.action}**`, r.reason ? `Your reason: ${r.reason}` : null, `Correct: **${r.correct_answer}**`, r.keywords ? `Expected: ${r.keywords}` : null].filter(Boolean).join('\n') });
    });
    await i.reply({ embeds: [embed], ephemeral: true });
  }
}

// ─── SELECT HANDLER ───────────────────────────────────────────────────────────
async function handleSelect(i: any): Promise<void> {
  const [action, ...rest] = i.customId.split(':');

  if (action === 'vote_select') {
    const voteId      = parseInt(rest[0]);
    const candidateId = i.values[0];
    const [vote]      = await sql`SELECT * FROM votes WHERE id = ${voteId}`;
    if (!vote || vote.status === 'closed') { await i.reply({ embeds: [errorEmbed('Vote is closed.')], ephemeral: true }); return; }

    const isAnon = vote.anonymity === 'anonymous';
    await sql`
      INSERT INTO vote_entries (vote_id, voter_id, candidate_id, anonymous)
      VALUES (${voteId}, ${i.user.id}, ${candidateId}, ${isAnon})
      ON CONFLICT (vote_id, voter_id) DO UPDATE SET candidate_id = ${candidateId}, anonymous = ${isAnon}
    `;

    // Update vote count
    const [countRow] = await sql`SELECT COUNT(*) as count FROM vote_entries WHERE vote_id = ${voteId}`;
    try {
      const ch = await i.client.channels.fetch(vote.channel_id) as TextChannel;
      const msg = await ch.messages.fetch(vote.message_id);
      const embed = EmbedBuilder.from(msg.embeds[0]);
      const fields = embed.data.fields?.map((f: any) => f.name === 'Total Votes' ? { ...f, value: String(countRow.count) } : f) ?? [];
      embed.setFields(fields);
      await msg.edit({ embeds: [embed] });
    } catch { /* silent */ }

    await i.update({ content: `✅ Vote cast for <@${candidateId}>!`, components: [] });
  }
}

// ─── MODAL HANDLER ────────────────────────────────────────────────────────────
async function handleModal(i: any): Promise<void> {
  const [action, ...rest] = i.customId.split(':');

  if (action === 'modal_deny_log') {
    await i.deferReply({ ephemeral: true });
    const pendingId = parseInt(rest[0]);
    const reason    = i.fields.getTextInputValue('reason').trim();
    const [pending] = await sql`SELECT * FROM pending_logs WHERE id = ${pendingId}`;
    if (!pending) { await i.editReply({ embeds: [errorEmbed('Not found.')] }); return; }

    await sql`DELETE FROM pending_logs WHERE id = ${pendingId}`;
    await sql`DELETE FROM used_post_ids WHERE post_id = ${pending.post_id}`;
    await safeDM(i.client, pending.logged_by, warningEmbed(`Log Denied - Post ID: ${pending.post_id}`, `Your log against <@${pending.user_id}> was denied.\n\n**Reason:** ${reason}`), 'log denied');
    await i.editReply({ embeds: [successEmbed('Denied', 'Log denied and logger notified.')] });
  }

  else if (action === 'modal_edit_pending') {
    await i.deferReply({ ephemeral: true });
    const pendingId = parseInt(rest[0]);
    const reason    = i.fields.getTextInputValue('reason').trim();
    const [pending] = await sql`SELECT * FROM pending_logs WHERE id = ${pendingId}`;
    if (!pending) { await i.editReply({ embeds: [errorEmbed('Not found.')] }); return; }

    await sql`UPDATE pending_logs SET reason = ${reason} WHERE id = ${pendingId}`;

    // Update embed in HPA channel
    try {
      const ch = await i.client.channels.fetch(config.channels.hpaReview) as TextChannel;
      const msgs = await ch.messages.fetch({ limit: 50 });
      const target = msgs.find((m: any) => m.embeds[0]?.footer?.text?.includes(`Pending ID: ${pendingId}`));
      if (target) {
        const approve = new ButtonBuilder().setCustomId(`log_approve:${pendingId}`).setLabel('✅ Approve').setStyle(ButtonStyle.Success);
        const editBtn = new ButtonBuilder().setCustomId(`log_edit:${pendingId}`).setLabel('✏️ Edit Reason').setStyle(ButtonStyle.Primary);
        const deny    = new ButtonBuilder().setCustomId(`log_deny:${pendingId}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger);
        const updatedEmbed = pendingLogEmbed({ userId: pending.user_id, postId: pending.post_id, reason, loggedBy: pending.logged_by, date: typeof pending.date === 'string' ? pending.date.split('T')[0] : new Date(pending.date).toISOString().split('T')[0], pendingId });
        await target.edit({ embeds: [updatedEmbed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(approve, editBtn, deny)] });
      }
    } catch { /* silent */ }

    await i.editReply({ embeds: [successEmbed('Updated', `Reason updated to: ${reason}`)] });
  }

  else if (action === 'modal_assess') {
    const sessionId  = parseInt(rest[0]);
    const questionId = parseInt(rest[1]);
    const answer     = rest[2];
    const reason     = i.fields.getTextInputValue('reason').trim();
    const [session]  = await sql`SELECT * FROM assessment_sessions WHERE id = ${sessionId}`;

    await i.deferUpdate().catch(() => {});

    // Clear buttons from original message
    try { if (i.message) await i.message.edit({ components: [] }); } catch { /* silent */ }

    await submitAssessmentAnswer(i, sessionId, questionId, answer, reason, session);
  }

  else if (action === 'modal_override') {
    await i.deferReply({ ephemeral: true });
    const resultId    = parseInt(rest[0]);
    const scoreRaw    = i.fields.getTextInputValue('score').trim();
    const passedRaw   = i.fields.getTextInputValue('passed').trim().toLowerCase();
    const feedback    = i.fields.getTextInputValue('feedback').trim() || null;
    const [result]    = await sql`SELECT * FROM assessment_results WHERE id = ${resultId}`;
    if (!result) { await i.editReply({ embeds: [errorEmbed('Not found.')] }); return; }

    const overrideScore  = scoreRaw ? parseInt(scoreRaw) : null;
    const overridePassed = passedRaw === 'yes' ? true : passedRaw === 'no' ? false : null;

    await sql`UPDATE assessment_results SET hpa_override_score = ${overrideScore}, hpa_override_passed = ${overridePassed}, hpa_feedback = ${feedback}, hpa_reviewed = true WHERE id = ${resultId}`;
    await sendFinalResult(i.client, result.user_id, resultId);
    await i.editReply({ embeds: [successEmbed('Override Applied', 'Result updated and sent to user.')] });
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
async function submitAssessmentAnswer(i: any, sessionId: number, questionId: number, answer: string, reason: string | null, session: any): Promise<void> {
  const existing = await sql`SELECT 1 FROM assessment_responses WHERE session_id = ${sessionId} AND question_id = ${questionId}`;
  if (existing.length > 0) return;

  await sql`INSERT INTO assessment_responses (session_id, question_id, action, reason) VALUES (${sessionId}, ${questionId}, ${answer}, ${reason})`;
  const newIndex = session.current_index + 1;
  await sql`UPDATE assessment_sessions SET current_index = ${newIndex} WHERE id = ${sessionId}`;

  const order = Array.isArray(session.question_order)
    ? session.question_order.map(Number)
    : JSON.parse(session.question_order).map(Number);

  // Clear buttons on DM message
  try {
    if (i.isButton?.() && !i.replied) await i.update({ components: [] });
    else if (i.message) await i.message.edit({ components: [] }).catch(() => {});
  } catch { /* silent */ }

  await sendQuestion(i.client, session.user_id, sessionId, session.assessment_id, order, newIndex);
}
