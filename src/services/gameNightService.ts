import { Client, EmbedBuilder, Colors, TextChannel, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { sql } from '../database/client';
import { config } from '../config';
import { dmUser } from './dmService';
import { warningEmbed } from '../utils/embeds';

// ─── SCHEDULE EMBED ───────────────────────────────────────────────────────────
let scheduleMessageId: string | null = null;

export async function updateScheduleEmbed(client: Client): Promise<void> {
  try {
    const ch = await client.channels.fetch(config.channels.gameNightSchedule) as TextChannel;
    if (!ch) return;

    const nights = await sql`
      SELECT * FROM game_nights WHERE status = 'upcoming' ORDER BY scheduled_at ASC LIMIT 10
    `;

    const embed = new EmbedBuilder()
      .setColor(Colors.Purple)
      .setTitle('🎮 Game Night Schedule')
      .setTimestamp()
      .setFooter({ text: `${nights.length} upcoming event${nights.length !== 1 ? 's' : ''}` });

    if (nights.length === 0) {
      embed.setDescription('No upcoming game nights scheduled.\nCheck back soon!');
    } else {
      const sections = nights.map((n: any, idx: number) => {
        const games = Array.isArray(n.games) ? n.games.map((g: string) => `• ${g}`).join('\n') : `• ${n.games}`;
        const ts = Math.floor(new Date(n.scheduled_at).getTime() / 1000);
        const lines = [
          `### ${idx + 1}. ${n.title}`,
          `📅 <t:${ts}:F>  ·  <t:${ts}:R>`,
          `🎮 Games:\n${games}`,
          `🎙️ Host: <@${n.host}>`,
        ];
        if (n.description) lines.push(`📝 ${n.description}`);
        return lines.join('\n');
      });
      embed.setDescription(sections.join('\n\n─────────────────────\n\n'));
    }

    // Try edit existing
    if (scheduleMessageId) {
      try {
        const msg = await ch.messages.fetch(scheduleMessageId);
        await msg.edit({ embeds: [embed] });
        return;
      } catch { scheduleMessageId = null; }
    }

    // Search for existing
    const recent = await ch.messages.fetch({ limit: 20 });
    const ours = recent.find(m => m.author.id === client.user?.id && m.embeds[0]?.title === '🎮 Game Night Schedule');
    if (ours) {
      scheduleMessageId = ours.id;
      await ours.edit({ embeds: [embed] });
    } else {
      const msg = await ch.send({ embeds: [embed] });
      scheduleMessageId = msg.id;
    }
  } catch (e) { console.error('Failed to update schedule embed:', e); }
}

// ─── RSVP EMBED ───────────────────────────────────────────────────────────────
export async function buildGameNightEmbed(nightId: number): Promise<{ embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> }> {
  const nights = await sql`SELECT * FROM game_nights WHERE id = ${nightId}`;
  const n = nights[0];
  const rsvps = await sql`SELECT * FROM game_night_rsvps WHERE game_night_id = ${nightId}`;
  const attending = rsvps.filter((r: any) => r.attending).length;
  const notAttending = rsvps.filter((r: any) => !r.attending).length;
  const games = Array.isArray(n.games) ? n.games.join('\n• ') : n.games;

  const embed = new EmbedBuilder()
    .setColor(Colors.Purple)
    .setTitle(`🎮 ${n.title}`)
    .addFields(
      { name: '📅 When',     value: `<t:${Math.floor(new Date(n.scheduled_at).getTime() / 1000)}:F>`, inline: true },
      { name: '🎙️ Host',     value: `<@${n.host}>`, inline: true },
      { name: '🎮 Games',    value: `• ${games}` },
      { name: '✅ Attending', value: `${attending}`, inline: true },
      { name: '❌ Not Attending', value: `${notAttending}`, inline: true },
    )
    .setTimestamp();

  if (n.description) embed.setDescription(n.description);

  const yesBtn = new ButtonBuilder().setCustomId(`gn_rsvp:${nightId}:yes`).setLabel('✅ Attending').setStyle(ButtonStyle.Success);
  const noBtn  = new ButtonBuilder().setCustomId(`gn_rsvp:${nightId}:no`).setLabel('❌ Not Attending').setStyle(ButtonStyle.Danger);
  const listBtn = new ButtonBuilder().setCustomId(`gn_list:${nightId}`).setLabel('👥 View Attendees').setStyle(ButtonStyle.Secondary);

  return { embed, row: new ActionRowBuilder<ButtonBuilder>().addComponents(yesBtn, noBtn, listBtn) };
}

// ─── REMINDERS ────────────────────────────────────────────────────────────────
export async function sendGameNightReminders(client: Client): Promise<void> {
  const now = new Date();

  // 60 min reminders
  const in60 = new Date(now.getTime() + 61 * 60 * 1000);
  const nights60 = await sql`
    SELECT * FROM game_nights
    WHERE status = 'upcoming' AND reminder_60_sent = false
    AND scheduled_at <= ${in60.toISOString()} AND scheduled_at > ${now.toISOString()}
  `;

  for (const n of nights60) {
    await sendReminders(client, n, 60);
    await sql`UPDATE game_nights SET reminder_60_sent = true WHERE id = ${n.id}`;
  }

  // 10 min reminders
  const in10 = new Date(now.getTime() + 11 * 60 * 1000);
  const nights10 = await sql`
    SELECT * FROM game_nights
    WHERE status = 'upcoming' AND reminder_10_sent = false
    AND scheduled_at <= ${in10.toISOString()} AND scheduled_at > ${now.toISOString()}
  `;

  for (const n of nights10) {
    await sendReminders(client, n, 10);
    await sql`UPDATE game_nights SET reminder_10_sent = true WHERE id = ${n.id}`;
  }

  // Mark past events as completed and send feedback requests
  const nowCompleted = await sql`
    UPDATE game_nights SET status = 'completed'
    WHERE status = 'upcoming' AND scheduled_at < ${now.toISOString()}
    RETURNING *
  `;
  for (const n of nowCompleted) {
    await sendFeedbackRequests(client, n);
  }

  // Process feedback deadlines
  const feedbackDeadlineNights = await sql`
    SELECT * FROM game_nights WHERE status = 'completed' AND feedback_sent = true
    AND feedback_deadline IS NOT NULL AND feedback_deadline <= NOW()
    AND id NOT IN (SELECT DISTINCT game_night_id FROM game_night_feedback WHERE game_night_id = game_nights.id)
  `.catch(() => []);
  for (const n of feedbackDeadlineNights) {
    await postFeedbackSummary(client, n.id);
  }
}

async function sendReminders(client: Client, night: any, minutesBefore: number): Promise<void> {
  const rsvps = await sql`SELECT user_id FROM game_night_rsvps WHERE game_night_id = ${night.id} AND attending = true`;
  const games = Array.isArray(night.games) ? night.games.join(', ') : night.games;

  const embed = new EmbedBuilder()
    .setColor(Colors.Purple)
    .setTitle('🎮 Game Night Reminder')
    .setDescription(
      `**${night.title}** starts in **${minutesBefore} minute${minutesBefore > 1 ? 's' : ''}**!\n\n` +
      `🎮 **Games:** ${games}\n` +
      `📅 **When:** <t:${Math.floor(new Date(night.scheduled_at).getTime() / 1000)}:F>`
    )
    .setTimestamp();

  for (const r of rsvps) {
    await dmUser(client, r.user_id, { embeds: [embed] });
  }
}

// ─── POST-EVENT FEEDBACK ──────────────────────────────────────────────────────
export async function sendFeedbackRequests(client: Client, night: any): Promise<void> {
  const deadline = new Date(Date.now() + 48 * 3600000);
  await sql`UPDATE game_nights SET feedback_sent = true, feedback_deadline = ${deadline.toISOString()} WHERE id = ${night.id}`;

  const rsvps = await sql`SELECT user_id FROM game_night_rsvps WHERE game_night_id = ${night.id} AND attending = true`;
  const embed = new EmbedBuilder()
    .setColor(Colors.Purple)
    .setTitle(`How was ${night.title}?`)
    .setDescription('We hope you had a great time! Please rate the game night.')
    .setTimestamp();

  const rateBtn = new ButtonBuilder()
    .setCustomId(`gn_rate:${night.id}`)
    .setLabel('Rate this Game Night')
    .setStyle(ButtonStyle.Primary);

  for (const r of rsvps) {
    await dmUser(client, r.user_id, { embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(rateBtn)] });
  }
}

export async function postFeedbackSummary(client: Client, nightId: number): Promise<void> {
  const nights   = await sql`SELECT * FROM game_nights WHERE id = ${nightId}`;
  const feedback = await sql`SELECT * FROM game_night_feedback WHERE game_night_id = ${nightId}`;
  if (feedback.length === 0) return;

  const avg = (feedback.reduce((a: number, f: any) => a + f.rating, 0) / feedback.length).toFixed(1);
  const stars = (r: number) => '★'.repeat(r) + '☆'.repeat(5 - r);

  const embed = new EmbedBuilder()
    .setColor(Colors.Purple)
    .setTitle(`Feedback — ${nights[0]?.title ?? 'Game Night'}`)
    .addFields(
      { name: 'Responses', value: String(feedback.length), inline: true },
      { name: 'Average Rating', value: `${avg}/5`, inline: true },
    )
    .setTimestamp();

  const comments = feedback.filter((f: any) => f.comment).map((f: any) => `${stars(f.rating)} — ${f.comment.slice(0, 200)}`);
  if (comments.length > 0) embed.addFields({ name: 'Comments', value: comments.slice(0, 5).join('\n') });

  try {
    const ch = await client.channels.fetch(config.channels.appeals) as TextChannel;
    await ch.send({ embeds: [embed] });
  } catch (e) { console.error('Failed to post feedback summary:', e); }
}
