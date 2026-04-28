import { Client } from 'discord.js';
import { runStartupChecks, startScheduler } from '../utils/scheduler';
import { sql } from '../database/client';

export async function onReady(client: Client): Promise<void> {
  console.log(`✅ Logged in as ${client.user?.tag}`);
  try {
    await sql`SELECT 1`;
    console.log('✅ Database connected');
  } catch (e) {
    console.error('❌ Database connection failed:', e);
  }
  await runStartupChecks(client);
  startScheduler(client);
}
