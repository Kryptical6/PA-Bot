import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isSPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';

export const data = new SlashCommandBuilder()
  .setName('warn_user')
  .setDescription('Send a formal warning DM to a staff member (SPA+)')
  .addUserOption(o => o.setName('user').setDescription('Staff member to warn').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;

  const target = i.options.getMember('user') as GuildMember | null;
  if (!target || target.id === i.user.id) {
    await i.reply({ embeds: [errorEmbed('Invalid user.')], ephemeral: true }); return;
  }

  await i.showModal({
    customId: `warn_user:${target.id}`,
    title: `Warn ${target.displayName}`,
    components: [
      { type: 1, components: [{ type: 4, customId: 'reason', label: 'Warning reason', style: 2, required: true, minLength: 10, maxLength: 1000 }] },
    ]
  });
}
