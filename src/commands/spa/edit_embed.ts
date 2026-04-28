import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, TextChannel } from 'discord.js';
import { isSPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';

export const data = new SlashCommandBuilder()
  .setName('edit_embed')
  .setDescription('Edit an existing embed posted by the bot')
  .addStringOption(o => o.setName('message_id').setDescription('The message ID of the embed to edit').setRequired(true))
  .addChannelOption(o => o.setName('channel').setDescription('Channel the embed is in').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;

  const messageId = i.options.getString('message_id', true).trim();
  const channel   = i.options.getChannel('channel', true);

  // Verify the message exists and was posted by the bot
  try {
    const ch  = await i.client.channels.fetch(channel.id) as TextChannel;
    const msg = await ch.messages.fetch(messageId);

    if (msg.author.id !== i.client.user?.id) {
      await i.reply({ embeds: [errorEmbed('That message was not posted by me.')], ephemeral: true });
      return;
    }

    const existingEmbed = msg.embeds[0];
    await i.showModal({
      customId: `edit_embed_modal:${channel.id}:${messageId}`,
      title: 'Edit Embed',
      components: [
        { type: 1, components: [{ type: 4, customId: 'title', label: 'Title (optional)', style: 1, required: false, maxLength: 256, value: existingEmbed?.title ?? '' }] },
        { type: 1, components: [{ type: 4, customId: 'content', label: 'Content', style: 2, required: true, minLength: 1, maxLength: 4000, value: existingEmbed?.description ?? '' }] },
        { type: 1, components: [{ type: 4, customId: 'footer', label: 'Footer (optional)', style: 1, required: false, maxLength: 2048, value: existingEmbed?.footer?.text ?? '' }] },
      ]
    });
  } catch {
    await i.reply({ embeds: [errorEmbed('Could not find that message. Make sure the message ID and channel are correct.')], ephemeral: true });
  }
}
