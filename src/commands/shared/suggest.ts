import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, TextChannel } from 'discord.js';
import { isPA, isSPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { config } from '../../config';

export function buildSuggestionEmbed(s: any): EmbedBuilder {
  const statusMap: Record<string, { color: number; label: string }> = {
    pending:     { color: Colors.Yellow, label: '🕐 Pending Review' },
    considered:  { color: Colors.Blue,   label: '🔍 Under Consideration' },
    implemented: { color: Colors.Green,  label: '✅ Implemented' },
    declined:    { color: Colors.Red,    label: '❌ Declined' },
    rejected:    { color: Colors.DarkRed, label: '🚫 Rejected' },
  };

  const { color, label } = statusMap[s.status] ?? { color: Colors.Grey, label: s.status };

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`💡 ${s.title}`)
    .addFields(
      { name: 'Submitted by', value: `<@${s.submitted_by}>`, inline: true },
      { name: 'Status',       value: label,                   inline: true },
      { name: 'Core Idea',    value: s.core_idea },
    )
    .setFooter({ text: `Suggestion ID: ${s.id}` })
    .setTimestamp();

  if (s.further_details) embed.addFields({ name: 'Further Details', value: s.further_details });
  if (s.rejection_reason) embed.addFields({ name: 'Reason', value: s.rejection_reason });
  return embed;
}

export function buildPendingSuggestionRow(suggId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`sug_consider:${suggId}`).setLabel('✅ Consider').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`sug_reject:${suggId}`).setLabel('❌ Reject').setStyle(ButtonStyle.Danger),
  );
}

export function buildConsideredRow(suggId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`sug_implement:${suggId}`).setLabel('✅ Implement').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`sug_decline:${suggId}`).setLabel('❌ Decline').setStyle(ButtonStyle.Danger),
  );
}

export const data = new SlashCommandBuilder()
  .setName('suggest')
  .setDescription('Submit a suggestion for the department');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isPA(m)) return;

  // Check limit — 2 open suggestions per user
  const open = await sql`SELECT COUNT(*) as count FROM suggestions WHERE submitted_by = ${i.user.id} AND status IN ('pending','considered')`;
  if (parseInt(open[0].count) >= 2) {
    await i.reply({ embeds: [errorEmbed('You already have 2 open suggestions. Wait for them to be resolved before submitting more.')], ephemeral: true });
    return;
  }

  await i.showModal({
    customId: 'suggest_modal',
    title: 'Submit a Suggestion',
    components: [
      { type: 1, components: [{ type: 4, customId: 'title', label: 'Title / Name', style: 1, required: true, maxLength: 100 }] },
      { type: 1, components: [{ type: 4, customId: 'core_idea', label: 'Core Idea / Concept', style: 2, required: true, minLength: 10, maxLength: 500 }] },
      { type: 1, components: [{ type: 4, customId: 'further_details', label: 'Further Information (optional)', style: 2, required: false, maxLength: 1000 }] },
    ]
  });
}
