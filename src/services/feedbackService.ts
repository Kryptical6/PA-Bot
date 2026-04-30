import { Client, EmbedBuilder, Colors, TextChannel, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { sql } from '../database/client';
import { config } from '../config';
import { dmUser } from './dmService';

export function buildFeedbackEmbed(round: any, closed = false): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(closed ? Colors.Grey : Colors.Blue)
    .setTitle(`📋 ${round.title}`)
    .setTimestamp();

  if (round.description) embed.setDescription(round.description);

  embed.addFields(
    { name: '📅 Closes', value: closed ? '🔒 Closed' : `<t:${Math.floor(new Date(round.closes_at).getTime() / 1000)}:R>`, inline: true },
    { name: 'Status', value: closed ? '🔒 Closed' : '✅ Open', inline: true },
  );

  if (!closed) embed.setFooter({ text: 'Click the button below to submit your feedback' });
  return embed;
}

export function buildFeedbackRow(roundId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`fb_start:${roundId}`).setLabel('📝 Give Feedback').setStyle(ButtonStyle.Primary),
  );
}

export function buildResponseEmbed(round: any, pending: any): EmbedBuilder {
  const stars = (n: number) => '⭐'.repeat(n) + '☆'.repeat(5 - n);
  return new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle(`📋 Your Feedback Preview — ${round.title}`)
    .setDescription('Please review your feedback before submitting. Once confirmed it cannot be changed.')
    .addFields(
      { name: '💬 General Thoughts', value: pending.general_thoughts },
      { name: '🏢 Department Feedback', value: pending.department_feedback },
      { name: '💡 Improvement Suggestions', value: pending.improvement_suggestions },
      { name: '⭐ Ratings', value: [
        `Department Overall: ${stars(pending.rating_department)} (${pending.rating_department}/5)`,
        `Resources: ${stars(pending.rating_resources)} (${pending.rating_resources}/5)`,
        `Leadership: ${stars(pending.rating_leadership)} (${pending.rating_leadership}/5)`,
        `Communication: ${stars(pending.rating_communication)} (${pending.rating_communication}/5)`,
        `${round.custom_category}: ${stars(pending.rating_custom)} (${pending.rating_custom}/5)`,
      ].join('\n') },
    )
    .setTimestamp();
}

export function buildSubmittedEmbed(round: any, response: any, userId: string): EmbedBuilder {
  const stars = (n: number) => '⭐'.repeat(n) + '☆'.repeat(5 - n);
  return new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle(`📋 Feedback Response — ${round.title}`)
    .setDescription(`Submitted by <@${userId}>`)
    .addFields(
      { name: '💬 General Thoughts', value: response.general_thoughts },
      { name: '🏢 Department Feedback', value: response.department_feedback },
      { name: '💡 Improvement Suggestions', value: response.improvement_suggestions },
      { name: '⭐ Ratings', value: [
        `Department Overall: ${stars(response.rating_department)} (${response.rating_department}/5)`,
        `Resources: ${stars(response.rating_resources)} (${response.rating_resources}/5)`,
        `Leadership: ${stars(response.rating_leadership)} (${response.rating_leadership}/5)`,
        `Communication: ${stars(response.rating_communication)} (${response.rating_communication}/5)`,
        `${round.custom_category}: ${stars(response.rating_custom)} (${response.rating_custom}/5)`,
      ].join('\n') },
    )
    .setFooter({ text: `Round ID: ${round.id}` })
    .setTimestamp();
}

export async function closeFeedbackRound(client: Client, roundId: number): Promise<void> {
  const rounds = await sql`SELECT * FROM feedback_rounds WHERE id = ${roundId}`;
  if (rounds.length === 0) return;
  const round = rounds[0];

  await sql`UPDATE feedback_rounds SET status = 'closed' WHERE id = ${roundId}`;

  // Update the public embed
  try {
    const ch = await client.channels.fetch(round.channel_id) as TextChannel;
    if (round.message_id) {
      const msg = await ch.messages.fetch(round.message_id);
      await msg.edit({ embeds: [buildFeedbackEmbed(round, true)], components: [] });
    }
  } catch { /* silent */ }

  // Post summary to responses channel
  const responses = await sql`SELECT * FROM feedback_responses WHERE round_id = ${roundId}`;
  const summary = new EmbedBuilder()
    .setColor(Colors.Grey)
    .setTitle(`🔒 Feedback Round Closed — ${round.title}`)
    .setDescription(`**${responses.length}** response(s) received.\nRound ran from <t:${Math.floor(new Date(round.created_at).getTime() / 1000)}:D> to <t:${Math.floor(new Date().getTime() / 1000)}:D>`)
    .setTimestamp();

  try {
    const ch = await client.channels.fetch(config.channels.feedbackResponses) as TextChannel;
    await ch.send({ embeds: [summary] });
  } catch { /* silent */ }
}

export async function checkFeedbackReminders(client: Client): Promise<void> {
  const now = new Date();
  const in24 = new Date(now.getTime() + 25 * 60 * 60 * 1000); // slightly over 24h to avoid missing edge
  const cutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const rounds = await sql`
    SELECT * FROM feedback_rounds
    WHERE status = 'active' AND closes_at <= ${in24.toISOString()} AND closes_at > ${now.toISOString()}
  `;

  for (const round of rounds) {
    // Get PA members who haven't responded
    const responded = await sql`SELECT user_id FROM feedback_responses WHERE round_id = ${round.id}`;
    const respondedIds = new Set(responded.map((r: any) => r.user_id));

    // We don't have a PA list here, so send to notifyUserIds as a heads up instead
    const embed = new EmbedBuilder()
      .setColor(Colors.Yellow)
      .setTitle('⏰ Feedback Round Closing Soon')
      .setDescription(`**${round.title}** closes <t:${Math.floor(new Date(round.closes_at).getTime() / 1000)}:R>. Make sure all PAs have submitted their feedback!`)
      .setTimestamp();

    for (const uid of config.reminders.notifyUserIds) {
      await dmUser(client, uid, { embeds: [embed] });
    }

    // Also try to DM PAs in the guild
    try {
      const guild = (client as any).guilds.cache.first();
      if (guild) {
        await guild.members.fetch();
        const paMembers = guild.members.cache.filter((m: any) =>
          (m.roles.cache.has(config.roles.PA) || m.roles.cache.has(config.roles.SPA)) &&
          !m.user.bot && !respondedIds.has(m.id)
        );
        for (const [, member] of paMembers) {
          await dmUser(client, member.id, {
            embeds: [new EmbedBuilder()
              .setColor(Colors.Yellow)
              .setTitle('⏰ Feedback Reminder')
              .setDescription(`The **${round.title}** feedback round closes <t:${Math.floor(new Date(round.closes_at).getTime() / 1000)}:R>.\n\nYou haven't submitted your feedback yet! Head to the feedback channel to share your thoughts.`)
              .setTimestamp()
            ]
          });
        }
      }
    } catch { /* silent */ }

    await sql`UPDATE feedback_rounds SET status = 'reminder_sent' WHERE id = ${round.id}`;
  }

  // Auto-close overdue rounds
  const overdue = await sql`SELECT * FROM feedback_rounds WHERE status IN ('active', 'reminder_sent') AND closes_at <= ${now.toISOString()}`;
  for (const round of overdue) {
    await closeFeedbackRound(client, round.id);
  }
}
