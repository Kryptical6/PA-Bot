import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, TextChannel } from 'discord.js';
import { isSPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

function parseDuration(s: string): number | null {
  const m = s.trim().match(/^(\d+)(h|d)$/i);
  if (!m) return null;
  return parseInt(m[1]) * (m[2].toLowerCase() === 'h' ? 3600000 : 86400000);
}

export const data = new SlashCommandBuilder().setName('create_vote').setDescription('Create a staff vote')
  .addStringOption(o => o.setName('title').setDescription('Vote title').setRequired(true))
  .addRoleOption(o => o.setName('role').setDescription('Role being voted on').setRequired(true))
  .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 24h or 7d').setRequired(true))
  .addStringOption(o => o.setName('anonymity').setDescription('Anonymity setting').setRequired(true)
    .addChoices({ name: 'Anonymous', value: 'anonymous' }, { name: 'Public', value: 'public' }, { name: 'Flexible', value: 'flexible' }))
  .addChannelOption(o => o.setName('channel').setDescription('Channel to post the vote').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;

  const title     = i.options.getString('title', true);
  const role      = i.options.getRole('role', true);
  const duration  = i.options.getString('duration', true);
  const anonymity = i.options.getString('anonymity', true) as 'anonymous' | 'public' | 'flexible';
  const channel   = i.options.getChannel('channel', true);

  const ms = parseDuration(duration);
  if (!ms) { await i.reply({ embeds: [errorEmbed('Invalid duration. Use `24h` or `7d`.')], ephemeral: true }); return; }

  await i.deferReply({ ephemeral: true });
  const deadline = new Date(Date.now() + ms);

  const [vote] = await sql`INSERT INTO votes (title, role_id, deadline, anonymity, channel_id, created_by) VALUES (${title}, ${role.id}, ${deadline.toISOString()}, ${anonymity}, ${channel.id}, ${i.user.id}) RETURNING id`;

  const embed = new EmbedBuilder().setColor(Colors.Gold).setTitle(`🗳️ ${title}`)
    .addFields(
      { name: 'Role',      value: `<@&${role.id}>`, inline: true },
      { name: 'Anonymity', value: anonymity.charAt(0).toUpperCase() + anonymity.slice(1), inline: true },
      { name: 'Ends',      value: `<t:${Math.floor(deadline.getTime() / 1000)}:R>`, inline: true },
      { name: 'Total Votes', value: '0', inline: true },
    )
    .setFooter({ text: `Vote ID: ${vote.id}` }).setTimestamp();

  const btn = new ButtonBuilder().setCustomId(`vote_cast:${vote.id}`).setLabel('Cast Vote').setStyle(ButtonStyle.Primary).setEmoji('🗳️');
  const ch = await i.guild!.channels.fetch(channel.id) as TextChannel;
  const msg = await ch.send({ embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(btn)] });
  await sql`UPDATE votes SET message_id = ${msg.id} WHERE id = ${vote.id}`;
  await i.editReply({ content: `✅ Vote created in <#${channel.id}>! Ends <t:${Math.floor(deadline.getTime() / 1000)}:R>.` });
}
