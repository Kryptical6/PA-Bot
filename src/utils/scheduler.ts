import { Client } from 'discord.js';
import { deleteExpiredLogs, deleteExpiredEscalationWarnings } from '../services/expiryService';
import { processExpiredVotes } from '../services/voteService';
import { checkPendingLogReminders } from '../services/reminderService';
import { cancelExpiredAssessmentSessions } from '../services/assessmentExpiryService';
import { sendGameNightReminders } from '../services/gameNightService';
import { checkFeedbackReminders } from '../services/feedbackService';

async function runAll(client: Client): Promise<void> {
  try {
    await deleteExpiredLogs();
    await deleteExpiredEscalationWarnings();
    await processExpiredVotes(client);
    await checkPendingLogReminders(client);
    await cancelExpiredAssessmentSessions(client);
    await sendGameNightReminders(client);
    await checkFeedbackReminders(client);
  } catch (e) { console.error('Scheduler error:', e); }
}

export const startScheduler = (client: Client) => setInterval(() => runAll(client), 60 * 60 * 1000);
export const runStartupChecks = async (client: Client) => { console.log('Running startup checks...'); await runAll(client); console.log('Startup checks complete.'); };
