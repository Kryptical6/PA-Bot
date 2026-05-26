import {
  ChatInputCommandInteraction, SlashCommandBuilder, GuildMember,
  EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder,
  ComponentType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  InteractionCollector
} from 'discord.js';
import { isSPA, canLogAgainst } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder()
  .setName('log_mistake')
  .setDescription('Submit a mistake for HPA review')
  .addUserOption(o => o.setName('user').setDescription('Staff member to log').setRequired(true))
  .addStringOption(o => o.setName('severity').setDescription('Severity of the mistake').setRequired(true)
    .addChoices(
      { name: 'Minor',        value: 'minor' },
      { name: 'Moderate',     value: 'moderate' },
      { name: 'Severe',       value: 'severe' },
      { name: 'Missed Quota', value: 'quota' },
    ));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;

  const target   = i.options.getMember('user') as GuildMember | null;
  const severity = i.options.getString('severity', true);

  if (!target) { await i.reply({ embeds: [errorEmbed('User not found.')], ephemeral: true }); return; }
  if (!canLogAgainst(m, target)) { await i.reply({ embeds: [errorEmbed('You cannot log a mistake against this user.')], ephemeral: true }); return; }

  const today = new Date().toISOString().split('T')[0];

  // ── Missed Quota ─────────────────────────────────────────────────────────────
  if (severity === 'quota') {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`quota_sel:${target.id}`)
      .setPlaceholder('How much of their quota did they complete?')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('More than 50% complete')
          .setDescription('Moderate mistake - submitted over half their quota')
          .setValue('quota_moderate'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Less than 50% complete')
          .setDescription('Severe mistake - submitted less than half their quota')
          .setValue('quota_severe'),
      );

    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Orange)
        .setTitle('Missed Quota')
        .setDescription(
          `How much of their quota did <@${target.id}> complete?\n\n` +
          `**More than 50%** - Moderate mistake\n` +
          `**Less than 50%** - Severe mistake`
        )
        .setTimestamp()],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
      ephemeral: true,
    });

    // Use interactionCreate collector on the client instead of awaitMessageComponent
    const sel = await new Promise<any>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 30_000);
      const handler = async (interaction: any) => {
        if (
          interaction.isStringSelectMenu() &&
          interaction.user.id === i.user.id &&
          interaction.customId === `quota_sel:${target.id}`
        ) {
          clearTimeout(timeout);
          i.client.off('interactionCreate', handler);
          resolve(interaction);
        }
      };
      i.client.on('interactionCreate', handler);
    });

    if (!sel) { await i.editReply({ content: 'Timed out.', embeds: [], components: [] }); return; }

    const resolvedSeverity = sel.values[0] === 'quota_severe' ? 'severe' : 'moderate';

    await sel.showModal({
      customId: `log_mistake:${target.id}:${resolvedSeverity}:quota`,
      title: `Missed Quota - ${resolvedSeverity === 'severe' ? 'Severe' : 'Moderate'}`,
      components: [
        { type: 1, components: [{ type: 4, customId: 'post_id', label: 'Date of missed quota (YYYY-MM-DD)', style: 1, required: true, maxLength: 10, value: today }] },
        { type: 1, components: [{ type: 4, customId: 'posts_reviewed', label: 'How many posts did they review? (number)', style: 1, required: true, maxLength: 6, placeholder: 'e.g. 12' }] },
        { type: 1, components: [{ type: 4, customId: 'reason', label: 'Additional notes (optional)', style: 2, required: false, maxLength: 500 }] },
      ]
    });

    await i.editReply({ content: 'Fill in the modal to complete the log.', embeds: [], components: [] });
    return;
  }

  // ── Normal severity - show guide then open modal ──────────────────────────────
  const guideRows = await sql`SELECT * FROM severity_guide WHERE id = 1`;
  const guide = guideRows[0] ?? {
    minor:    'Outcome was correct but execution was slightly off.',
    moderate: 'Wrong outcome reached or a required process was not followed.',
    severe:   'PA approved something that should never have passed.',
  };

  const guideEmbed = new EmbedBuilder()
    .setColor(severity === 'minor' ? Colors.Yellow : severity === 'moderate' ? Colors.Orange : Colors.Red)
    .setTitle('Severity Guide')
    .setDescription('Make sure the severity you selected matches the mistake below.')
    .addFields(
      { name: 'Minor',    value: guide.minor },
      { name: 'Moderate', value: guide.moderate },
      { name: 'Severe',   value: guide.severe },
    )
    .setFooter({ text: `You selected: ${severity.charAt(0).toUpperCase() + severity.slice(1)}` })
    .setTimestamp();

  const continueBtn = new ButtonBuilder()
    .setCustomId(`sev_guide_continue:${target.id}:${severity}`)
    .setLabel(`Continue with ${severity.charAt(0).toUpperCase() + severity.slice(1)}`)
    .setStyle(severity === 'minor' ? ButtonStyle.Secondary : severity === 'moderate' ? ButtonStyle.Primary : ButtonStyle.Danger);

  await i.reply({
    embeds: [guideEmbed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(continueBtn)],
    ephemeral: true,
  });

  // Listen for the continue button via interactionCreate
  const btn = await new Promise<any>((resolve) => {
    const timeout = setTimeout(() => resolve(null), 60_000);
    const handler = async (interaction: any) => {
      if (
        interaction.isButton() &&
        interaction.user.id === i.user.id &&
        interaction.customId === `sev_guide_continue:${target.id}:${severity}`
      ) {
        clearTimeout(timeout);
        i.client.off('interactionCreate', handler);
        resolve(interaction);
      }
    };
    i.client.on('interactionCreate', handler);
  });

  if (!btn) { await i.editReply({ content: 'Timed out.', embeds: [], components: [] }); return; }

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
