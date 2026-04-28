import { Client } from 'discord.js';
import { sql } from '../database/client';
import { dmUser } from './dmService';
import { warningEmbed } from '../utils/embeds';

export async function cancelExpiredAssessmentSessions(client: Client): Promise<void> {
  const expired = await sql`
    SELECT s.*, a.title FROM assessment_sessions s
    JOIN assessments a ON s.assessment_id = a.id WHERE s.deadline <= NOW()
  `;
  for (const s of expired) {
    await dmUser(client, s.user_id, {
      embeds: [warningEmbed('Assessment Expired', `Your assessment **${s.title}** has expired. Use \`/pa_assessment\` to request a retake.`)]
    });
    await sql`DELETE FROM assessment_sessions WHERE id = ${s.id}`;
  }
}
