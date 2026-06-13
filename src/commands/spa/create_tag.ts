import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isSPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder()
  .setName('create-tag')
  .setDescription('Create a knowledge base tag (SPA+)')
  .addStringOption(o => o.setName('category').setDescription('Tag category').setRequired(true)
    .addChoices(
      { name: 'Rules',     value: 'Rules' },
      { name: 'Guides',    value: 'Guides' },
      { name: 'Resources', value: 'Resources' },
      { name: 'Other',     value: 'Other' },
    ));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;

  const category = i.options.getString('category', true);

  await i.showModal({
    customId: `create_tag_modal:${category}`,
    title: `Create a Tag — ${category}`,
    components: [
      { type: 1, components: [{ type: 4, customId: 'tag_name', label: 'Tag Name', style: 1, required: true, minLength: 2, maxLength: 50, placeholder: 'e.g. borderline_nsfw' }] },
      { type: 1, components: [{ type: 4, customId: 'tag_content', label: 'Content', style: 2, required: true, minLength: 5, maxLength: 1000 }] },
    ]
  });
}
