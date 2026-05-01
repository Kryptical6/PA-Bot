import { Client, EmbedBuilder, Colors, TextChannel, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { sql } from '../database/client';
import { config } from '../config';
import { dmUser } from './dmService';

const AUDIT_CHANNEL = config.channels.appeals; // 1497723319829401750

export const BEHAVIOUR_FLAGS = [
  '⚠️ Inconsistent Judgement',
  '⚠️ Poor Reasoning',
  '⚠️ Passive Behaviour',
  '⚠️ Poor Communication',
  '⚠️ Lack of Initiative',
  '⚠️ Unreliable Attendance',
  '⚠️ Disregarding Guidelines',
  '⚠️ Overstepping Boundaries',
  '⚠️ Unprofessional Conduct',
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
export async function getConfig(userId: string): Promise<any> {
  const global = (await sql`SELECT * FROM spa_audit_global WHERE id = 1`)[0];
  const rows   = await sql`SELECT * FROM spa_audit_config WHERE user_id = ${userId}`;
  if (rows.length === 0) {
    await sql`INSERT INTO spa_audit_config (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;
    return { user_id: userId, reminder_hour: 9, soft_target: 10, ...global };
  }
  return { ...global, ...rows[0] };
}

export async function getOrCreateDailyLog(userId: string, date?: string): Promise<any> {
  const d = date ?? new Date().toISOString().split('T')[0];
  await sql`INSERT INTO spa_daily_logs (user_id, log_date) VALUES (${userId}, ${d}) ON CONFLICT DO NOTHING`;
  return (await sql`SELECT * FROM spa_daily_logs WHERE user_id = ${userId} AND log_date = ${d}`)[0];
}

function pct(a: number, b: number): string {
  if (b === 0) return 'N/A';
  return `${Math.round((a / b) * 100)}%`;
}

function dayLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ─── SPA QUOTA EMBED ──────────────────────────────────────────────────────────
export async function buildQuotaEmbed(targetUserId: string, requesterId: string, isHPA: boolean): Promise<EmbedBuilder> {
  const cfg = await getConfig(targetUserId);
  const now  = new Date();

  // 24h stats
  const today = now.toISOString().split('T')[0];
  const todayLog = await getOrCreateDailyLog(targetUserId, today);

  // 7d stats
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
  const weekLogs = await sql`SELECT * FROM spa_daily_logs WHERE user_id = ${targetUserId} AND log_date >= ${sevenDaysAgo} ORDER BY log_date DESC`;

  const weekSubmitted = weekLogs.reduce((a: number, l: any) => a + (l.submitted || 0), 0);
  const weekApproved  = weekLogs.reduce((a: number, l: any) => a + (l.approved  || 0), 0);
  const weekDenied    = weekLogs.reduce((a: number, l: any) => a + (l.denied    || 0), 0);
  const activeDays    = weekLogs.filter((l: any) => (l.submitted || 0) >= cfg.soft_target).length;

  // All time
  const allLogs = await sql`SELECT SUM(submitted) as s, SUM(approved) as a, SUM(denied) as d FROM spa_daily_logs WHERE user_id = ${targetUserId}`;
  const allSub  = parseInt(allLogs[0].s) || 0;
  const allApp  = parseInt(allLogs[0].a) || 0;
  const allDen  = parseInt(allLogs[0].d) || 0;

  // Last done click
  const lastDone = await sql`SELECT log_date FROM spa_daily_logs WHERE user_id = ${targetUserId} AND done_clicked = true ORDER BY log_date DESC LIMIT 1`;

  // Active stat flags
  const statFlags = await sql`SELECT * FROM spa_stat_flags WHERE user_id = ${targetUserId} AND active = true`;
  const bhvFlags  = await sql`SELECT * FROM spa_behaviour_flags WHERE user_id = ${targetUserId} AND expires_at > NOW()`;

  const targetStr = `${cfg.soft_target} logs/day`;
  const todaySub  = todayLog?.submitted || 0;
  const todayApp  = todayLog?.approved  || 0;
  const todayDen  = todayLog?.denied    || 0;

  const embed = new EmbedBuilder()
    .setColor(statFlags.length > 0 || bhvFlags.length > 0 ? Colors.Orange : Colors.Blue)
    .setTitle(`📊 SPA Quota — <@${targetUserId}>`)
    .setTimestamp();

  // Today
  embed.addFields({ name: '📅 Today', value:
    `Submitted: **${todaySub}** | Approved: **${todayApp}** | Denied: **${todayDen}**\n` +
    `Accuracy: **${pct(todayApp, todaySub)}** | Target: **${targetStr}**\n` +
    `Status: ${todayLog?.done_clicked ? (todayLog?.underperformed ? '⚠️ Done (Underperformed)' : '✅ Done') : todayLog?.cant_do ? '❌ Can\'t Do' : '🕐 Pending'}`,
  });

  // 7 day
  embed.addFields({ name: '📆 Last 7 Days', value:
    `Submitted: **${weekSubmitted}** | Approved: **${weekApproved}** | Denied: **${weekDenied}**\n` +
    `Accuracy: **${pct(weekApproved, weekSubmitted)}** | Active Days: **${activeDays}/7**`,
  });

  // All time (only show to HPA or self)
  if (isHPA || targetUserId === requesterId) {
    embed.addFields({ name: '📈 All Time', value:
      `Submitted: **${allSub}** | Approved: **${allApp}** | Denied: **${allDen}**\n` +
      `Overall Accuracy: **${pct(allApp, allSub)}**`,
    });
  }

  // Last done
  const lastDoneStr = lastDone.length > 0
    ? `<t:${Math.floor(new Date(lastDone[0].log_date).getTime() / 1000)}:D>`
    : 'Never';
  embed.addFields({ name: '🕐 Last Active', value: lastDoneStr, inline: true });

  // Flags (only show to HPA)
  if (isHPA) {
    if (statFlags.length > 0) {
      embed.addFields({ name: '🚨 Stat Flags', value: statFlags.map((f: any) => `• ${f.flag_type.replace('_', ' ')}: ${f.details ?? ''}`).join('\n') });
    }
    if (bhvFlags.length > 0) {
      embed.addFields({ name: '⚠️ Behaviour Flags', value: bhvFlags.map((f: any) => `• ${f.flag_type}${f.note ? `: ${f.note}` : ''}`).join('\n') });
    }
  }

  return embed;
}

// ─── FULL AUDIT REPORT ────────────────────────────────────────────────────────
export async function buildAuditReport(client: Client, targetUserId: string, requesterId: string): Promise<{ embeds: EmbedBuilder[]; rows: ActionRowBuilder<ButtonBuilder>[] }> {
  const cfg  = await getConfig(targetUserId);
  const now  = new Date();

  // Last 7 days breakdown
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000).toISOString().split('T')[0];
    days.push(d);
  }

  const logs7 = await sql`SELECT * FROM spa_daily_logs WHERE user_id = ${targetUserId} AND log_date = ANY(${days}::date[])`;
  const logMap = new Map(logs7.map((l: any) => [l.log_date.toISOString?.().split('T')[0] ?? l.log_date, l]));

  // Prior 7 days for % change
  const days7to14: string[] = [];
  for (let i = 13; i >= 7; i--) {
    days7to14.push(new Date(now.getTime() - i * 86400000).toISOString().split('T')[0]);
  }
  const priorLogs = await sql`SELECT * FROM spa_daily_logs WHERE user_id = ${targetUserId} AND log_date = ANY(${days7to14}::date[])`;
  const priorAcc  = priorLogs.reduce((a: number, l: any) => a + (l.approved || 0), 0);
  const priorSub  = priorLogs.reduce((a: number, l: any) => a + (l.submitted || 0), 0);
  const priorAccPct = priorSub > 0 ? Math.round((priorAcc / priorSub) * 100) : 0;

  // Current 7d accuracy
  const currAcc = logs7.reduce((a: number, l: any) => a + (l.approved || 0), 0);
  const currSub = logs7.reduce((a: number, l: any) => a + (l.submitted || 0), 0);
  const currAccPct = currSub > 0 ? Math.round((currAcc / currSub) * 100) : 0;
  const accChange  = currAccPct - priorAccPct;
  const accChangeStr = accChange >= 0 ? `+${accChange}%` : `${accChange}%`;

  // Day breakdown
  const dayBreakdown = days.map(d => {
    const l = logMap.get(d) as any;
    const sub = l?.submitted || 0;
    const app = l?.approved  || 0;
    const den = l?.denied    || 0;
    const hit = sub >= cfg.soft_target;
    const icon = !l ? '⬜' : l.cant_do ? '❌' : l.underperformed ? '⚠️' : hit ? '✅' : l.done_clicked ? '🔸' : '🔴';
    return `${icon} **${dayLabel(d)}** — ${sub} sub / ${app} ✅ / ${den} ❌ ${l?.done_clicked ? '' : '*(no done)*'}`;
  }).join('\n');

  // Active days, streaks
  const activeDays = logs7.filter((l: any) => (l.submitted || 0) >= cfg.soft_target).length;
  const belowStreak = await getBelowTargetStreak(targetUserId, cfg.soft_target);

  // Last done
  const lastDone = await sql`SELECT log_date FROM spa_daily_logs WHERE user_id = ${targetUserId} AND done_clicked = true ORDER BY log_date DESC LIMIT 1`;
  const lastDoneStr = lastDone.length > 0 ? `<t:${Math.floor(new Date(lastDone[0].log_date).getTime() / 1000)}:D>` : 'Never';

  // Stat flags
  const statFlags = await sql`SELECT * FROM spa_stat_flags WHERE user_id = ${targetUserId} AND active = true`;
  const bhvFlags  = await sql`SELECT * FROM spa_behaviour_flags WHERE user_id = ${targetUserId} AND expires_at > NOW() ORDER BY created_at DESC`;
  const cantDoFlag = await sql`SELECT * FROM spa_cant_do_flags WHERE user_id = ${targetUserId}`;

  // Main embed
  const mainEmbed = new EmbedBuilder()
    .setColor(statFlags.length > 0 || bhvFlags.length > 0 ? Colors.Orange : Colors.Green)
    .setTitle(`🔍 SPA Audit — <@${targetUserId}>`)
    .setDescription(`**Soft Target:** ${cfg.soft_target} logs/day | **Reminder:** ${cfg.reminder_hour}:00 UTC`)
    .addFields(
      { name: '📊 7-Day Accuracy', value: `${currAccPct}% (${accChange >= 0 ? '📈' : '📉'} ${accChangeStr} vs prior week)`, inline: true },
      { name: '📅 Active Days', value: `${activeDays}/7`, inline: true },
      { name: '🕐 Last Active', value: lastDoneStr, inline: true },
      { name: '📉 Below-Target Streak', value: belowStreak > 0 ? `**${belowStreak}** day(s)` : 'None', inline: true },
      { name: '🚨 Flagged (Can\'t Do)', value: cantDoFlag[0]?.flagged ? '🚩 Yes' : 'No', inline: true },
    )
    .setTimestamp()
    .setFooter({ text: `Audit report for ${targetUserId} | Requested by ${requesterId}` });

  // Day breakdown embed
  const trendEmbed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle('📆 Last 7 Days Breakdown')
    .setDescription(dayBreakdown)
    .addFields({ name: 'Legend', value: '✅ Hit target | 🔸 Done (below target) | ⚠️ Underperformed | ❌ Can\'t Do | 🔴 Inactive | ⬜ No data' });

  // Stat flags embed
  const flagsEmbed = new EmbedBuilder()
    .setColor(Colors.Orange)
    .setTitle('🚨 Flags & Behaviour');

  if (statFlags.length === 0 && bhvFlags.length === 0) {
    flagsEmbed.setDescription('No active flags.');
  } else {
    if (statFlags.length > 0) {
      flagsEmbed.addFields({ name: 'Stat Flags', value: statFlags.map((f: any) =>
        `• **${f.flag_type.replace(/_/g, ' ')}** — ${f.details ?? 'Auto-flagged'}\n  <t:${Math.floor(new Date(f.flagged_at).getTime() / 1000)}:D>`
      ).join('\n') });
    }
    if (bhvFlags.length > 0) {
      const BHV_PER_PAGE = 5;
      const slice = bhvFlags.slice(0, BHV_PER_PAGE);
      flagsEmbed.addFields({ name: `Behaviour Flags (${bhvFlags.length} total)`, value: slice.map((f: any) =>
        `• **${f.flag_type}**${f.note ? `\n  Note: ${f.note}` : ''}\n  Added <t:${Math.floor(new Date(f.created_at).getTime() / 1000)}:D> | Expires <t:${Math.floor(new Date(f.expires_at).getTime() / 1000)}:D>`
      ).join('\n') });
    }
  }

  // Buttons on main embed
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`audit_add_flag:${targetUserId}`).setLabel('➕ Add Behaviour Flag').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`audit_clear_flag:${targetUserId}`).setLabel('🗑️ Clear Stat Flag').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`audit_clear_cant:${targetUserId}`).setLabel('✅ Clear Can\'t Do Flag').setStyle(ButtonStyle.Secondary),
  );

  // Update last audit time
  await sql`UPDATE spa_audit_config SET updated_at = NOW() WHERE user_id = ${targetUserId}`;

  return { embeds: [mainEmbed, trendEmbed, flagsEmbed], rows: [row1] };
}

async function getBelowTargetStreak(userId: string, target: number): Promise<number> {
  const logs = await sql`SELECT log_date, submitted FROM spa_daily_logs WHERE user_id = ${userId} ORDER BY log_date DESC LIMIT 14`;
  let streak = 0;
  for (const l of logs) {
    if ((l.submitted || 0) < target) streak++;
    else break;
  }
  return streak;
}

// ─── DAILY REMINDER ───────────────────────────────────────────────────────────
export async function sendDailyReminders(client: Client): Promise<void> {
  const nowHour = new Date().getUTCHours();

  // Get all seniors
  try {
    const guild = (client as any).guilds.cache.first();
    if (!guild) return;
    await guild.members.fetch();
    const seniors = guild.members.cache.filter((m: any) =>
      m.roles.cache.has(config.roles.SPA) && !m.roles.cache.has(config.roles.HPA) && !m.user.bot
    );

    for (const [, member] of seniors) {
      const cfg = await getConfig(member.id);
      if (cfg.reminder_hour !== nowHour) continue;

      // Check if already sent today
      const today = new Date().toISOString().split('T')[0];
      const alreadySent = await sql`SELECT 1 FROM spa_daily_logs WHERE user_id = ${member.id} AND log_date = ${today} AND (done_clicked = true OR cant_do = true)`;
      if (alreadySent.length > 0) continue;

      // Build custom reminder text
      const personText  = cfg.reminder_person  ? `for <@${cfg.reminder_person}>` : null;
      const channelText = cfg.reminder_channel ? `in <#${cfg.reminder_channel}>` : null;
      const contextLine = [personText, channelText].filter(Boolean).join(' ');
      const descLine = contextLine
        ? `Please review posts ${contextLine} and submit your logs for today.`
        : 'Please review posts and submit your logs for today.';

      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('📋 Daily Log Reminder')
        .setDescription(`Hey ${member.displayName}! It's time for your daily post review session.\n\n${descLine}`)
        .addFields({ name: 'Daily Target', value: `${cfg.soft_target} logs` })
        .setTimestamp();

      const doneBtn   = new ButtonBuilder().setCustomId(`audit_done:${member.id}`).setLabel('✅ Done').setStyle(ButtonStyle.Success);
      const cantBtn   = new ButtonBuilder().setCustomId(`audit_cant:${member.id}`).setLabel('❌ Can\'t Do').setStyle(ButtonStyle.Danger);

      await dmUser(client, member.id, { embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(doneBtn, cantBtn)] });
    }
  } catch (e) { console.error('Failed to send daily reminders:', e); }
}

// ─── AUTO-FLAG CHECKS ─────────────────────────────────────────────────────────
export async function runAuditChecks(client: Client): Promise<void> {
  try {
    const guild = (client as any).guilds.cache.first();
    if (!guild) return;
    await guild.members.fetch();
    const seniors = guild.members.cache.filter((m: any) =>
      m.roles.cache.has(config.roles.SPA) && !m.roles.cache.has(config.roles.HPA) && !m.user.bot
    );
    const global = (await sql`SELECT * FROM spa_audit_global WHERE id = 1`)[0];

    for (const [, member] of seniors) {
      const cfg = await getConfig(member.id);
      const accThreshold  = cfg.accuracy_threshold ?? global.accuracy_threshold;
      const belowDays     = cfg.below_target_days  ?? global.below_target_days;
      const improveDays   = cfg.improvement_days   ?? global.improvement_days;

      // Check accuracy over 7 days
      const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      const week = await sql`SELECT * FROM spa_daily_logs WHERE user_id = ${member.id} AND log_date >= ${sevenAgo}`;
      const totalSub = week.reduce((a: number, l: any) => a + (l.submitted || 0), 0);
      const totalApp = week.reduce((a: number, l: any) => a + (l.approved  || 0), 0);
      const accPct = totalSub > 0 ? Math.round((totalApp / totalSub) * 100) : 100;

      if (totalSub >= 5 && accPct < accThreshold) {
        const existing = await sql`SELECT 1 FROM spa_stat_flags WHERE user_id = ${member.id} AND flag_type = 'low_accuracy' AND active = true`;
        if (existing.length === 0) {
          await sql`INSERT INTO spa_stat_flags (user_id, flag_type, details) VALUES (${member.id}, 'low_accuracy', ${`${accPct}% accuracy over 7 days (threshold: ${accThreshold}%)`})`;
          await postAuditAlert(client, member.id, `🚨 **Low Accuracy Auto-Flag** — <@${member.id}> has **${accPct}% accuracy** over the last 7 days (threshold: ${accThreshold}%)`);
        }
      }

      // Check below-target streak
      const streak = await getBelowTargetStreak(member.id, cfg.soft_target);
      if (streak >= belowDays) {
        const existing = await sql`SELECT 1 FROM spa_stat_flags WHERE user_id = ${member.id} AND flag_type = 'below_target' AND active = true`;
        if (existing.length === 0) {
          await sql`INSERT INTO spa_stat_flags (user_id, flag_type, details) VALUES (${member.id}, 'below_target', ${`${streak} consecutive days below target of ${cfg.soft_target}`})`;
          await postAuditAlert(client, member.id, `🚨 **Below Target Auto-Flag** — <@${member.id}> has been below their target of **${cfg.soft_target}** logs for **${streak} consecutive days**`);
        }
      }

      // Auto-clear flags after improvement
      const activeFlags = await sql`SELECT * FROM spa_stat_flags WHERE user_id = ${member.id} AND active = true`;
      for (const flag of activeFlags) {
        const recentDays = await sql`SELECT * FROM spa_daily_logs WHERE user_id = ${member.id} ORDER BY log_date DESC LIMIT ${improveDays}`;
        const allGood = recentDays.length >= improveDays && recentDays.every((l: any) => (l.submitted || 0) >= cfg.soft_target);
        if (allGood) {
          await sql`UPDATE spa_stat_flags SET active = false, cleared_at = NOW(), auto_cleared = true WHERE id = ${flag.id}`;
        }
      }

      // Prompt flag expiry
      const expiringFlags = await sql`
        SELECT * FROM spa_behaviour_flags WHERE user_id = ${member.id}
        AND expires_at <= NOW() + INTERVAL '24 hours' AND expiry_prompted = false
      `;
      for (const f of expiringFlags) {
        await promptFlagExpiry(client, f);
        await sql`UPDATE spa_behaviour_flags SET expiry_prompted = true WHERE id = ${f.id}`;
      }

      // Remove expired flags
      await sql`DELETE FROM spa_behaviour_flags WHERE expires_at <= NOW() AND expiry_prompted = true`;
    }
  } catch (e) { console.error('Audit check error:', e); }
}

async function postAuditAlert(client: Client, userId: string, message: string): Promise<void> {
  try {
    const ch = await client.channels.fetch(AUDIT_CHANNEL) as TextChannel;
    await ch.send({ content: `<@&${config.roles.HPA}> ${message}` });
  } catch (e) { console.error('Failed to post audit alert:', e); }
}

async function promptFlagExpiry(client: Client, flag: any): Promise<void> {
  try {
    const ch = await client.channels.fetch(AUDIT_CHANNEL) as TextChannel;
    const embed = new EmbedBuilder()
      .setColor(Colors.Yellow)
      .setTitle('⏰ Behaviour Flag Expiring')
      .setDescription(`The following flag on <@${flag.user_id}> is expiring in 24 hours:`)
      .addFields(
        { name: 'Flag', value: flag.flag_type, inline: true },
        { name: 'Note', value: flag.note ?? 'No note', inline: true },
      )
      .setTimestamp();

    const keep   = new ButtonBuilder().setCustomId(`flag_keep:${flag.id}`).setLabel('⏳ Extend 30 Days').setStyle(ButtonStyle.Primary);
    const expire = new ButtonBuilder().setCustomId(`flag_expire:${flag.id}`).setLabel('✅ Let It Expire').setStyle(ButtonStyle.Secondary);

    await ch.send({ embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(keep, expire)] });
  } catch (e) { console.error('Failed to prompt flag expiry:', e); }
}
