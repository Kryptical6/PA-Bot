import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isSPA, canLogAgainst } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';

export const data = new SlashCommandBuilder()
  .setName('log_mistake')
  .setDescription('Submit a mistake for HPA review')
  .addUserOption(o => o.setName('user').setDescription('Staff member to log').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;

  const target = i.options.getMember('user') as GuildMember | null;
  if (!target) { await i.reply({ embeds: [errorEmbed('User not found.')], ephemeral: true }); return; }
  if (!canLogAgainst(m, target)) { await i.reply({ embeds: [errorEmbed('You cannot log a mistake against this user.')], ephemeral: true }); return; }

  const today = new Date().toISOString().split('T')[0];
  await i.showModal({
    customId: `log_mistake:${target.id}`,
    title: 'Log a Mistake',
    components: [
      { type: 1, components: [{ type: 4, customId: 'post_id', label: 'Post ID', style: 1, required: true, maxLength: 200 }] },
      { type: 1, components: [{ type: 4, customId: 'date', label: 'Date (YYYY-MM-DD)', style: 1, required: true, value: today }] },
      { type: 1, components: [{ type: 4, customId: 'reason', label: 'Reason', style: 2, required: true, minLength: 5, maxLength: 1000 }] },
    ]
  });
}
