import { Interaction, ChatInputCommandInteraction, GuildMember, TextChannel, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { sql } from '../database/client';
import { config } from '../config';
import { isHPA, isSPA, isPA } from '../utils/permissions';
import { successEmbed, errorEmbed, warningEmbed, pendingLogEmbed, infoEmbed, appealEmbed } from '../utils/embeds';
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
import * as setReminder from '../commands/spa/set_reminder';
import * as sendTag from '../commands/spa/send_tag';
import * as importAssessmentQ from '../commands/hpa/import_assessment_questions';
import * as createGameNight from '../commands/hpa/create_game_night';
import * as setupWeeklyReport from '../commands/hpa/setup_weekly_report';
import * as triggerWeeklyReport from '../commands/hpa/trigger_weekly_report';
import * as viewReportStatus from '../commands/hpa/view_report_status';
import { getActiveCycle, buildTagSelect, finalizeReport, generateSummary, scoreReport, getReportConfig, TAGS } from '../services/weeklyReportService';
import * as createFeedback from '../commands/hpa/create_feedback';
import * as closeFeedback from '../commands/hpa/close_feedback';
import * as spaQuota from '../commands/spa/spa_quota';
import * as viewSpaAudit from '../commands/hpa/view_spa_audit';
import * as configureAudit from '../commands/hpa/configure_audit';
import * as clearSpaFlag from '../commands/hpa/clear_spa_flag';
import * as suggest from '../commands/shared/suggest';
import * as searchSuggestions from '../commands/spa/search_suggestions';
import { buildFeedbackEmbed, buildFeedbackRow, buildResponseEmbed, buildSubmittedEmbed } from '../services/feedbackService';
import { buildSuggestionEmbed, buildPendingSuggestionRow, buildConsideredRow } from '../commands/shared/suggest';
import { getOrCreateDailyLog, getConfig, BEHAVIOUR_FLAGS } from '../services/spaAuditService';
import { startLogSession, updateSessionDM, closeSession, postSessionSummary, buildSessionEmbed, buildSessionButtons } from '../services/logSessionService';
import { buildStrikeRolePrompt, syncStrikeRole, getActiveStrikeCount } from '../services/strikeRoleService';
import * as cancelGameNight from '../commands/hpa/cancel_game_night';
import * as deleteSuggestion from '../commands/hpa/delete_suggestion';
import * as clearStale from '../commands/hpa/clear_stale';
import { updateScheduleEmbed, buildGameNightEmbed } from '../services/gameNightService';
import * as forceStrike from '../commands/hpa/force_strike';
import * as manageLog from '../commands/hpa/manage_log';
import * as setEscalation from '../commands/hpa/set_escalation';
import * as recalcEscalation from '../commands/hpa/recalculate_escalation';
import * as notifyUser from '../commands/hpa/notify_user';
import * as bulkActions from '../commands/hpa/bulk_actions';
import * as manageLogTracker from '../commands/hpa/manage_log_tracker';
import * as assessment from '../commands/hpa/assessment';

const commands: Record<string, { execute: (i: ChatInputCommandInteraction) => Promise<void> }> = {
  help, my_logs: myLogs, appeal, tag, tag_search: tagSearch, pa_assessment: paAssessment,
  log_mistake: logMistake, staff_profile: staffProfile, staff_overview: staffOverview,
  lookup_post: lookupPost, warn_user: warnUser, create_vote: createVote,
  list_assessments: listAssessments, create_tag: createTag, edit_tag: editTag, delete_tag: deleteTag,
  create_embed: createEmbed, edit_embed: editEmbed,
  suggest, search_suggestions: searchSuggestions,
  set_reminder: setReminder, send_tag: sendTag,
  import_assessment_questions: importAssessmentQ,
  escalate, my_escalations: myEscalations, view_escalations: viewEscalations,
  edit_game_night: editGameNight,
  create_game_night: createGameNight, cancel_game_night: cancelGameNight,
  delete_suggestion: deleteSuggestion, clear_stale: clearStale,
  create_feedback: createFeedback, close_feedback: closeFeedback,
  setup_weekly_report: setupWeeklyReport, trigger_weekly_report: triggerWeeklyReport,
  view_report_status: viewReportStatus,
  spa_quota: spaQuota, view_spa_audit: viewSpaAudit,
  configure_audit: configureAudit, clear_spa_flag: clearSpaFlag,
  force_strike: forceStrike, manage_log: manageLog, set_escalation: setEscalation,
  recalculate_escalation: recalcEscalation, notify_user: notifyUser, bulk_actions: bulkActions,
  manage_log_tracker: manageLogTracker,
  assessment,
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
  const gameNightActions = ['gs_approve', 'gs_deny', 'gs_upvote', 'gn_rsvp', 'gn_list', 'gn_rate'];
  if (gameNightActions.includes(action)) { await handleGameNightButton(i); return; }

  // Escalation buttons
  const escalationActions = ['esc_claim', 'esc_withdraw', 'esc_handle', 'esc_reject', 'esc_escalate_hpa', 'esc_add_note', 'esc_show_notes'];
  if (escalationActions.includes(action)) { await handleEscalationButton(i, action, rest); return; }

  // Warning read receipt
  if (action === 'warn_read') { await handleWarnRead(i, rest); return; }

  // Feedback buttons
  if (action === 'fb_start' || action === 'fb_confirm' || action === 'fb_edit' || action === 'fb_rate_trigger') { await handleFeedbackButton(i, action, rest); return; }

  // Suggestion buttons
  const suggestionActions = ['sug_consider', 'sug_reject', 'sug_implement', 'sug_decline'];
  if (suggestionActions.includes(action)) { await handleSuggestionButton(i, action, rest); return; }

  // Audit buttons
  const auditActions = ['audit_done', 'audit_cant', 'audit_add_flag', 'audit_clear_flag', 'audit_clear_cant', 'flag_keep', 'flag_expire', 'audit_flag_senior', 'audit_ignore_underperform', 'audit_accept_cant', 'audit_start_session', 'session_done', 'session_items_trigger'];
  if (auditActions.includes(action)) { await handleAuditButton(i, action, rest); return; }

  // Strike role buttons
  if (action === 'strike_role_assign' || action === 'strike_role_skip') { await handleStrikeRoleButton(i, action, rest); return; }

  // Weekly report buttons
  const wrActions = ['wr_submit', 'wr_extend', 'wr_confirm', 'wr_edit', 'wr_modal2_trigger'];
  if (wrActions.includes(action)) { await handleWeeklyReportButton(i, action, rest); return; }

  // Pending log review
  if (action === 'log_approve') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }
    const pendingId = parseInt(rest[0]);
    const [pending] = await sql`SELECT * FROM pending_logs WHERE id = ${pendingId}`;
    if (!pending) { await i.reply({ embeds: [errorEmbed('Pending log not found.')], ephemeral: true }); return; }

    const mistakeBtn = new ButtonBuilder().setCustomId(`log_as:mistake:${pendingId}`).setLabel('⚠️ Mistake').setStyle(ButtonStyle.Primary);
    const strikeBtn  = new ButtonBuilder().setCustomId(`log_as:strike:${pendingId}`).setLabel('❌ Strike').setStyle(ButtonStyle.Danger);
    const cancelBtn  = new ButtonBuilder().setCustomId(`log_cancel:${pendingId}`).setLabel('↩️ Cancel').setStyle(ButtonStyle.Secondary);

    const updatedEmbed = pendingLogEmbed({
      userId: pending.user_id,
      postId: pending.post_id,
      reason: pending.reason,
      loggedBy: pending.logged_by,
      date: typeof pending.date === 'string' ? pending.date.split('T')[0] : new Date(pending.date).toISOString().split('T')[0],
      pendingId,
    }).setColor(Colors.Green).setTitle('📋 Choose Log Type');

    await i.update({
      embeds: [updatedEmbed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(mistakeBtn, strikeBtn, cancelBtn)],
    });
  }

  else if (action === 'log_cancel') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) return;
    const pendingId = parseInt(rest[0]);
    const [pending] = await sql`SELECT * FROM pending_logs WHERE id = ${pendingId}`;
    if (!pending) { await i.update({ content: '❌ Not found.', components: [] }); return; }

    const approve = new ButtonBuilder().setCustomId(`log_approve:${pendingId}`).setLabel('✅ Approve').setStyle(ButtonStyle.Success);
    const editBtn = new ButtonBuilder().setCustomId(`log_edit:${pendingId}`).setLabel('✏️ Edit Reason').setStyle(ButtonStyle.Primary);
    const deny    = new ButtonBuilder().setCustomId(`log_deny:${pendingId}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger);

    const originalEmbed = pendingLogEmbed({
      userId: pending.user_id,
      postId: pending.post_id,
      reason: pending.reason,
      loggedBy: pending.logged_by,
      date: typeof pending.date === 'string' ? pending.date.split('T')[0] : new Date(pending.date).toISOString().split('T')[0],
      pendingId,
    });

    await i.update({ embeds: [originalEmbed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(approve, editBtn, deny)] });
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

    // Edit the original HPA review message (fetch from hpaReview channel by footer)
    const resultEmbed = new EmbedBuilder()
      .setColor(type === 'mistake' ? Colors.Orange : Colors.Red)
      .setTitle(`${type === 'mistake' ? '⚠️ Mistake Logged' : '❌ Strike Logged'}`)
      .setDescription(`**Post ID:** \`${pending.post_id}\`\nLogged for <@${pending.user_id}>\n\n**Reason:** ${pending.reason}`)
      .setFooter({ text: `Logged by ${i.user.tag}` })
      .setTimestamp();

    // Try to find and edit the original message in hpaReview channel
    try {
      const ch = await i.client.channels.fetch(config.channels.hpaReview) as TextChannel;
      const messages = await ch.messages.fetch({ limit: 50 });
      const original = messages.find((msg: any) =>
        msg.embeds[0]?.footer?.text?.includes(`Pending ID: ${pendingId}`)
      );
      if (original) await original.edit({ embeds: [resultEmbed], components: [] });
    } catch { /* silent */ }

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
    await checkStrikeAlert(i.client, pending.user_id);
    // Track in SPA audit daily log
    try {
      const today = new Date().toISOString().split('T')[0];
      await sql`INSERT INTO spa_daily_logs (user_id, log_date, submitted, approved) VALUES (${pending.logged_by}, ${today}, 1, 1) ON CONFLICT (user_id, log_date) DO UPDATE SET submitted = spa_daily_logs.submitted + 1, approved = spa_daily_logs.approved + 1`;
      // Update live session DM if active
      await updateSessionDM(i.client, pending.logged_by).catch(() => {});
    } catch { /* silent */ }
    await updateLogTracker(i.client);
    await i.update({ content: `✅ Logged as **${type}**.`, components: [] });

    if (type === 'strike') {
      const strikeCount = await getActiveStrikeCount(pending.user_id);
      const prompt = buildStrikeRolePrompt(pending.user_id, strikeCount);
      if (prompt) {
        await i.followUp({ ...prompt, ephemeral: true });
      }
    }
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
    const page     = rest[1] ? parseInt(rest[1]) : 0;
    const rows = await sql`SELECT r.*, a.title FROM assessment_results r JOIN assessments a ON r.assessment_id = a.id WHERE r.id = ${resultId}`;
    if (rows.length === 0 || rows[0].user_id !== i.user.id) { await i.reply({ embeds: [errorEmbed('Not found.')], ephemeral: true }); return; }
    const result = rows[0];

    const responses = await sql`
      SELECT r.*, q.post_id, q.correct_answer, q.correct_reason
      FROM assessment_responses r JOIN assessment_questions q ON r.question_id = q.id
      WHERE r.session_id = ${result.session_id} ORDER BY r.answered_at ASC
    `;

    const PER_PAGE   = 5;
    const totalPages = Math.max(1, Math.ceil(responses.length / PER_PAGE));
    const slice      = responses.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle(`📊 Detailed Results - ${result.title}`)
      .setFooter({ text: `Page ${page + 1}/${totalPages}` })
      .setTimestamp();

    slice.forEach((r: any, idx: number) => {
      const qNum = page * PER_PAGE + idx + 1;
      const ok   = r.override_correct ?? r.is_correct;
      const lines = [`Your answer: **${r.action}**`];
      if (r.reason) lines.push(`Your reason: ${r.reason}`);
      lines.push(`Correct answer: **${r.correct_answer}**`);
      if (r.correct_reason) lines.push(`Expected reason: ${r.correct_reason}`);
      embed.addFields({ name: `Q${qNum}: \`${r.post_id}\` ${ok ? '✅' : '❌'}`, value: lines.join('\n') });
    });

    const btns: ButtonBuilder[] = [];
    if (page > 0) btns.push(new ButtonBuilder().setCustomId(`view_details:${resultId}:${page - 1}`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary));
    if (page + 1 < totalPages) btns.push(new ButtonBuilder().setCustomId(`view_details:${resultId}:${page + 1}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary));

    const components = btns.length > 0 ? [new ActionRowBuilder<ButtonBuilder>().addComponents(...btns)] : [];

    if (i.isButton() && i.message) {
      await i.update({ embeds: [embed], components });
    } else {
      await i.reply({ embeds: [embed], components, ephemeral: true });
    }
  }
}

// ─── GAME NIGHT BUTTONS ───────────────────────────────────────────────────────
// ─── WEEKLY REPORT BUTTONS ────────────────────────────────────────────────────
async function handleWeeklyReportButton(i: any, action: string, rest: string[]): Promise<void> {
  const cycleId = parseInt(rest[0]);

  if (action === 'wr_submit') {
    const cycle = (await sql`SELECT * FROM weekly_report_cycles WHERE id = ${cycleId}`)[0];
    if (!cycle || cycle.status !== 'active') { await i.reply({ embeds: [errorEmbed('This report cycle is no longer active.')], ephemeral: true }); return; }
    const existing = await sql`SELECT 1 FROM weekly_reports WHERE cycle_id = ${cycleId} AND user_id = ${i.user.id} AND submitted_at IS NOT NULL`;
    if (existing.length > 0) { await i.reply({ embeds: [errorEmbed('You have already submitted your report for this cycle.')], ephemeral: true }); return; }
    await i.showModal({
      customId: `wr_modal1:${cycleId}`,
      title: 'Weekly Report — Part 1 of 2',
      components: [
        { type: 1, components: [{ type: 4, customId: 'issues', label: '📉 Marketplace/System Issues', style: 2, required: true, minLength: 50, maxLength: 1000, placeholder: 'What issues did you notice? Include at least 1 concrete example.' }] },
        { type: 1, components: [{ type: 4, customId: 'mistakes', label: '🔁 Repeated PA Mistakes', style: 2, required: true, minLength: 50, maxLength: 1000, placeholder: 'What mistakes are PAs consistently making? Focus on patterns.' }] },
        { type: 1, components: [{ type: 4, customId: 'weaknesses', label: '⚖️ System Weaknesses', style: 2, required: true, minLength: 50, maxLength: 1000, placeholder: 'What part of the system is failing or unclear?' }] },
      ]
    });
  }

  else if (action === 'wr_extend') {
    const cycle = (await sql`SELECT * FROM weekly_report_cycles WHERE id = ${cycleId}`)[0];
    if (!cycle || cycle.status !== 'active') { await i.reply({ embeds: [errorEmbed('No active cycle.')], ephemeral: true }); return; }
    const cfg = await getReportConfig();
    const extCount = await sql`SELECT COUNT(*) as c FROM weekly_report_extensions WHERE cycle_id = ${cycleId} AND user_id = ${i.user.id}`;
    const count = parseInt(extCount[0].c);
    if (count >= cfg.extension_limit) { await i.reply({ embeds: [errorEmbed(`You have used all ${cfg.extension_limit} extension(s) for this cycle.`)], ephemeral: true }); return; }
    const expiresAt = new Date(Date.now() + 24 * 3600000);
    await sql`INSERT INTO weekly_report_extensions (cycle_id, user_id, expires_at) VALUES (${cycleId}, ${i.user.id}, ${expiresAt.toISOString()}) ON CONFLICT (cycle_id, user_id) DO UPDATE SET expires_at = ${expiresAt.toISOString()}, granted_at = NOW()`;
    await i.update({ embeds: [new EmbedBuilder().setColor(Colors.Yellow).setTitle('⏳ Extension Granted').setDescription(`Extension ${count + 1}/${cfg.extension_limit} used. New deadline: <t:${Math.floor(expiresAt.getTime() / 1000)}:F>`).setTimestamp()], components: [] });
  }

  else if (action === 'wr_confirm') {
    const cycle   = (await sql`SELECT * FROM weekly_report_cycles WHERE id = ${cycleId}`)[0];
    const pending = (await sql`SELECT * FROM weekly_report_pending WHERE user_id = ${i.user.id} AND cycle_id = ${cycleId}`)[0];
    if (!pending) { await i.reply({ embeds: [errorEmbed('Session expired. Please start again.')], ephemeral: true }); return; }
    const isLate = cycle && new Date(cycle.deadline_at) < new Date();
    await i.update({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('✅ Submitting...').setTimestamp()], components: [] });
    await finalizeReport(i.client, i.user.id, cycleId, pending, isLate);
    await i.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('✅ Report Submitted').setDescription('Your weekly report has been submitted and posted for review.').setTimestamp()] });
  }

  else if (action === 'wr_edit') {
    const pending = (await sql`SELECT * FROM weekly_report_pending WHERE user_id = ${i.user.id} AND cycle_id = ${cycleId}`)[0];
    await i.showModal({
      customId: `wr_modal1:${cycleId}`,
      title: 'Edit Report — Part 1 of 2',
      components: [
        { type: 1, components: [{ type: 4, customId: 'issues', label: '📉 Marketplace/System Issues', style: 2, required: true, minLength: 50, maxLength: 1000, value: pending?.section_issues ?? '' }] },
        { type: 1, components: [{ type: 4, customId: 'mistakes', label: '🔁 Repeated PA Mistakes', style: 2, required: true, minLength: 50, maxLength: 1000, value: pending?.section_mistakes ?? '' }] },
        { type: 1, components: [{ type: 4, customId: 'weaknesses', label: '⚖️ System Weaknesses', style: 2, required: true, minLength: 50, maxLength: 1000, value: pending?.section_weaknesses ?? '' }] },
      ]
    });
  }

  else if (action === 'wr_modal2_trigger') {
    const pending = (await sql`SELECT * FROM weekly_report_pending WHERE user_id = ${i.user.id} AND cycle_id = ${cycleId}`)[0];
    await i.showModal({
      customId: `wr_modal2:${cycleId}`,
      title: 'Weekly Report — Part 2 of 2',
      components: [
        { type: 1, components: [{ type: 4, customId: 'risks', label: '🚨 Risks/Emerging Problems', style: 2, required: true, minLength: 50, maxLength: 1000, placeholder: 'Any new risks or behaviours appearing?', value: pending?.section_risks ?? '' }] },
        { type: 1, components: [{ type: 4, customId: 'suggestions', label: '💡 Improvement Suggestions', style: 2, required: true, minLength: 50, maxLength: 1000, placeholder: 'What should be improved? Must be actionable.', value: pending?.section_suggestions ?? '' }] },
        { type: 1, components: [{ type: 4, customId: 'reflection', label: '👤 Self Reflection', style: 2, required: true, minLength: 50, maxLength: 1000, placeholder: 'What could you have done better this week?', value: pending?.section_reflection ?? '' }] },
      ]
    });
  }
}

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
    await i.reply({ content: 'Escalated to HPA.', ephemeral: true });
  }

  else if (action === 'esc_add_note') {
    const m = i.member as GuildMember;
    if (!isSPA(m)) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }
    await i.showModal({
      customId: `esc_note_modal:${escalationId}`,
      title: 'Add Internal Note',
      components: [{ type: 1, components: [{ type: 4, customId: 'note', label: 'Note', style: 2, required: true, minLength: 5, maxLength: 1000 }] }]
    });
  }

  else if (action === 'esc_show_notes') {
    const notes = await sql`SELECT * FROM escalation_notes WHERE escalation_id = ${escalationId} ORDER BY created_at ASC`;
    if (notes.length === 0) { await i.reply({ content: 'No notes on this escalation.', ephemeral: true }); return; }
    const text = notes.map((n: any) => `<@${n.added_by}> — <t:${Math.floor(new Date(n.created_at).getTime() / 1000)}:R>\n${n.note}`).join('\n\n');
    await i.reply({ content: `**Internal Notes:**\n\n${text.slice(0, 1900)}`, ephemeral: true });
  }
}

// ─── AUDIT BUTTONS ────────────────────────────────────────────────────────────
async function handleAuditButton(i: any, action: string, rest: string[]): Promise<void> {
  if (action === 'audit_start_session') {
    const userId = rest[0];
    if (i.user.id !== userId) { await i.reply({ content: 'This reminder is not for you.', ephemeral: true }); return; }

    const today = new Date().toISOString().split('T')[0];
    const alreadyDone = await sql`SELECT 1 FROM spa_daily_logs WHERE user_id = ${userId} AND log_date = ${today} AND done_clicked = true`;
    if (alreadyDone.length > 0) { await i.update({ content: 'You have already completed a session today.', components: [] }); return; }

    const cfg = await getConfig(userId);
    const dayLog = await getOrCreateDailyLog(userId, today);
    const logsToday = (dayLog?.submitted || 0) + (dayLog?.approved || 0) + (dayLog?.denied || 0);

    // Update the message to show active session
    await i.update({
      embeds: [buildSessionEmbed(userId, logsToday, cfg, 'active')],
      components: [buildSessionButtons(userId)],
    });

    // Record session start using the DM message details
    const dmMsg = i.message;
    await startLogSession(i.client, userId, dmMsg.channelId, dmMsg.id);
  }

  else if (action === 'session_done') {
    const userId = rest[0];
    if (i.user.id !== userId) { await i.reply({ content: 'This session is not yours.', ephemeral: true }); return; }

    const sessions = await sql`SELECT * FROM spa_log_sessions WHERE user_id = ${userId} AND status = 'active'`;
    if (sessions.length === 0) { await i.reply({ content: 'No active session found.', ephemeral: true }); return; }

    // Step 1: show review type dropdown
    const select = new StringSelectMenuBuilder()
      .setCustomId(`session_review_type:${sessions[0].id}`)
      .setPlaceholder('How did you review posts today?')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('Sections / Categories').setDescription('Reviewed specific channel categories').setValue('sections'),
        new StringSelectMenuOptionBuilder().setLabel('Individual PAs').setDescription('Focused on specific post approvers').setValue('individuals'),
        new StringSelectMenuOptionBuilder().setLabel('Mix').setDescription('Both sections and individual PAs').setValue('mix'),
      );

    await i.reply({
      content: 'How did you review posts today?',
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
      ephemeral: true,
    });
  }

  else if (action === 'session_items_trigger') {
    const sessionId  = parseInt(rest[0]);
    const reviewType = rest[1];
    const posts      = parseInt(rest[2]) || 0;
    const isIndividuals = reviewType === 'individuals';

    const components: any[] = [];
    if (isIndividuals || reviewType === 'mix') {
      components.push({ type: 1, components: [{ type: 4, customId: 'user_ids', label: 'User IDs reviewed (one per line)', style: 2, required: isIndividuals, maxLength: 2000, placeholder: '123456789012345678\n234567890123456789' }] });
    }
    if (reviewType === 'sections' || reviewType === 'mix') {
      components.push({ type: 1, components: [{ type: 4, customId: 'channel_ids', label: 'Channel/Category IDs (one per line)', style: 2, required: reviewType === 'sections', maxLength: 2000, placeholder: '123456789012345678' }] });
    }

    await i.showModal({
      customId: `session_items_modal:${sessionId}:${reviewType}:${posts}`,
      title: 'Session Summary — Step 2',
      components: components.slice(0, 2),
    });
  }

  else if (action === 'audit_done') {
    const userId = rest[0];
    if (i.user.id !== userId) { await i.reply({ content: 'This reminder is not for you.', ephemeral: true }); return; }

    const cfg    = await getConfig(userId);
    const today  = new Date().toISOString().split('T')[0];
    const dayLog = await getOrCreateDailyLog(userId, today);

    if (dayLog.done_clicked) { await i.update({ content: '✅ Already marked as done today.', components: [] }); return; }

    // Check how many logs submitted today
    const submitted = dayLog.submitted || 0;
    const underperformThreshold = Math.floor((cfg.soft_target * (cfg.underperform_pct || 50)) / 100);
    const underperformed = submitted < underperformThreshold;

    await sql`UPDATE spa_daily_logs SET done_clicked = true, underperformed = ${underperformed} WHERE user_id = ${userId} AND log_date = ${today}`;

    if (underperformed) {
      // Notify HPA with ignore button
      try {
        const ch = await i.client.channels.fetch(config.channels.appeals) as TextChannel;
        const ignoreBtn = new ButtonBuilder()
          .setCustomId(`audit_ignore_underperform:${userId}:${today}`)
          .setLabel('✅ Ignore Underperformance')
          .setStyle(ButtonStyle.Secondary);
        await ch.send({
          content: `<@&${config.roles.HPA}> ⚠️ **Underperformance Note** — <@${userId}> clicked Done but only submitted **${submitted}** logs today (target: ${cfg.soft_target}, threshold: ${underperformThreshold}).`,
          components: [new ActionRowBuilder<ButtonBuilder>().addComponents(ignoreBtn)],
        });
      } catch { /* silent */ }
      await i.update({ embeds: [new EmbedBuilder().setColor(Colors.Orange).setTitle('⚠️ Marked as Done (Underperformed)').setDescription(`You submitted ${submitted} logs today. Your target is ${cfg.soft_target}. This has been noted.`).setTimestamp()], components: [] });
    } else {
      await i.update({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('✅ Done!').setDescription(`Great work today! ${submitted} logs submitted.`).setTimestamp()], components: [] });
    }
  }

  else if (action === 'audit_cant') {
    const userId = rest[0];
    if (i.user.id !== userId) { await i.reply({ content: 'This reminder is not for you.', ephemeral: true }); return; }

    await i.showModal({
      customId: `audit_cant_modal:${userId}`,
      title: "Can't Do Logs Today",
      components: [{ type: 1, components: [{ type: 4, customId: 'reason', label: 'Reason', style: 2, required: true, minLength: 5, maxLength: 500 }] }]
    });
  }

  else if (action === 'audit_add_flag') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'HPA only.', ephemeral: true }); return; }
    const targetId = rest[0];

    const selectOptions = BEHAVIOUR_FLAGS.map((f, idx) => ({
      label: f.slice(0, 100),
      value: String(idx),
    }));

    await i.reply({
      content: `Add behaviour flag to <@${targetId}>:`,
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId(`audit_flag_type:${targetId}`).setPlaceholder('Select flag type').addOptions(
          selectOptions.map(o => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value))
        )
      )],
      ephemeral: true,
    });
  }

  else if (action === 'audit_clear_flag') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'HPA only.', ephemeral: true }); return; }
    const targetId = rest[0];
    const flags = await sql`SELECT * FROM spa_stat_flags WHERE user_id = ${targetId} AND active = true`;
    if (flags.length === 0) { await i.reply({ content: 'No active stat flags.', ephemeral: true }); return; }
    await sql`UPDATE spa_stat_flags SET active = false, cleared_at = NOW(), cleared_by = ${i.user.id} WHERE user_id = ${targetId} AND active = true`;
    await i.reply({ content: `✅ All stat flags cleared for <@${targetId}>.`, ephemeral: true });
  }

  else if (action === 'audit_clear_cant') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'HPA only.', ephemeral: true }); return; }
    const targetId = rest[0];
    await sql`UPDATE spa_cant_do_flags SET flagged = false, flagged_by = NULL, flagged_at = NULL WHERE user_id = ${targetId}`;
    await i.reply({ content: `✅ Can't Do flag cleared for <@${targetId}>.`, ephemeral: true });
  }

  else if (action === 'audit_accept_cant') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'HPA only.', ephemeral: true }); return; }
    const targetId = rest[0];
    await i.update({ content: `Accepted — Can't Do from <@${targetId}> noted and accepted.`, components: [] });
  }

  else if (action === 'audit_ignore_underperform') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'HPA only.', ephemeral: true }); return; }
    const targetId = rest[0];
    const date     = rest[1];
    await sql`UPDATE spa_daily_logs SET underperformed = false WHERE user_id = ${targetId} AND log_date = ${date}`;
    await i.update({ content: `✅ Underperformance for <@${targetId}> on ${date} marked as ignored.`, components: [] });
  }

  else if (action === 'audit_flag_senior') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'HPA only.', ephemeral: true }); return; }
    const targetId = rest[0];
    await sql`INSERT INTO spa_cant_do_flags (user_id, flagged, flagged_by, flagged_at) VALUES (${targetId}, true, ${i.user.id}, NOW()) ON CONFLICT (user_id) DO UPDATE SET flagged = true, flagged_by = ${i.user.id}, flagged_at = NOW()`;
    await i.update({ components: [] });
    await i.followUp({ content: `🚩 <@${targetId}> has been flagged. Future Can't Do responses will ping you.`, ephemeral: true });
  }

  else if (action === 'flag_keep') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'HPA only.', ephemeral: true }); return; }
    const flagId = parseInt(rest[0]);
    await sql`UPDATE spa_behaviour_flags SET expires_at = NOW() + INTERVAL '30 days', expiry_prompted = false WHERE id = ${flagId}`;
    await i.update({ content: '⏳ Flag extended by 30 days.', components: [] });
  }

  else if (action === 'flag_expire') {
    const m = i.member as GuildMember;
    if (!isHPA(m)) { await i.reply({ content: 'HPA only.', ephemeral: true }); return; }
    const flagId = parseInt(rest[0]);
    await sql`DELETE FROM spa_behaviour_flags WHERE id = ${flagId}`;
    await i.update({ content: '✅ Flag removed.', components: [] });
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
      .setTitle('RSVP List')
      .addFields(
        { name: `Attending (${attending.length})`,     value: attending.length > 0 ? attending.join('\n') : 'None', inline: true },
        { name: `Not Attending (${notAttending.length})`, value: notAttending.length > 0 ? notAttending.join('\n') : 'None', inline: true },
      )
      .setTimestamp();

    await i.reply({ embeds: [embed], ephemeral: true });
  }

  else if (action === 'gn_rate') {
    const nightId = parseInt(rest[0]);
    const existing = await sql`SELECT 1 FROM game_night_feedback WHERE game_night_id = ${nightId} AND user_id = ${i.user.id}`;
    if (existing.length > 0) { await i.reply({ content: 'You have already rated this game night.', ephemeral: true }); return; }

    await i.showModal({
      customId: `gn_rate_modal:${nightId}`,
      title: 'Rate the Game Night',
      components: [
        { type: 1, components: [{ type: 4, customId: 'rating', label: 'Rating (1-5)', style: 1, required: true, maxLength: 1, placeholder: '1-5' }] },
        { type: 1, components: [{ type: 4, customId: 'comment', label: 'Comment (optional)', style: 2, required: false, maxLength: 500 }] },
      ]
    });
  }
}

// ─── SELECT HANDLER ───────────────────────────────────────────────────────────
// ─── WARN READ RECEIPT ────────────────────────────────────────────────────────
async function handleWarnRead(i: any, rest: string[]): Promise<void> {
  const receiptId = parseInt(rest[0]);
  const rows = await sql`SELECT * FROM warning_read_receipts WHERE id = ${receiptId}`;
  if (rows.length === 0) { await i.update({ content: 'This warning has already been acknowledged.', components: [] }); return; }
  const receipt = rows[0];

  if (receipt.read_at) { await i.update({ content: 'You have already acknowledged this warning.', components: [] }); return; }
  if (receipt.warned_user_id !== i.user.id) { await i.reply({ content: 'This warning is not for you.', ephemeral: true }); return; }

  await sql`UPDATE warning_read_receipts SET read_at = NOW() WHERE id = ${receiptId}`;
  await i.update({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('Acknowledged').setDescription('You have confirmed you have read this warning.').setTimestamp()], components: [] });

  // DM the person who sent the warning
  try {
    const sender = await i.client.users.fetch(receipt.warned_by);
    await sender.send({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('Warning Acknowledged').setDescription(`<@${receipt.warned_user_id}> has read and acknowledged your warning.\n\n**Reason:** ${receipt.reason}`).setTimestamp()] });
  } catch { /* silent */ }
}

// ─── FEEDBACK BUTTONS ─────────────────────────────────────────────────────────
async function handleFeedbackButton(i: any, action: string, rest: string[]): Promise<void> {
  const roundId = parseInt(rest[0]);
  const rounds = await sql`SELECT * FROM feedback_rounds WHERE id = ${roundId}`;
  if (rounds.length === 0) { await i.reply({ embeds: [errorEmbed('Feedback round not found.')], ephemeral: true }); return; }
  const round = rounds[0];

  if (round.status !== 'active' && round.status !== 'reminder_sent') {
    await i.reply({ embeds: [errorEmbed('This feedback round is closed.')], ephemeral: true }); return;
  }

  const m = i.member as GuildMember;
  if (!isPA(m)) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }

  if (action === 'fb_start') {
    // Check already submitted
    const submitted = await sql`SELECT 1 FROM feedback_responses WHERE round_id = ${roundId} AND user_id = ${i.user.id}`;
    if (submitted.length > 0) { await i.reply({ embeds: [errorEmbed('You have already submitted feedback for this round.')], ephemeral: true }); return; }

    await i.showModal({
      customId: `fb_text_modal:${roundId}`,
      title: `Feedback — ${round.title}`,
      components: [
        { type: 1, components: [{ type: 4, customId: 'general', label: 'General Thoughts', style: 2, required: true, minLength: 10, maxLength: 1000 }] },
        { type: 1, components: [{ type: 4, customId: 'department', label: 'Department Feedback', style: 2, required: true, minLength: 10, maxLength: 1000 }] },
        { type: 1, components: [{ type: 4, customId: 'improvements', label: 'Suggestions for Improvement', style: 2, required: true, minLength: 10, maxLength: 1000 }] },
      ]
    });
  }

  else if (action === 'fb_confirm') {
    // Submit the pending response
    const pending = await sql`SELECT * FROM feedback_pending WHERE user_id = ${i.user.id} AND round_id = ${roundId}`;
    if (pending.length === 0) { await i.reply({ embeds: [errorEmbed('No pending feedback found.')], ephemeral: true }); return; }
    const p = pending[0];

    const [response] = await sql`
      INSERT INTO feedback_responses (round_id, user_id, general_thoughts, department_feedback, improvement_suggestions,
        rating_department, rating_resources, rating_leadership, rating_communication, rating_custom)
      VALUES (${roundId}, ${i.user.id}, ${p.general_thoughts}, ${p.department_feedback}, ${p.improvement_suggestions},
        ${p.rating_department}, ${p.rating_resources}, ${p.rating_leadership}, ${p.rating_communication}, ${p.rating_custom})
      RETURNING *
    `;
    await sql`DELETE FROM feedback_pending WHERE user_id = ${i.user.id} AND round_id = ${roundId}`;

    // Post to private responses channel
    try {
      const ch = await i.client.channels.fetch(config.channels.feedbackResponses) as TextChannel;
      await ch.send({ embeds: [buildSubmittedEmbed(round, response, i.user.id)] });
    } catch (e) { console.error('Failed to post feedback response:', e); }

    await i.update({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('✅ Feedback Submitted').setDescription('Thank you! Your feedback has been submitted.').setTimestamp()], components: [] });
  }

  else if (action === 'fb_rate_trigger') {
    const roundId = parseInt(rest[0]);
    const rounds = await sql`SELECT * FROM feedback_rounds WHERE id = ${roundId}`;
    if (rounds.length === 0) { await i.reply({ embeds: [errorEmbed('Round not found.')], ephemeral: true }); return; }
    const round = rounds[0];
    await i.showModal({
      customId: `fb_ratings_modal:${roundId}`,
      title: 'Rate the Department (1-5)',
      components: [
        { type: 1, components: [{ type: 4, customId: 'dept', label: 'Department Overall (1-5)', style: 1, required: true, maxLength: 1, placeholder: '1-5' }] },
        { type: 1, components: [{ type: 4, customId: 'res', label: 'Resources (1-5)', style: 1, required: true, maxLength: 1, placeholder: '1-5' }] },
        { type: 1, components: [{ type: 4, customId: 'lead', label: 'Leadership (1-5)', style: 1, required: true, maxLength: 1, placeholder: '1-5' }] },
        { type: 1, components: [{ type: 4, customId: 'comm', label: 'Communication (1-5)', style: 1, required: true, maxLength: 1, placeholder: '1-5' }] },
        { type: 1, components: [{ type: 4, customId: 'custom', label: `${round.custom_category} (1-5)`, style: 1, required: true, maxLength: 1, placeholder: '1-5' }] },
      ]
    });
  }

  else if (action === 'fb_edit') {
    // Re-open text modal
    const pending = await sql`SELECT * FROM feedback_pending WHERE user_id = ${i.user.id} AND round_id = ${roundId}`;
    const p = pending[0] ?? {};
    await i.showModal({
      customId: `fb_text_modal:${roundId}`,
      title: `Edit Feedback — ${round.title}`,
      components: [
        { type: 1, components: [{ type: 4, customId: 'general', label: 'General Thoughts', style: 2, required: true, minLength: 10, maxLength: 1000, value: p.general_thoughts ?? '' }] },
        { type: 1, components: [{ type: 4, customId: 'department', label: 'Department Feedback', style: 2, required: true, minLength: 10, maxLength: 1000, value: p.department_feedback ?? '' }] },
        { type: 1, components: [{ type: 4, customId: 'improvements', label: 'Suggestions for Improvement', style: 2, required: true, minLength: 10, maxLength: 1000, value: p.improvement_suggestions ?? '' }] },
      ]
    });
  }
}

// ─── SUGGESTION BUTTONS ───────────────────────────────────────────────────────
async function handleSuggestionButton(i: any, action: string, rest: string[]): Promise<void> {
  const suggId = parseInt(rest[0]);
  const m = i.member as GuildMember;
  if (!isSPA(m)) { await i.reply({ content: 'No permission.', ephemeral: true }); return; }

  const sugRows = await sql`SELECT * FROM suggestions WHERE id = ${suggId}`;
  if (sugRows.length === 0) { await i.reply({ embeds: [errorEmbed('Suggestion not found.')], ephemeral: true }); return; }
  const sug = sugRows[0];

  if (action === 'sug_consider') {
    await sql`UPDATE suggestions SET status = 'considered', reviewed_by = ${i.user.id}, updated_at = NOW() WHERE id = ${suggId}`;
    const updated = (await sql`SELECT * FROM suggestions WHERE id = ${suggId}`)[0];

    // Create a thread for this suggestion
    try {
      const ch = await i.client.channels.fetch(config.channels.suggestions) as TextChannel;
      const thread = await ch.threads.create({
        name: `[#${suggId}] ${sug.title}`.slice(0, 100),
        autoArchiveDuration: 10080,
        reason: `Suggestion #${suggId} under consideration`,
      });
      await sql`UPDATE suggestions SET thread_id = ${thread.id} WHERE id = ${suggId}`;

      // Post embed with HPA-only action buttons in thread
      const threadEmbed = buildSuggestionEmbed({ ...updated, status: 'considered' });
      await thread.send({
        content: `<@&${config.roles.HPA}> This suggestion is now under consideration.`,
        embeds: [threadEmbed],
        components: [buildConsideredRow(suggId)],
      });
    } catch (e) { console.error('Failed to create suggestion thread:', e); }

    // Update original embed
    await i.message.edit({ embeds: [buildSuggestionEmbed(updated)], components: [] });
    await i.reply({ embeds: [{ color: 0x57f287, title: '✅ Marked as Considered', description: `Suggestion #${suggId} moved to thread.` }], ephemeral: true });

    // DM submitter
    await dmUser(i.client, sug.submitted_by, {
      embeds: [new EmbedBuilder().setColor(Colors.Blue).setTitle('💡 Suggestion Update').setDescription(`Your suggestion **${sug.title}** is now under consideration by the team!`).setTimestamp()]
    });
  }

  else if (action === 'sug_reject') {
    await i.showModal({
      customId: `sug_reject_modal:${suggId}`,
      title: 'Reject Suggestion',
      components: [{ type: 1, components: [{ type: 4, customId: 'reason', label: 'Reason for rejection', style: 2, required: true, minLength: 5, maxLength: 500 }] }]
    });
  }

  else if (action === 'sug_implement') {
    if (!isHPA(m)) { await i.reply({ content: 'HPA only.', ephemeral: true }); return; }
    await sql`UPDATE suggestions SET status = 'implemented', reviewed_by = ${i.user.id}, updated_at = NOW() WHERE id = ${suggId}`;
    const updated = (await sql`SELECT * FROM suggestions WHERE id = ${suggId}`)[0];
    await i.message.edit({ embeds: [buildSuggestionEmbed(updated)], components: [] });
    await i.reply({ content: '✅ Marked as implemented.', ephemeral: true });
    await dmUser(i.client, sug.submitted_by, {
      embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('💡 Suggestion Implemented!').setDescription(`Your suggestion **${sug.title}** has been implemented! 🎉`).setTimestamp()]
    });
  }

  else if (action === 'sug_decline') {
    if (!isHPA(m)) { await i.reply({ content: 'HPA only.', ephemeral: true }); return; }
    await i.showModal({
      customId: `sug_decline_modal:${suggId}`,
      title: 'Decline Suggestion',
      components: [{ type: 1, components: [{ type: 4, customId: 'reason', label: 'Reason for declining', style: 2, required: true, minLength: 5, maxLength: 500 }] }]
    });
  }
}

async function handleSelect(i: any): Promise<void> {
  const [action, ...rest] = i.customId.split(':');

  if (action === 'audit_flag_type') {
    const targetId  = rest[0];
    const flagIndex = parseInt(i.values[0]);
    const flagType  = BEHAVIOUR_FLAGS[flagIndex];
    await i.showModal({
      customId: `audit_add_flag_modal:${targetId}:${flagIndex}`,
      title: 'Add Behaviour Flag',
      components: [
        { type: 1, components: [{ type: 4, customId: 'note', label: 'Note (optional)', style: 2, required: false, maxLength: 500 }] },
        { type: 1, components: [{ type: 4, customId: 'notify', label: 'Notify senior? (yes/no)', style: 1, required: true, maxLength: 3, value: 'no' }] },
      ]
    });
    return;
  }

  if (action === 'wr_tags') {
    // customId: wr_tags:cycleId:sectionKey
    const cycleId    = parseInt(rest[0]);
    const sectionKey = rest[1];
    const tags       = i.values as string[];

    // Check if Other selected — need a label
    if (tags.includes('Other')) {
      await i.showModal({
        customId: `wr_other_label:${cycleId}:${sectionKey}`,
        title: 'Label for "Other" Tag',
        components: [{ type: 1, components: [{ type: 4, customId: 'label', label: 'Brief label (max 30 chars)', style: 1, required: true, maxLength: 30, placeholder: 'e.g. UI Clarity' }] }]
      });
    } else {
      await storeTags(i.user.id, cycleId, sectionKey, tags, null);
      await i.update({ content: '✅ Tags saved! Continue with the next step.', components: [] });
      await showNextTagsOrModal(i, cycleId, sectionKey);
    }
    return;
  }

  if (action === 'suggest_type_sel') {
    const type = i.values[0];
    if (type === 'department') {
      // Check limit
      const open = await sql`SELECT COUNT(*) as count FROM suggestions WHERE submitted_by = ${i.user.id} AND status IN ('pending','considered') AND suggestion_type = 'department'`;
      if (parseInt(open[0].count) >= 2) { await i.reply({ embeds: [errorEmbed('You already have 2 open department suggestions.')], ephemeral: true }); return; }
      await i.showModal({ customId: 'suggest_modal:department', title: 'Department Suggestion', components: [
        { type: 1, components: [{ type: 4, customId: 'title', label: 'Title', style: 1, required: true, maxLength: 100 }] },
        { type: 1, components: [{ type: 4, customId: 'core_idea', label: 'Core Idea', style: 2, required: true, minLength: 10, maxLength: 500 }] },
        { type: 1, components: [{ type: 4, customId: 'further_details', label: 'Further Details (optional)', style: 2, required: false, maxLength: 1000 }] },
      ]});
    } else if (type === 'game_night') {
      await i.showModal({ customId: 'suggest_modal:game_night', title: 'Game Night Suggestion', components: [
        { type: 1, components: [{ type: 4, customId: 'title', label: 'Game Name', style: 1, required: true, maxLength: 100 }] },
        { type: 1, components: [{ type: 4, customId: 'core_idea', label: 'Why should we play this?', style: 2, required: true, minLength: 5, maxLength: 500 }] },
      ]});
    } else if (type === 'tag') {
      await i.showModal({ customId: 'suggest_modal:tag', title: 'Tag Suggestion', components: [
        { type: 1, components: [{ type: 4, customId: 'title', label: 'Tag Name', style: 1, required: true, maxLength: 50 }] },
        { type: 1, components: [{ type: 4, customId: 'core_idea', label: 'Category (Rules/Guides/Resources/Other)', style: 1, required: true, maxLength: 20 }] },
        { type: 1, components: [{ type: 4, customId: 'further_details', label: 'Tag Content', style: 2, required: true, minLength: 5, maxLength: 1000 }] },
      ]});
    }
    return;
  }

  if (action === 'session_review_type') {
    const sessionId  = parseInt(rest[0]);
    const reviewType = i.values[0];

    // Modal step 1: posts reviewed count
    await i.showModal({
      customId: `session_count_modal:${sessionId}:${reviewType}`,
      title: 'Session Summary — Step 1',
      components: [
        { type: 1, components: [{ type: 4, customId: 'posts_reviewed', label: 'Approx. how many posts did you review?', style: 1, required: true, maxLength: 6, placeholder: 'e.g. 50' }] },
      ]
    });
    return;
  }

  if (action === 'esc_action_select') {
    const selectedAction = i.values[0];
    const actionTitles: Record<string, string> = {
      review_post:        'Review My Post',
      revoke_skill_role:  'Revoke a Skill Role',
      takeover_post:      'Take-over This Post',
      punishment_request: 'Punishment Request',
    };

    if (selectedAction === 'punishment_request') {
      await i.showModal({
        customId: `escalate_modal:punishment_request`,
        title: 'Punishment Request (Code/Scripts Only)',
        components: [
          { type: 1, components: [{ type: 4, customId: 'post_id', label: 'Post ID', style: 1, required: true, maxLength: 200 }] },
          { type: 1, components: [{ type: 4, customId: 'information', label: 'Reasoning', style: 2, required: true, minLength: 10, maxLength: 1000, placeholder: 'Please make sure the evidence you are providing clearly highlights the faults.' }] },
          { type: 1, components: [{ type: 4, customId: 'evidence', label: 'Evidence Links (one per line)', style: 2, required: false, maxLength: 1000, placeholder: 'https://imgur.com/...\nhttps://imgur.com/...' }] },
        ]
      });
    } else {
      await i.showModal({
        customId: `escalate_modal:${selectedAction}`,
        title: actionTitles[selectedAction] ?? 'Escalate Post',
        components: [
          { type: 1, components: [{ type: 4, customId: 'post_id', label: 'Post ID', style: 1, required: true, maxLength: 200 }] },
          { type: 1, components: [{ type: 4, customId: 'information', label: 'Information / Context', style: 2, required: true, minLength: 10, maxLength: 1000 }] },
        ]
      });
    }
    return;
  }

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

  if (action === 'session_count_modal') {
    await i.deferReply({ ephemeral: true });
    const sessionId  = parseInt(rest[0]);
    const reviewType = rest[1];
    const postsRaw   = i.fields.getTextInputValue('posts_reviewed').trim();
    const posts      = parseInt(postsRaw) || 0;

    // Can't open modal from modal — store count and show button to continue
    await sql`
      INSERT INTO weekly_report_pending (user_id, cycle_id, section_issues, step)
      VALUES (${i.user.id}, 0, ${String(posts)}, ${reviewType})
      ON CONFLICT (user_id) DO UPDATE SET section_issues = ${String(posts)}, step = ${reviewType}, updated_at = NOW()
    `.catch(() => {});

    const continueBtn = new ButtonBuilder()
      .setCustomId(`session_items_trigger:${sessionId}:${reviewType}:${posts}`)
      .setLabel('Continue — Enter Reviewed IDs')
      .setStyle(ButtonStyle.Primary);

    await i.editReply({
      content: `Approx. **${posts}** posts reviewed. Click below to enter the IDs.`,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(continueBtn)],
    });
    return;
  }

  else if (action === 'session_items_modal') {
    await i.deferReply({ ephemeral: true });
    const sessionId  = parseInt(rest[0]);
    const reviewType = rest[1];
    const posts      = parseInt(rest[2]) || 0;

    const sessions = await sql`SELECT * FROM spa_log_sessions WHERE id = ${sessionId} AND user_id = ${i.user.id}`;
    if (sessions.length === 0) { await i.editReply({ embeds: [errorEmbed('Session not found.')] }); return; }

    // Collect IDs from whichever fields were filled
    const allIds: string[] = [];
    try {
      const userIds    = i.fields.getTextInputValue('user_ids').split('\n').map((s: string) => s.trim()).filter(Boolean);
      allIds.push(...userIds);
    } catch { /* field not present */ }
    try {
      const channelIds = i.fields.getTextInputValue('channel_ids').split('\n').map((s: string) => s.trim()).filter(Boolean);
      allIds.push(...channelIds);
    } catch { /* field not present */ }

    // Close session and post summary
    await sql`UPDATE spa_log_sessions SET status = 'completed', completed_at = NOW() WHERE id = ${sessionId}`;

    const today  = new Date().toISOString().split('T')[0];
    const dayLog = await sql`SELECT * FROM spa_daily_logs WHERE user_id = ${i.user.id} AND log_date = ${today}`;
    const cfg    = await getConfig(i.user.id);

    // Mark done_clicked
    await sql`
      INSERT INTO spa_daily_logs (user_id, log_date, done_clicked)
      VALUES (${i.user.id}, ${today}, true)
      ON CONFLICT (user_id, log_date) DO UPDATE SET done_clicked = true
    `;

    // Check underperform
    const submitted = dayLog[0]?.submitted || 0;
    const underperformThreshold = Math.floor((cfg.soft_target * (cfg.underperform_pct || 50)) / 100);
    if (submitted < underperformThreshold) {
      await sql`UPDATE spa_daily_logs SET underperformed = true WHERE user_id = ${i.user.id} AND log_date = ${today}`;
      try {
        const ch = await i.client.channels.fetch(config.channels.appeals) as TextChannel;
        const ignoreBtn = new ButtonBuilder().setCustomId(`audit_ignore_underperform:${i.user.id}:${today}`).setLabel('Ignore Underperformance').setStyle(ButtonStyle.Secondary);
        await ch.send({ content: `<@&${config.roles.HPA}> Underperformance Note — <@${i.user.id}> submitted **${submitted}** logs today (target: ${cfg.soft_target}, threshold: ${underperformThreshold}).`, components: [new ActionRowBuilder<ButtonBuilder>().addComponents(ignoreBtn)] });
      } catch { /* silent */ }
    }

    await postSessionSummary(i.client, i.user.id, sessionId, reviewType, allIds, posts);

    // Update the DM message
    try { await updateSessionDM(i.client, i.user.id); } catch { /* silent */ }

    await i.editReply({ embeds: [successEmbed('Session Submitted', `Your session summary has been submitted. ${submitted} log(s) recorded today.`)] });
    return;
  }

  if (action === 'log_mistake') {
    await i.deferReply({ ephemeral: true });
    const targetId = rest[0];
    const severity = rest[1] ?? 'minor';
    const postId   = i.fields.getTextInputValue('post_id').trim();
    const date     = i.fields.getTextInputValue('date').trim();
    const reason   = i.fields.getTextInputValue('reason').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      await i.editReply({ embeds: [errorEmbed('Invalid date. Use YYYY-MM-DD.')] }); return;
    }

    const guild = i.guild!;
    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) { await i.editReply({ embeds: [errorEmbed('This user is no longer in the server.')] }); return; }

    const existing = await sql`SELECT 1 FROM used_post_ids WHERE post_id = ${postId}`;
    if (existing.length > 0) { await i.editReply({ embeds: [errorEmbed(`Post ID \`${postId}\` has already been logged.`)] }); return; }

    const [result] = await sql`INSERT INTO pending_logs (user_id, post_id, reason, logged_by, date, severity) VALUES (${targetId}, ${postId}, ${reason}, ${i.user.id}, ${date}, ${severity}) RETURNING id`;
    await sql`INSERT INTO used_post_ids (post_id) VALUES (${postId}) ON CONFLICT DO NOTHING`;

    const embed = pendingLogEmbed({ userId: targetId, postId, reason, loggedBy: i.user.id, date, pendingId: result.id, severity });
    const approve = new ButtonBuilder().setCustomId(`log_approve:${result.id}`).setLabel('Approve').setStyle(ButtonStyle.Success);
    const editBtn = new ButtonBuilder().setCustomId(`log_edit:${result.id}`).setLabel('Edit Reason').setStyle(ButtonStyle.Primary);
    const deny    = new ButtonBuilder().setCustomId(`log_deny:${result.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger);

    const ch = await i.client.channels.fetch(config.channels.hpaReview) as TextChannel;
    await ch.send({ embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(approve, editBtn, deny)] });
    await i.editReply({ embeds: [successEmbed('Submitted', 'Your log has been submitted for HPA review.')] });
    return;
  }

  if (action === 'warn_user') {
    await i.deferReply({ ephemeral: true });
    const targetId = rest[0];
    const reason   = i.fields.getTextInputValue('reason').trim();

    const [receipt] = await sql`
      INSERT INTO warning_read_receipts (warned_user_id, warned_by, reason)
      VALUES (${targetId}, ${i.user.id}, ${reason})
      RETURNING id
    `;

    const warnEmbed = new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle('Formal Warning')
      .setDescription(`You have received a formal warning from the staff team.\n\n**Reason:** ${reason}`)
      .setFooter({ text: 'Please click the button below to acknowledge you have read this warning.' })
      .setTimestamp();

    const readBtn = new ButtonBuilder()
      .setCustomId(`warn_read:${receipt.id}`)
      .setLabel('Mark as Read')
      .setStyle(ButtonStyle.Success);

    try {
      const user = await i.client.users.fetch(targetId);
      await user.send({ embeds: [warnEmbed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(readBtn)] });
      await i.editReply({ embeds: [successEmbed('Warning Sent', `Warning DM sent to <@${targetId}>. You will be notified if they do not acknowledge within 24 hours.`)] });
    } catch {
      await sql`DELETE FROM warning_read_receipts WHERE id = ${receipt.id}`;
      await i.editReply({ embeds: [errorEmbed(`Failed to DM <@${targetId}>. They may have DMs disabled.`)] });
    }
    return;
  }

  if (action === 'appeal_modal') {
    await i.deferReply({ ephemeral: true });
    const logId  = parseInt(rest[0]);
    const reason = i.fields.getTextInputValue('reason').trim();
    const userId = i.user.id;

    const logRows = await sql`SELECT * FROM logs WHERE id = ${logId} AND user_id = ${userId}`;
    if (logRows.length === 0) { await i.editReply({ embeds: [errorEmbed('Log not found or not yours.')] }); return; }
    const log = logRows[0];

    const [result] = await sql`INSERT INTO appeals (user_id, log_id, reason) VALUES (${userId}, ${logId}, ${reason}) RETURNING id`;
    const embed = appealEmbed({ userId, logId, reason, logType: log.type, logReason: log.reason, appealId: result.id });
    const approve = new ButtonBuilder().setCustomId(`appeal_approve:${result.id}`).setLabel('✅ Approve').setStyle(ButtonStyle.Success);
    const deny    = new ButtonBuilder().setCustomId(`appeal_deny:${result.id}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger);

    const ch = await i.client.channels.fetch(config.channels.appeals) as TextChannel;
    await ch.send({ embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(approve, deny)] });
    await i.editReply({ embeds: [successEmbed('Appeal Submitted', 'Your appeal has been sent to HPA.')] });
    return;
  }

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
    await i.deferReply({ flags: 64 });
    const pendingId = parseInt(rest[0]);
    const reason    = i.fields.getTextInputValue('reason').trim();
    const [pending] = await sql`SELECT * FROM pending_logs WHERE id = ${pendingId}`;
    if (!pending) { await i.editReply({ embeds: [errorEmbed('Not found.')] }); return; }

    await sql`DELETE FROM pending_logs WHERE id = ${pendingId}`;
    await sql`DELETE FROM used_post_ids WHERE post_id = ${pending.post_id}`;
    await safeDM(i.client, pending.logged_by, warningEmbed(`Log Denied - Post ID: ${pending.post_id}`, `Your log against <@${pending.user_id}> was denied.\n\n**Reason:** ${reason}`), 'log denied');
    // Track in SPA audit
    try {
      const today = new Date().toISOString().split('T')[0];
      await sql`INSERT INTO spa_daily_logs (user_id, log_date, submitted, denied) VALUES (${pending.logged_by}, ${today}, 1, 1) ON CONFLICT (user_id, log_date) DO UPDATE SET submitted = spa_daily_logs.submitted + 1, denied = spa_daily_logs.denied + 1`;
      await updateSessionDM(i.client, pending.logged_by).catch(() => {});
    } catch { /* silent */ }
    await i.editReply({ embeds: [successEmbed('Denied', 'Log denied and logger notified.')] });
  }

  else if (action === 'modal_edit_pending') {
    await i.deferReply({ flags: 64 });
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
    await i.deferReply({ flags: 64 });
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
    await i.deferReply({ flags: 64 });
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
    await i.deferReply({ flags: 64 });
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
    const actionType  = rest[0];
    await i.deferReply({ flags: 64 });

    const postId      = i.fields.getTextInputValue('post_id').trim();
    const information = i.fields.getTextInputValue('information').trim();
    const evidence    = actionType === 'punishment_request'
      ? (i.fields.getTextInputValue('evidence').trim() || null)
      : null;
    const m = i.member as GuildMember;

    const existing = await sql`SELECT 1 FROM post_escalations WHERE post_id = ${postId} AND status IN ('pending','claimed')`;
    if (existing.length > 0) {
      await i.editReply({ embeds: [errorEmbed(`Post ID \`${postId}\` already has an active escalation.`)] });
      return;
    }

    // Build full information string - append evidence if present
    const fullInfo = evidence
      ? `${information}\n\n**Evidence:**\n${evidence}`
      : information;

    const [result] = await sql`
      INSERT INTO post_escalations (post_id, submitted_by, information, action)
      VALUES (${postId}, ${i.user.id}, ${fullInfo}, ${actionType})
      RETURNING id
    `;

    const escRows = await sql`SELECT * FROM post_escalations WHERE id = ${result.id}`;
    const esc = escRows[0];
    const embed = buildEscalationEmbed(esc);
    const row   = buildPendingRow(result.id);

    // Punishment requests ping HPA, all others ping SPA
    const pingRole = actionType === 'punishment_request'
      ? `<@&${config.roles.HPA}>`
      : `<@&${config.roles.SPA}>`;

    try {
      const ch = await i.client.channels.fetch(config.channels.escalations) as TextChannel;
      const sentMsg = await ch.send({ content: `${pingRole} New escalation request`, embeds: [embed], components: [row] });
      await sql`UPDATE post_escalations SET message_id = ${sentMsg.id} WHERE id = ${result.id}`;
    } catch (e) { console.error('Failed to post escalation:', e); }

    await i.editReply({ embeds: [successEmbed('Escalation Submitted', `Your escalation for post \`${postId}\` has been submitted.`)] });
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

  // ─── FEEDBACK MODALS ──────────────────────────────────────────────────────
  else if (action === 'fb_text_modal') {
    await i.deferReply({ ephemeral: true });
    const roundId = parseInt(rest[0]);
    const rounds = await sql`SELECT * FROM feedback_rounds WHERE id = ${roundId}`;
    if (rounds.length === 0) { await i.editReply({ embeds: [errorEmbed('Round not found.')] }); return; }

    const general      = i.fields.getTextInputValue('general').trim();
    const department   = i.fields.getTextInputValue('department').trim();
    const improvements = i.fields.getTextInputValue('improvements').trim();

    // Save to pending
    await sql`
      INSERT INTO feedback_pending (user_id, round_id, general_thoughts, department_feedback, improvement_suggestions)
      VALUES (${i.user.id}, ${roundId}, ${general}, ${department}, ${improvements})
      ON CONFLICT (user_id, round_id) DO UPDATE
      SET general_thoughts = ${general}, department_feedback = ${department}, improvement_suggestions = ${improvements}, updated_at = NOW()
    `;

    // Can't open modal from modal — show a button to continue to ratings
    const rateBtn = new ButtonBuilder()
      .setCustomId(`fb_rate_trigger:${roundId}`)
      .setLabel('Continue — Rate the Department')
      .setStyle(ButtonStyle.Primary);

    await i.editReply({
      content: 'Text saved! Click below to rate the department.',
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(rateBtn)],
    });
  }

  else if (action === 'fb_ratings_modal') {
    const roundId = parseInt(rest[0]);
    const rounds = await sql`SELECT * FROM feedback_rounds WHERE id = ${roundId}`;
    if (rounds.length === 0) { await i.reply({ embeds: [errorEmbed('Round not found.')], ephemeral: true }); return; }
    const round = rounds[0];

    const parseRating = (v: string) => Math.min(5, Math.max(1, parseInt(v.trim()) || 1));
    const ratings = {
      dept:   parseRating(i.fields.getTextInputValue('dept')),
      res:    parseRating(i.fields.getTextInputValue('res')),
      lead:   parseRating(i.fields.getTextInputValue('lead')),
      comm:   parseRating(i.fields.getTextInputValue('comm')),
      custom: parseRating(i.fields.getTextInputValue('custom')),
    };

    // Update pending with ratings
    await sql`
      UPDATE feedback_pending SET
        rating_department = ${ratings.dept}, rating_resources = ${ratings.res},
        rating_leadership = ${ratings.lead}, rating_communication = ${ratings.comm},
        rating_custom = ${ratings.custom}, updated_at = NOW()
      WHERE user_id = ${i.user.id} AND round_id = ${roundId}
    `;

    const pending = (await sql`SELECT * FROM feedback_pending WHERE user_id = ${i.user.id} AND round_id = ${roundId}`)[0];
    if (!pending) { await i.reply({ embeds: [errorEmbed('Session expired. Please start again.')], ephemeral: true }); return; }

    // Show preview with confirm/edit buttons
    const confirmBtn = new ButtonBuilder().setCustomId(`fb_confirm:${roundId}`).setLabel('✅ Confirm & Submit').setStyle(ButtonStyle.Success);
    const editBtn    = new ButtonBuilder().setCustomId(`fb_edit:${roundId}`).setLabel('✏️ Edit').setStyle(ButtonStyle.Secondary);

    await i.reply({
      embeds: [buildResponseEmbed(round, pending)],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, editBtn)],
      ephemeral: true,
    });
  }

  // ─── SUGGESTION MODALS ────────────────────────────────────────────────────
  else if (action === 'suggest_modal') {
    await i.deferReply({ ephemeral: true });
    const type       = rest[0] ?? 'department';
    const title      = i.fields.getTextInputValue('title').trim();
    const coreIdea   = i.fields.getTextInputValue('core_idea').trim();
    const furtherRaw = (() => { try { return i.fields.getTextInputValue('further_details').trim() || null; } catch { return null; } })();

    if (type === 'game_night') {
      const existing = await sql`SELECT 1 FROM game_suggestions WHERE LOWER(game_name) = LOWER(${title}) AND status != 'denied'`;
      if (existing.length > 0) { await i.editReply({ embeds: [errorEmbed(`**${title}** has already been suggested.`)] }); return; }
      const [result] = await sql`INSERT INTO game_suggestions (suggested_by, game_name, description) VALUES (${i.user.id}, ${title}, ${coreIdea}) RETURNING id`;
      const embed = new EmbedBuilder().setColor(Colors.Blue).setTitle('Game Suggestion')
        .addFields({ name: 'Game', value: title, inline: true }, { name: 'Suggested by', value: `<@${i.user.id}>`, inline: true })
        .setFooter({ text: `Suggestion ID: ${result.id}` }).setTimestamp();
      if (coreIdea) embed.addFields({ name: 'Why?', value: coreIdea });
      const approve = new ButtonBuilder().setCustomId(`gs_approve:${result.id}`).setLabel('Approve').setStyle(ButtonStyle.Success);
      const deny    = new ButtonBuilder().setCustomId(`gs_deny:${result.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger);
      const ch = await i.client.channels.fetch(config.channels.suggestions) as TextChannel;
      const msg = await ch.send({ content: `<@&${config.roles.HPA}> New game suggestion`, embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(approve, deny)] });
      await sql`UPDATE game_suggestions SET message_id = ${msg.id} WHERE id = ${result.id}`;
      await i.editReply({ embeds: [successEmbed('Submitted', `**${title}** submitted for HPA review.`)] });
      return;
    }

    const similar = type === 'department' ? await sql`
      SELECT id, title FROM suggestions WHERE status NOT IN ('rejected','declined') AND suggestion_type = 'department'
      AND (title ILIKE ${'%' + title + '%'} OR core_idea ILIKE ${'%' + coreIdea.slice(0, 30) + '%'}) LIMIT 3
    ` : [];

    if (similar.length > 0) {
      await i.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Yellow).setTitle('Similar Suggestions Found').setDescription(`Similar suggestions exist:\n\n${similar.map((s: any) => `#${s.id} — ${s.title}`).join('\n')}\n\nIf yours is different, run \`/suggest\` again.`).setTimestamp()] });
      return;
    }

    const tagCategory = type === 'tag' ? (['Rules','Guides','Resources','Other'].includes(coreIdea) ? coreIdea : 'Other') : null;
    const tagContent  = type === 'tag' ? furtherRaw : null;
    const finalIdea   = type === 'tag' ? `Tag suggestion: ${title}` : coreIdea;

    const [result] = await sql`
      INSERT INTO suggestions (submitted_by, title, core_idea, further_details, suggestion_type, tag_name, tag_category, tag_content)
      VALUES (${i.user.id}, ${title}, ${finalIdea}, ${type !== 'tag' ? furtherRaw : null}, ${type}, ${type === 'tag' ? title : null}, ${tagCategory}, ${tagContent})
      RETURNING *
    `;

    const embed = buildSuggestionEmbed(result);
    const row   = buildPendingSuggestionRow(result.id);
    const ch    = await i.client.channels.fetch(config.channels.suggestions) as TextChannel;
    const msg   = await ch.send({ embeds: [embed], components: [row] });
    await sql`UPDATE suggestions SET message_id = ${msg.id} WHERE id = ${result.id}`;
    await i.editReply({ embeds: [successEmbed('Suggestion Submitted', `**${title}** (ID: #${result.id}) submitted.`)] });
  }

  else if (action === 'import_questions') {
    await i.deferReply({ ephemeral: true });
    const assessmentId = parseInt(rest[0]);
    const isScripting  = rest[1] === 'true';
    const csvData      = i.fields.getTextInputValue('csv_data').trim();
    const lines        = csvData.split('\n').map((l: string) => l.trim()).filter(Boolean);
    const VALID_ANS    = ['approve', 'deny', 'suspend', 'request_pof'];
    let success = 0; const failures: string[] = [];
    for (let idx = 0; idx < lines.length; idx++) {
      const parts = lines[idx].split(',');
      if (parts.length < 2) { failures.push(`Line ${idx + 1}: too few fields`); continue; }
      const [postId, answer, reason, ...ctxParts] = parts.map((p: string) => p.trim());
      const context = ctxParts.join(',').trim() || null;
      if (!VALID_ANS.includes(answer.toLowerCase())) { failures.push(`Line ${idx + 1}: invalid answer '${answer}'`); continue; }
      try {
        await sql`INSERT INTO assessment_questions (assessment_id, post_id, correct_answer, correct_reason, context, is_scripting) VALUES (${assessmentId}, ${postId}, ${answer.toLowerCase()}, ${reason || null}, ${context}, ${isScripting})`;
        success++;
      } catch { failures.push(`Line ${idx + 1}: DB error`); }
    }
    await sql`INSERT INTO assessment_import_log (assessment_id, imported_by, total_lines, successful, failed) VALUES (${assessmentId}, ${i.user.id}, ${lines.length}, ${success}, ${failures.length})`.catch(() => {});
    const embed = new EmbedBuilder().setColor(failures.length === 0 ? Colors.Green : Colors.Yellow).setTitle('Import Complete')
      .addFields({ name: 'Imported', value: String(success), inline: true }, { name: 'Failed', value: String(failures.length), inline: true }, { name: 'Total', value: String(lines.length), inline: true }).setTimestamp();
    if (failures.length > 0) embed.addFields({ name: 'Failures', value: failures.slice(0, 10).join('\n') });
    await i.editReply({ embeds: [embed] });
  }

  else if (action === 'esc_note_modal') {
    await i.deferReply({ ephemeral: true });
    const escalationId = parseInt(rest[0]);
    const note = i.fields.getTextInputValue('note').trim();
    await sql`INSERT INTO escalation_notes (escalation_id, added_by, note) VALUES (${escalationId}, ${i.user.id}, ${note})`;

    // Add Show Notes button to the message if not already there
    try {
      const btns = i.message?.components?.[0]?.components ?? [];
      const hasNoteBtn = btns.some((b: any) => b.customId?.startsWith('esc_show_notes'));
      if (!hasNoteBtn && i.message) {
        const existing = i.message.components[0];
        const showBtn  = new ButtonBuilder().setCustomId(`esc_show_notes:${escalationId}`).setLabel('Show Notes').setStyle(ButtonStyle.Secondary);
        const newRow   = new ActionRowBuilder<ButtonBuilder>().addComponents(...existing.components.map((b: any) => ButtonBuilder.from(b as any)), showBtn);
        await i.message.edit({ components: [newRow] });
      }
    } catch { /* silent */ }

    await i.editReply({ embeds: [successEmbed('Note Added', 'Your note has been saved to this escalation.')] });
  }

  else if (action === 'sug_reject_modal') {
    await i.deferReply({ ephemeral: true });
    const suggId = parseInt(rest[0]);
    const reason = i.fields.getTextInputValue('reason').trim();
    const [sug]  = await sql`SELECT * FROM suggestions WHERE id = ${suggId}`;
    if (!sug) { await i.editReply({ embeds: [errorEmbed('Not found.')] }); return; }

    await sql`UPDATE suggestions SET status = 'rejected', rejection_reason = ${reason}, reviewed_by = ${i.user.id}, updated_at = NOW() WHERE id = ${suggId}`;
    const updated = (await sql`SELECT * FROM suggestions WHERE id = ${suggId}`)[0];

    try { await i.message.edit({ embeds: [buildSuggestionEmbed(updated)], components: [] }); } catch { /* silent */ }
    await dmUser(i.client, sug.submitted_by, {
      embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('💡 Suggestion Update').setDescription(`Your suggestion **${sug.title}** has been rejected.\n\n**Reason:** ${reason}`).setTimestamp()]
    });
    await i.editReply({ embeds: [successEmbed('Rejected', `Suggestion #${suggId} rejected.`)] });
  }

  else if (action === 'sug_decline_modal') {
    await i.deferReply({ ephemeral: true });
    const suggId = parseInt(rest[0]);
    const reason = i.fields.getTextInputValue('reason').trim();
    const suggRows = await sql`SELECT * FROM suggestions WHERE id = ${suggId}`;
    if (suggRows.length === 0) { await i.editReply({ embeds: [errorEmbed('Not found.')] }); return; }
    const sug = suggRows[0];

    await sql`UPDATE suggestions SET status = 'declined', rejection_reason = ${reason}, reviewed_by = ${i.user.id}, updated_at = NOW() WHERE id = ${suggId}`;
    const updated = (await sql`SELECT * FROM suggestions WHERE id = ${suggId}`)[0];

    // Update thread message (remove buttons)
    try { await i.message.edit({ embeds: [buildSuggestionEmbed(updated)], components: [] }); } catch { /* silent */ }

    // Update original channel message
    if (sug.message_id) {
      try {
        const ch = await i.client.channels.fetch(config.channels.suggestions) as TextChannel;
        const msg = await ch.messages.fetch(sug.message_id);
        await msg.edit({ embeds: [buildSuggestionEmbed(updated)], components: [] });
      } catch { /* silent */ }
    }

    // DM submitter
    const dmSent = await dmUser(i.client, sug.submitted_by, {
      embeds: [new EmbedBuilder().setColor(Colors.Orange).setTitle('💡 Suggestion Update').setDescription(`Your suggestion **${sug.title}** has been declined.\n\n**Reason:** ${reason}`).setTimestamp()]
    });
    console.log(`Decline DM sent to ${sug.submitted_by}: ${dmSent}`);

    await i.editReply({ embeds: [successEmbed('Declined', `Suggestion #${suggId} declined and submitter notified.`)] });
  }

  // ─── AUDIT MODALS ─────────────────────────────────────────────────────────
  else if (action === 'audit_cant_modal') {
    const userId = rest[0];
    const reason = i.fields.getTextInputValue('reason').trim();
    const today  = new Date().toISOString().split('T')[0];

    await sql`
      INSERT INTO spa_daily_logs (user_id, log_date, cant_do, cant_do_reason)
      VALUES (${userId}, ${today}, true, ${reason})
      ON CONFLICT (user_id, log_date) DO UPDATE SET cant_do = true, cant_do_reason = ${reason}
    `;

    await i.deferUpdate().catch(() => {});
    try { await i.message.edit({ embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle("❌ Can't Do — Noted").setDescription('Your response has been logged and forwarded to HPA.').setTimestamp()], components: [] }); } catch { /* silent */ }

    // Check if flagged
    const flagStatus = await sql`SELECT * FROM spa_cant_do_flags WHERE user_id = ${userId}`;
    const isFlagged  = flagStatus[0]?.flagged ?? false;

    const flagBtn     = new ButtonBuilder().setCustomId(`audit_flag_senior:${userId}`).setLabel('Flag Senior').setStyle(ButtonStyle.Danger);
    const acceptedBtn = new ButtonBuilder().setCustomId(`audit_accept_cant:${userId}`).setLabel('Accepted').setStyle(ButtonStyle.Success);
    const noteEmbed = new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle(`❌ Can't Do — <@${userId}>`)
      .addFields({ name: 'Reason', value: reason })
      .setFooter({ text: isFlagged ? '🚩 This senior is currently flagged' : 'Not flagged' })
      .setTimestamp();

    try {
      const ch = await i.client.channels.fetch(config.channels.appeals) as TextChannel;
      const content = isFlagged ? `<@&${config.roles.HPA}> ⚠️ Flagged senior submitted Can't Do:` : `<@&${config.roles.HPA}> Senior Can't Do response:`;
      await ch.send({ content, embeds: [noteEmbed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(acceptedBtn, flagBtn)] });
    } catch { /* silent */ }
  }

  else if (action === 'audit_add_flag_modal') {
    await i.deferReply({ ephemeral: true });
    const targetId  = rest[0];
    const flagIndex = parseInt(rest[1]);
    const flagType  = BEHAVIOUR_FLAGS[flagIndex] ?? 'Unknown Flag';
    const note      = i.fields.getTextInputValue('note').trim() || null;
    const notify    = i.fields.getTextInputValue('notify').trim().toLowerCase() === 'yes';

    await sql`
      INSERT INTO spa_behaviour_flags (user_id, flag_type, note, added_by, notify_senior)
      VALUES (${targetId}, ${flagType}, ${note}, ${i.user.id}, ${notify})
    `;

    if (notify) {
      await dmUser(i.client, targetId, {
        embeds: [new EmbedBuilder().setColor(Colors.Orange).setTitle('⚠️ Behaviour Flag Added').setDescription(`A behaviour flag has been added to your profile: **${flagType}**${note ? `\n\n**Note:** ${note}` : ''}`).setTimestamp()]
      });
    }

    await i.editReply({ embeds: [successEmbed('Flag Added', `**${flagType}** added to <@${targetId}>${note ? ` with note: ${note}` : ''}.${notify ? ' Senior has been notified.' : ''}`)] });
  }

  // ─── WEEKLY REPORT MODALS ─────────────────────────────────────────────────
  else if (action === 'wr_modal1') {
    const cycleId  = parseInt(rest[0]);
    const issues   = i.fields.getTextInputValue('issues').trim();
    const mistakes = i.fields.getTextInputValue('mistakes').trim();
    const weaknesses = i.fields.getTextInputValue('weaknesses').trim();

    // Quality check
    const banned = ['no issues', 'everything fine', 'n/a', 'nothing', 'all good', 'no problems', 'all fine', 'none', 'all clear'];
    const failed: string[] = [];
    if ([issues, mistakes, weaknesses].some(t => banned.some(b => t.toLowerCase().includes(b)))) {
      failed.push('One or more sections contain low-effort phrases.');
    }
    if (issues.length < 50) failed.push('Marketplace/System Issues is too short.');
    if (mistakes.length < 50) failed.push('Repeated PA Mistakes is too short.');
    if (weaknesses.length < 50) failed.push('System Weaknesses is too short.');

    if (failed.length > 0) {
      await i.reply({
        embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('❌ Report Rejected').setDescription(`Your report was rejected for the following reasons:\n\n${failed.map(f => `• ${f}`).join('\n')}\n\nPlease try again with more detailed responses.`).setTimestamp()],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`wr_submit:${cycleId}`).setLabel('📝 Try Again').setStyle(ButtonStyle.Primary))],
        ephemeral: true,
      });
      return;
    }

    // Save to pending
    await sql`
      INSERT INTO weekly_report_pending (user_id, cycle_id, section_issues, section_mistakes, section_weaknesses, step)
      VALUES (${i.user.id}, ${cycleId}, ${issues}, ${mistakes}, ${weaknesses}, 'tags1')
      ON CONFLICT (user_id) DO UPDATE SET
        cycle_id = ${cycleId}, section_issues = ${issues}, section_mistakes = ${mistakes},
        section_weaknesses = ${weaknesses}, step = 'tags1', updated_at = NOW()
    `;

    await i.reply({
      content: '**Part 1 saved!** Now tag the themes for each section (optional but encouraged):',
      components: [buildTagSelect('issues', cycleId, '📉 Marketplace/System Issues')],
      ephemeral: true,
    });
  }

  else if (action === 'wr_modal2') {
    const cycleId  = parseInt(rest[0]);
    const risks    = i.fields.getTextInputValue('risks').trim();
    const suggestions = i.fields.getTextInputValue('suggestions').trim();
    const reflection  = i.fields.getTextInputValue('reflection').trim();

    const banned = ['no issues', 'everything fine', 'n/a', 'nothing', 'all good', 'no problems', 'all fine', 'none', 'all clear'];
    const failed: string[] = [];
    if (risks.length < 50) failed.push('Risks/Emerging Problems is too short.');
    if (suggestions.length < 50) failed.push('Improvement Suggestions is too short.');
    if (reflection.length < 50) failed.push('Self Reflection is too short.');
    if ([risks, suggestions, reflection].some(t => banned.some(b => t.toLowerCase().includes(b)))) failed.push('One or more sections contain low-effort phrases.');

    if (failed.length > 0) {
      await i.reply({
        embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('❌ Report Rejected').setDescription(`Your report was rejected:\n\n${failed.map(f => `• ${f}`).join('\n')}\n\nPlease try again.`).setTimestamp()],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`wr_submit:${cycleId}`).setLabel('📝 Restart').setStyle(ButtonStyle.Primary))],
        ephemeral: true,
      });
      return;
    }

    await sql`
      UPDATE weekly_report_pending SET
        section_risks = ${risks}, section_suggestions = ${suggestions},
        section_reflection = ${reflection}, step = 'tags2', updated_at = NOW()
      WHERE user_id = ${i.user.id} AND cycle_id = ${cycleId}
    `;

    await i.reply({
      content: '**Part 2 saved!** Now tag the themes for each section:',
      components: [buildTagSelect('risks', cycleId, '🚨 Risks/Emerging Problems')],
      ephemeral: true,
    });
  }

  else if (action === 'wr_other_label') {
    const cycleId    = parseInt(rest[0]);
    const sectionKey = rest[1];
    const label      = i.fields.getTextInputValue('label').trim();

    await storeTags(i.user.id, cycleId, sectionKey, ['Other'], label);
    await i.deferUpdate().catch(() => {});
    await showNextTagsOrModal(i, cycleId, sectionKey);
  }

  // ─── TAG MODALS ────────────────────────────────────────────────────────────
  else if (action === 'create_tag_modal') {
    await i.deferReply({ ephemeral: true });
    const category = rest[0] ?? 'Other';
    const name     = i.fields.getTextInputValue('tag_name').trim().toLowerCase().replace(/\s+/g, '_');
    const content  = i.fields.getTextInputValue('tag_content').trim();

    const existing = await sql`SELECT 1 FROM tags WHERE name = ${name}`;
    if (existing.length > 0) { await i.editReply({ embeds: [errorEmbed(`Tag **${name}** already exists.`)] }); return; }
    const count = await sql`SELECT COUNT(*) as c FROM tags`;
    if (parseInt(count[0].c) >= 30) { await i.editReply({ embeds: [errorEmbed('Tag limit of 30 reached.')] }); return; }

    await sql`INSERT INTO tags (name, content, category, created_by) VALUES (${name}, ${content}, ${category}, ${i.user.id})`;
    await i.editReply({ embeds: [successEmbed('Tag Created', `Tag **${name}** [${category}] created.`)] });
  }

  else if (action === 'edit_tag_modal') {
    await i.deferReply({ ephemeral: true });
    const tagId   = parseInt(rest[0]);
    const content = i.fields.getTextInputValue('tag_content').trim();
    const catRaw  = i.fields.getTextInputValue('category').trim();
    const validCats = ['Rules', 'Guides', 'Resources', 'Other'];
    const category  = validCats.find(c => c.toLowerCase() === catRaw.toLowerCase()) ?? 'Other';

    await sql`UPDATE tags SET content = ${content}, category = ${category}, updated_by = ${i.user.id}, updated_at = NOW() WHERE id = ${tagId}`;
    const [tag] = await sql`SELECT name FROM tags WHERE id = ${tagId}`;
    await i.editReply({ embeds: [successEmbed('Tag Updated', `**${tag?.name}** updated.`)] });
  }

  // ─── GAME NIGHT RATE MODAL ─────────────────────────────────────────────────
  else if (action === 'gn_rate_modal') {
    await i.deferReply({ ephemeral: true });
    const nightId  = parseInt(rest[0]);
    const rating   = Math.min(5, Math.max(1, parseInt(i.fields.getTextInputValue('rating').trim()) || 3));
    const comment  = i.fields.getTextInputValue('comment').trim() || null;

    await sql`INSERT INTO game_night_feedback (game_night_id, user_id, rating, comment) VALUES (${nightId}, ${i.user.id}, ${rating}, ${comment}) ON CONFLICT DO NOTHING`;

    // Check if all attendees rated
    const rsvps    = await sql`SELECT user_id FROM game_night_rsvps WHERE game_night_id = ${nightId} AND attending = true`;
    const feedback = await sql`SELECT user_id FROM game_night_feedback WHERE game_night_id = ${nightId}`;
    const rsvpIds  = new Set(rsvps.map((r: any) => r.user_id));
    const doneIds  = new Set(feedback.map((f: any) => f.user_id));
    if ([...rsvpIds].every(id => doneIds.has(id))) {
      const { postFeedbackSummary } = await import('../services/gameNightService');
      await postFeedbackSummary(i.client, nightId).catch(() => {});
    }

    await i.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('Thanks for the feedback!').setDescription(`You rated this game night **${rating}/5**.${comment ? `\n\nComment: ${comment}` : ''}`).setTimestamp()] });
  }

  // ─── ESC NOTE MODAL ────────────────────────────────────────────────────────
  else if (action === 'esc_note_modal') {
    await i.deferReply({ ephemeral: true });
    const escalationId = parseInt(rest[0]);
    const note = i.fields.getTextInputValue('note').trim();
    await sql`INSERT INTO escalation_notes (escalation_id, added_by, note) VALUES (${escalationId}, ${i.user.id}, ${note})`;
    await i.editReply({ embeds: [successEmbed('Note Added', 'Your note has been saved.')] });
  }
}

// ─── WEEKLY REPORT HELPERS ────────────────────────────────────────────────────
async function storeTags(userId: string, cycleId: number, sectionKey: string, tags: string[], otherLabel: string | null): Promise<void> {
  try {
    if (sectionKey === 'issues') {
      await sql`UPDATE weekly_report_pending SET tags_issues = ${tags}, other_label_issues = ${otherLabel}, updated_at = NOW() WHERE user_id = ${userId} AND cycle_id = ${cycleId}`;
    } else if (sectionKey === 'mistakes') {
      await sql`UPDATE weekly_report_pending SET tags_mistakes = ${tags}, other_label_mistakes = ${otherLabel}, updated_at = NOW() WHERE user_id = ${userId} AND cycle_id = ${cycleId}`;
    } else if (sectionKey === 'weaknesses') {
      await sql`UPDATE weekly_report_pending SET tags_weaknesses = ${tags}, other_label_weaknesses = ${otherLabel}, updated_at = NOW() WHERE user_id = ${userId} AND cycle_id = ${cycleId}`;
    } else if (sectionKey === 'risks') {
      await sql`UPDATE weekly_report_pending SET tags_risks = ${tags}, other_label_risks = ${otherLabel}, updated_at = NOW() WHERE user_id = ${userId} AND cycle_id = ${cycleId}`;
    } else if (sectionKey === 'suggestions') {
      await sql`UPDATE weekly_report_pending SET tags_suggestions = ${tags}, other_label_suggestions = ${otherLabel}, updated_at = NOW() WHERE user_id = ${userId} AND cycle_id = ${cycleId}`;
    }
  } catch (e) { console.error('Failed to store tags:', e); }
}

async function showNextTagsOrModal(i: any, cycleId: number, currentSection: string): Promise<void> {
  const section1Flow = ['issues', 'mistakes', 'weaknesses'];
  const section2Flow = ['risks', 'suggestions'];

  const idx1 = section1Flow.indexOf(currentSection);
  const idx2 = section2Flow.indexOf(currentSection);

  const sectionLabels: Record<string, string> = {
    issues: '📉 Marketplace/System Issues', mistakes: '🔁 Repeated PA Mistakes',
    weaknesses: '⚖️ System Weaknesses', risks: '🚨 Risks/Emerging Problems',
    suggestions: '💡 Improvement Suggestions',
  };

  if (idx1 >= 0 && idx1 < section1Flow.length - 1) {
    const next = section1Flow[idx1 + 1];
    await i.editReply({ content: `Tags saved! Now tag: **${sectionLabels[next]}**`, components: [buildTagSelect(next, cycleId, sectionLabels[next])] }).catch(() => {});
  } else if (currentSection === 'weaknesses') {
    // Done with part 1 tags — show modal 2
    await i.editReply({ content: 'Tags for Part 1 saved! Now complete Part 2:', components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`wr_modal2_trigger:${cycleId}`).setLabel('📝 Continue to Part 2').setStyle(ButtonStyle.Primary))] }).catch(() => {});
  } else if (idx2 >= 0 && idx2 < section2Flow.length - 1) {
    const next = section2Flow[idx2 + 1];
    await i.editReply({ content: `Tags saved! Now tag: **${sectionLabels[next]}**`, components: [buildTagSelect(next, cycleId, sectionLabels[next])] }).catch(() => {});
  } else if (currentSection === 'suggestions') {
    // Done with all tags — show preview
    const pending = (await sql`SELECT * FROM weekly_report_pending WHERE user_id = ${i.user.id} AND cycle_id = ${cycleId}`)[0];
    if (!pending) return;

    const cfg = await getReportConfig();
    const { score } = scoreReport(pending, cfg);

    const preview = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle('📋 Report Preview — Please Confirm')
      .setDescription('Review your report below. Once confirmed it cannot be changed.')
      .addFields(
        { name: '📉 Issues', value: pending.section_issues.slice(0, 300) },
        { name: '🔁 Mistakes', value: pending.section_mistakes.slice(0, 300) },
        { name: '⚖️ Weaknesses', value: pending.section_weaknesses.slice(0, 300) },
        { name: '🚨 Risks', value: pending.section_risks?.slice(0, 300) ?? 'Pending' },
        { name: '💡 Suggestions', value: pending.section_suggestions?.slice(0, 300) ?? 'Pending' },
        { name: '👤 Reflection', value: pending.section_reflection?.slice(0, 300) ?? 'Pending' },
        { name: '📊 Est. Quality Score', value: `${score}/100` },
      )
      .setTimestamp();

    const confirmBtn = new ButtonBuilder().setCustomId(`wr_confirm:${cycleId}`).setLabel('✅ Confirm & Submit').setStyle(ButtonStyle.Success);
    const editBtn    = new ButtonBuilder().setCustomId(`wr_edit:${cycleId}`).setLabel('✏️ Edit').setStyle(ButtonStyle.Secondary);

    await i.editReply({ content: '', embeds: [preview], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, editBtn)] }).catch(() => {});
  }
}

// ─── STRIKE ROLE HANDLER ─────────────────────────────────────────────────────
async function handleStrikeRoleButton(i: any, action: string, rest: string[]): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) { await i.reply({ content: 'HPA only.', ephemeral: true }); return; }

  const targetId    = rest[0];
  const strikeCount = parseInt(rest[1] ?? '0');

  if (action === 'strike_role_skip') {
    await i.update({
      embeds: [new EmbedBuilder().setColor(Colors.Grey).setTitle('No Role Assigned').setDescription(`No strike role assigned to <@${targetId}>.`).setTimestamp()],
      components: [],
    });
    return;
  }

  try {
    await syncStrikeRole(i.client, targetId, i.guild!.id);
    const STRIKE_ROLE_IDS: Record<number, string> = {
      1: '1372621584036134922',
      2: '1372621626134233148',
    };
    const roleId = STRIKE_ROLE_IDS[strikeCount];
    await i.update({
      embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('Role Assigned').setDescription(`<@&${roleId}> has been assigned to <@${targetId}>.`).setTimestamp()],
      components: [],
    });
  } catch {
    await i.update({
      embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Failed').setDescription('Could not assign role. Check bot permissions.').setTimestamp()],
      components: [],
    });
  }
}

async function checkStrikeAlert(client: any, userId: string): Promise<void> {
  try {
    const rows = await sql`
      SELECT
        COUNT(*) FILTER (WHERE type = 'strike') AS strikes
      FROM logs WHERE user_id = ${userId} AND expires_at > NOW()
    `;
    const strikes = parseInt(rows[0].strikes) || 0;
    if (strikes !== 2 && strikes !== 3) return;

    const ch = await client.channels.fetch(config.channels.appeals) as TextChannel;
    if (strikes === 2) {
      await ch.send({ content: `<@&${config.roles.HPA}> Warning: <@${userId}> is now at **2 strikes** and is approaching 3.` });
    } else if (strikes === 3) {
      await ch.send({ content: `<@&${config.roles.HPA}> <@${userId}> has reached **3 strikes**.` });
    }
  } catch { /* silent */ }
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
