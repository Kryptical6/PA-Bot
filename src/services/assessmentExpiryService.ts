import { Client } from 'discord.js';
import { sql } from '../database/client';
import { dmUser } from './dmService';
import { warningEmbed } from '../utils/embeds';

export async function cancelExpiredAssessmentSessions(client: Client): Promise<void> {
  // Only expire sessions that do NOT have a completed result
  // (if a result exists, the assessment was finished and the session is just lingering)
  const expired = await sql`
    SELECT s.*, a.title FROM assessment_sessions s
    JOIN assessments a ON s.assessment_id = a.id
    WHERE s.deadline <= NOW()
    AND NOT EXISTS (
      SELECT 1 FROM assessment_results r
      WHERE r.session_id = s.id
    )
  `;

  for (const s of expired) {
    await dmUser(client, s.user_id, {
      embeds: [warningEmbed('Assessment Expired', `Your assessment **${s.title}** has expired. Use \`/pa-assessment\` to request a retake.`)]
    });
    await sql`DELETE FROM assessment_sessions WHERE id = ${s.id}`;
  }

  // Clean up sessions that DO have a result (finished sessions) - delete silently
  await sql`
    DELETE FROM assessment_sessions
    WHERE deadline <= NOW()
    AND EXISTS (
      SELECT 1 FROM assessment_results r WHERE r.session_id = assessment_sessions.id
    )
  `;
}
