import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

function parseDuration(s: string): number | null {
  const m = s.trim().match(/^(\d+)(h|d)$/i);
  if (!m) return null;
  return parseInt(m[1]) * (m[2].toLowerCase() === 'h' ? 3600000 : 86400000);
}

export const data = new SlashCommandBuilder().setName('create_assessment').setDescription('Create a new assessment (HPA only)')
  .addStringOption(o => o.setName('title').setDescription('Title').setRequired(true))
  .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 2h or 1d').setRequired(true))
  .addStringOption(o => o.setName('description').setDescription('Briefing shown before questions'))
  .addIntegerOption(o => o.setName('pass_threshold').setDescription('Pass % (default 70)').setMinValue(1).setMaxValue(100))
  .addBooleanOption(o => o.setName('restricted').setDescription('Restrict to specific users?'));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const title     = i.options.getString('title', true);
  const dur       = i.options.getString('duration', true);
  const desc      = i.options.getString('description') ?? null;
  const threshold = i.options.getInteger('pass_threshold') ?? 70;
  const restricted = i.options.getBoolean('restricted') ?? false;

  const ms = parseDuration(dur);
  if (!ms) { await i.editReply({ embeds: [errorEmbed('Invalid duration. Use `2h` or `1d`.')] }); return; }

  const [result] = await sql`INSERT INTO assessments (title, description, deadline_ms, pass_threshold, restricted, created_by) VALUES (${title}, ${desc}, ${ms}, ${threshold}, ${restricted}, ${i.user.id}) RETURNING id`;
  await i.editReply({ embeds: [successEmbed('Created', `Assessment **${title}** created (ID: ${result.id}).\n\nAdd questions with \`/create_assessment_question\`, then publish with \`/publish_assessment\`.`)] });
}
