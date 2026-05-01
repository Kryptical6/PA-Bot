import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder()
  .setName('clear_spa_flag')
  .setDescription('Manually clear a stat flag on a senior (HPA only)')
  .addUserOption(o => o.setName('senior').setDescription('Senior to clear flags for').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const user  = i.options.getUser('senior', true);
  const flags = await sql`SELECT * FROM spa_stat_flags WHERE user_id = ${user.id} AND active = true`;

  if (flags.length === 0) {
    await i.editReply({ embeds: [errorEmbed(`No active stat flags for <@${user.id}>.`)] });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('clear_flag_sel')
    .setPlaceholder('Select flag to clear')
    .addOptions([
      new StringSelectMenuOptionBuilder().setLabel('Clear ALL flags').setValue('all'),
      ...flags.map((f: any) => new StringSelectMenuOptionBuilder()
        .setLabel(`${f.flag_type.replace(/_/g, ' ')} — ${f.details?.slice(0, 50) ?? 'Auto-flagged'}`)
        .setValue(String(f.id))
      )
    ]);

  const msg = await i.editReply({ content: `Select flag to clear for <@${user.id}>:`, components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });
  const sel = await msg.awaitMessageComponent({ componentType: ComponentType.StringSelect, filter: s => s.user.id === i.user.id, time: 30_000 }).catch(() => null);
  if (!sel) { await i.editReply({ content: 'Timed out.', components: [] }); return; }
  await sel.deferUpdate();

  if (sel.values[0] === 'all') {
    await sql`UPDATE spa_stat_flags SET active = false, cleared_at = NOW(), cleared_by = ${i.user.id} WHERE user_id = ${user.id} AND active = true`;
    await i.editReply({ content: '', embeds: [successEmbed('Cleared', `All stat flags cleared for <@${user.id}>.`)], components: [] });
  } else {
    const flagId = parseInt(sel.values[0]);
    await sql`UPDATE spa_stat_flags SET active = false, cleared_at = NOW(), cleared_by = ${i.user.id} WHERE id = ${flagId}`;
    await i.editReply({ content: '', embeds: [successEmbed('Cleared', `Flag cleared for <@${user.id}>.`)], components: [] });
  }
}
