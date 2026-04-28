import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType, ButtonBuilder, ButtonStyle } from 'discord.js';
import { isSPA } from '../../utils/permissions';
import { errorEmbed, successEmbed, infoEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder().setName('create_tag').setDescription('Create a knowledge base tag');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;

  await i.showModal({
    customId: 'create_tag_modal',
    title: 'Create a Tag',
    components: [
      { type: 1, components: [{ type: 4, customId: 'tag_name', label: 'Tag Name', style: 1, required: true, minLength: 2, maxLength: 50, placeholder: 'e.g. borderline_nsfw' }] },
      { type: 1, components: [{ type: 4, customId: 'tag_content', label: 'Content', style: 2, required: true, minLength: 5, maxLength: 1000 }] },
    ]
  });

  const modal = await i.awaitModalSubmit({ time: 300_000, filter: m => m.customId === 'create_tag_modal' }).catch(() => null);
  if (!modal) return;
  await modal.deferReply({ ephemeral: true });

  const name    = modal.fields.getTextInputValue('tag_name').trim().toLowerCase().replace(/\s+/g, '_');
  const content = modal.fields.getTextInputValue('tag_content').trim();

  const existing = await sql`SELECT 1 FROM tags WHERE name = ${name}`;
  if (existing.length > 0) { await modal.editReply({ embeds: [errorEmbed(`Tag **${name}** already exists.`)] }); return; }

  const count = await sql`SELECT COUNT(*) as count FROM tags`;
  if (parseInt(count[0].count) >= 30) { await modal.editReply({ embeds: [errorEmbed('Tag limit of 30 reached.')] }); return; }

  await sql`INSERT INTO tags (name, content, created_by) VALUES (${name}, ${content}, ${i.user.id})`;
  await modal.editReply({ embeds: [successEmbed('Tag Created', `Tag **${name}** is now available.`)] });
}
