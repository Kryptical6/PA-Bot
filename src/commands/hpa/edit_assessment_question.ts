import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

const VALID = ['approve', 'deny', 'suspend', 'request_pof'];

export const data = new SlashCommandBuilder().setName('edit_assessment_question').setDescription('Edit a question (HPA only)')
  .addIntegerOption(o => o.setName('question_id').setDescription('Question ID').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;

  const qId = i.options.getInteger('question_id', true);
  const [q] = await sql`SELECT * FROM assessment_questions WHERE id = ${qId}`;
  if (!q) { await i.reply({ embeds: [errorEmbed(`Question ${qId} not found.`)], ephemeral: true }); return; }

  await i.showModal({
    customId: `edit_q:${qId}`,
    title: `Edit Q#${qId}`,
    components: [
      { type: 1, components: [{ type: 4, customId: 'post_id', label: 'Post ID', style: 1, required: true, value: q.post_id, maxLength: 200 }] },
      { type: 1, components: [{ type: 4, customId: 'correct_answer', label: 'Correct Answer', style: 1, required: true, value: q.correct_answer, maxLength: 20 }] },
      { type: 1, components: [{ type: 4, customId: 'context', label: 'Context (optional)', style: 2, required: false, value: q.context ?? '' }] },
      { type: 1, components: [{ type: 4, customId: 'keywords', label: 'Keywords (optional)', style: 1, required: false, value: q.keywords ?? '', maxLength: 300 }] },
    ]
  });

  const modal = await i.awaitModalSubmit({ time: 300_000, filter: m => m.customId === `edit_q:${qId}` }).catch(() => null);
  if (!modal) return;
  await modal.deferReply({ ephemeral: true });

  const postId   = modal.fields.getTextInputValue('post_id').trim();
  const answer   = modal.fields.getTextInputValue('correct_answer').trim().toLowerCase();
  const context  = modal.fields.getTextInputValue('context').trim() || null;
  const keywords = modal.fields.getTextInputValue('keywords').trim() || null;

  if (!VALID.includes(answer)) { await modal.editReply({ embeds: [errorEmbed(`Invalid answer. Must be: ${VALID.join(', ')}`)] }); return; }
  await sql`UPDATE assessment_questions SET post_id = ${postId}, correct_answer = ${answer}, context = ${context}, keywords = ${keywords} WHERE id = ${qId}`;
  await modal.editReply({ embeds: [successEmbed('Updated', `Q#${qId} updated.`)] });
}
