import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors } from 'discord.js';
import { isSPA } from '../../utils/permissions';
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
  .setName('view_escalations')
  .setDescription('View escalations (SPA+)')
  .addStringOption(o => o.setName('status').setDescription('Filter by status')
    .addChoices(
      { name: 'Open (pending + claimed)', value: 'open' },
      { name: 'Pending only',             value: 'pending' },
      { name: 'Claimed only',             value: 'claimed' },
      { name: 'Escalated to HPA',         value: 'escalated_hpa' },
      { name: 'All',                      value: 'all' },
    ));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const filter = i.options.getString('status') ?? 'open';

  let escalations: any[];
  if (filter === 'open') {
    escalations = await sql`SELECT * FROM post_escalations WHERE status IN ('pending','claimed') ORDER BY created_at ASC LIMIT 20`;
  } else if (filter === 'all') {
    escalations = await sql`SELECT * FROM post_escalations ORDER BY created_at DESC LIMIT 20`;
  } else {
    escalations = await sql`SELECT * FROM post_escalations WHERE status = ${filter} ORDER BY created_at DESC LIMIT 20`;
  }

  const embed = new EmbedBuilder().setColor(Colors.Orange).setTitle('📋 Escalations').setTimestamp();

  if (escalations.length === 0) {
    embed.setDescription('No escalations found.');
  } else {
    embed.setDescription(
      escalations.map((e: any) =>
        `**#${e.id} — \`${e.post_id}\`** — ${STATUS_LABELS[e.status] ?? e.status}\n` +
        `By: <@${e.submitted_by}>  |  ${ACTION_LABELS[e.action] ?? e.action}\n` +
        (e.claimed_by ? `Claimed by: <@${e.claimed_by}>\n` : '') +
        `<t:${Math.floor(new Date(e.created_at).getTime() / 1000)}:R>`
      ).join('\n\n').slice(0, 4000)
    );
  }

  await i.editReply({ embeds: [embed] });
}
