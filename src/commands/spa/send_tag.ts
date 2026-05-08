import {
  ChatInputCommandInteraction, SlashCommandBuilder, GuildMember,
  EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder,
  TextChannel, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ComponentType
} from 'discord.js';
import { isSPA, isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { config } from '../../config';
import { dmUser } from '../../services/dmService';

export const data = new SlashCommandBuilder()
  .setName('send_tag')
  .setDescription('Send a knowledge base tag to a user, role, or channel (SPA+)')
  .addStringOption(o => o.setName('delivery').setDescription('How to deliver the tag').setRequired(true)
    .addChoices(
      { name: 'DM a user',      value: 'user' },
      { name: 'DM a role',      value: 'role' },
      { name: 'Post in channel', value: 'channel' },
    ))
  .addUserOption(o => o.setName('user').setDescription('User to DM (if delivery = DM a user)'))
  .addRoleOption(o => o.setName('role').setDescription('Role to DM (if delivery = DM a role)'))
  .addChannelOption(o => o.setName('channel').setDescription('Channel to post in (if delivery = Post in channel)'));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const delivery = i.options.getString('delivery', true);
  const targetUser    = i.options.getUser('user');
  const targetRole    = i.options.getRole('role');
  const targetChannel = i.options.getChannel('channel');

  // Validate target
  if (delivery === 'user' && !targetUser) {
    await i.editReply({ embeds: [errorEmbed('Please provide a user to DM.')] }); return;
  }
  if (delivery === 'role' && !targetRole) {
    await i.editReply({ embeds: [errorEmbed('Please provide a role to DM.')] }); return;
  }
  if (delivery === 'channel' && !targetChannel) {
    await i.editReply({ embeds: [errorEmbed('Please provide a channel to post in.')] }); return;
  }

  // Fetch tags for dropdown
  const tags = await sql`SELECT id, name, category FROM tags ORDER BY category ASC, name ASC`;
  if (tags.length === 0) {
    await i.editReply({ embeds: [errorEmbed('No tags exist yet.')] }); return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('send_tag_sel')
    .setPlaceholder('Select a tag to send')
    .addOptions(tags.slice(0, 25).map((t: any) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`[${t.category}] ${t.name}`)
        .setValue(String(t.id))
    ));

  const msg = await i.editReply({
    content: 'Select which tag to send:',
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  });

  const sel = await msg.awaitMessageComponent({
    componentType: ComponentType.StringSelect,
    filter: s => s.user.id === i.user.id && s.customId === 'send_tag_sel',
    time: 30_000,
  }).catch(() => null);

  if (!sel) { await i.editReply({ content: 'Timed out.', components: [] }); return; }
  await sel.deferUpdate();

  const tagId = parseInt(sel.values[0]);
  const [tag] = await sql`SELECT * FROM tags WHERE id = ${tagId}`;
  if (!tag) { await i.editReply({ embeds: [errorEmbed('Tag not found.')], components: [] }); return; }

  // For role delivery — show confirmation with member count
  if (delivery === 'role') {
    await i.guild!.members.fetch();
    const members = i.guild!.members.cache.filter(mb =>
      mb.roles.cache.has(targetRole!.id) && !mb.user.bot
    );
    const count = members.size;

    const confirmEmbed = new EmbedBuilder()
      .setColor(Colors.Yellow)
      .setTitle('Confirm Role DM')
      .setDescription(`You are about to DM the **${tag.name}** tag to **${count} member(s)** with the <@&${targetRole!.id}> role.\n\nAre you sure?`)
      .setTimestamp();

    const confirmBtn = new ButtonBuilder().setCustomId('send_tag_confirm').setLabel('Send').setStyle(ButtonStyle.Success);
    const cancelBtn  = new ButtonBuilder().setCustomId('send_tag_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary);

    const confirmMsg = await i.editReply({
      content: '',
      embeds: [confirmEmbed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, cancelBtn)],
    });

    const btn = await confirmMsg.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: b => b.user.id === i.user.id,
      time: 30_000,
    }).catch(() => null);

    if (!btn || btn.customId === 'send_tag_cancel') {
      await i.editReply({ content: 'Cancelled.', embeds: [], components: [] }); return;
    }
    await btn.deferUpdate();

    // Send to all role members
    let sent = 0; let failed = 0;
    for (const [, member] of members) {
      const result = await dmUser(i.client, member.id, { content: tag.content });
      result ? sent++ : failed++;
    }

    await logTagSend(i.client, i.user.id, tag.name, `role:${targetRole!.id}`, `${targetRole!.name} (${sent} sent, ${failed} failed)`);
    await i.editReply({
      embeds: [successEmbed('Tag Sent', `**${tag.name}** sent to **${sent}** member(s) with <@&${targetRole!.id}>.${failed > 0 ? ` ${failed} failed (DMs disabled).` : ''}`)],
      components: [],
    });
    return;
  }

  // DM a single user
  if (delivery === 'user') {
    const result = await dmUser(i.client, targetUser!.id, { content: tag.content });
    if (!result) {
      await i.editReply({ embeds: [errorEmbed(`Failed to DM <@${targetUser!.id}>. They may have DMs disabled.`)], components: [] }); return;
    }
    await logTagSend(i.client, i.user.id, tag.name, `user:${targetUser!.id}`, targetUser!.username);
    await i.editReply({ embeds: [successEmbed('Tag Sent', `**${tag.name}** sent to <@${targetUser!.id}>.`)], components: [] });
    return;
  }

  // Post in channel
  if (delivery === 'channel') {
    try {
      const ch = await i.client.channels.fetch(targetChannel!.id) as TextChannel;
      await ch.send({ content: tag.content });
      await logTagSend(i.client, i.user.id, tag.name, `channel:${targetChannel!.id}`, `<#${targetChannel!.id}>`);
      await i.editReply({ embeds: [successEmbed('Tag Sent', `**${tag.name}** posted in <#${targetChannel!.id}>.`)], components: [] });
    } catch {
      await i.editReply({ embeds: [errorEmbed('Failed to post in that channel. Check bot permissions.')], components: [] });
    }
  }
}

async function logTagSend(client: any, sentBy: string, tagName: string, targetType: string, targetLabel: string): Promise<void> {
  try {
    const ch = await client.channels.fetch('1497723319829401750') as TextChannel;
    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle('Tag Sent')
      .addFields(
        { name: 'Tag',       value: tagName,              inline: true },
        { name: 'Sent by',   value: `<@${sentBy}>`,       inline: true },
        { name: 'Delivered to', value: targetLabel,       inline: true },
      )
      .setTimestamp();
    await ch.send({ embeds: [embed] });
  } catch { /* silent */ }
}
