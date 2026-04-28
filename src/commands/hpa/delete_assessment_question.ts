import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder().setName('delete_assessment_question').setDescription('Delete a question (HPA only)')
  .addIntegerOption(o => o.setName('question_id').setDescription('Question ID').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const qId = i.options.getInteger('question_id', true);
  const [q] = await sql`SELECT * FROM assessment_questions WHERE id = ${qId}`;
  if (!q) { await i.editReply({ embeds: [errorEmbed(`Question ${qId} not found.`)] }); return; }

  await sql`DELETE FROM assessment_questions WHERE id = ${qId}`;
  await i.editReply({ embeds: [successEmbed('Deleted', `Q#${qId} (Post ID: ${q.post_id}) deleted.`)] });
}
