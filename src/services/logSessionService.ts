import { Client, EmbedBuilder, Colors, TextChannel, ButtonBuilder, ButtonStyle, ActionRowBuilder, DMChannel } from 'discord.js';
import { sql } from '../database/client';
import { config } from '../config';
import { dmUser } from './dmService';

const SESSION_HOURS = 12;

// ─── START SESSION ────────────────────────────────────────────────────────────
export async function startLogSession(client: Client, userId: string, dmChannelId: string, dmMessageId: string): Promise<void> {
  // Close any existing active session first
  const existing = await sql`SELECT * FROM spa_log_sessions WHERE user_id = ${userId} AND status = 'active'`;
  for (const session of existing) {
    await closeSession(client, session, 'expired', 'A new session was started. Previous session closed.');
  }

  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600000);
  await sql`
    INSERT INTO spa_log_sessions (user_id, started_at, expires_at, dm_message_id, dm_channel_id)
    VALUES (${userId}, NOW(), ${expiresAt.toISOString()}, ${dmMessageId}, ${dmChannelId})
  `;
}

// ─── BUILD SESSION EMBED ──────────────────────────────────────────────────────
export function buildSessionEmbed(userId: string, logsToday: number, cfg: any, status: 'active' | 'done' = 'active'): EmbedBuilder {
  if (status === 'active') {
    return new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('Log Session Active')
      .setDescription('Your session is running. Logs are being tracked automatically.')
      .addFields(
        { name: 'Logs today',   value: String(logsToday),     inline: true },
        { name: 'Daily target', value: String(cfg.soft_target), inline: true },
      )
      .setTimestamp();
  }
  return new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle('Session Complete')
    .setDescription('Session submitted.')
    .addFields({ name: 'Total logs today', value: String(logsToday), inline: true })
    .setTimestamp();
}

export function buildSessionButtons(userId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`session_done:${userId}`).setLabel('Done').setStyle(ButtonStyle.Primary),
  );
}

// ─── UPDATE SESSION DM LIVE ───────────────────────────────────────────────────
export async function updateSessionDM(client: Client, userId: string): Promise<void> {
  try {
    const [session] = await sql`SELECT * FROM spa_log_sessions WHERE user_id = ${userId} AND status = 'active'`;
    if (!session) return;

    const today  = new Date().toISOString().split('T')[0];
    const [dayLog] = await sql`SELECT * FROM spa_daily_logs WHERE user_id = ${userId} AND log_date = ${today}`;
    const logsToday = (dayLog?.submitted || 0) + (dayLog?.approved || 0) + (dayLog?.denied || 0);
    const [cfgRow]  = await sql`SELECT soft_target FROM spa_audit_config WHERE user_id = ${userId}`;
    const cfg = cfgRow ?? { soft_target: 10 };

    const dmChannel = await client.channels.fetch(session.dm_channel_id) as DMChannel;
    const msg       = await dmChannel.messages.fetch(session.dm_message_id);
    await msg.edit({ embeds: [buildSessionEmbed(userId, logsToday, cfg)], components: [buildSessionButtons(userId)] });
  } catch { /* silent - DM may have been deleted */ }
}

// ─── CLOSE SESSION ────────────────────────────────────────────────────────────
export async function closeSession(client: Client, session: any, status: 'completed' | 'expired', reason?: string): Promise<void> {
  await sql`UPDATE spa_log_sessions SET status = ${status}, completed_at = NOW() WHERE id = ${session.id}`;
  try {
    const dmChannel = await client.channels.fetch(session.dm_channel_id) as DMChannel;
    const msg       = await dmChannel.messages.fetch(session.dm_message_id);
    const embed = new EmbedBuilder()
      .setColor(status === 'expired' ? Colors.Red : Colors.Blue)
      .setTitle(status === 'expired' ? 'Session Missed' : 'Session Closed')
      .setDescription(reason ?? (status === 'expired' ? 'This session was automatically closed after 12 hours.' : 'Session closed.'))
      .setTimestamp();
    await msg.edit({ embeds: [embed], components: [] });
  } catch { /* silent */ }
}

// ─── CHECK EXPIRED SESSIONS ───────────────────────────────────────────────────
export async function checkExpiredSessions(client: Client): Promise<void> {
  const expired = await sql`SELECT * FROM spa_log_sessions WHERE status = 'active' AND expires_at <= NOW()`;
  for (const session of expired) {
    await closeSession(client, session, 'expired', 'This session was automatically closed after 12 hours. Marked as missed.');
    const today = new Date().toISOString().split('T')[0];
    await sql`
      INSERT INTO spa_daily_logs (user_id, log_date, underperformed)
      VALUES (${session.user_id}, ${today}, true)
      ON CONFLICT (user_id, log_date) DO UPDATE SET underperformed = true
    `.catch(() => {});
  }
}

// ─── POST SESSION SUMMARY ─────────────────────────────────────────────────────
export async function postSessionSummary(client: Client, userId: string, sessionId: number, reviewType: string, reviewedItems: string[], postsReviewed: number): Promise<void> {
  const today  = new Date().toISOString().split('T')[0];
  const [dayLog] = await sql`SELECT * FROM spa_daily_logs WHERE user_id = ${userId} AND log_date = ${today}`;
  const log    = dayLog ?? { submitted: 0, approved: 0, denied: 0 };
  const [session] = await sql`SELECT * FROM spa_log_sessions WHERE id = ${sessionId}`;

  const durationMs = new Date(session.completed_at ?? new Date()).getTime() - new Date(session.started_at).getTime();
  const hours   = Math.floor(durationMs / 3600000);
  const minutes = Math.floor((durationMs % 3600000) / 60000);

  const typeLabel: Record<string, string> = {
    sections:    'Sections',
    individuals: 'Individual PAs',
    mix:         'Mix',
  };

  const formattedItems = reviewedItems.map(id => {
    const cleaned = id.trim();
    if (/^\d{17,20}$/.test(cleaned)) {
      return reviewType === 'individuals' ? `<@${cleaned}>` : `<#${cleaned}>`;
    }
    return cleaned;
  });

  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle(`Log Session - <@${userId}>`)
    .addFields(
      { name: 'Date',           value: today,                                                                              inline: true },
      { name: 'Duration',       value: `${hours}h ${minutes}m`,                                                           inline: true },
      { name: 'Logs submitted', value: `${log.submitted ?? 0} (approved: ${log.approved ?? 0}, denied: ${log.denied ?? 0})` },
      { name: 'Posts reviewed', value: `~${postsReviewed}`,                                                               inline: true },
      { name: 'Review type',    value: typeLabel[reviewType] ?? reviewType,                                                inline: true },
    )
    .setTimestamp();

  if (formattedItems.length > 0) {
    const label = reviewType === 'individuals' ? 'PAs Reviewed' : reviewType === 'sections' ? 'Sections Reviewed' : 'Reviewed';
    embed.addFields({ name: label, value: formattedItems.join('\n') });
  }

  try {
    const ch = await client.channels.fetch(config.channels.appeals) as TextChannel;
    await ch.send({ embeds: [embed] });
  } catch (e) { console.error('Failed to post session summary:', e); }

  await sql`
    UPDATE spa_log_sessions SET
      review_type       = ${reviewType},
      reviewed_sections = ${reviewType !== 'individuals' ? reviewedItems : []},
      reviewed_users    = ${reviewType !== 'sections'    ? reviewedItems : []},
      posts_reviewed    = ${postsReviewed}
    WHERE id = ${sessionId}
  `;
}
