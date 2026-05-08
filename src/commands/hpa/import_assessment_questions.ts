import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

const VALID_ANSWERS = ['approve', 'deny', 'suspend', 'request_pof'];

export const data = new SlashCommandBuilder()
  .setName('import_assessment_questions')
  .setDescription('Bulk import questions from CSV format (HPA only)')
  .addIntegerOption(o => o.setName('assessment_id').setDescription('Assessment ID to import into').setRequired(true).setMinValue(1))
  .addBooleanOption(o => o.setName('scripting').setDescription('Mark all imported questions as scripting questions'));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;

  const assessmentId = i.options.getInteger('assessment_id', true);
  const isScripting  = i.options.getBoolean('scripting') ?? false;

  const assessment = await sql`SELECT * FROM assessments WHERE id = ${assessmentId}`;
  if (assessment.length === 0) {
    await i.reply({ embeds: [errorEmbed(`Assessment #${assessmentId} not found.`)], ephemeral: true }); return;
  }

  await i.showModal({
    customId: `import_questions:${assessmentId}:${isScripting}`,
    title: `Import Questions — Assessment #${assessmentId}`,
    components: [
      { type: 1, components: [{
        type: 4,
        customId: 'csv_data',
        label: 'Questions (one per line: post_id,answer,reason,context)',
        style: 2,
        required: true,
        minLength: 5,
        maxLength: 4000,
        placeholder: 'abc123,approve,Post is compliant,\ndef456,deny,Missing proof of funds,Check POF rules\n...',
      }] },
    ]
  });
}
