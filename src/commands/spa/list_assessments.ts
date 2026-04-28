import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors } from 'discord.js';
import { isSPA } from '../../utils/permissions';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder().setName('list_assessments').setDescription('View available assessments');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const assessments = await sql`
    SELECT a.*, COUNT(q.id) as question_count FROM assessments a
    LEFT JOIN assessment_questions q ON q.assessment_id = a.id AND q.is_scripting = false
    WHERE a.published = true GROUP BY a.id ORDER BY a.created_at DESC
  `;

  const embed = new EmbedBuilder().setColor(Colors.Blue).setTitle('📋 Available Assessments').setTimestamp();
  if (assessments.length === 0) { embed.setDescription('No assessments currently available.'); }
  else {
    embed.setDescription(assessments.map((a: any) => {
      const hours = Number(a.deadline_ms) / 3600000;
      const duration = hours >= 24 ? `${hours / 24}d` : `${hours}h`;
      return `**[${a.id}] ${a.title}**${a.restricted ? ' 🔒' : ''}\n${a.question_count} questions - ${duration} limit - Pass: ${a.pass_threshold}%`;
    }).join('\n\n'));
  }
  await i.editReply({ embeds: [embed] });
}
