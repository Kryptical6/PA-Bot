import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType } from 'discord.js';
import { isSPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder()
  .setName('edit_tag')
  .setDescription('Edit an existing tag (SPA+)');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const tags = await sql`SELECT id, name, category FROM tags ORDER BY category ASC, name ASC`;
  if (tags.length === 0) { await i.editReply({ embeds: [errorEmbed('No tags exist.')] }); return; }

  const select = new StringSelectMenuBuilder()
    .setCustomId('edit_tag_sel')
    .setPlaceholder('Select tag to edit')
    .addOptions(tags.slice(0, 25).map((t: any) =>
      new StringSelectMenuOptionBuilder().setLabel(`[${t.category}] ${t.name}`).setValue(String(t.id))
    ));

  const msg = await i.editReply({ content: 'Select a tag to edit:', components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });

  const sel = await msg.awaitMessageComponent({ componentType: ComponentType.StringSelect, filter: s => s.user.id === i.user.id && s.customId === 'edit_tag_sel', time: 30_000 }).catch(() => null);
  if (!sel) { await i.editReply({ content: 'Timed out.', components: [] }); return; }

  const tagId = parseInt(sel.values[0]);
  const [tag] = await sql`SELECT * FROM tags WHERE id = ${tagId}`;
  if (!tag) { await sel.update({ content: 'Tag not found.', components: [] }); return; }

  await sel.showModal({
    customId: `edit_tag_modal:${tagId}`,
    title: `Edit — ${tag.name}`,
    components: [
      { type: 1, components: [{ type: 4, customId: 'tag_content', label: 'Content', style: 2, required: true, value: tag.content, maxLength: 1000 }] },
      { type: 1, components: [{ type: 4, customId: 'category', label: 'Category (Rules/Guides/Resources/Other)', style: 1, required: true, value: tag.category, maxLength: 20 }] },
    ]
  });

  // Modal handled globally
  await i.editReply({ content: 'Fill in the modal to update the tag.', components: [] });
}
