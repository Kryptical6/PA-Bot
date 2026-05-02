import { Client } from 'discord.js';
import { deleteExpiredLogs, deleteExpiredEscalationWarnings } from '../services/expiryService';
import { processExpiredVotes } from '../services/voteService';
import { checkPendingLogReminders } from '../services/reminderService';
import { cancelExpiredAssessmentSessions } from '../services/assessmentExpiryService';
import { sendGameNightReminders } from '../services/gameNightService';
import { checkFeedbackReminders } from '../services/feedbackService';
import { sendDailyReminders, runAuditChecks } from '../services/spaAuditService';
import { checkWeeklyReportSchedule } from '../services/weeklyReportService';

async function runAll(client: Client): Promise<void> {
  try {
    await deleteExpiredLogs();
    await deleteExpiredEscalationWarnings();
    await processExpiredVotes(client);
    await checkPendingLogReminders(client);
    await cancelExpiredAssessmentSessions(client);
    await sendGameNightReminders(client);
    await checkFeedbackReminders(client);
    await sendDailyReminders(client);
    await runAuditChecks(client);
    await checkWeeklyReportSchedule(client);
  } catch (e) { console.error('Scheduler error:', e); }
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

export const startScheduler = (client: Client) => setInterval(() => runAll(client), 60 * 60 * 1000);
export const runStartupChecks = async (client: Client) => {
  console.log('Running startup checks...');
  await runStartupOnly(client);
  console.log('Startup checks complete.');
};
