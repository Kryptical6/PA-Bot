import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType, TextChannel, ButtonBuilder, ButtonStyle } from 'discord.js';
import { sql } from '../../database/client';
import { appealEmbed, errorEmbed, successEmbed } from '../../utils/embeds';
import { config } from '../../config';
import { isPA } from '../../utils/permissions';

export const data = new SlashCommandBuilder().setName('appeal').setDescription('Appeal one of your active mistakes');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const userId = i.user.id;
  const pending = await sql`SELECT 1 FROM appeals WHERE user_id = ${userId} AND status = 'pending'`;
  if (pending.length > 0) { await i.editReply({ embeds: [errorEmbed('You already have a pending appeal. Please wait.')] }); return; }

  const mistakes = await sql`SELECT * FROM logs WHERE user_id = ${userId} AND type = 'mistake' AND expires_at > NOW() ORDER BY date DESC`;
  if (mistakes.length === 0) { await i.editReply({ embeds: [errorEmbed('You have no active mistakes to appeal.')] }); return; }

  const appealed = await sql`SELECT log_id FROM appeals WHERE user_id = ${userId} AND status != 'denied'`;
  const appealedSet = new Set(appealed.map((a: any) => a.log_id));
  const available = (mistakes as any[]).filter(m => !appealedSet.has(m.id));
  if (available.length === 0) { await i.editReply({ embeds: [errorEmbed('All your mistakes already have appeals.')] }); return; }

  const select = new StringSelectMenuBuilder().setCustomId('appeal_select').setPlaceholder('Select a mistake to appeal')
    .addOptions(available.slice(0, 25).map((m: any) => new StringSelectMenuOptionBuilder()
      .setLabel(`${(m.post_id ?? m.reason).slice(0, 50)}`).setValue(String(m.id))));

  const msg = await i.editReply({ content: 'Select the mistake to appeal:', components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });

  const col = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, filter: s => s.user.id === userId && s.customId === 'appeal_select', time: 60_000, max: 1 });
  col.on('collect', async sel => {
    const logId = parseInt(sel.values[0]);
    const log = available.find((m: any) => m.id === logId);

    await sel.showModal({
      customId: `appeal_modal:${logId}`,
      title: 'Appeal Reason',
      components: [{ type: 1, components: [{ type: 4, customId: 'reason', label: 'Why are you appealing?', style: 2, required: true, minLength: 10, maxLength: 1000 }] }]
    });

    const modal = await sel.awaitModalSubmit({ time: 300_000, filter: m => m.customId === `appeal_modal:${logId}` }).catch(() => null);
    if (!modal) return;

    await modal.deferUpdate();
    const reason = modal.fields.getTextInputValue('reason').trim();
    const [result] = await sql`INSERT INTO appeals (user_id, log_id, reason) VALUES (${userId}, ${logId}, ${reason}) RETURNING id`;

    const embed = appealEmbed({ userId, logId, reason, logType: log.type, logReason: log.reason, appealId: result.id });
    const approve = new ButtonBuilder().setCustomId(`appeal_approve:${result.id}`).setLabel('✅ Approve').setStyle(ButtonStyle.Success);
    const deny = new ButtonBuilder().setCustomId(`appeal_deny:${result.id}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger);

    const ch = await i.client.channels.fetch(config.channels.appeals) as TextChannel;
    await ch.send({ embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(approve, deny)] });
    await i.editReply({ content: '', embeds: [successEmbed('Appeal Submitted', 'Your appeal has been sent to HPA.')], components: [] });
  });
}
