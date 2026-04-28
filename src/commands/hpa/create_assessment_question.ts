import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

const VALID = ['approve', 'deny', 'suspend', 'request_pof'];

export const data = new SlashCommandBuilder().setName('create_assessment_question').setDescription('Add a question to an assessment (HPA only)')
  .addIntegerOption(o => o.setName('assessment_id').setDescription('Assessment ID').setRequired(true))
  .addBooleanOption(o => o.setName('scripting').setDescription('Scripting-only question?').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;

  const assessmentId = i.options.getInteger('assessment_id', true);
  const isScripting  = i.options.getBoolean('scripting', true);

  const assessment = await sql`SELECT id FROM assessments WHERE id = ${assessmentId}`;
  if (assessment.length === 0) { await i.reply({ embeds: [errorEmbed(`Assessment ${assessmentId} not found.`)], ephemeral: true }); return; }

  await i.showModal({
    customId: `create_q:${assessmentId}:${isScripting}`,
    title: 'Add Question',
    components: [
      { type: 1, components: [{ type: 4, customId: 'post_id', label: 'Post ID', style: 1, required: true, maxLength: 200 }] },
      { type: 1, components: [{ type: 4, customId: 'correct_answer', label: 'Correct Answer', style: 1, required: true, maxLength: 20, placeholder: 'approve, deny, suspend, request_pof' }] },
      { type: 1, components: [{ type: 4, customId: 'context', label: 'Context (optional)', style: 2, required: false, maxLength: 500 }] },
      { type: 1, components: [{ type: 4, customId: 'keywords', label: 'Keywords (optional, comma separated)', style: 1, required: false, maxLength: 300 }] },
    ]
  });

  const modal = await i.awaitModalSubmit({ time: 300_000, filter: m => m.customId === `create_q:${assessmentId}:${isScripting}` }).catch(() => null);
  if (!modal) return;
  await modal.deferReply({ ephemeral: true });

  const postId   = modal.fields.getTextInputValue('post_id').trim();
  const answer   = modal.fields.getTextInputValue('correct_answer').trim().toLowerCase();
  const context  = modal.fields.getTextInputValue('context').trim() || null;
  const keywords = modal.fields.getTextInputValue('keywords').trim() || null;

  if (!VALID.includes(answer)) { await modal.editReply({ embeds: [errorEmbed(`Invalid answer. Must be: ${VALID.join(', ')}`)] }); return; }

  const [result] = await sql`INSERT INTO assessment_questions (assessment_id, post_id, context, correct_answer, keywords, is_scripting) VALUES (${assessmentId}, ${postId}, ${context}, ${answer}, ${keywords}, ${isScripting}) RETURNING id`;
  await modal.editReply({ embeds: [successEmbed('Question Added', `Q#${result.id} added to assessment ${assessmentId}.\nPost ID: \`${postId}\` | Correct: **${answer}**${isScripting ? ' | 📝 Scripting' : ''}`)] });
}
