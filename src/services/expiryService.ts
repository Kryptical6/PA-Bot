import { sql } from '../database/client';

export async function deleteExpiredLogs(): Promise<number> {
  const r = await sql`DELETE FROM logs WHERE expires_at <= NOW() RETURNING id`;
  return r.length;
}

export async function deleteExpiredEscalationWarnings(): Promise<void> {
  const rateRow = await sql`SELECT rate FROM escalation_config WHERE id = 1`;
  const rate = rateRow[0]?.rate ?? 3;
  await sql`DELETE FROM escalation_warnings WHERE threshold != ${rate}`;
}
