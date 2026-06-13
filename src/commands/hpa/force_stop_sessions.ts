import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

type SessionType = 'all' | 'post_train' | 'assessments' | 'log_sessions';

export const data = new SlashCommandBuilder()
  .setName('force-stop-sessions')
  .setDescription('Force stop active bot sessions (HPA only)')
  .addStringOption(o => o
    .setName('type')
    .setDescription('Which sessions to stop')
    .setRequired(false)
    .addChoices(
      { name: 'All active sessions', value: 'all' },
      { name: 'Post training sessions', value: 'post_train' },
      { name: 'PA assessment sessions', value: 'assessments' },
      { name: 'SPA log sessions', value: 'log_sessions' },
    ))
  .addStringOption(o => o
    .setName('reason')
    .setDescription('Internal reason for stopping the sessions')
    .setRequired(false)
    .setMaxLength(500));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) {
    await i.reply({ embeds: [errorEmbed('This command is HPA only.')], ephemeral: true });
    return;
  }

  await i.deferReply({ ephemeral: true });

  const type = (i.options.getString('type') ?? 'all') as SessionType;
  const reason = i.options.getString('reason') ?? 'Force stopped by HPA.';
  const counts: Record<string, number> = {
    postTrain: 0,
    assessments: 0,
    logSessions: 0,
  };

  if (type === 'all' || type === 'post_train') {
    const rows = await sql`
      UPDATE post_train_sessions
      SET status = 'ended', ended_at = NOW()
      WHERE status = 'active'
      RETURNING id
    `;
    counts.postTrain = rows.length;
  }

  if (type === 'all' || type === 'assessments') {
    const rows = await sql`
      UPDATE assessment_sessions s
      SET deadline = NOW()
      WHERE s.deadline > NOW()
        AND NOT EXISTS (
          SELECT 1 FROM assessment_results r WHERE r.session_id = s.id
        )
      RETURNING s.id
    `;
    counts.assessments = rows.length;
  }

  if (type === 'all' || type === 'log_sessions') {
    const rows = await sql`
      UPDATE spa_log_sessions
      SET status = 'expired', completed_at = NOW()
      WHERE status = 'active'
      RETURNING id
    `;
    counts.logSessions = rows.length;
  }

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const embed = new EmbedBuilder()
    .setColor(total > 0 ? Colors.Green : Colors.Yellow)
    .setTitle(total > 0 ? 'Sessions Stopped' : 'No Active Sessions')
    .setDescription(total > 0 ? `Stopped **${total}** active session(s).` : 'There were no matching active sessions to stop.')
    .addFields(
      { name: 'Post Training', value: String(counts.postTrain), inline: true },
      { name: 'Assessments', value: String(counts.assessments), inline: true },
      { name: 'SPA Log Sessions', value: String(counts.logSessions), inline: true },
      { name: 'Stopped By', value: `<@${i.user.id}>`, inline: true },
      { name: 'Reason', value: reason },
    )
    .setTimestamp();

  await i.editReply({ embeds: [embed] });
}
