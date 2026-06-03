import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { aiMarkAssessment } from '../../services/aiMarkingService';
import { dmUser } from '../../services/dmService';
import { infoEmbed } from '../../utils/embeds';

export const data = new SlashCommandBuilder()
  .setName('force-stop-assessment')
  .setDescription('Force stop a user\'s active PA assessment and send their current answers to results (HPA only)')
  .addUserOption(o => o
    .setName('user')
    .setDescription('The user whose assessment to stop')
    .setRequired(true)
  )
  .addStringOption(o => o
    .setName('reason')
    .setDescription('Reason for force stopping (shown to the user)')
    .setRequired(false)
    .setMaxLength(500)
  );

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) {
    await i.reply({ embeds: [errorEmbed('This command is HPA only.')], ephemeral: true });
    return;
  }

  await i.deferReply({ ephemeral: true });

  const target = i.options.getUser('user', true);
  const reason = i.options.getString('reason') ?? 'Your assessment was force stopped by HPA.';

  // Find active session
  const [session] = await sql`
    SELECT s.*, a.title, a.pass_threshold, a.assessment_id
    FROM assessment_sessions s
    JOIN assessments a ON s.assessment_id = a.id
    WHERE s.user_id = ${target.id}
    ORDER BY s.started_at DESC
    LIMIT 1
  `;

  if (!session) {
    await i.editReply({ embeds: [errorEmbed(`<@${target.id}> has no active assessment session.`)] });
    return;
  }

  // Check if they have already been finalized
  const [existingResult] = await sql`
    SELECT id FROM assessment_results WHERE session_id = ${session.id}
  `;
  if (existingResult) {
    await i.editReply({ embeds: [errorEmbed(`This session has already been finalized (Result ID: ${existingResult.id}).`)] });
    return;
  }

  // Count responses so far
  const responses = await sql`SELECT * FROM assessment_responses WHERE session_id = ${session.id}`;
  const total = responses.length;

  if (total === 0) {
    // No answers at all - just delete the session cleanly
    await sql`DELETE FROM assessment_sessions WHERE id = ${session.id}`;
    await dmUser(i.client, target.id, {
      embeds: [new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle('Assessment Stopped')
        .setDescription(`Your assessment **${session.title}** was stopped by HPA before any answers were submitted.\n\n**Reason:** ${reason}`)
        .setTimestamp()],
    });
    await i.editReply({ embeds: [successEmbed('Session Cleared', `<@${target.id}>'s session for **${session.title}** had no answers and was cleared.`)] });
    return;
  }

  // Create a result row with the answers they have submitted so far
  const [resultRow] = await sql`
    INSERT INTO assessment_results (user_id, assessment_id, session_id, score, total, percentage, passed, force_stopped)
    VALUES (${target.id}, ${session.assessment_id}, ${session.id}, 0, ${total}, 0, false, true)
    RETURNING id
  `;
  const resultId = resultRow.id;

  // Mark session as force-stopped so it won't be resumed
  await sql`
    UPDATE assessment_sessions
    SET deadline = NOW()
    WHERE id = ${session.id}
  `;

  // DM the user
  await dmUser(i.client, target.id, {
    embeds: [new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle('Assessment Stopped')
      .setDescription(
        `Your assessment **${session.title}** was stopped by HPA.\n\n` +
        `**Reason:** ${reason}\n\n` +
        `Your answers so far (${total} question${total !== 1 ? 's' : ''}) have been submitted and will be reviewed by HPA.`
      )
      .setTimestamp()],
  });

  // Send to AI marking and then HPA review channel, same as normal finalisation
  await dmUser(i.client, target.id, { embeds: [infoEmbed('Processing', 'Your responses are being processed. You will receive your result shortly.')] });
  await aiMarkAssessment(i.client, target.id, session.id, resultId);

  const embed = new EmbedBuilder()
    .setColor(Colors.Orange)
    .setTitle('Assessment Force Stopped')
    .addFields(
      { name: 'User',        value: `<@${target.id}>`,  inline: true },
      { name: 'Assessment',  value: session.title,       inline: true },
      { name: 'Answers',     value: String(total),       inline: true },
      { name: 'Result ID',   value: String(resultId),    inline: true },
      { name: 'Stopped by',  value: `<@${i.user.id}>`,  inline: true },
      { name: 'Reason',      value: reason },
    )
    .setFooter({ text: 'Sent to AI marking and HPA review channel.' })
    .setTimestamp();

  await i.editReply({ embeds: [embed] });
}
