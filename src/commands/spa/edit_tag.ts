import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType } from 'discord.js';
import { isSPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder().setName('edit_tag').setDescription('Edit an existing tag');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const tags = await sql`SELECT id, name, content FROM tags ORDER BY name ASC`;
  if (tags.length === 0) { await i.editReply({ embeds: [errorEmbed('No tags exist.')] }); return; }

  const select = new StringSelectMenuBuilder().setCustomId('edit_tag_sel').setPlaceholder('Select tag to edit')
    .addOptions(tags.slice(0, 25).map((t: any) => new StringSelectMenuOptionBuilder().setLabel(t.name).setValue(String(t.id))));

  const msg = await i.editReply({ content: 'Select a tag:', components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });
  const col = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, filter: s => s.user.id === i.user.id && s.customId === 'edit_tag_sel', time: 30_000, max: 1 });

  col.on('collect', async sel => {
    const tagId = parseInt(sel.values[0]);
    const [tag] = await sql`SELECT * FROM tags WHERE id = ${tagId}`;
    if (!tag) { await sel.update({ content: '❌ Tag not found.', components: [] }); return; }

    await sel.showModal({
      customId: `edit_tag_modal:${tagId}`,
      title: `Edit - ${tag.name}`,
      components: [{ type: 1, components: [{ type: 4, customId: 'tag_content', label: 'Content', style: 2, required: true, value: tag.content }] }]
    });

    const modal = await sel.awaitModalSubmit({ time: 300_000, filter: m => m.customId === `edit_tag_modal:${tagId}` }).catch(() => null);
    if (!modal) return;
    await modal.deferUpdate();

    const content = modal.fields.getTextInputValue('tag_content').trim();
    await sql`UPDATE tags SET content = ${content}, updated_by = ${i.user.id}, updated_at = NOW() WHERE id = ${tagId}`;
    await i.editReply({ content: '', embeds: [successEmbed('Tag Updated', `**${tag.name}** has been updated.`)], components: [] });
  });
}
