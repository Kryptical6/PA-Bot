import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, TextChannel, EmbedBuilder } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';

export const data = new SlashCommandBuilder()
  .setName('edit-embed')
  .setDescription('Edit an existing embed (HPA only)')
  .addChannelOption(o => o.setName('channel').setDescription('Channel the embed is in').setRequired(true))
  .addStringOption(o => o.setName('message_id').setDescription('Message ID of the embed to edit').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;

  const channel   = i.options.getChannel('channel', true);
  const messageId = i.options.getString('message_id', true).trim();

  // Fetch the message first to pre-fill the modal
  let existingTitle       = '';
  let existingDescription = '';
  let existingFooter      = '';
  let existingColor       = '#5865F2';

  try {
    const ch  = await i.guild!.channels.fetch(channel.id) as TextChannel;
    const msg = await ch.messages.fetch(messageId);

    if (msg.author.id !== i.client.user?.id) {
      await i.reply({ embeds: [errorEmbed('That message was not sent by me.')], ephemeral: true });
      return;
    }

    if (msg.embeds.length === 0) {
      await i.reply({ embeds: [errorEmbed('That message does not contain an embed.')], ephemeral: true });
      return;
    }

    const embed = msg.embeds[0];
    existingTitle       = embed.title ?? '';
    existingDescription = embed.description ?? '';
    existingFooter      = embed.footer?.text ?? '';
    if (embed.color) existingColor = `#${embed.color.toString(16).padStart(6, '0')}`;
  } catch {
    await i.reply({ embeds: [errorEmbed('Could not find that message. Check the channel and message ID.')], ephemeral: true });
    return;
  }

  await i.showModal({
    customId: `edit_embed_modal:${channel.id}:${messageId}`,
    title: 'Edit Embed',
    components: [
      { type: 1, components: [{ type: 4, customId: 'title', label: 'Title (leave blank to remove)', style: 1, required: false, maxLength: 256, value: existingTitle }] },
      { type: 1, components: [{ type: 4, customId: 'description', label: 'Content', style: 2, required: true, minLength: 1, maxLength: 4000, value: existingDescription }] },
      { type: 1, components: [{ type: 4, customId: 'color', label: 'Colour (hex e.g. #5865F2)', style: 1, required: false, maxLength: 7, value: existingColor }] },
      { type: 1, components: [{ type: 4, customId: 'footer', label: 'Footer text (leave blank to remove)', style: 1, required: false, maxLength: 2048, value: existingFooter }] },
    ]
  });

  const modal = await i.awaitModalSubmit({ time: 300_000, filter: m => m.customId === `edit_embed_modal:${channel.id}:${messageId}` }).catch(() => null);
  if (!modal) return;
  await modal.deferReply({ ephemeral: true });

  const title       = modal.fields.getTextInputValue('title').trim() || null;
  const description = modal.fields.getTextInputValue('description').trim();
  const colorRaw    = modal.fields.getTextInputValue('color').trim();
  const footer      = modal.fields.getTextInputValue('footer').trim() || null;

  let color: number = 0x5865F2;
  if (colorRaw) {
    const hex = colorRaw.replace('#', '');
    const parsed = parseInt(hex, 16);
    if (!isNaN(parsed)) color = parsed;
  }

  const newEmbed = new EmbedBuilder().setColor(color).setDescription(description).setTimestamp();
  if (title) newEmbed.setTitle(title);
  if (footer) newEmbed.setFooter({ text: footer });

  try {
    const ch  = await i.guild!.channels.fetch(channel.id) as TextChannel;
    const msg = await ch.messages.fetch(messageId);
    await msg.edit({ embeds: [newEmbed] });
    await modal.editReply({ content: `✅ Embed updated in <#${channel.id}>.` });
  } catch {
    await modal.editReply({ embeds: [errorEmbed('Failed to edit the embed.')] });
  }
}
