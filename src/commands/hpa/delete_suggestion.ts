import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType, TextChannel } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { config } from '../../config';

export const data = new SlashCommandBuilder()
  .setName('delete_suggestion')
  .setDescription('Remove an approved game suggestion (HPA only)');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const suggestions = await sql`SELECT * FROM game_suggestions WHERE status = 'approved' ORDER BY game_name ASC LIMIT 25`;
  if (suggestions.length === 0) {
    await i.editReply({ embeds: [errorEmbed('No approved suggestions to remove.')] });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('del_suggestion_sel')
    .setPlaceholder('Select suggestion to remove')
    .addOptions(suggestions.map((s: any) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`${s.game_name} (👍 ${s.upvotes})`)
        .setDescription(`Suggested by: ${s.suggested_by}`)
        .setValue(String(s.id))
    ));

  const msg = await i.editReply({ content: 'Select a suggestion to remove:', components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });

  const sel = await msg.awaitMessageComponent({
    componentType: ComponentType.StringSelect,
    filter: s => s.user.id === i.user.id && s.customId === 'del_suggestion_sel',
    time: 30_000,
  }).catch(() => null);

  if (!sel) { await i.editReply({ content: 'Timed out.', components: [] }); return; }
  await sel.deferUpdate();

  const suggId = parseInt(sel.values[0]);
  const [s] = await sql`SELECT * FROM game_suggestions WHERE id = ${suggId}`;

  // Delete the message in suggestions channel if it exists
  if (s.message_id) {
    try {
      const ch = await i.client.channels.fetch(config.channels.gameSuggestions) as TextChannel;
      const msg2 = await ch.messages.fetch(s.message_id);
      await msg2.delete();
    } catch { /* silent */ }
  }

  await sql`DELETE FROM game_suggestions WHERE id = ${suggId}`;
  await i.editReply({ content: '', embeds: [successEmbed('Removed', `**${s.game_name}** has been removed from suggestions.`)], components: [] });
}
