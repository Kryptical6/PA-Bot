import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, TextChannel } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { buildFeedbackEmbed, buildFeedbackRow } from '../../services/feedbackService';

export const data = new SlashCommandBuilder()
  .setName('create_feedback')
  .setDescription('Create a new PA feedback round (HPA only)')
  .addStringOption(o => o.setName('title').setDescription('Feedback round title').setRequired(true))
  .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 7d or 14d').setRequired(true))
  .addChannelOption(o => o.setName('channel').setDescription('Channel to post the feedback embed').setRequired(true))
  .addStringOption(o => o.setName('description').setDescription('Optional description shown on the embed'))
  .addStringOption(o => o.setName('custom_category').setDescription('Custom 5th rating category (default: Other)'));

function parseDuration(s: string): number | null {
  const m = s.trim().match(/^(\d+)(h|d)$/i);
  if (!m) return null;
  return parseInt(m[1]) * (m[2].toLowerCase() === 'h' ? 3600000 : 86400000);
}

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const title    = i.options.getString('title', true);
  const duration = i.options.getString('duration', true);
  const channel  = i.options.getChannel('channel', true);
  const desc     = i.options.getString('description') ?? null;
  const custom   = i.options.getString('custom_category') ?? 'Other';

  const ms = parseDuration(duration);
  if (!ms) { await i.editReply({ embeds: [errorEmbed('Invalid duration. Use e.g. `7d` or `14d`.')] }); return; }

  // Check no active round already exists
  const existing = await sql`SELECT 1 FROM feedback_rounds WHERE status = 'active'`;
  if (existing.length > 0) {
    await i.editReply({ embeds: [errorEmbed('There is already an active feedback round. Close it before creating a new one.')] });
    return;
  }

  const closesAt = new Date(Date.now() + ms);
  const [round] = await sql`
    INSERT INTO feedback_rounds (title, description, custom_category, channel_id, closes_at, created_by)
    VALUES (${title}, ${desc}, ${custom}, ${channel.id}, ${closesAt.toISOString()}, ${i.user.id})
    RETURNING *
  `;

  const embed = buildFeedbackEmbed(round);
  const row   = buildFeedbackRow(round.id);

  try {
    const ch = await i.client.channels.fetch(channel.id) as TextChannel;
    const msg = await ch.send({ embeds: [embed], components: [row] });
    await sql`UPDATE feedback_rounds SET message_id = ${msg.id} WHERE id = ${round.id}`;
  } catch (e) {
    console.error('Failed to post feedback embed:', e);
    await i.editReply({ embeds: [errorEmbed('Failed to post in that channel. Check bot permissions.')] });
    return;
  }

  await i.editReply({ embeds: [successEmbed('Feedback Round Created', `**${title}** is now live in <#${channel.id}>.\nCloses <t:${Math.floor(closesAt.getTime() / 1000)}:R>.`)] });
}
