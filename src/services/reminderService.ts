import { Client, TextChannel } from 'discord.js';
import { sql } from '../database/client';
import { config } from '../config';
import { warningEmbed } from '../utils/embeds';

export async function checkPendingLogReminders(client: Client): Promise<void> {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - config.reminders.pendingLogDays);
  const stale = await sql`SELECT * FROM pending_logs WHERE created_at <= ${threshold.toISOString()}`;
  if (stale.length === 0) return;

  const embed = warningEmbed('Pending Logs Reminder', `**${stale.length}** log(s) unreviewed for ${config.reminders.pendingLogDays}+ days.`);
  for (const uid of config.reminders.notifyUserIds) {
    try { const u = await client.users.fetch(uid); await u.send({ embeds: [embed] }); } catch { /* silent */ }
  }
}
