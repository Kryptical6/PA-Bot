import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { successEmbed } from '../../utils/embeds';
import { updateLogTracker, resetTrackerMessageId } from '../../services/logTrackerService';
import { config } from '../../config';

export const data = new SlashCommandBuilder().setName('manage_log_tracker').setDescription('Manage the staff log tracker embed (HPA only)')
  .addStringOption(o => o.setName('action').setDescription('Action').setRequired(true)
    .addChoices({ name: 'Send - Post fresh tracker embed', value: 'send' }, { name: 'Refresh - Update existing embed', value: 'refresh' }));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const action = i.options.getString('action', true);
  if (action === 'send') resetTrackerMessageId();
  await updateLogTracker(i.client);
  await i.editReply({ embeds: [successEmbed(action === 'send' ? 'Tracker Posted' : 'Tracker Refreshed', `Log tracker ${action === 'send' ? 'posted' : 'updated'} in <#${config.channels.logTracker}>.`)] });
}
