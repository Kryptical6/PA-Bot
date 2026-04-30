import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType, TextChannel, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle } from 'discord.js';
import { sql } from '../../database/client';
import { errorEmbed, infoEmbed } from '../../utils/embeds';
import { isPA } from '../../utils/permissions';
import { startAssessmentSession, sendQuestion, sendRetakeRequest } from '../../services/assessmentService';
import { config } from '../../config';
import { dmUser } from '../../services/dmService';

export const data = new SlashCommandBuilder().setName('pa_assessment').setDescription('Start a PA assessment');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isPA(m)) return;
  await i.deferReply({ flags: 64 });

  const userId = i.user.id;
  const assessments = await sql`
    SELECT a.* FROM assessments a WHERE (a.published = TRUE OR a.published = 't' OR a.published::text = 'true')
    AND (a.restricted IS NOT TRUE OR EXISTS (SELECT 1 FROM assessment_allowed_users u WHERE u.assessment_id = a.id AND u.user_id = ${userId}))
    ORDER BY a.created_at DESC
  `;

  if (assessments.length === 0) { await i.editReply({ embeds: [errorEmbed('No assessments available to you.')] }); return; }

  const select = new StringSelectMenuBuilder().setCustomId('assess_sel').setPlaceholder('Select an assessment')
    .addOptions(assessments.slice(0, 25).map((a: any) => new StringSelectMenuOptionBuilder()
      .setLabel(a.title).setDescription(`Pass: ${a.pass_threshold}%`).setValue(String(a.id))));

  const msg = await i.editReply({ content: 'Select an assessment:', components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });

  const col = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, filter: s => s.user.id === userId && s.customId === 'assess_sel', time: 30_000, max: 1 });
  col.on('collect', async sel => {
    const assessmentId = parseInt(sel.values[0]);
    const assessment = assessments.find((a: any) => a.id === assessmentId);

    // Check for completed result (retake flow)
    const existing = await sql`SELECT 1 FROM assessment_results WHERE user_id = ${userId} AND assessment_id = ${assessmentId}`;
    if (existing.length > 0) {
      const pendingRetake = await sql`SELECT 1 FROM retake_requests WHERE user_id = ${userId} AND assessment_id = ${assessmentId} AND status = 'pending'`;
      if (pendingRetake.length > 0) {
        await sel.update({ embeds: [infoEmbed('Retake Pending', 'Your retake request is pending HPA authorisation.')], components: [] });
        return;
      }
      const [req] = await sql`INSERT INTO retake_requests (user_id, assessment_id) VALUES (${userId}, ${assessmentId}) RETURNING id`;
      await sel.update({ embeds: [infoEmbed('Retake Requested', 'Your retake request has been sent to HPA.')], components: [] });
      await sendRetakeRequest(i.client, userId, assessmentId, assessment.title, req.id);
      return;
    }

    // Check for existing session (resume)
    const [existingSession] = await sql`SELECT * FROM assessment_sessions WHERE user_id = ${userId} AND assessment_id = ${assessmentId}`;
    if (existingSession) {
      if (new Date(existingSession.deadline) <= new Date()) {
        await sql`DELETE FROM assessment_sessions WHERE id = ${existingSession.id}`;
        await sel.update({ embeds: [errorEmbed('Your previous session expired. Request a retake.')], components: [] });
        return;
      }
      const order = Array.isArray(existingSession.question_order) ? existingSession.question_order.map(Number) : JSON.parse(existingSession.question_order).map(Number);
      await sel.update({ embeds: [infoEmbed('Resuming', `Resuming **${assessment.title}** from Q${existingSession.current_index + 1}. Check your DMs!`)], components: [] });
      await sendQuestion(i.client, userId, existingSession.id, assessmentId, order, existingSession.current_index);
      return;
    }

    // Test DM
    const canDM = await dmUser(i.client, userId, { content: '📝 Your assessment is starting! Questions will appear below.' });
    if (!canDM) {
      await sel.update({ embeds: [errorEmbed('Could not send you a DM. Enable **Allow direct messages from server members** in your Discord privacy settings.')], components: [] });
      return;
    }

    await sel.update({ embeds: [infoEmbed('Assessment Starting', `**${assessment.title}** is starting. Check your DMs!`)], components: [] });
    await startAssessmentSession(i.client, userId, assessmentId);
  });
}
