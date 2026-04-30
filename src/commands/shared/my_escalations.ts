import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors } from 'discord.js';
import { isPA } from '../../utils/permissions';
import { sql } from '../../database/client';

const ACTION_LABELS: Record<string, string> = {
  review_post:       '🔍 Review my post',
  revoke_skill_role: '🔰 Revoke a Skill Role',
  takeover_post:     '🔄 Take-over this post',
};

const STATUS_LABELS: Record<string, string> = {
  pending:       '🕐 Pending',
  claimed:       '🙋 Claimed',
  handled:       '✅ Handled',
  rejected:      '❌ Rejected',
  escalated_hpa: '⬆️ Escalated to HPA',
};

export const data = new SlashCommandBuilder()
  .setName('my_escalations')
  .setDescription('View your submitted escalations');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const escalations = await sql`
    SELECT * FROM post_escalations WHERE submitted_by = ${i.user.id}
    ORDER BY created_at DESC LIMIT 10
  `;

  const embed = new EmbedBuilder().setColor(Colors.Blue).setTitle('📋 My Escalations').setTimestamp();

  if (escalations.length === 0) {
    embed.setDescription('You have no submitted escalations.');
  } else {
    embed.setDescription(
      escalations.map((e: any) =>
        `**#${e.id} — \`${e.post_id}\`**\n` +
        `Action: ${ACTION_LABELS[e.action] ?? e.action}\n` +
        `Status: ${STATUS_LABELS[e.status] ?? e.status}\n` +
        (e.claimed_by ? `Claimed by: <@${e.claimed_by}>\n` : '') +
        (e.resolution_notes ? `Notes: ${e.resolution_notes}\n` : '') +
        `Submitted: <t:${Math.floor(new Date(e.created_at).getTime() / 1000)}:R>`
      ).join('\n\n')
    );
  }

  await i.editReply({ embeds: [embed] });
}
