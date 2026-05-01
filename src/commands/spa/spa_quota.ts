import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isPA, isSPA, isHPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';
import { buildQuotaEmbed } from '../../services/spaAuditService';

export const data = new SlashCommandBuilder()
  .setName('spa_quota')
  .setDescription('View SPA log quota and stats')
  .addUserOption(o => o.setName('senior').setDescription('View a specific senior\'s stats (HPA only)'));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const targetUser = i.options.getUser('senior');

  // Only HPA can view others
  if (targetUser && !isHPA(m)) {
    await i.editReply({ embeds: [errorEmbed('Only HPA can view another senior\'s quota.')] });
    return;
  }

  const targetId = targetUser?.id ?? i.user.id;

  // SPA can only view their own - must be SPA+
  if (!isSPA(m) && targetId === i.user.id) {
    await i.editReply({ embeds: [errorEmbed('This command is for seniors only.')] });
    return;
  }

  const embed = await buildQuotaEmbed(targetId, i.user.id, isHPA(m));
  await i.editReply({ embeds: [embed] });
}
