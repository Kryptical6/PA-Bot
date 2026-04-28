import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors } from 'discord.js';
import { sql } from '../../database/client';
import { errorEmbed } from '../../utils/embeds';
import { isPA } from '../../utils/permissions';

export const data = new SlashCommandBuilder().setName('tag_search').setDescription('Search tags by keyword')
  .addStringOption(o => o.setName('keyword').setDescription('Keyword to search').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const kw = i.options.getString('keyword', true).trim();
  const tags = await sql`SELECT * FROM tags WHERE name ILIKE ${'%' + kw + '%'} OR content ILIKE ${'%' + kw + '%'} ORDER BY name ASC LIMIT 10`;
  if (tags.length === 0) { await i.editReply({ embeds: [errorEmbed(`No tags found for "${kw}".`)] }); return; }

  await i.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Blue).setTitle(`🔍 Tag Search - "${kw}"`)
    .setDescription(tags.map((t: any) => `**${t.name}**\n${t.content}`).join('\n\n'))
    .setFooter({ text: `${tags.length} result(s)` }).setTimestamp()] });
}
