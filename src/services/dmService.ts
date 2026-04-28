import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { config } from '../config';

export async function safeDM(client: Client, userId: string, embed: EmbedBuilder, context: string): Promise<void> {
  try {
    const user = await client.users.fetch(userId);
    const dm = await user.createDM();
    await dm.send({ embeds: [embed] });
  } catch {
    try {
      const ch = await client.channels.fetch(config.channels.hpaReview) as TextChannel;
      await ch.send(`⚠️ Failed to DM <@${userId}> for: ${context}. Please notify them manually.`);
    } catch { /* silent */ }
  }
}

export async function dmUser(client: Client, userId: string, payload: any): Promise<boolean> {
  try {
    const user = await client.users.fetch(userId);
    const dm = await user.createDM();
    await dm.send(payload);
    return true;
  } catch (e) {
    console.error(`Failed to DM ${userId}:`, e);
    return false;
  }
}
