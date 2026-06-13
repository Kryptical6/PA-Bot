import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, Colors, GuildMember } from 'discord.js';
import { isHPA, isSPA, isPA } from '../../utils/permissions';

export const data = new SlashCommandBuilder().setName('help').setDescription('View available commands');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isPA(m)) { await i.reply({ content: 'You do not have permission to use this bot.', ephemeral: true }); return; }

  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle('Staff Bot Commands')
    .setDescription('Only commands available to your role are shown.')
    .setTimestamp();

  embed.addFields(
    {
      name: 'All Staff',
      value: [
        '`/help` `/my-logs` `/appeal`',
        '`/tag` `/tag-search`',
        '`/pa-assessment` `/post-train`',
        '`/escalate` `/my-escalations`',
        '`/suggest` `/remind` `/bot-bug`',
      ].join('\n'),
    },
  );

  if (isSPA(m)) {
    embed.addFields(
      {
        name: 'SPA - Staff Tools',
        value: [
          '`/log-mistake` `/staff-profile` `/staff-overview`',
          '`/lookup-post` `/warn-user` `/spa-quota`',
          '`/view-escalations` `/search-suggestions`',
        ].join('\n'),
      },
      {
        name: 'SPA - Content & Operations',
        value: [
          '`/create-vote` `/set-reminder` `/list-assessments`',
          '`/create-tag` `/edit-tag` `/delete-tag` `/send-tag`',
          '`/create-embed` `/edit-embed` `/edit-game-night`',
        ].join('\n'),
      },
    );
  }

  if (isHPA(m)) {
    embed.addFields(
      {
        name: 'HPA - Staff Control',
        value: [
          '`/force-strike` `/manage-log` `/clear-stale`',
          '`/force-stop-sessions` `/force-stop-assessment`',
          '`/set-escalation` `/recalculate-escalation`',
          '`/notify-user` `/bulk-actions` `/manage-log-tracker`',
        ].join('\n'),
      },
      {
        name: 'HPA - Assessments & Training',
        value: [
          '`/assessment` (create/list/questions/results/sessions/force-stop)',
          '`/import-assessment-questions` `/severity-guide`',
          '`/manage-denial-reasons`',
        ].join('\n'),
      },
      {
        name: 'HPA - Content & Feedback',
        value: [
          '`/create-game-night` `/cancel-game-night` `/delete-suggestion`',
          '`/create-feedback` `/close-feedback`',
        ].join('\n'),
      },
      {
        name: 'HPA - Audit & Reports',
        value: [
          '`/view-spa-audit` `/configure-audit` `/clear-spa-flag`',
          '`/setup-weekly-report` `/trigger-weekly-report` `/view-report-status`',
        ].join('\n'),
      },
    );
  }

  await i.reply({ embeds: [embed], ephemeral: true });
}
