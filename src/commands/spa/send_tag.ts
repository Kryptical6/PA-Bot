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
  .setName('send-tag')
  .setDescription('Send a knowledge base tag (SPA+)')
  .addStringOption(o => o.setName('delivery').setDescription('How to deliver the tag').setRequired(true)
    .addChoices(
      { name: 'DM a user',                    value: 'user' },
      { name: 'DM a role',                    value: 'role' },
      { name: 'Post in channel',              value: 'channel' },
      { name: 'Auto-send to role (new only)', value: 'auto' },
      { name: 'Manage auto-send sessions',    value: 'manage' },
    ))
  .addUserOption(o => o.setName('user').setDescription('User to DM'))
  .addRoleOption(o => o.setName('role').setDescription('Role to DM or auto-send to'))
  .addChannelOption(o => o.setName('channel').setDescription('Channel to post in'));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const delivery = i.options.getString('delivery', true);

  // ── Manage auto-send sessions ─────────────────────────────────────────────
  if (delivery === 'manage') {
    const sessions = await sql`
      SELECT a.*, t.name as tag_name FROM tag_role_auto a
      JOIN tags t ON a.tag_id = t.id
      ORDER BY a.created_at DESC LIMIT 20
    `;

    if (sessions.length === 0) {
      await i.editReply({ embeds: [errorEmbed('No auto-send sessions found.')] }); return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle('Auto-Send Sessions')
      .setTimestamp();

    for (const s of sessions) {
      const [sentCount] = await sql`SELECT COUNT(*) as c FROM tag_role_sent WHERE session_id = ${s.session_id}`;
      const status = s.active ? 'Active' : 'Inactive';
      embed.addFields({
        name: `${s.session_id} - ${s.tag_name} to <@&${s.role_id}>`,
        value: [
          `Status: **${status}**`,
          `Users sent to: **${sentCount.c}**`,
          `Mode: **${s.replace_existing ? 'Replace' : 'Add alongside'}**`,
          `Created by: <@${s.added_by}>`,
          `Created: <t:${Math.floor(new Date(s.created_at).getTime() / 1000)}:R>`,
          s.deactivated_at ? `Deactivated: <t:${Math.floor(new Date(s.deactivated_at).getTime() / 1000)}:R> by <@${s.deactivated_by}>` : '',
        ].filter(Boolean).join('\n'),
      });
    }

    // Show deactivate buttons for active sessions
    const activeSessions = sessions.filter((s: any) => s.active);
    const btns: ButtonBuilder[] = activeSessions.slice(0, 5).map((s: any) =>
      new ButtonBuilder()
        .setCustomId(`auto_tag_deactivate:${s.session_id}`)
        .setLabel(`Stop ${s.session_id}`)
        .setStyle(ButtonStyle.Danger)
    );

    const components = btns.length > 0
      ? [new ActionRowBuilder<ButtonBuilder>().addComponents(...btns)]
      : [];

    await i.editReply({ embeds: [embed], components });
    return;
  }

  // ── Fetch tags for dropdown ───────────────────────────────────────────────
  const tags = await sql`SELECT id, name, category FROM tags ORDER BY category ASC, name ASC`;
  if (tags.length === 0) { await i.editReply({ embeds: [errorEmbed('No tags exist yet.')] }); return; }

  const tagSelect = new StringSelectMenuBuilder()
    .setCustomId('send_tag_sel')
    .setPlaceholder('Select a tag to send')
    .addOptions(tags.slice(0, 25).map((t: any) =>
      new StringSelectMenuOptionBuilder().setLabel(`[${t.category}] ${t.name}`).setValue(String(t.id))
    ));

  const tagMsg = await i.editReply({
    content: 'Select which tag to send:',
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(tagSelect)],
  });

  const tagSel = await tagMsg.awaitMessageComponent({
    componentType: ComponentType.StringSelect,
    filter: s => s.user.id === i.user.id && s.customId === 'send_tag_sel',
    time: 30_000,
  }).catch(() => null);

  if (!tagSel) { await i.editReply({ content: 'Timed out.', components: [] }); return; }
  await tagSel.deferUpdate();

  const tagId = parseInt(tagSel.values[0]);
  const [tag] = await sql`SELECT * FROM tags WHERE id = ${tagId}`;
  if (!tag) { await i.editReply({ embeds: [errorEmbed('Tag not found.')], components: [] }); return; }

  // ── Auto-send to role (new members only) ─────────────────────────────────
  if (delivery === 'auto') {
    const targetRole = i.options.getRole('role');
    if (!targetRole) { await i.editReply({ embeds: [errorEmbed('Please provide a role option.')] }); return; }

    // Check if an active session already exists for this tag + role
    const existing = await sql`
      SELECT * FROM tag_role_auto
      WHERE tag_id = ${tagId} AND role_id = ${targetRole.id} AND active = true
    `;

    if (existing.length > 0) {
      const s = existing[0];
      const [sentCount] = await sql`SELECT COUNT(*) as c FROM tag_role_sent WHERE session_id = ${s.session_id}`;
      const deactivateBtn = new ButtonBuilder()
        .setCustomId(`auto_tag_deactivate:${s.session_id}`)
        .setLabel(`Deactivate ${s.session_id}`)
        .setStyle(ButtonStyle.Danger);

      await i.editReply({
        embeds: [new EmbedBuilder()
          .setColor(Colors.Orange)
          .setTitle('Session Already Active')
          .setDescription(`An active auto-send session already exists for **${tag.name}** to <@&${targetRole.id}>.\n\nSession ID: **${s.session_id}**\nUsers sent to so far: **${sentCount.c}**\n\nClick below to deactivate it, or leave it running.`)
          .setTimestamp()],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(deactivateBtn)],
      });
      return;
    }

    // Ask replace or add
    const replaceBtn = new ButtonBuilder().setCustomId('auto_replace').setLabel('Replace existing').setStyle(ButtonStyle.Danger);
    const addBtn     = new ButtonBuilder().setCustomId('auto_add').setLabel('Add alongside').setStyle(ButtonStyle.Primary);
    const cancelBtn  = new ButtonBuilder().setCustomId('auto_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary);

    const modeMsg = await i.editReply({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Auto-Send Mode')
        .setDescription(`If a user already received a different tag for the <@&${targetRole.id}> role:\n\n**Replace** - deactivate old session, this tag becomes the only active one for this role\n**Add alongside** - run in parallel with any existing sessions`)
        .setTimestamp()],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(replaceBtn, addBtn, cancelBtn)],
    });

    const modeBtn = await modeMsg.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: b => b.user.id === i.user.id,
      time: 30_000,
    }).catch(() => null);

    if (!modeBtn || modeBtn.customId === 'auto_cancel') {
      await i.editReply({ content: 'Cancelled.', embeds: [], components: [] }); return;
    }
    await modeBtn.deferUpdate();

    const replaceExisting = modeBtn.customId === 'auto_replace';

    // If replacing, deactivate all other active sessions for this role
    if (replaceExisting) {
      await sql`
        UPDATE tag_role_auto SET active = false, deactivated_at = NOW(), deactivated_by = ${i.user.id}
        WHERE role_id = ${targetRole.id} AND active = true
      `;
    }

    // Generate session ID
    const countRow = await sql`SELECT COUNT(*) as c FROM tag_role_auto`;
    const sessionId = `TRA-${String(parseInt(countRow[0].c) + 1).padStart(3, '0')}`;

    // Create session
    await sql`
      INSERT INTO tag_role_auto (session_id, tag_id, role_id, added_by, replace_existing)
      VALUES (${sessionId}, ${tagId}, ${targetRole.id}, ${i.user.id}, ${replaceExisting})
    `;

    // Immediately send to all current role members
    await i.guild!.members.fetch();
    const members = i.guild!.members.cache.filter(mb => mb.roles.cache.has(targetRole.id) && !mb.user.bot);
    let sent = 0; let failed = 0;

    for (const [, member] of members) {
      const result = await dmUser(i.client, member.id, { content: tag.content });
      if (result) {
        sent++;
        await sql`
          INSERT INTO tag_role_sent (session_id, tag_id, role_id, user_id)
          VALUES (${sessionId}, ${tagId}, ${targetRole.id}, ${member.id})
          ON CONFLICT DO NOTHING
        `;
      } else {
        failed++;
      }
    }

    // Log setup
    await logTagSend(i.client, i.user.id, tag.name, `auto:${targetRole.id}`,
      `<@&${targetRole.name}> - Session **${sessionId}** started. Initial send: ${sent} sent, ${failed} failed.`);

    await i.editReply({
      embeds: [successEmbed('Auto-Send Started', [
        `Session ID: **${sessionId}**`,
        `Tag: **${tag.name}**`,
        `Role: <@&${targetRole.id}>`,
        `Initial send: **${sent}** member(s) DM'd${failed > 0 ? `, ${failed} failed` : ''}`,
        `Mode: **${replaceExisting ? 'Replace' : 'Add alongside'}**`,
        ``,
        `New members who gain this role will be DM'd when you manually trigger a check via /send-tag manage.`,
      ].join('\n'))],
      components: [],
    });
    return;
  }

  // ── DM a role (one-time) ─────────────────────────────────────────────────
  if (delivery === 'role') {
    const targetRole = i.options.getRole('role');
    if (!targetRole) { await i.editReply({ embeds: [errorEmbed('Please provide a role.')] }); return; }

    await i.guild!.members.fetch();
    const members = i.guild!.members.cache.filter(mb => mb.roles.cache.has(targetRole.id) && !mb.user.bot);

    const confirmBtn = new ButtonBuilder().setCustomId('send_tag_confirm').setLabel('Send').setStyle(ButtonStyle.Success);
    const cancelBtn  = new ButtonBuilder().setCustomId('send_tag_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary);

    const confirmMsg = await i.editReply({
      embeds: [new EmbedBuilder().setColor(Colors.Yellow).setTitle('Confirm Role DM')
        .setDescription(`You are about to DM **${tag.name}** to **${members.size} member(s)** with <@&${targetRole.id}>.\n\nAre you sure?`)
        .setTimestamp()],
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

    let sent = 0; let failed = 0;
    for (const [, member] of members) {
      const result = await dmUser(i.client, member.id, { content: tag.content });
      result ? sent++ : failed++;
    }

    await logTagSend(i.client, i.user.id, tag.name, `role:${targetRole.id}`,
      `${targetRole.name} (${sent} sent, ${failed} failed)`);
    await i.editReply({
      embeds: [successEmbed('Tag Sent', `**${tag.name}** sent to **${sent}** member(s) with <@&${targetRole.id}>.${failed > 0 ? ` ${failed} failed.` : ''}`)],
      components: [],
    });
    return;
  }

  // ── DM a user ─────────────────────────────────────────────────────────────
  if (delivery === 'user') {
    const targetUser = i.options.getUser('user');
    if (!targetUser) { await i.editReply({ embeds: [errorEmbed('Please provide a user.')] }); return; }
    const result = await dmUser(i.client, targetUser.id, { content: tag.content });
    if (!result) { await i.editReply({ embeds: [errorEmbed(`Failed to DM <@${targetUser.id}>. They may have DMs disabled.`)], components: [] }); return; }
    await logTagSend(i.client, i.user.id, tag.name, `user:${targetUser.id}`, targetUser.username);
    await i.editReply({ embeds: [successEmbed('Tag Sent', `**${tag.name}** sent to <@${targetUser.id}>.`)], components: [] });
    return;
  }

  // ── Post in channel ───────────────────────────────────────────────────────
  if (delivery === 'channel') {
    const targetChannel = i.options.getChannel('channel');
    if (!targetChannel) { await i.editReply({ embeds: [errorEmbed('Please provide a channel.')] }); return; }
    try {
      const ch = await i.client.channels.fetch(targetChannel.id) as TextChannel;
      await ch.send({ content: tag.content });
      await logTagSend(i.client, i.user.id, tag.name, `channel:${targetChannel.id}`, `<#${targetChannel.id}>`);
      await i.editReply({ embeds: [successEmbed('Tag Sent', `**${tag.name}** posted in <#${targetChannel.id}>.`)], components: [] });
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
        { name: 'Tag',          value: tagName,        inline: true },
        { name: 'Sent by',      value: `<@${sentBy}>`, inline: true },
        { name: 'Delivered to', value: targetLabel,    inline: true },
      )
      .setTimestamp();
    await ch.send({ embeds: [embed] });
  } catch { /* silent */ }
}
