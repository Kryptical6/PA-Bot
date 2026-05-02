import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType } from 'discord.js';
import { sql } from '../../database/client';
import { errorEmbed } from '../../utils/embeds';
import { isPA } from '../../utils/permissions';

export const data = new SlashCommandBuilder().setName('appeal').setDescription('Appeal one of your active mistakes');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const userId  = i.user.id;
  const pending = await sql`SELECT 1 FROM appeals WHERE user_id = ${userId} AND status = 'pending'`;
  if (pending.length > 0) { await i.editReply({ embeds: [errorEmbed('You already have a pending appeal.')] }); return; }

  const mistakes = await sql`SELECT * FROM logs WHERE user_id = ${userId} AND type = 'mistake' AND expires_at > NOW() ORDER BY date DESC`;
  if (mistakes.length === 0) { await i.editReply({ embeds: [errorEmbed('You have no active mistakes to appeal.')] }); return; }

  const appealed    = await sql`SELECT log_id FROM appeals WHERE user_id = ${userId} AND status != 'denied'`;
  const appealedSet = new Set(appealed.map((a: any) => a.log_id));
  const available   = (mistakes as any[]).filter(m => !appealedSet.has(m.id));
  if (available.length === 0) { await i.editReply({ embeds: [errorEmbed('All your mistakes already have appeals.')] }); return; }

  const select = new StringSelectMenuBuilder()
    .setCustomId('appeal_select')
    .setPlaceholder('Select a mistake to appeal')
    .addOptions(available.slice(0, 25).map((m: any) =>
      new StringSelectMenuOptionBuilder()
        .setLabel((m.post_id ?? m.reason).slice(0, 50))
        .setDescription(m.reason.slice(0, 100))
        .setValue(String(m.id))
    ));

  const msg = await i.editReply({ content: 'Select the mistake to appeal:', components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });

  const sel = await msg.awaitMessageComponent({ componentType: ComponentType.StringSelect, filter: s => s.user.id === userId && s.customId === 'appeal_select', time: 60_000 }).catch(() => null);
  if (!sel) { await i.editReply({ content: 'Timed out.', components: [] }); return; }

  const logId = parseInt(sel.values[0]);

  await sel.showModal({
    customId: `appeal_modal:${logId}`,
    title: 'Appeal Reason',
    components: [{ type: 1, components: [{ type: 4, customId: 'reason', label: 'Why are you appealing?', style: 2, required: true, minLength: 10, maxLength: 1000 }] }]
  });

  // Modal processed by global handleModal
  await i.editReply({ content: 'Fill in the modal to submit your appeal.', components: [] });
}
