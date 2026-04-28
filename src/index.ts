import { Client, GatewayIntentBits, Partials } from 'discord.js';
import * as dotenv from 'dotenv';
dotenv.config();

import { handleInteraction } from './handlers/interactionHandler';
import { onReady } from './events/ready';
import { onGuildMemberRemove } from './events/guildMemberRemove';

if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN not set in .env');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.GuildMember, Partials.Message],
});

client.once('ready', () => onReady(client));
client.on('interactionCreate', handleInteraction);
client.on('guildMemberRemove', onGuildMemberRemove);

client.login(process.env.DISCORD_TOKEN);
