import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { successEmbed, errorEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { startWeeklyCycle, generateSummary, getActiveCycle, sendWeeklyDMs } from '../../services/weeklyReportService';
import { dmUser } from '../../services/dmService';
import { config } from '../../config';

export const data = new SlashCommandBuilder()
  .setName('trigger_weekly_report')
  .setDescription('Manually trigger the weekly report DMs now (HPA only)');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const existing = await getActiveCycle();
  if (existing) {
    await i.editReply({ embeds: [errorEmbed(`A cycle is already active (Week ${existing.week_number}). Use \`/view_report_status\` to check progress.`)] });
    return;
  }

  await startWeeklyCycle(i.client);
  await i.editReply({ embeds: [successEmbed('Cycle Started', 'Weekly report DMs have been sent to all seniors.')] });
}
