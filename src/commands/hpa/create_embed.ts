import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, TextChannel, EmbedBuilder, Colors } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';

export const data = new SlashCommandBuilder()
  .setName('create-embed')
  .setDescription('Create a custom embed in a channel (HPA only)')
  .addChannelOption(o => o.setName('channel').setDescription('Channel to post the embed in').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;

  const channel = i.options.getChannel('channel', true);

  await i.showModal({
    customId: `create_embed_modal:${channel.id}`,
    title: 'Create Embed',
    components: [
      { type: 1, components: [{ type: 4, customId: 'title', label: 'Title (optional)', style: 1, required: false, maxLength: 256, placeholder: 'Leave blank for no title' }] },
      { type: 1, components: [{ type: 4, customId: 'description', label: 'Content', style: 2, required: true, minLength: 1, maxLength: 4000, placeholder: 'Supports **bold**, *italic*, and other markdown' }] },
      { type: 1, components: [{ type: 4, customId: 'color', label: 'Colour (hex e.g. #5865F2, leave blank for default)', style: 1, required: false, maxLength: 7, placeholder: '#5865F2' }] },
      { type: 1, components: [{ type: 4, customId: 'footer', label: 'Footer text (optional)', style: 1, required: false, maxLength: 2048 }] },
    ]
  });

  const modal = await i.awaitModalSubmit({ time: 300_000, filter: m => m.customId === `create_embed_modal:${channel.id}` }).catch(() => null);
  if (!modal) return;
  await modal.deferReply({ ephemeral: true });

  const title       = modal.fields.getTextInputValue('title').trim() || null;
  const description = modal.fields.getTextInputValue('description').trim();
  const colorRaw    = modal.fields.getTextInputValue('color').trim();
  const footer      = modal.fields.getTextInputValue('footer').trim() || null;

  // Parse color
  let color: number = Colors.Blue;
  if (colorRaw) {
    const hex = colorRaw.replace('#', '');
    const parsed = parseInt(hex, 16);
    if (!isNaN(parsed)) color = parsed;
  }

  const embed = new EmbedBuilder().setColor(color).setDescription(description).setTimestamp();
  if (title) embed.setTitle(title);
  if (footer) embed.setFooter({ text: footer });

  try {
    const ch = await i.guild!.channels.fetch(channel.id) as TextChannel;
    const msg = await ch.send({ embeds: [embed] });
    await modal.editReply({ content: `✅ Embed posted in <#${channel.id}>!\nMessage ID: \`${msg.id}\` (save this to edit later)` });
  } catch (e) {
    await modal.editReply({ embeds: [errorEmbed(`Failed to post embed. Make sure I have permission to send messages in <#${channel.id}>.`)] });
  }
}
