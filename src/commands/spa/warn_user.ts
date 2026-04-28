import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isSPA, canLogAgainst } from '../../utils/permissions';
import { errorEmbed, successEmbed, warningEmbed } from '../../utils/embeds';
import { dmUser } from '../../services/dmService';

export const data = new SlashCommandBuilder().setName('warn_user').setDescription('Send a formal warning DM')
  .addUserOption(o => o.setName('user').setDescription('Staff member to warn').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;

  const target = i.options.getMember('user') as GuildMember | null;
  if (!target) { await i.reply({ embeds: [errorEmbed('User not found.')], ephemeral: true }); return; }
  if (!canLogAgainst(m, target)) { await i.reply({ embeds: [errorEmbed('You cannot warn this user.')], ephemeral: true }); return; }

  await i.showModal({
    customId: `warn_user:${target.id}`,
    title: `Warn ${target.displayName}`,
    components: [{ type: 1, components: [{ type: 4, customId: 'message', label: 'Warning message', style: 2, required: true, minLength: 5, maxLength: 1000 }] }]
  });

  const modal = await i.awaitModalSubmit({ time: 300_000, filter: m => m.customId === `warn_user:${target.id}` }).catch(() => null);
  if (!modal) return;
  await modal.deferReply({ ephemeral: true });

  const message = modal.fields.getTextInputValue('message').trim();
  await dmUser(i.client, target.id, { embeds: [warningEmbed('⚠️ Formal Warning', message)] });
  await modal.editReply({ embeds: [successEmbed('Warning Sent', `Warning delivered to <@${target.id}>.`)] });
}
