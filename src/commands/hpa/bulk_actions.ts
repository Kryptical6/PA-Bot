import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { successEmbed, infoEmbed } from '../../utils/embeds';
import { deleteExpiredLogs } from '../../services/expiryService';
import { checkEscalation } from '../../services/escalationService';
import { checkPendingLogReminders } from '../../services/reminderService';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder().setName('bulk_actions').setDescription('Run bulk operations (HPA only)')
  .addStringOption(o => o.setName('action').setDescription('Action').setRequired(true)
    .addChoices(
      { name: 'Clear Expired Logs', value: 'clear' },
      { name: 'Recalculate Escalation', value: 'recalc' },
      { name: 'Trigger Reminders', value: 'reminders' },
    ));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;

  const action = i.options.getString('action', true);
  const labels: Record<string, string> = { clear: 'Clear all expired logs', recalc: 'Recalculate escalation for all staff', reminders: 'Trigger pending log reminders' };

  const confirm = new ButtonBuilder().setCustomId('bulk_yes').setLabel('✅ Confirm').setStyle(ButtonStyle.Danger);
  const cancel  = new ButtonBuilder().setCustomId('bulk_no').setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary);

  await i.reply({ embeds: [infoEmbed('Confirm', `Run: **${labels[action]}**?`)], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirm, cancel)], ephemeral: true });

  const msg = await i.fetchReply();
  const btn = await msg.awaitMessageComponent({ componentType: ComponentType.Button, filter: b => b.user.id === i.user.id, time: 30_000 }).catch(() => null);
  if (!btn || btn.customId === 'bulk_no') { await i.editReply({ embeds: [infoEmbed('Cancelled', 'Action cancelled.')], components: [] }); return; }

  await btn.deferUpdate();
  let summary = '';
  if (action === 'clear') { const n = await deleteExpiredLogs(); summary = `Deleted **${n}** expired log(s).`; }
  else if (action === 'recalc') { const users = await sql`SELECT DISTINCT user_id FROM logs WHERE type = 'mistake' AND expires_at > NOW()`; for (const r of users) await checkEscalation(i.client, r.user_id); summary = `Recalculated **${users.length}** staff.`; }
  else { await checkPendingLogReminders(i.client); summary = 'Reminders triggered.'; }

  await i.editReply({ embeds: [successEmbed('Done', summary)], components: [] });
}
