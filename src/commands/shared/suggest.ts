import {
  ChatInputCommandInteraction, SlashCommandBuilder, GuildMember,
  EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder,
  TextChannel, StringSelectMenuBuilder, StringSelectMenuOptionBuilder
} from 'discord.js';
import { isPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { config } from '../../config';

// ─── SHARED EMBED BUILDERS ────────────────────────────────────────────────────

export function buildSuggestionEmbed(s: any): EmbedBuilder {
  const statusMap: Record<string, { color: number; label: string }> = {
    pending:     { color: Colors.Yellow,  label: 'Pending Review' },
    considered:  { color: Colors.Blue,    label: 'Under Consideration' },
    implemented: { color: Colors.Green,   label: 'Implemented' },
    declined:    { color: Colors.Red,     label: 'Declined' },
    rejected:    { color: Colors.DarkRed, label: 'Rejected' },
  };
  const { color, label } = statusMap[s.status] ?? { color: Colors.Grey, label: s.status };
  const typeLabel: Record<string, string> = { department: 'Department', game_night: 'Game Night', tag: 'Tag' };

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(s.title)
    .addFields(
      { name: 'Type',         value: typeLabel[s.suggestion_type ?? 'department'] ?? 'Department', inline: true },
      { name: 'Submitted by', value: `<@${s.submitted_by}>`, inline: true },
      { name: 'Status',       value: label, inline: true },
      { name: 'Core Idea',    value: s.core_idea },
    )
    .setFooter({ text: `ID: ${s.id}` })
    .setTimestamp();

  if (s.further_details)  embed.addFields({ name: 'Further Details', value: s.further_details });
  if (s.tag_name)         embed.addFields({ name: 'Tag Name',    value: s.tag_name,     inline: true });
  if (s.tag_category)     embed.addFields({ name: 'Category',    value: s.tag_category, inline: true });
  if (s.tag_content)      embed.addFields({ name: 'Tag Content', value: s.tag_content });
  if (s.rejection_reason) embed.addFields({ name: 'Reason',      value: s.rejection_reason });
  return embed;
}

export function buildPendingSuggestionRow(suggId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`sug_consider:${suggId}`).setLabel('Consider').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`sug_reject:${suggId}`).setLabel('Reject').setStyle(ButtonStyle.Danger),
  );
}

export function buildConsideredRow(suggId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`sug_implement:${suggId}`).setLabel('Implement').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`sug_decline:${suggId}`).setLabel('Decline').setStyle(ButtonStyle.Danger),
  );
}

// ─── COMMAND ──────────────────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('suggest')
  .setDescription('Submit a suggestion');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isPA(m)) return;

  const select = new StringSelectMenuBuilder()
    .setCustomId('suggest_type_sel')
    .setPlaceholder('What type of suggestion?')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('Department Suggestion').setDescription('Suggest an improvement for the department').setValue('department'),
      new StringSelectMenuOptionBuilder().setLabel('Game Night Suggestion').setDescription('Suggest a game for game night').setValue('game_night'),
      new StringSelectMenuOptionBuilder().setLabel('Tag Suggestion').setDescription('Suggest a new knowledge base tag (SPA review required)').setValue('tag'),
    );

  await i.reply({
    content: 'What would you like to suggest?',
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    ephemeral: true,
  });
}
