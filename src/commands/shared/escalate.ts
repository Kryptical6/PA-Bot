import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, TextChannel, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType } from 'discord.js';
import { isPA, isSPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { config } from '../../config';

export const ACTION_LABELS: Record<string, string> = {
  review_post:         '🔍 Review my post',
  revoke_skill_role:   '🔰 Revoke a Skill Role',
  takeover_post:       '🔄 Take-over this post',
  punishment_request:  '⚖️ Punishment Request (Code/Scripts Only)',
};

export function buildEscalationEmbed(e: any): EmbedBuilder {
  const statusMap: Record<string, { color: number; label: string }> = {
    pending:       { color: Colors.Yellow, label: '🕐 Pending — awaiting claim' },
    claimed:       { color: Colors.Blue,   label: `🙋 Claimed by <@${e.claimed_by}>` },
    handled:       { color: Colors.Green,  label: '✅ Handled' },
    rejected:      { color: Colors.Red,    label: '❌ Rejected' },
    escalated_hpa: { color: Colors.Purple, label: '⬆️ Escalated to HPA' },
  };

  const { color, label } = statusMap[e.status] ?? { color: 0x99aab5, label: e.status };

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('📋 Post Escalation')
    .addFields(
      { name: 'Post ID',      value: `\`${e.post_id}\``,                  inline: true },
      { name: 'Submitted by', value: `<@${e.submitted_by}>`,              inline: true },
      { name: 'Action',       value: ACTION_LABELS[e.action] ?? e.action, inline: true },
      { name: 'Status',       value: label },
      { name: 'Information',  value: e.information },
    )
    .setFooter({ text: `Escalation ID: ${e.id}` })
    .setTimestamp();

  if (e.resolution_notes) embed.addFields({ name: 'Resolution Notes', value: e.resolution_notes });
  return embed;
}

export function buildPendingRow(escalationId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`esc_claim:${escalationId}`).setLabel('🙋 Claim').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`esc_withdraw:${escalationId}`).setLabel('↩️ Withdraw').setStyle(ButtonStyle.Secondary),
  );
}

export function buildClaimedRow(escalationId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`esc_handle:${escalationId}`).setLabel('✅ Handled').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`esc_reject:${escalationId}`).setLabel('❌ Reject').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`esc_escalate_hpa:${escalationId}`).setLabel('⬆️ Escalate to HPA').setStyle(ButtonStyle.Secondary),
  );
}

export const data = new SlashCommandBuilder()
  .setName('escalate')
  .setDescription('Escalate a post to a senior for review');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const member = i.member as GuildMember | null;
  if (!member || !isPA(member)) {
    await i.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('esc_action_select')
    .setPlaceholder('What action do you need?')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('🔍 Review my post').setDescription('Ask a senior to review my post').setValue('review_post'),
      new StringSelectMenuOptionBuilder().setLabel('🔰 Revoke a Skill Role').setDescription('Request removal of a skill role').setValue('revoke_skill_role'),
      new StringSelectMenuOptionBuilder().setLabel('🔄 Take-over this post').setDescription('Ask a senior to take over handling a post').setValue('takeover_post'),
      new StringSelectMenuOptionBuilder().setLabel('⚖️ Punishment Request').setDescription('Code/Scripts Only — pings HPA directly').setValue('punishment_request'),
    );

  await i.reply({
    content: 'Select what action you need:',
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    ephemeral: true,
  });
}
