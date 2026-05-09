import { Client } from 'discord.js';
import { sql } from '../database/client';
import { syncStrikeRole } from './strikeRoleService';

export async function deleteExpiredLogs(): Promise<number> {
  const r = await sql`DELETE FROM logs WHERE expires_at <= NOW() RETURNING id`;
  return r.length;
}

export async function deleteExpiredEscalationWarnings(): Promise<void> {
  const rateRow = await sql`SELECT rate FROM escalation_config WHERE id = 1`;
  const rate = rateRow[0]?.rate ?? 3;
  await sql`DELETE FROM escalation_warnings WHERE threshold != ${rate}`;
}

export async function syncExpiredStrikeRoles(client: Client): Promise<void> {
  try {
    // Find users whose strike logs expired in the last 2 hours
    const recentlyExpired = await sql`
      SELECT DISTINCT user_id FROM logs
      WHERE type = 'strike'
      AND expires_at <= NOW()
      AND expires_at >= NOW() - INTERVAL '2 hours'
    `;

    const guild = (client as any).guilds?.cache?.first();
    if (!guild || recentlyExpired.length === 0) return;

    for (const row of recentlyExpired) {
      await syncStrikeRole(client, row.user_id, guild.id);
    }
  } catch (e) {
    console.error('Failed to sync expired strike roles:', e);
  }
}
