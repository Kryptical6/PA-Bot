import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder().setName('view_active_sessions').setDescription('View in-progress assessment sessions (HPA only)');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const sessions = await sql`SELECT s.*, a.title FROM assessment_sessions s JOIN assessments a ON s.assessment_id = a.id ORDER BY s.started_at DESC`;
  const embed = new EmbedBuilder().setColor(Colors.Orange).setTitle('🔄 Active Sessions').setTimestamp();

  if (sessions.length === 0) { embed.setDescription('No active sessions.'); }
  else {
    embed.setDescription(sessions.map((s: any) =>
      `<@${s.user_id}> - **${s.title}** - Q${s.current_index + 1} - Ends <t:${Math.floor(new Date(s.deadline).getTime() / 1000)}:R>`
    ).join('\n'));
  }
  await i.editReply({ embeds: [embed] });
}
