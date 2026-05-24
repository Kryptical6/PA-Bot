import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder()
  .setName('severity_guide')
  .setDescription('View or update the severity guide shown to SPAs when logging (HPA only)')
  .addSubcommand(sub => sub.setName('view')
    .setDescription('View the current severity guide'))
  .addSubcommand(sub => sub.setName('update')
    .setDescription('Update one or more severity descriptions')
    .addStringOption(o => o.setName('minor').setDescription('New description for Minor severity').setMaxLength(500))
    .addStringOption(o => o.setName('moderate').setDescription('New description for Moderate severity').setMaxLength(500))
    .addStringOption(o => o.setName('severe').setDescription('New description for Severe severity').setMaxLength(500)));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const sub = i.options.getSubcommand();

  // Ensure row exists
  await sql`
    INSERT INTO severity_guide (id, minor, moderate, severe)
    VALUES (1,
      'Minor - Small formatting issues, missing non-critical information, minor rule violations with low impact.',
      'Moderate - Clear rule violations, missing required proof, incorrect category, invalid payment range.',
      'Severe - Stolen/AI-generated assets, prohibited services, scripting violations, repeat offences, significant fraud indicators.'
    )
    ON CONFLICT (id) DO NOTHING
  `;

  const [guide] = await sql`SELECT * FROM severity_guide WHERE id = 1`;

  if (sub === 'view') {
    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle('Severity Guide')
      .setDescription('This guide is shown to SPAs when they run `/log_mistake`.')
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
    const minor    = i.options.getString('minor');
    const moderate = i.options.getString('moderate');
    const severe   = i.options.getString('severe');

    if (!minor && !moderate && !severe) {
      await i.editReply({ embeds: [errorEmbed('Provide at least one field to update.')] }); return;
    }

    await sql`
      UPDATE severity_guide SET
        minor    = COALESCE(${minor},    minor),
        moderate = COALESCE(${moderate}, moderate),
        severe   = COALESCE(${severe},   severe),
        updated_at = NOW()
      WHERE id = 1
    `;

    const [updated] = await sql`SELECT * FROM severity_guide WHERE id = 1`;
    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('Severity Guide Updated')
      .addFields(
        { name: 'Minor',    value: updated.minor },
        { name: 'Moderate', value: updated.moderate },
        { name: 'Severe',   value: updated.severe },
      )
      .setTimestamp();
    await i.editReply({ embeds: [embed] });
  }
}
