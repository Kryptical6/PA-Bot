import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType, EmbedBuilder, Colors } from 'discord.js';
import { isPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder()
  .setName('tag')
  .setDescription('View a knowledge base tag')
  .addStringOption(o => o.setName('category').setDescription('Filter by category')
    .addChoices(
      { name: 'All',       value: 'all' },
      { name: 'Rules',     value: 'Rules' },
      { name: 'Guides',    value: 'Guides' },
      { name: 'Resources', value: 'Resources' },
      { name: 'Other',     value: 'Other' },
    ));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const category = i.options.getString('category') ?? 'all';
  const tags = category === 'all'
    ? await sql`SELECT id, name, category FROM tags ORDER BY category ASC, name ASC`
    : await sql`SELECT id, name, category FROM tags WHERE category = ${category} ORDER BY name ASC`;

  if (tags.length === 0) { await i.editReply({ embeds: [errorEmbed('No tags found.')] }); return; }

  const select = new StringSelectMenuBuilder()
    .setCustomId('tag_view_sel')
    .setPlaceholder('Select a tag')
    .addOptions(tags.slice(0, 25).map((t: any) =>
      new StringSelectMenuOptionBuilder().setLabel(`[${t.category}] ${t.name}`).setValue(String(t.id))
    ));

  const msg = await i.editReply({ content: 'Select a tag to view:', components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });

  const sel = await msg.awaitMessageComponent({ componentType: ComponentType.StringSelect, filter: s => s.user.id === i.user.id && s.customId === 'tag_view_sel', time: 30_000 }).catch(() => null);
  if (!sel) { await i.editReply({ content: 'Timed out.', components: [] }); return; }

  await sel.deferUpdate();
  const tagId = parseInt(sel.values[0]);
  const [tag] = await sql`SELECT * FROM tags WHERE id = ${tagId}`;
  if (!tag) { await i.editReply({ embeds: [errorEmbed('Tag not found.')], components: [] }); return; }

  await sql`UPDATE tags SET view_count = view_count + 1 WHERE id = ${tagId}`;

  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle(tag.name)
    .setDescription(tag.content)
    .addFields({ name: 'Category', value: tag.category, inline: true })
    .setFooter({ text: `Last updated: ${new Date(tag.updated_at).toLocaleDateString('en-GB')} · Views: ${tag.view_count + 1}` })
    .setTimestamp();

  await i.editReply({ content: '', embeds: [embed], components: [] });
}
