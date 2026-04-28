import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed, warningEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { safeDM } from '../../services/dmService';

export const data = new SlashCommandBuilder().setName('approve_retake').setDescription('Approve or deny a retake request (HPA only)')
  .addIntegerOption(o => o.setName('request_id').setDescription('Retake request ID').setRequired(true))
  .addBooleanOption(o => o.setName('approve').setDescription('True to approve, false to deny').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const reqId   = i.options.getInteger('request_id', true);
  const approve = i.options.getBoolean('approve', true);

  const [req] = await sql`SELECT r.*, a.title FROM retake_requests r JOIN assessments a ON r.assessment_id = a.id WHERE r.id = ${reqId} AND r.status = 'pending'`;
  if (!req) { await i.editReply({ embeds: [errorEmbed(`Request #${reqId} not found or already actioned.`)] }); return; }

  await sql`UPDATE retake_requests SET status = ${approve ? 'approved' : 'denied'} WHERE id = ${reqId}`;

  if (approve) {
    await sql`DELETE FROM assessment_sessions WHERE user_id = ${req.user_id} AND assessment_id = ${req.assessment_id}`;
    await safeDM(i.client, req.user_id, successEmbed('Retake Approved', `Your retake for **${req.title}** has been approved. Use \`/pa_assessment\` to begin.`), 'retake approved');
    await i.editReply({ embeds: [successEmbed('Approved', `Retake approved for <@${req.user_id}>.`)] });
  } else {
    await safeDM(i.client, req.user_id, warningEmbed('Retake Denied', `Your retake request for **${req.title}** has been denied.`), 'retake denied');
    await i.editReply({ embeds: [successEmbed('Denied', `Retake denied for <@${req.user_id}>.`)] });
  }
}
