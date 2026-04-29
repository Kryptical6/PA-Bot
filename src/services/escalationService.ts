import { Client, TextChannel } from 'discord.js';
import { sql } from '../database/client';
import { config } from '../config';
import { safeDM } from './dmService';
import { warningEmbed, infoEmbed } from '../utils/embeds';
import { updateLogTracker } from './logTrackerService';

export async function checkEscalation(client: Client, userId: string): Promise<void> {
  const rateRow = await sql`SELECT rate FROM escalation_config WHERE id = 1`;
  const rate = rateRow[0]?.rate ?? config.escalation.defaultRate;

  const mistakes = await sql`
    SELECT id FROM logs WHERE user_id = ${userId} AND type = 'mistake' AND expires_at > NOW() ORDER BY date ASC
  `;
  const count = mistakes.length;

  // 20% warning
  const warnAt = rate - Math.ceil(rate * 0.2);
  if (count >= warnAt && count < rate) {
    const existing = await sql`SELECT 1 FROM escalation_warnings WHERE user_id = ${userId} AND threshold = ${rate}`;
    if (existing.length === 0) {
      await sql`INSERT INTO escalation_warnings (user_id, threshold) VALUES (${userId}, ${rate}) ON CONFLICT DO NOTHING`;
      const embed = infoEmbed('Escalation Warning', `<@${userId}> is **${rate - count} mistake(s) away** from a strike. (${count}/${rate})`);
      for (const uid of config.reminders.notifyUserIds) {
        try { const u = await client.users.fetch(uid); await u.send({ embeds: [embed] }); } catch { /* silent */ }
      }
    }
  }

  // Escalate
  if (count >= rate) {
    const ids = mistakes.slice(0, rate).map((m: any) => m.id);
    await sql`DELETE FROM logs WHERE id = ANY(${ids})`;
    await sql`DELETE FROM escalation_warnings WHERE user_id = ${userId} AND threshold = ${rate}`;

    const exp = new Date();
    exp.setDate(exp.getDate() + config.expiry.defaultDays);
    await sql`INSERT INTO logs (user_id, type, reason, logged_by, expires_at) VALUES (${userId}, 'strike', 'Automatic escalation', 'system', ${exp.toISOString()})`;

    await safeDM(client, userId, warningEmbed('Strike Issued', 'You have received a strike.'), 'escalation strike');

    // Notify HPA to optionally send an explanation DM
    try {
      const { TextChannel, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
      const ch = await client.channels.fetch(config.channels.hpaReview) as TextChannel;
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle('⚡ Automatic Escalation Strike')
        .setDescription(`<@${userId}> has been automatically issued a strike after reaching the escalation threshold (${rate} mistakes).`)
        .setTimestamp();
      const btn = new ButtonBuilder()
        .setCustomId(`escalation_dm:${userId}`)
        .setLabel('📨 Send Explanation DM')
        .setStyle(ButtonStyle.Primary);
      await ch.send({ embeds: [embed], components: [new ActionRowBuilder<typeof btn>().addComponents(btn)] });
    } catch { /* silent */ }

    await updateLogTracker(client);
  }
}
