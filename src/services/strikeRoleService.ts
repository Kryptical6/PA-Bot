import { Client, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { sql } from '../database/client';

export const STRIKE_ROLE_IDS: Record<number, string> = {
  1: '1372621584036134922',
  2: '1372621626134233148',
};

export async function getActiveStrikeCount(userId: string): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*) as count FROM logs
    WHERE user_id = ${userId} AND type = 'strike' AND expires_at > NOW()
  `;
  return parseInt(rows[0]?.count) || 0;
}

export async function syncStrikeRole(client: Client, userId: string, guildId: string): Promise<void> {
  try {
    // Use cache first, fall back to fetch
    const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId);
    const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch((e: any) => { console.error(`Failed to fetch member ${userId}:`, e); return null; });
    if (!member) { console.error(`syncStrikeRole: member ${userId} not found in guild`); return; }

    const count = await getActiveStrikeCount(userId);
    console.log(`syncStrikeRole: user=${userId} activeStrikes=${count}`);

    // Remove all strike roles first
    for (const roleId of Object.values(STRIKE_ROLE_IDS)) {
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId).catch((e: any) => console.error(`Failed to remove role ${roleId}:`, e));
      }
    }

    // Add correct role for 1 or 2 strikes (3+ = no role, HPA flagged separately)
    if (count === 1 || count === 2) {
      const roleId = STRIKE_ROLE_IDS[count];
      console.log(`syncStrikeRole: assigning role ${roleId} to ${userId}`);
      await member.roles.add(roleId).catch((e: any) => console.error(`Failed to add role ${roleId} to ${userId}:`, e));
    }
  } catch (e) {
    console.error(`Failed to sync strike role for ${userId}:`, e);
  }
}

export function buildStrikeRolePrompt(userId: string, strikeCount: number): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } | null {
  if (strikeCount < 1 || strikeCount > 2) return null;

  const roleId   = STRIKE_ROLE_IDS[strikeCount];
  const roleName = strikeCount === 1 ? 'Strike 1' : 'Strike 2';

  const embed = new EmbedBuilder()
    .setColor(strikeCount === 1 ? Colors.Orange : Colors.Red)
    .setTitle('Assign Strike Role?')
    .setDescription(`<@${userId}> now has **${strikeCount}** active strike(s).\n\nWould you like to assign the <@&${roleId}> role?`)
    .setTimestamp();

  const assignBtn = new ButtonBuilder()
    .setCustomId(`strike_role_assign:${userId}:${strikeCount}`)
    .setLabel(`Assign ${roleName} Role`)
    .setStyle(strikeCount === 1 ? ButtonStyle.Primary : ButtonStyle.Danger);

  const skipBtn = new ButtonBuilder()
    .setCustomId(`strike_role_skip:${userId}`)
    .setLabel('No Role')
    .setStyle(ButtonStyle.Secondary);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(assignBtn, skipBtn)],
  };
}
