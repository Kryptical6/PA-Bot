import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed, warningEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { safeDM } from '../../services/dmService';
import { updateLogTracker } from '../../services/logTrackerService';
import { config } from '../../config';

export const data = new SlashCommandBuilder().setName('force_strike').setDescription('Issue a strike directly (HPA only)')
  .addUserOption(o => o.setName('user').setDescription('Staff member').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;

  const target = i.options.getMember('user') as GuildMember | null;
  if (!target) { await i.reply({ embeds: [errorEmbed('User not found.')], ephemeral: true }); return; }
  if (target.id === i.user.id) { await i.reply({ embeds: [errorEmbed('You cannot strike yourself.')], ephemeral: true }); return; }

  const today = new Date().toISOString().split('T')[0];
  await i.showModal({
    customId: `force_strike:${target.id}`,
    title: `Force Strike - ${target.displayName}`,
    components: [
      { type: 1, components: [{ type: 4, customId: 'reason', label: 'Reason', style: 2, required: true, minLength: 5, maxLength: 1000 }] },
      { type: 1, components: [{ type: 4, customId: 'date', label: 'Date (YYYY-MM-DD)', style: 1, required: true, value: today }] },
    ]
  });

  const modal = await i.awaitModalSubmit({ time: 300_000, filter: m => m.customId === `force_strike:${target.id}` }).catch(() => null);
  if (!modal) return;
  await modal.deferReply({ ephemeral: true });

  const reason = modal.fields.getTextInputValue('reason').trim();
  const date   = modal.fields.getTextInputValue('date').trim();

  const exp = new Date(); exp.setDate(exp.getDate() + config.expiry.defaultDays);
  await sql`INSERT INTO logs (user_id, type, reason, logged_by, date, expires_at) VALUES (${target.id}, 'strike', ${reason}, ${i.user.id}, ${date}, ${exp.toISOString()})`;

  await safeDM(i.client, target.id, warningEmbed('Strike Issued', `You have received a strike.\n\n**Reason:** ${reason}\n**Date:** ${date}`), 'force strike');
  await updateLogTracker(i.client);
  await modal.editReply({ embeds: [successEmbed('Strike Issued', `Strike issued to <@${target.id}>.`)] });
}
