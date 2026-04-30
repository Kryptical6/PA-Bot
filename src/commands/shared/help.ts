import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, Colors, GuildMember } from 'discord.js';
import { isHPA, isSPA, isPA } from '../../utils/permissions';

export const data = new SlashCommandBuilder().setName('help').setDescription('View available commands');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isPA(m)) { await i.reply({ content: 'You do not have permission to use this bot.', ephemeral: true }); return; }

  const embed = new EmbedBuilder().setColor(Colors.Blue).setTitle('📖 Staff Bot Commands').setTimestamp();

  embed.addFields({ name: '👤 All Staff', value: [
    '`/help` - Show this menu',
    '`/my_logs` - View your active logs',
    '`/appeal` - Appeal an active mistake',
    '`/tag` - View a knowledge base tag',
    '`/tag_search` - Search tags by keyword',
    '`/pa_assessment` - Start an assessment',
    '`/escalate` - Escalate a post to a senior',
    '`/my_escalations` - View your escalation requests',
    '`/suggest_game` - Suggest a game for game night',
    '`/view_suggestions` - View approved game suggestions',
  ].join('\n') });

  if (isSPA(m)) embed.addFields({ name: '🔹 SPA Commands', value: [
    '`/log_mistake` - Submit a mistake for review',
    '`/staff_profile` - View a staff member profile',
    '`/staff_overview` - View all staff logs',
    '`/lookup_post` - Search a post ID',
    '`/warn_user` - Send a formal warning DM',
    '`/create_vote` - Create a staff vote',
    '`/list_assessments` - View available assessments',
    '`/create_tag` - Create a knowledge base tag',
    '`/edit_tag` - Edit a tag',
    '`/delete_tag` - Delete a tag',
    '`/create_embed` - Post a custom embed',
    '`/edit_embed` - Edit an existing embed',
    '`/edit_game_night` - Edit a scheduled game night',
    '`/view_escalations` - View all open escalations',
  ].join('\n') });

  if (isHPA(m)) embed.addFields({ name: '🔸 HPA Commands', value: [
    '`/force_strike` - Issue a strike directly',
    '`/manage_log` - Edit, remove, or transfer a log',
    '`/set_escalation` - Set the escalation rate',
    '`/recalculate_escalation` - Re-evaluate all staff',
    '`/notify_user` - Send a structured DM',
    '`/bulk_actions` - Run bulk operations',
    '`/manage_log_tracker` - Manage the log tracker embed',
    '`/create_assessment` - Create an assessment',
    '`/create_assessment_question` - Add a question',
    '`/edit_assessment_question` - Edit a question',
    '`/delete_assessment_question` - Delete a question',
    '`/publish_assessment` - Publish/unpublish an assessment',
    '`/restrict_assessment` - Restrict assessment access',
    '`/view_assessment_results` - View user results',
    '`/view_active_sessions` - See in-progress sessions',
    '`/create_game_night` - Schedule a game night',
    '`/cancel_game_night` - Cancel a game night',
    '`/delete_suggestion` - Remove a game suggestion',
    '`/clear_stale` - Clear stale pending logs or appeals',
  ].join('\n') });

  await i.reply({ embeds: [embed], ephemeral: true });
}
