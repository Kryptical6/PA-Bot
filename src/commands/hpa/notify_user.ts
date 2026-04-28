import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { notifyEmbed, successEmbed } from '../../utils/embeds';
import { safeDM } from '../../services/dmService';

export const data = new SlashCommandBuilder().setName('notify_user').setDescription('Send a structured DM (HPA only)')
  .addStringOption(o => o.setName('type').setDescription('Type').setRequired(true)
    .addChoices({ name: 'Warning', value: 'warning' }, { name: 'Info', value: 'info' }, { name: 'Reminder', value: 'reminder' }))
  .addStringOption(o => o.setName('users').setDescription('User IDs or mentions (space separated)').setRequired(true))
  .addStringOption(o => o.setName('message').setDescription('Message').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const type    = i.options.getString('type', true) as 'warning' | 'info' | 'reminder';
  const usersRaw = i.options.getString('users', true);
  const message = i.options.getString('message', true);
  const userIds = [...usersRaw.matchAll(/\d{17,20}/g)].map(m => m[0]);

  if (userIds.length === 0) { await i.editReply({ content: '❌ No valid user IDs found.' }); return; }
  const embed = notifyEmbed(type, message);
  for (const uid of userIds) await safeDM(i.client, uid, embed, `${type} notification`);
  await i.editReply({ embeds: [successEmbed('Sent', `**${type}** notification sent to **${userIds.length}** user(s).`)] });
}
