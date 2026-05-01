import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { successEmbed, errorEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const data = new SlashCommandBuilder()
  .setName('setup_weekly_report')
  .setDescription('Configure the weekly SPA report cycle (HPA only)')
  .addIntegerOption(o => o.setName('day').setDescription('Day of week to send DMs').setRequired(true)
    .addChoices(
      { name: 'Monday', value: 1 }, { name: 'Tuesday', value: 2 },
      { name: 'Wednesday', value: 3 }, { name: 'Thursday', value: 4 },
      { name: 'Friday', value: 5 }, { name: 'Saturday', value: 6 },
      { name: 'Sunday', value: 0 },
    ))
  .addIntegerOption(o => o.setName('hour').setDescription('UTC hour to send DMs (0-23)').setRequired(true).setMinValue(0).setMaxValue(23))
  .addIntegerOption(o => o.setName('deadline_hours').setDescription('Hours after DM before cycle closes (e.g. 48)').setRequired(true).setMinValue(12).setMaxValue(168))
  .addIntegerOption(o => o.setName('extension_limit').setDescription('Max extensions per senior per cycle').setMinValue(1).setMaxValue(5))
  .addIntegerOption(o => o.setName('miss_threshold').setDescription('Consecutive misses before stat flag').setMinValue(1).setMaxValue(10))
  .addIntegerOption(o => o.setName('quality_threshold').setDescription('Quality score below this = low quality flag (0-100)').setMinValue(0).setMaxValue(100));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const day      = i.options.getInteger('day', true);
  const hour     = i.options.getInteger('hour', true);
  const deadline = i.options.getInteger('deadline_hours', true);
  const extLimit = i.options.getInteger('extension_limit');
  const missThresh = i.options.getInteger('miss_threshold');
  const qualThresh = i.options.getInteger('quality_threshold');

  await sql`
    UPDATE weekly_report_config SET
      day_of_week        = ${day},
      hour_utc           = ${hour},
      deadline_hours     = ${deadline},
      extension_limit    = COALESCE(${extLimit},   extension_limit),
      miss_threshold     = COALESCE(${missThresh}, miss_threshold),
      quality_threshold  = COALESCE(${qualThresh}, quality_threshold),
      updated_at = NOW()
    WHERE id = 1
  `;

  const cfg = (await sql`SELECT * FROM weekly_report_config WHERE id = 1`)[0];
  await i.editReply({ embeds: [successEmbed('Weekly Report Configured', [
    `📅 Day: **${DAYS[cfg.day_of_week]}**`,
    `🕐 Time: **${cfg.hour_utc}:00 UTC**`,
    `⏰ Deadline: **${cfg.deadline_hours} hours** after DM`,
    `⏳ Extension Limit: **${cfg.extension_limit}** per cycle`,
    `🚨 Miss Threshold: **${cfg.miss_threshold}** consecutive misses`,
    `📊 Quality Threshold: **${cfg.quality_threshold}/100**`,
  ].join('\n'))] });
}
