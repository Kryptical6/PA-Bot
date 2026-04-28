import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors } from 'discord.js';
import { isSPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';

export const data = new SlashCommandBuilder()
  .setName('create_embed')
  .setDescription('Create a custom embed in a channel')
  .addChannelOption(o => o.setName('channel').setDescription('Channel to post the embed in').setRequired(true))
  .addStringOption(o => o.setName('color').setDescription('Embed color').setRequired(false)
    .addChoices(
      { name: 'Blue',   value: 'blue' },
      { name: 'Green',  value: 'green' },
      { name: 'Red',    value: 'red' },
      { name: 'Yellow', value: 'yellow' },
      { name: 'Purple', value: 'purple' },
      { name: 'Orange', value: 'orange' },
      { name: 'White',  value: 'white' },
    ));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;

  const channel = i.options.getChannel('channel', true);
  const color   = i.options.getString('color') ?? 'blue';

  await i.showModal({
    customId: `create_embed_modal:${channel.id}:${color}`,
    title: 'Create Embed',
    components: [
      { type: 1, components: [{ type: 4, customId: 'title', label: 'Title (optional)', style: 1, required: false, maxLength: 256 }] },
      { type: 1, components: [{ type: 4, customId: 'content', label: 'Content', style: 2, required: true, minLength: 1, maxLength: 4000 }] },
      { type: 1, components: [{ type: 4, customId: 'footer', label: 'Footer (optional)', style: 1, required: false, maxLength: 2048 }] },
    ]
  });
}
