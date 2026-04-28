import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder().setName('view_assessment_results').setDescription('View assessment results for a user (HPA only)')
  .addUserOption(o => o.setName('user').setDescription('Staff member').setRequired(true))
  .addIntegerOption(o => o.setName('assessment_id').setDescription('Filter by assessment ID (optional)'));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const target = i.options.getUser('user', true);
  const aId    = i.options.getInteger('assessment_id');

  const results = aId
    ? await sql`SELECT r.*, a.title FROM assessment_results r JOIN assessments a ON r.assessment_id = a.id WHERE r.user_id = ${target.id} AND r.assessment_id = ${aId} ORDER BY r.completed_at DESC`
    : await sql`SELECT r.*, a.title FROM assessment_results r JOIN assessments a ON r.assessment_id = a.id WHERE r.user_id = ${target.id} ORDER BY r.completed_at DESC LIMIT 10`;

  if (results.length === 0) { await i.editReply({ embeds: [errorEmbed(`No results found for <@${target.id}>.`)] }); return; }

  const embed = new EmbedBuilder().setColor(Colors.Blue).setTitle(`📊 Results - ${target.username}`).setThumbnail(target.displayAvatarURL()).setTimestamp();
  for (const r of results) {
    const score  = r.hpa_override_score ?? r.score;
    const passed = r.hpa_override_passed ?? r.passed;
    const note   = r.hpa_reviewed ? '' : ' *(pending review)*';
    embed.addFields({ name: `${r.title} - <t:${Math.floor(new Date(r.completed_at).getTime() / 1000)}:D>${note}`, value: `**${score}/${r.total}** (${r.percentage}%) - ${passed ? '✅ Pass' : '❌ Fail'}` });
  }
  await i.editReply({ embeds: [embed] });
}
