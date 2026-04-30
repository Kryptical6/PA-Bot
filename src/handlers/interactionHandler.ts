import { Interaction, ChatInputCommandInteraction, GuildMember, TextChannel, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { sql } from '../database/client';
import { config } from '../config';
import { isHPA, isSPA } from '../utils/permissions';
import { successEmbed, errorEmbed, warningEmbed, pendingLogEmbed, infoEmbed } from '../utils/embeds';
import { safeDM, dmUser } from '../services/dmService';
import { checkEscalation } from '../services/escalationService';
import { updateLogTracker } from '../services/logTrackerService';
import { closeVote } from '../services/voteService';
import { sendQuestion, sendScriptingQuestions, finalizeAssessment, sendFinalResult, buildReviewEmbed } from '../services/assessmentService';

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
import * as createEmbed from '../commands/spa/create_embed';
import * as editEmbed from '../commands/spa/edit_embed';
import * as editGameNight from '../commands/spa/edit_game_night';
import * as escalate from '../commands/shared/escalate';
import * as myEscalations from '../commands/shared/my_escalations';
import * as viewEscalations from '../commands/spa/view_escalations';
import { buildEscalationEmbed, buildPendingRow, buildClaimedRow } from '../commands/shared/escalate';
import * as suggestGame from '../commands/shared/suggest_game';
import * as viewSuggestions from '../commands/shared/view_suggestions';
import * as createGameNight from '../commands/hpa/create_game_night';
import * as cancelGameNight from '../commands/hpa/cancel_game_night';
import { updateScheduleEmbed, buildGameNightEmbed } from '../services/gameNightService';
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
  create_embed: createEmbed, edit_embed: editEmbed,
  suggest_game: suggestGame, view_suggestions: viewSuggestions,
  escalate, my_escalations: myEscalations, view_escalations: viewEscalations,
  edit_game_night: editGameNight,
  create_game_night: createGameNight, cancel_game_night: cancelGameNight,
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

  // Game night buttons
  const gameNightActions = ['gs_approve', 'gs_deny', 'gs_upvote', 'gn_rsvp', 'gn_list'];
  if (gameNightActions.includes(action)) { await handleGameNightButton(i); return; }

  // Escalation buttons
  const escalationActions = ['esc_claim', 'esc_withdraw', 'esc_handle', 'esc_reject', 'esc_escalate_hpa'];
  if (escalationActions.includes(action)) { await handleEscalationButton(i, action, rest); return; }

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
    const pendingRows = await sql`SELECT * FROM pending_logs WHERE id = ${pendingId}`;
    if (pendingRows.length === 0) { await i.update({ content: '❌ Not found.', components: [] }); return; }
    const pending = pendingRows[0];

    const exp = new Date(); exp.setDate(exp.getDate() + config.expiry.defaultDays);
    await sql`INSERT INTO logs (user_id, type, reason, post_id, logged_by, date, expires_at) VALUES (${pending.user_id}, ${type}, ${pending.reason}, ${pending.post_id}, ${pending.logged_by}, ${pending.date}, ${exp.toISOString()})`;
    await sql`DELETE FROM pending_logs WHERE id = ${pendingId}`;

    // Update the embed to show result, remove buttons
    const resultEmbed = new EmbedBuilder()
      .setColor(type === 'mistake' ? Colors.Orange : Colors.Red)
      .setTitle(`${type === 'mistake' ? '⚠️ Mistake Logged' : '❌ Strike Logged'}`)
      .setDescription(`**Post ID:** \`${pending.post_id}\`\nLogged for <@${pending.user_id}>\n\n**Reason:** ${pending.reason}`)
      .setFooter({ text: `Logged by ${i.user.tag}` })
      .setTimestamp();
    try { await i.message.edit({ embeds: [resultEmbed], components: [] }); } catch { /* silent */ }

    // DM logger
    await safeDM(i.client, pending.logged_by, successEmbed('Log Approved', `Your log against <@${pending.user_id}> was approved as a **${type}**.`), 'log approved');

    // DM user if strike
    if (type === 'strike') {
      await safeDM(i.client, pending.user_id, warningEmbed('Strike Issued', `You received a strike.\n\n**Reason:** ${pending.reason}\n**Date:** ${pending.date}`), 'strike');
    }

    if (type === 'mistake') {
      await checkEscalation(i.client, pending.user_id);
      await sendMilestoneDM(i.client, pending.user_id);
    }
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
    const voteRows = await sql`SELECT * FROM votes WHERE id = ${voteId}`;
    if (voteRows.length === 0 || voteRows[0].status === 'closed') { await i.reply({ embeds: [errorEmbed('This vote is no longer active.')], ephemeral: true }); return; }
    const vote = voteRows[0];
    if (new Date(vote.deadline) <= new Date()) { await closeVote(i.client, voteId); await i.reply({ embeds: [errorEmbed('Vote expired.')], ephemeral: true }); return; }

    if (!i.guild) { await i.reply({ embeds: [errorEmbed('Could not access server data.')], ephemeral: true }); return; }

    await i.guild.members.fetch();
    const candidatesCollection = i.guild.members.cache.filter((m: GuildMember) => m.roles.cache.has(vote.role_id) && m.id !== i.user.id && !m.user.bot);
    const candidates = Array.from(candidatesCollection.values());

    if (candidates.length === 0) { await i.reply({ embeds: [errorEmbed('No eligible candidates found.')], ephemeral: true }); return; }
    if (candidates.length > 25) candidates.splice(25);

    const select = new StringSelectMenuBuilder()
      .setCustomId(`vote_select:${voteId}`)
      .setPlaceholder('Select a candidate')
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

  else if (action === 'escalation_dm') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }
    const targetId = rest[0];
    await i.showModal({
      customId: `modal_escalation_dm:${targetId}`,
      title: 'Send Escalation Explanation',
      components: [{
        type: 1,
        components: [{
          type: 4, customId: 'message', label: 'Message to send the user',
          style: 2, required: true, minLength: 5, maxLength: 1000,
          placeholder: 'Explain why they received the strike...'
        }]
      }]
    });
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

  else if (action === 'review_page') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }
    const resultId = parseInt(rest[0]);
    const page     = parseInt(rest[1]);

    const [result] = await sql`SELECT r.*, a.title, a.pass_threshold FROM assessment_results r JOIN assessments a ON r.assessment_id = a.id WHERE r.id = ${resultId}`;
    if (!result) { await i.reply({ embeds: [errorEmbed('Result not found.')], ephemeral: true }); return; }

    const responses = await sql`
      SELECT r.*, q.correct_answer, q.keywords, q.is_scripting, q.post_id
      FROM assessment_responses r JOIN assessment_questions q ON r.question_id = q.id
      WHERE r.session_id = ${result.session_id} ORDER BY r.answered_at ASC
    `;

    const score  = result.hpa_override_score ?? result.score;
    const passed = result.hpa_override_passed ?? result.passed;
    const { embed, row } = buildReviewEmbed(result.user_id, { title: result.title, pass_threshold: result.pass_threshold }, responses, score, result.total, result.percentage, passed, page, resultId);
    await i.update({ embeds: [embed], components: [row] });
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
        { type: 1, components: [{ type: 4, customId: 'score', label: 'Override total score (leave blank to skip)', style: 1, required: false, maxLength: 5 }] },
        { type: 1, components: [{ type: 4, customId: 'passed', label: 'Override pass/fail? (yes/no, leave blank to skip)', style: 1, required: false, maxLength: 3 }] },
        { type: 1, components: [{ type: 4, customId: 'question_overrides', label: 'Question overrides: Q1=correct,Q3=incorrect', style: 2, required: false, maxLength: 500, placeholder: 'e.g. Q1=correct,Q3=incorrect,Q5=correct' }] },
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

// ─── GAME NIGHT BUTTONS ───────────────────────────────────────────────────────
// ─── ESCALATION BUTTONS ───────────────────────────────────────────────────────
async function handleEscalationButton(i: any, action: string, rest: string[]): Promise<void> {
  const escalationId = parseInt(rest[0]);
  const escRows = await sql`SELECT * FROM post_escalations WHERE id = ${escalationId}`;
  if (escRows.length === 0) { await i.reply({ embeds: [errorEmbed('Escalation not found.')], ephemeral: true }); return; }
  const e = escRows[0];

  const m = i.member as GuildMember;
  const canManage = isSPA(m);
  const isClaimer = e.claimed_by === i.user.id;
  const isSubmitter = e.submitted_by === i.user.id;

  if (action === 'esc_claim') {
    if (!canManage) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }
    if (e.status !== 'pending') { await i.reply({ embeds: [errorEmbed('This escalation has already been claimed.')], ephemeral: true }); return; }

    await sql`UPDATE post_escalations SET status = 'claimed', claimed_by = ${i.user.id}, updated_at = NOW() WHERE id = ${escalationId}`;
    const updated = (await sql`SELECT * FROM post_escalations WHERE id = ${escalationId}`)[0];
    await i.message.edit({ embeds: [buildEscalationEmbed(updated)], components: [buildClaimedRow(escalationId)] });
    await i.reply({ content: `✅ You have claimed escalation #${escalationId}.`, ephemeral: true });
  }

  else if (action === 'esc_withdraw') {
    if (!isSubmitter) { await i.reply({ content: 'Only the submitter can withdraw this escalation.', ephemeral: true }); return; }
    if (e.status !== 'pending') { await i.reply({ embeds: [errorEmbed('You can only withdraw pending escalations.')], ephemeral: true }); return; }

    await sql`DELETE FROM post_escalations WHERE id = ${escalationId}`;
    await i.message.edit({ embeds: [buildEscalationEmbed({ ...e, status: 'handled', resolution_notes: 'Withdrawn by submitter' })], components: [] });
    await i.reply({ content: '↩️ Escalation withdrawn.', ephemeral: true });
  }

  else if (action === 'esc_handle' || action === 'esc_reject') {
    if (!canManage) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }
    if (e.status !== 'claimed' && e.status !== 'escalated_hpa') { await i.reply({ embeds: [errorEmbed('This escalation is not claimed.')], ephemeral: true }); return; }
    if (!isClaimer && !isHPA(m)) { await i.reply({ content: 'Only the claimer or HPA can resolve this.', ephemeral: true }); return; }

    const newStatus = action === 'esc_handle' ? 'handled' : 'rejected';
    await i.showModal({
      customId: `esc_resolve_modal:${escalationId}:${newStatus}`,
      title: action === 'esc_handle' ? 'Resolve - Handled' : 'Resolve - Rejected',
      components: [{ type: 1, components: [{ type: 4, customId: 'notes', label: 'Resolution notes (required)', style: 2, required: true, minLength: 5, maxLength: 1000 }] }]
    });
  }

  else if (action === 'esc_escalate_hpa') {
    if (!canManage) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }
    if (!isClaimer && !isHPA(m)) { await i.reply({ content: 'Only the claimer or HPA can escalate.', ephemeral: true }); return; }

    await sql`UPDATE post_escalations SET status = 'escalated_hpa', updated_at = NOW() WHERE id = ${escalationId}`;
    const updated = (await sql`SELECT * FROM post_escalations WHERE id = ${escalationId}`)[0];

    const hpaRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`esc_handle:${escalationId}`).setLabel('✅ Handled').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`esc_reject:${escalationId}`).setLabel('❌ Reject').setStyle(ButtonStyle.Danger),
    );

    await i.message.edit({ content: `<@&${config.roles.HPA}> This escalation has been escalated to HPA.`, embeds: [buildEscalationEmbed(updated)], components: [hpaRow] });
    await i.reply({ content: '⬆️ Escalated to HPA.', ephemeral: true });
  }
}

async function handleGameNightButton(i: any): Promise<void> {
  const [action, ...rest] = i.customId.split(':');

  if (action === 'gs_approve') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }
    const suggId = parseInt(rest[0]);
    const suggestions = await sql`SELECT * FROM game_suggestions WHERE id = ${suggId}`;
    if (suggestions.length === 0) { await i.reply({ embeds: [errorEmbed('Not found.')], ephemeral: true }); return; }
    const s = suggestions[0];

    await sql`UPDATE game_suggestions SET status = 'approved' WHERE id = ${suggId}`;

    // Post in suggestions channel with upvote button
    try {
      const ch = await i.client.channels.fetch(config.channels.gameSuggestions) as TextChannel;
      const embed = new EmbedBuilder()
        .setColor(Colors.Purple)
        .setTitle(`🎮 ${s.game_name}`)
        .setDescription(s.description ?? 'No description provided.')
        .addFields({ name: 'Suggested by', value: `<@${s.suggested_by}>`, inline: true }, { name: '👍 Upvotes', value: '0', inline: true })
        .setFooter({ text: `ID: ${suggId}` })
        .setTimestamp();
      const btn = new ButtonBuilder().setCustomId(`gs_upvote:${suggId}`).setLabel('👍 Upvote').setStyle(ButtonStyle.Primary);
      const msg = await ch.send({ embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(btn)] });
      await sql`UPDATE game_suggestions SET message_id = ${msg.id} WHERE id = ${suggId}`;
    } catch (e) { console.error('Failed to post approved suggestion:', e); }

    await i.update({ components: [] });
    await i.followUp({ embeds: [successEmbed('Approved', `**${s.game_name}** has been approved and posted.`)], ephemeral: true });
  }

  else if (action === 'gs_deny') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }
    const suggId = parseInt(rest[0]);
    await sql`UPDATE game_suggestions SET status = 'denied' WHERE id = ${suggId}`;
    await i.update({ components: [] });
    await i.followUp({ embeds: [successEmbed('Denied', 'Suggestion denied.')], ephemeral: true });
  }

  else if (action === 'gs_upvote') {
    const suggId = parseInt(rest[0]);
    const existing = await sql`SELECT 1 FROM game_suggestion_upvotes WHERE suggestion_id = ${suggId} AND user_id = ${i.user.id}`;
    if (existing.length > 0) {
      await i.reply({ content: 'You have already upvoted this suggestion.', ephemeral: true });
      return;
    }
    await sql`INSERT INTO game_suggestion_upvotes (suggestion_id, user_id) VALUES (${suggId}, ${i.user.id})`;
    await sql`UPDATE game_suggestions SET upvotes = upvotes + 1 WHERE id = ${suggId}`;

    // Update embed
    const [s] = await sql`SELECT * FROM game_suggestions WHERE id = ${suggId}`;
    try {
      const embed = EmbedBuilder.from(i.message.embeds[0]);
      const fields = embed.data.fields?.map((f: any) => f.name === '👍 Upvotes' ? { ...f, value: String(s.upvotes) } : f) ?? [];
      embed.setFields(fields);
      await i.message.edit({ embeds: [embed] });
    } catch { /* silent */ }

    await i.reply({ content: '👍 Upvoted!', ephemeral: true });
  }

  else if (action === 'gn_rsvp') {
    const nightId  = parseInt(rest[0]);
    const attending = rest[1] === 'yes';

    await sql`
      INSERT INTO game_night_rsvps (game_night_id, user_id, attending)
      VALUES (${nightId}, ${i.user.id}, ${attending})
      ON CONFLICT (game_night_id, user_id) DO UPDATE SET attending = ${attending}
    `;

    // Update the announcement embed
    try {
      const { embed, row } = await buildGameNightEmbed(nightId);
      await i.message.edit({ embeds: [embed], components: [row] });
    } catch { /* silent */ }

    await i.reply({ content: attending ? '✅ You are marked as attending!' : '❌ You are marked as not attending.', ephemeral: true });
  }

  else if (action === 'gn_list') {
    const nightId = parseInt(rest[0]);
    const rsvps = await sql`SELECT * FROM game_night_rsvps WHERE game_night_id = ${nightId}`;
    const attending    = rsvps.filter((r: any) => r.attending).map((r: any) => `<@${r.user_id}>`);
    const notAttending = rsvps.filter((r: any) => !r.attending).map((r: any) => `<@${r.user_id}>`);

    const embed = new EmbedBuilder()
      .setColor(Colors.Purple)
      .setTitle('👥 RSVP List')
      .addFields(
        { name: `✅ Attending (${attending.length})`,     value: attending.length > 0 ? attending.join('\n') : 'None', inline: true },
        { name: `❌ Not Attending (${notAttending.length})`, value: notAttending.length > 0 ? notAttending.join('\n') : 'None', inline: true },
      )
      .setTimestamp();

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

  if (action === 'create_embed_modal') {
    const channelId = rest[0];
    const color     = rest[1];
    const title   = i.fields.getTextInputValue('title').trim() || null;
    const content = i.fields.getTextInputValue('content').trim();
    const footer  = i.fields.getTextInputValue('footer').trim() || null;

    const colorMap: Record<string, number> = {
      blue: 0x3498db, green: 0x2ecc71, red: 0xe74c3c,
      yellow: 0xf1c40f, purple: 0x9b59b6, orange: 0xe67e22, white: 0xffffff,
    };

    const embed = new EmbedBuilder().setColor(colorMap[color] ?? 0x3498db).setDescription(content).setTimestamp();
    if (title) embed.setTitle(title);
    if (footer) embed.setFooter({ text: footer });

    try {
      const ch = await i.client.channels.fetch(channelId) as TextChannel;
      const msg = await ch.send({ embeds: [embed] });
      await i.reply({ content: `✅ Embed posted in <#${channelId}>! Message ID: \`${msg.id}\``, ephemeral: true });
    } catch (e) {
      await i.reply({ embeds: [errorEmbed('Failed to post embed. Check the bot has permission to send messages in that channel.')], ephemeral: true });
    }
  }

  else if (action === 'edit_embed_modal') {
    const channelId = rest[0];
    const messageId = rest[1];
    const title   = i.fields.getTextInputValue('title').trim() || null;
    const content = i.fields.getTextInputValue('content').trim();
    const footer  = i.fields.getTextInputValue('footer').trim() || null;

    try {
      const ch  = await i.client.channels.fetch(channelId) as TextChannel;
      const msg = await ch.messages.fetch(messageId);
      const existing = msg.embeds[0];

      const embed = new EmbedBuilder()
        .setColor(existing?.color ?? 0x3498db)
        .setDescription(content)
        .setTimestamp();
      if (title) embed.setTitle(title);
      if (footer) embed.setFooter({ text: footer });

      await msg.edit({ embeds: [embed] });
      await i.reply({ content: '✅ Embed updated successfully.', ephemeral: true });
    } catch (e) {
      await i.reply({ embeds: [errorEmbed('Failed to edit embed. Make sure the message ID and channel are correct.')], ephemeral: true });
    }
  }

  else if (action === 'modal_deny_log') {
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
    const resultId       = parseInt(rest[0]);
    const scoreRaw       = i.fields.getTextInputValue('score').trim();
    const passedRaw      = i.fields.getTextInputValue('passed').trim().toLowerCase();
    const feedback       = i.fields.getTextInputValue('feedback').trim() || null;
    const qOverridesRaw  = i.fields.getTextInputValue('question_overrides').trim();
    const [result]       = await sql`SELECT * FROM assessment_results WHERE id = ${resultId}`;
    if (!result) { await i.editReply({ embeds: [errorEmbed('Not found.')] }); return; }

    // Process per-question overrides e.g. "Q1=correct,Q3=incorrect"
    if (qOverridesRaw) {
      const responses = await sql`
        SELECT r.id FROM assessment_responses r
        WHERE r.session_id = ${result.session_id} ORDER BY r.answered_at ASC
      `;
      const parts = qOverridesRaw.split(',');
      for (const part of parts) {
        const match = part.trim().match(/^Q(\d+)=(correct|incorrect)$/i);
        if (match) {
          const qIdx = parseInt(match[1]) - 1;
          const isCorrect = match[2].toLowerCase() === 'correct';
          if (responses[qIdx]) {
            await sql`UPDATE assessment_responses SET override_correct = ${isCorrect} WHERE id = ${responses[qIdx].id}`;
          }
        }
      }
      // Recalculate score from overrides
      const allResponses = await sql`SELECT is_correct, override_correct FROM assessment_responses WHERE session_id = ${result.session_id}`;
      let newScore = 0;
      for (const r of allResponses) {
        const ok = r.override_correct !== null ? r.override_correct : r.is_correct;
        if (ok) newScore++;
      }
      const newPct    = Math.round((newScore / result.total) * 100);
      const [assessment] = await sql`SELECT pass_threshold FROM assessments WHERE id = ${result.assessment_id}`;
      const newPassed = newPct >= assessment.pass_threshold;
      await sql`UPDATE assessment_results SET hpa_override_score = ${newScore}, hpa_override_passed = ${newPassed}, hpa_reviewed = true, hpa_feedback = ${feedback} WHERE id = ${resultId}`;
    } else {
      const overrideScore  = scoreRaw ? parseInt(scoreRaw) : null;
      const overridePassed = passedRaw === 'yes' ? true : passedRaw === 'no' ? false : null;
      await sql`UPDATE assessment_results SET hpa_override_score = ${overrideScore}, hpa_override_passed = ${overridePassed}, hpa_reviewed = true, hpa_feedback = ${feedback} WHERE id = ${resultId}`;
    }

    await sendFinalResult(i.client, result.user_id, resultId);
    await i.editReply({ embeds: [successEmbed('Override Applied', 'Result updated and sent to user.')] });
  }

  else if (action === 'modal_escalation_dm') {
    await i.deferReply({ ephemeral: true });
    const targetId = rest[0];
    const message  = i.fields.getTextInputValue('message').trim();
    try {
      const user = await i.client.users.fetch(targetId);
      const dm   = await user.createDM();
      await dm.send({ embeds: [warningEmbed('Strike Explanation', message)] });
      await i.editReply({ embeds: [successEmbed('Sent', `Explanation DM sent to <@${targetId}>.`)] });
      try { await i.message.edit({ components: [] }); } catch { /* silent */ }
    } catch {
      await i.editReply({ embeds: [errorEmbed('Failed to DM user. They may have DMs disabled.')] });
    }
  }

  else if (action === 'gn_edit_modal') {
    await i.deferReply({ ephemeral: true });
    const nightId = parseInt(rest[0]);
    const title   = i.fields.getTextInputValue('title').trim();
    const dateStr = i.fields.getTextInputValue('date').trim();
    const gamesRaw = i.fields.getTextInputValue('games').trim();
    const desc    = i.fields.getTextInputValue('description').trim() || null;

    const scheduledAt = new Date(dateStr);
    if (isNaN(scheduledAt.getTime())) {
      await i.editReply({ embeds: [errorEmbed('Invalid date. Use YYYY-MM-DD HH:MM.')] });
      return;
    }

    const games = gamesRaw.split(',').map((g: string) => g.trim()).filter(Boolean);
    await sql`UPDATE game_nights SET title = ${title}, scheduled_at = ${scheduledAt.toISOString()}, games = ${games}, description = ${desc} WHERE id = ${nightId}`;

    // Update announcement embed if it exists
    const nights = await sql`SELECT * FROM game_nights WHERE id = ${nightId}`;
    if (nights.length > 0 && nights[0].announcement_message_id) {
      try {
        const ch = await i.client.channels.fetch(config.channels.gameNightSchedule) as TextChannel;
        const msg = await ch.messages.fetch(nights[0].announcement_message_id);
        const { embed, row } = await buildGameNightEmbed(nightId);
        await msg.edit({ embeds: [embed], components: [row] });
      } catch { /* silent */ }
    }

    await updateScheduleEmbed(i.client);
    await i.editReply({ embeds: [successEmbed('Updated', `Game night #${nightId} updated.`)] });
  }

  else if (action === 'escalate_modal') {
    // action is now in rest[0] since customId is escalate_modal:action
    // This path is no longer used - modal is handled inline in the command via awaitModalSubmit
    // But kept as fallback
    await i.deferReply({ ephemeral: true }).catch(() => {});
    await i.editReply({ content: 'Please use /escalate to submit an escalation.' }).catch(() => {});
  }

  else if (action === 'esc_resolve_modal') {
    const escalationId = parseInt(rest[0]);
    const newStatus    = rest[1];
    const notes        = i.fields.getTextInputValue('notes').trim();

    await i.deferUpdate().catch(() => {});

    await sql`UPDATE post_escalations SET status = ${newStatus}, resolution_notes = ${notes}, updated_at = NOW() WHERE id = ${escalationId}`;
    const updated = (await sql`SELECT * FROM post_escalations WHERE id = ${escalationId}`)[0];

    try { await i.message.edit({ embeds: [buildEscalationEmbed(updated)], components: [] }); } catch { /* silent */ }
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

// ─── MILESTONE DM ────────────────────────────────────────────────────────────
async function sendMilestoneDM(client: any, userId: string): Promise<void> {
  const rows = await sql`SELECT COUNT(*) as count FROM logs WHERE user_id = ${userId} AND type = 'mistake' AND expires_at > NOW()`;
  const count = parseInt(rows[0].count);
  if (count === 0 || count % 5 !== 0) return;

  const rateRows = await sql`SELECT rate FROM escalation_config WHERE id = 1`;
  const rate = rateRows[0]?.rate ?? 3;
  const remaining = Math.max(0, rate - (count % rate || rate));

  const embed = new EmbedBuilder()
    .setColor(Colors.Orange)
    .setTitle('⚠️ Mistake Notification')
    .setDescription(
      `You currently have **${count} active mistake(s)**.\n\n` +
      (remaining > 0 ? `You are **${remaining} mistake(s) away** from receiving a strike.` : 'You are at the escalation threshold.')
    )
    .setTimestamp();

  try {
    const user = await client.users.fetch(userId);
    const dm = await user.createDM();
    await dm.send({ embeds: [embed] });
  } catch { /* silent */ }
}
