import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType, ButtonBuilder, ButtonStyle } from 'discord.js';
import { isSPA } from '../../utils/permissions';
import { errorEmbed, successEmbed, infoEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder().setName('delete_tag').setDescription('Delete a tag');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const tags = await sql`SELECT id, name FROM tags ORDER BY name ASC`;
  if (tags.length === 0) { await i.editReply({ embeds: [errorEmbed('No tags exist.')] }); return; }

  const select = new StringSelectMenuBuilder().setCustomId('del_tag_sel').setPlaceholder('Select tag to delete')
    .addOptions(tags.slice(0, 25).map((t: any) => new StringSelectMenuOptionBuilder().setLabel(t.name).setValue(String(t.id))));

  const msg = await i.editReply({ content: 'Select a tag:', components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });
  const col = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, filter: s => s.user.id === i.user.id && s.customId === 'del_tag_sel', time: 30_000, max: 1 });

  col.on('collect', async sel => {
    const tagId = parseInt(sel.values[0]);
    const [tag] = await sql`SELECT * FROM tags WHERE id = ${tagId}`;
    if (!tag) { await sel.update({ content: '❌ Not found.', components: [] }); return; }

    const confirm = new ButtonBuilder().setCustomId('del_confirm').setLabel('Delete').setStyle(ButtonStyle.Danger);
    const cancel  = new ButtonBuilder().setCustomId('del_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary);
    await sel.update({ embeds: [infoEmbed('Confirm', `Delete **${tag.name}**?`)], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirm, cancel)] });

    const btn = await msg.awaitMessageComponent({ componentType: ComponentType.Button, filter: b => b.user.id === i.user.id, time: 15_000 }).catch(() => null);
    if (!btn || btn.customId === 'del_cancel') { await i.editReply({ embeds: [infoEmbed('Cancelled', 'Deletion cancelled.')], components: [] }); return; }
    await sql`DELETE FROM tags WHERE id = ${tagId}`;
    await btn.update({ embeds: [successEmbed('Deleted', `**${tag.name}** has been deleted.`)], components: [] });
  });
}
