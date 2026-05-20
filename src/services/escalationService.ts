import { Client, TextChannel, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { sql } from '../database/client';
import { config } from '../config';
import { safeDM } from './dmService';
import { warningEmbed, infoEmbed } from '../utils/embeds';
import { updateLogTracker } from './logTrackerService';
import { syncStrikeRole } from './strikeRoleService';

export async function checkEscalation(client: Client, userId: string): Promise<void> {
  const rateRow = await sql`SELECT rate FROM escalation_config WHERE id = 1`;
  const rate = rateRow[0]?.rate ?? config.escalation.defaultRate;

  // Only count moderate and severe mistakes — minor mistakes do not contribute to escalation
  const mistakes = await sql`
    SELECT id FROM logs
    WHERE user_id = ${userId}
    AND type = 'mistake'
    AND expires_at > NOW()
    AND (severity = 'moderate' OR severity = 'severe')
    ORDER BY date ASC
  `;
  const count = mistakes.length;

  // Escalation threshold for moderate/severe is fixed at 15
  const escalationRate = 15;

  // 20% warning (at 12)
  const warnAt = escalationRate - Math.ceil(escalationRate * 0.2);
  if (count >= warnAt && count < escalationRate) {
    const existing = await sql`SELECT 1 FROM escalation_warnings WHERE user_id = ${userId} AND threshold = ${escalationRate}`;
    if (existing.length === 0) {
      await sql`INSERT INTO escalation_warnings (user_id, threshold) VALUES (${userId}, ${escalationRate}) ON CONFLICT DO NOTHING`;
      const embed = infoEmbed('Escalation Warning', `<@${userId}> is **${escalationRate - count} moderate/severe mistake(s) away** from a strike. (${count}/${escalationRate})`);
      for (const uid of config.reminders.notifyUserIds) {
        try { const u = await client.users.fetch(uid); await u.send({ embeds: [embed] }); } catch { /* silent */ }
      }
    }
  }

  // Escalate at 15 moderate/severe mistakes
  if (count >= escalationRate) {
    const ids = mistakes.slice(0, escalationRate).map((m: any) => m.id);
    await sql`DELETE FROM logs WHERE id = ANY(${ids})`;
    await sql`DELETE FROM escalation_warnings WHERE user_id = ${userId} AND threshold = ${escalationRate}`;

    const exp = new Date();
    exp.setDate(exp.getDate() + config.expiry.defaultDays);
    await sql`INSERT INTO logs (user_id, type, reason, logged_by, expires_at) VALUES (${userId}, 'strike', 'Automatic escalation (15 moderate/severe mistakes)', 'system', ${exp.toISOString()})`;

    await safeDM(client, userId, warningEmbed('Strike Issued', 'You have received a strike due to accumulating 15 or more moderate/severe mistakes.'), 'escalation strike');

    // Silently sync strike role
    try {
      const guild = (client as any).guilds?.cache?.first();
      if (guild) await syncStrikeRole(client, userId, guild.id);
    } catch { /* silent */ }

    // Notify HPA
    try {
      const ch = await client.channels.fetch(config.channels.hpaReview) as TextChannel;
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle('Automatic Escalation Strike')
        .setDescription(`<@${userId}> has been automatically issued a strike after reaching 15 moderate/severe mistakes.`)
        .setTimestamp();
      const btn = new ButtonBuilder()
        .setCustomId(`escalation_dm:${userId}`)
        .setLabel('Send Explanation DM')
        .setStyle(ButtonStyle.Primary);
      await ch.send({ embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(btn)] });
    } catch { /* silent */ }

    await updateLogTracker(client);
  }
}
