import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } from 'discord.js';
import { isSPA, canLogAgainst } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';
import { config } from '../../config';

export const data = new SlashCommandBuilder()
  .setName('log_mistake')
  .setDescription('Submit a mistake for HPA review')
  .addUserOption(o => o.setName('user').setDescription('Staff member to log').setRequired(true))
  .addStringOption(o => o.setName('severity').setDescription('Severity of the mistake').setRequired(true)
    .addChoices(
      { name: 'Minor',    value: 'minor' },
      { name: 'Moderate', value: 'moderate' },
      { name: 'Severe',   value: 'severe' },
    ));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;

  const target   = i.options.getMember('user') as GuildMember | null;
  const severity = i.options.getString('severity', true);

  if (!target) { await i.reply({ embeds: [errorEmbed('User not found.')], ephemeral: true }); return; }
  if (!canLogAgainst(m, target)) { await i.reply({ embeds: [errorEmbed('You cannot log a mistake against this user.')], ephemeral: true }); return; }

  // Show severity guide first as an ephemeral embed with a Continue button
  const guideEmbed = new EmbedBuilder()
    .setColor(severity === 'minor' ? Colors.Yellow : severity === 'moderate' ? Colors.Orange : Colors.Red)
    .setTitle('Severity Guide')
    .setDescription('Make sure the severity you selected matches the mistake below.')
    .addFields(
      { name: 'Minor',    value: config.severityGuide.minor },
      { name: 'Moderate', value: config.severityGuide.moderate },
      { name: 'Severe',   value: config.severityGuide.severe },
    )
    .setFooter({ text: `You selected: ${severity.charAt(0).toUpperCase() + severity.slice(1)}` })
    .setTimestamp();

  const continueBtn = new ButtonBuilder()
    .setCustomId('sev_guide_continue')
    .setLabel(`Continue with ${severity.charAt(0).toUpperCase() + severity.slice(1)}`)
    .setStyle(severity === 'minor' ? ButtonStyle.Secondary : severity === 'moderate' ? ButtonStyle.Primary : ButtonStyle.Danger);

  const msg = await i.reply({
    embeds: [guideEmbed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(continueBtn)],
    ephemeral: true,
  });

  // Wait for Continue click, then show modal
  const btn = await msg.awaitMessageComponent({
    componentType: ComponentType.Button,
    filter: b => b.user.id === i.user.id && b.customId === 'sev_guide_continue',
    time: 30_000,
  }).catch(() => null);

  if (!btn) { await i.editReply({ content: 'Timed out.', embeds: [], components: [] }); return; }

  const today = new Date().toISOString().split('T')[0];
  await btn.showModal({
    customId: `log_mistake:${target.id}:${severity}`,
    title: `Log a ${severity.charAt(0).toUpperCase() + severity.slice(1)} Mistake`,
    components: [
      { type: 1, components: [{ type: 4, customId: 'post_id', label: 'Post ID', style: 1, required: true, maxLength: 200 }] },
      { type: 1, components: [{ type: 4, customId: 'date', label: 'Date (YYYY-MM-DD)', style: 1, required: true, value: today }] },
      { type: 1, components: [{ type: 4, customId: 'reason', label: 'Reason', style: 2, required: true, minLength: 5, maxLength: 1000 }] },
    ]
  });

  await i.editReply({ content: 'Fill in the modal to complete the log.', embeds: [], components: [] });
}
