import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType, EmbedBuilder, Colors } from 'discord.js';
import { sql } from '../../database/client';
import { errorEmbed } from '../../utils/embeds';
import { isPA } from '../../utils/permissions';

export const data = new SlashCommandBuilder().setName('tag').setDescription('View a knowledge base tag');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const tags = await sql`SELECT id, name FROM tags ORDER BY name ASC`;
  if (tags.length === 0) { await i.editReply({ embeds: [errorEmbed('No tags exist yet.')] }); return; }

  const select = new StringSelectMenuBuilder().setCustomId('tag_sel').setPlaceholder('Select a tag')
    .addOptions(tags.slice(0, 25).map((t: any) => new StringSelectMenuOptionBuilder().setLabel(t.name).setValue(String(t.id))));

  const msg = await i.editReply({ content: 'Select a tag:', components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });

  const col = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, filter: s => s.user.id === i.user.id && s.customId === 'tag_sel', time: 30_000, max: 1 });
  col.on('collect', async sel => {
    const [tag] = await sql`SELECT * FROM tags WHERE id = ${parseInt(sel.values[0])}`;
    if (!tag) { await sel.update({ content: '❌ Tag not found.', components: [] }); return; }
    await sel.update({ content: '', embeds: [new EmbedBuilder().setColor(Colors.Blue).setTitle(`🏷️ ${tag.name}`).setDescription(tag.content).setFooter({ text: `Created by <@${tag.created_by}>` }).setTimestamp()], components: [] });
  });
}
