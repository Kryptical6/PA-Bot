import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { checkEscalation } from '../../services/escalationService';

export const data = new SlashCommandBuilder().setName('recalculate_escalation').setDescription('Re-evaluate all staff escalation (HPA only)');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });
  const users = await sql`SELECT DISTINCT user_id FROM logs WHERE type = 'mistake' AND expires_at > NOW()`;
  for (const row of users) await checkEscalation(i.client, row.user_id);
  await i.editReply({ embeds: [successEmbed('Done', `Evaluated **${users.length}** staff member(s).`)] });
}
