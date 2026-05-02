import { GuildMember, PartialGuildMember } from 'discord.js';
import { sql } from '../database/client';

export async function onGuildMemberRemove(member: GuildMember | PartialGuildMember): Promise<void> {
  try {
    const logs = await sql`DELETE FROM logs WHERE user_id = ${member.id} RETURNING id`;
    const pending = await sql`SELECT post_id FROM pending_logs WHERE user_id = ${member.id}`;
    for (const p of pending) await sql`DELETE FROM used_post_ids WHERE post_id = ${p.post_id}`;
    await sql`DELETE FROM pending_logs WHERE user_id = ${member.id}`;
    await sql`DELETE FROM appeals WHERE user_id = ${member.id}`;
    await sql`DELETE FROM escalation_warnings WHERE user_id = ${member.id}`;
    await sql`DELETE FROM assessment_sessions WHERE user_id = ${member.id}`;
    await sql`DELETE FROM retake_requests WHERE user_id = ${member.id}`;
    await sql`DELETE FROM spa_audit_config WHERE user_id = ${member.id}`;
    await sql`DELETE FROM spa_daily_logs WHERE user_id = ${member.id}`;
    await sql`DELETE FROM spa_behaviour_flags WHERE user_id = ${member.id}`;
    await sql`DELETE FROM spa_stat_flags WHERE user_id = ${member.id}`;
    await sql`DELETE FROM spa_cant_do_flags WHERE user_id = ${member.id}`;
    await sql`DELETE FROM weekly_report_pending WHERE user_id = ${member.id}`;
    await sql`DELETE FROM weekly_report_misses WHERE user_id = ${member.id}`;
    await sql`DELETE FROM feedback_pending WHERE user_id = ${member.id}`;
    await sql`DELETE FROM suggestions WHERE submitted_by = ${member.id} AND status = 'pending'`;
    if (logs.length > 0) console.log(`Cleaned up ${logs.length} log(s) for departed member ${member.id}`);
  } catch (e) {
    console.error(`Cleanup failed for ${member.id}:`, e);
  }
}
