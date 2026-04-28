import { Client, EmbedBuilder, Colors, TextChannel } from 'discord.js';
import { sql } from '../database/client';
import { config } from '../config';

let trackerMessageIds: string[] = [];

export function resetTrackerMessageId(): void { trackerMessageIds = []; }

export async function updateLogTracker(client: Client): Promise<void> {
  try {
    const channel = await client.channels.fetch(config.channels.logTracker) as TextChannel;
    if (!channel) return;

    await channel.guild.members.fetch();
    const staffMembers = Array.from(channel.guild.members.cache.values()).filter(m =>
      (m.roles.cache.has(config.roles.PA) || m.roles.cache.has(config.roles.SPA)) && !m.user.bot
    );

    const rows = await sql`
      SELECT user_id,
        COUNT(*) FILTER (WHERE type = 'mistake') AS mistakes,
        COUNT(*) FILTER (WHERE type = 'strike') AS strikes
      FROM logs WHERE expires_at > NOW() GROUP BY user_id
    `;

    const logMap = new Map(rows.map((r: any) => [r.user_id, { mistakes: parseInt(r.mistakes), strikes: parseInt(r.strikes) }]));

    const entries = staffMembers
      .map(m => ({ member: m, ...(logMap.get(m.id) ?? { mistakes: 0, strikes: 0 }) }))
      .sort((a, b) => (b.mistakes + b.strikes) - (a.mistakes + a.strikes) || a.member.displayName.localeCompare(b.member.displayName))
      .map(e => `<@${e.member.id}>\n⚠️ **${e.mistakes}** mistake(s)  •  ❌ **${e.strikes}** strike(s)`);

    if (entries.length === 0) entries.push('No staff found.');

    const PAGE = 15;
    const chunks: string[][] = [];
    for (let i = 0; i < entries.length; i += PAGE) chunks.push(entries.slice(i, i + PAGE));

    const embeds = chunks.map((chunk, i) =>
      new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(chunks.length > 1 ? `📋 Staff Log Tracker (${i + 1}/${chunks.length})` : '📋 Staff Log Tracker')
        .setDescription(chunk.join('\n\n'))
        .setFooter({ text: `${staffMembers.length} staff members` })
        .setTimestamp()
    );

    await syncMessages(client, channel, embeds);
  } catch (e) { console.error('Log tracker error:', e); }
}

async function syncMessages(client: Client, channel: TextChannel, embeds: EmbedBuilder[]): Promise<void> {
  if (trackerMessageIds.length > 0) {
    try {
      for (let i = 0; i < trackerMessageIds.length; i++) {
        const msg = await channel.messages.fetch(trackerMessageIds[i]);
        if (i < embeds.length) await msg.edit({ embeds: [embeds[i]] });
        else await msg.delete().catch(() => {});
      }
      for (let i = trackerMessageIds.length; i < embeds.length; i++) {
        const msg = await channel.send({ embeds: [embeds[i]] });
        trackerMessageIds.push(msg.id);
      }
      trackerMessageIds = trackerMessageIds.slice(0, embeds.length);
      return;
    } catch { trackerMessageIds = []; }
  }

  const recent = await channel.messages.fetch({ limit: 50 });
  const ours = Array.from(recent.values())
    .filter(m => m.author.id === client.user?.id && m.embeds[0]?.title?.startsWith('📋 Staff Log Tracker'))
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  trackerMessageIds = [];
  if (ours.length > 0) {
    for (let i = 0; i < Math.max(ours.length, embeds.length); i++) {
      if (i < ours.length && i < embeds.length) { await ours[i].edit({ embeds: [embeds[i]] }); trackerMessageIds.push(ours[i].id); }
      else if (i >= ours.length) { const msg = await channel.send({ embeds: [embeds[i]] }); trackerMessageIds.push(msg.id); }
      else await ours[i].delete().catch(() => {});
    }
  } else {
    for (const embed of embeds) { const msg = await channel.send({ embeds: [embed] }); trackerMessageIds.push(msg.id); }
  }
}
