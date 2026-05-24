import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

const DEFAULTS = {
  minor:    'A mistake where the outcome was correct but execution was slightly off. Examples: denying a post using the wrong reason when the deny was still correct; approving a borderline post that could reasonably go either way. Low impact — tracked as a note only.',
  moderate: 'A clear error in judgement or process where the wrong outcome was reached, or a required step was skipped. Examples: approving a post that should have been denied or vice versa; approving a scripting post without the scripting skill role; a PA falling below 50% of their daily log quota.',
  severe:   'A significant failure where the PA approved something that should never have passed. Examples: approving a skill role application containing AI-generated or stolen work; approving a post that warranted a punishment request such as scripting abuse or a Terms of Service violation. General rule — if a reasonable PA should have caught it and the consequences are serious, it is Severe.',
};

async function ensureGuide(): Promise<void> {
  await sql`
    INSERT INTO severity_guide (id, minor, moderate, severe)
    VALUES (1, ${DEFAULTS.minor}, ${DEFAULTS.moderate}, ${DEFAULTS.severe})
    ON CONFLICT (id) DO NOTHING
  `;
}

export const data = new SlashCommandBuilder()
  .setName('severity_guide')
  .setDescription('View or update the severity guide shown when logging mistakes (HPA only)')
  .addSubcommand(sub => sub.setName('view')
    .setDescription('View the current severity guide'))
  .addSubcommand(sub => sub.setName('update')
    .setDescription('Edit the severity guide via modal'));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;

  const sub = i.options.getSubcommand();

  if (sub === 'view') {
    await i.deferReply({ ephemeral: true });
    await ensureGuide();
    const [guide] = await sql`SELECT * FROM severity_guide WHERE id = 1`;

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle('Severity Guide')
      .setDescription('This guide is shown to SPAs before they submit a log.')
      .addFields(
        { name: 'Minor',    value: guide.minor },
        { name: 'Moderate', value: guide.moderate },
        { name: 'Severe',   value: guide.severe },
      )
      .setFooter({ text: `Last updated: ${new Date(guide.updated_at).toLocaleDateString('en-GB')}` })
      .setTimestamp();

    await i.editReply({ embeds: [embed] });
  }

  else if (sub === 'update') {
    await ensureGuide();
    const [guide] = await sql`SELECT * FROM severity_guide WHERE id = 1`;

    await i.showModal({
      customId: 'severity_guide_modal',
      title: 'Update Severity Guide',
      components: [
        { type: 1, components: [{ type: 4, customId: 'minor',    label: 'Minor',    style: 2, required: true, value: guide.minor,    maxLength: 1000 }] },
        { type: 1, components: [{ type: 4, customId: 'moderate', label: 'Moderate', style: 2, required: true, value: guide.moderate, maxLength: 1000 }] },
        { type: 1, components: [{ type: 4, customId: 'severe',   label: 'Severe',   style: 2, required: true, value: guide.severe,   maxLength: 1000 }] },
      ]
    });
  }
}
