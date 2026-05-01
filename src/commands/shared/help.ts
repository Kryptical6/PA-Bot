import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, Colors, GuildMember } from 'discord.js';
import { isHPA, isSPA, isPA } from '../../utils/permissions';

export const data = new SlashCommandBuilder().setName('help').setDescription('View available commands');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isPA(m)) { await i.reply({ content: 'You do not have permission to use this bot.', ephemeral: true }); return; }

  const embed = new EmbedBuilder().setColor(Colors.Blue).setTitle('📖 Staff Bot Commands').setTimestamp();

  embed.addFields({ name: '👤 All Staff', value: [
    '`/help` `/my_logs` `/appeal`',
    '`/tag` `/tag_search`',
    '`/pa_assessment` `/escalate` `/my_escalations`',
    '`/game_suggest` `/game_suggestions` `/suggest`',
  ].join('\n') });

  if (isSPA(m)) embed.addFields({ name: '🔹 SPA', value: [
    '`/log_mistake` `/staff_profile` `/staff_overview`',
    '`/lookup_post` `/warn_user` `/create_vote` `/spa_quota`',
    '`/list_assessments`',
    '`/create_tag` `/edit_tag` `/delete_tag`',
    '`/create_embed` `/edit_embed`',
    '`/edit_game_night` `/view_escalations` `/search_suggestions`',
  ].join('\n') });

  if (isHPA(m)) {
    embed.addFields({ name: '🔸 HPA — Logs & Staff', value: [
      '`/force_strike` `/manage_log` `/clear_stale`',
      '`/set_escalation` `/recalculate_escalation`',
      '`/notify_user` `/bulk_actions` `/manage_log_tracker`',
    ].join('\n') });
    embed.addFields({ name: '🔸 HPA — Assessments', value: [
      '`/create_assessment` `/publish_assessment` `/restrict_assessment`',
      '`/create_assessment_question` `/edit_assessment_question` `/delete_assessment_question`',
      '`/view_assessment_results` `/view_active_sessions`',
    ].join('\n') });
    embed.addFields({ name: '🔸 HPA — Game Night & Content', value: [
      '`/create_game_night` `/cancel_game_night` `/delete_suggestion`',
      '`/create_feedback` `/close_feedback`',
      '`/create_embed` `/edit_embed`',
    ].join('\n') });
    embed.addFields({ name: '🔸 HPA — Audit & Reports', value: [
      '`/view_spa_audit` `/configure_audit` `/clear_spa_flag`',
      '`/setup_weekly_report` `/trigger_weekly_report` `/view_report_status`',
    ].join('\n') });
  }

  await i.reply({ embeds: [embed], ephemeral: true });
}
