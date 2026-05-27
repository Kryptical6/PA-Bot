import { sql } from '../database/client';

// ─── ERROR CODE GENERATION ────────────────────────────────────────────────────
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars

export function generateErrorCode(): string {
  let code = 'ERR-';
  for (let i = 0; i < 4; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
  return code;
}

// ─── LOG ERROR ────────────────────────────────────────────────────────────────
export async function logError(opts: {
  code:      string;
  command:   string;
  userId:    string;
  guildId?:  string;
  message:   string;
  stack?:    string;
}): Promise<void> {
  try {
    await sql`
      INSERT INTO error_log (code, command, user_id, guild_id, message, stack)
      VALUES (${opts.code}, ${opts.command}, ${opts.userId}, ${opts.guildId ?? null}, ${opts.message.slice(0, 2000)}, ${opts.stack?.slice(0, 2000) ?? null})
    `;
    // Keep only last 50
    await sql`
      DELETE FROM error_log WHERE id NOT IN (
        SELECT id FROM error_log ORDER BY created_at DESC LIMIT 50
      )
    `;
  } catch (e) {
    console.error('Failed to log error to DB:', e);
  }
}

// ─── GET RECENT ERRORS ────────────────────────────────────────────────────────
export async function getRecentErrors(limit = 10): Promise<any[]> {
  return sql`SELECT * FROM error_log ORDER BY created_at DESC LIMIT ${limit}`;
}

// ─── GET ERROR BY CODE ────────────────────────────────────────────────────────
export async function getErrorByCode(code: string): Promise<any | null> {
  const rows = await sql`SELECT * FROM error_log WHERE code = ${code} ORDER BY created_at DESC LIMIT 1`;
  return rows[0] ?? null;
}
