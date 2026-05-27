import { Client, TextChannel, EmbedBuilder, Colors } from 'discord.js';
import { sql } from '../database/client';
import { config } from '../config';
import { deleteExpiredLogs, deleteExpiredEscalationWarnings, syncExpiredStrikeRoles } from '../services/expiryService';
import { processExpiredVotes } from '../services/voteService';
import { checkPendingLogReminders } from '../services/reminderService';
import { cancelExpiredAssessmentSessions } from '../services/assessmentExpiryService';
import { sendGameNightReminders } from '../services/gameNightService';
import { checkFeedbackReminders } from '../services/feedbackService';
import { sendDailyReminders, runAuditChecks } from '../services/spaAuditService';
import { checkWeeklyReportSchedule } from '../services/weeklyReportService';
import { checkExpiredSessions } from '../services/logSessionService';
import { dmUser } from '../services/dmService';

async function runAll(client: Client): Promise<void> {
  try {
    await deleteExpiredLogs();
    await syncExpiredStrikeRoles(client);
    await deleteExpiredEscalationWarnings();
    await processExpiredVotes(client);
    await checkPendingLogReminders(client);
    await cancelExpiredAssessmentSessions(client);
    await sendGameNightReminders(client);
    await checkFeedbackReminders(client);
    await sendDailyReminders(client);
    await runAuditChecks(client);
    await checkWeeklyReportSchedule(client);
    await checkUnreadWarnings(client);
    await checkExpiredSessions(client);
    await fireReminders(client);
  } catch (e) { console.error('Scheduler error:', e); }
}

async function fireReminders(client: Client): Promise<void> {
  try {
    const due = await sql`SELECT * FROM reminders WHERE fires_at <= NOW() AND sent = false`;
    for (const r of due) {
      await sql`UPDATE reminders SET sent = true WHERE id = ${r.id}`;
      try {
        const user = await client.users.fetch(r.user_id);
        const dm   = await user.createDM();
        const embed = new EmbedBuilder()
          .setColor(Colors.Yellow)
          .setTitle('Reminder')
          .setDescription(r.type === 'custom' ? r.note : `${r.label}${r.note ? `\n\n${r.note}` : ''}`)
          .setFooter({ text: `Reminder ID: ${r.id}` })
          .setTimestamp();
        await dm.send({ embeds: [embed] });
      } catch { /* silent - DMs disabled */ }
    }
  } catch (e) { console.error('Reminder fire error:', e); }
}

async function checkUnreadWarnings(client: Client): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 24 * 3600000).toISOString();
    const unread = await sql`
      SELECT * FROM warning_read_receipts
      WHERE read_at IS NULL AND alert_sent = FALSE AND created_at <= ${cutoff}
    `;

    for (const w of unread) {
      await sql`UPDATE warning_read_receipts SET alert_sent = TRUE WHERE id = ${w.id}`;

      const alertEmbed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle('Warning Not Acknowledged')
        .setDescription(`<@${w.warned_user_id}> has not read or acknowledged their warning after 24 hours.\n\n**Reason:** ${w.reason}\n**Sent by:** <@${w.warned_by}>`)
        .setTimestamp();

      // Post in appeals channel
      try {
        const ch = await client.channels.fetch('1497723319829401750') as TextChannel;
        await ch.send({ content: `<@&${config.roles.HPA}>`, embeds: [alertEmbed] });
      } catch { /* silent */ }

      // DM the sender
      try {
        const sender = await client.users.fetch(w.warned_by);
        await sender.send({ embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Warning Not Read').setDescription(`<@${w.warned_user_id}> has not acknowledged your warning after 24 hours.\n\n**Reason:** ${w.reason}`).setTimestamp()] });
      } catch { /* silent */ }
    }
  } catch (e) { console.error('Unread warning check error:', e); }
}

// Startup checks: run safe maintenance tasks only (no DM-sending)
async function runStartupOnly(client: Client): Promise<void> {
  try {
    await deleteExpiredLogs();
    await deleteExpiredEscalationWarnings();
    await processExpiredVotes(client);
    await cancelExpiredAssessmentSessions(client);
    await runAuditChecks(client);
  } catch (e) { console.error('Startup check error:', e); }
}

let autoTagRunning = false;

async function checkAutoTagSends(client: Client): Promise<void> {
  if (autoTagRunning) return;
  autoTagRunning = true;
  try {
    const sessions = await sql`
      SELECT a.*, t.name as tag_name, t.content as tag_content
      FROM tag_role_auto a
      JOIN tags t ON a.tag_id = t.id
      WHERE a.active = true
    `;

    if (sessions.length === 0) return;

    const guild = (client as any).guilds?.cache?.first();
    if (!guild) return;
    await guild.members.fetch();

    const summaryLines: string[] = [];

    for (const session of sessions) {
      const members = guild.members.cache.filter((mb: any) =>
        mb.roles.cache.has(session.role_id) && !mb.user.bot
      );

      // Find members who haven't been sent this session's tag yet
      const alreadySent = await sql`
        SELECT user_id FROM tag_role_sent WHERE session_id = ${session.session_id}
      `;
      const sentIds = new Set(alreadySent.map((r: any) => r.user_id));

      const newMembers = [...members.values()].filter((mb: any) => !sentIds.has(mb.id));
      if (newMembers.length === 0) continue;

      let sent = 0;
      for (const member of newMembers) {
        const result = await dmUser(client, member.id, { content: session.tag_content });
        if (result) {
          sent++;
          await sql`
            INSERT INTO tag_role_sent (session_id, tag_id, role_id, user_id)
            VALUES (${session.session_id}, ${session.tag_id}, ${session.role_id}, ${member.id})
            ON CONFLICT DO NOTHING
          `;
        }
      }

      if (sent > 0) {
        summaryLines.push(`**${session.session_id}** - Tag: ${session.tag_name} | Role: <@&${session.role_id}> | New users DM'd: **${sent}**`);
      }
    }

    if (summaryLines.length > 0) {
      const ch = await client.channels.fetch('1497723319829401750') as TextChannel;
      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Daily Auto-Send Summary')
        .setDescription(summaryLines.join('\n'))
        .setTimestamp();
      await ch.send({ embeds: [embed] });
    }
  } catch (e) { console.error('Auto tag send error:', e); } finally { autoTagRunning = false; }
}

export const startScheduler = (client: Client) => setInterval(() => runAll(client), 60 * 60 * 1000);
export const startMinuteScheduler = (client: Client) => setInterval(() => { checkAutoTagSends(client).catch(e => console.error('Auto tag error:', e)); }, 60 * 1000);
export const runStartupChecks = async (client: Client) => {
  console.log('Running startup checks...');
  await runStartupOnly(client);
  console.log('Startup checks complete.');
};
