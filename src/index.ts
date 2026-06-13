import { Client, GatewayIntentBits, Partials, EmbedBuilder, Colors, Events } from 'discord.js';
import * as dotenv from 'dotenv';
dotenv.config();

import { handleInteraction } from './handlers/interactionHandler';
import { onReady } from './events/ready';
import { onGuildMemberRemove } from './events/guildMemberRemove';
import { getRecentErrors } from './services/errorService';
import { isHPA } from './utils/permissions';
import { config } from './config';
import { embedDescription, embedField, embedFooter, embedTitle } from './utils/embeds';

if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN not set in .env');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.GuildMember, Partials.Message],
});

client.once(Events.ClientReady, () => onReady(client));
client.on('interactionCreate', handleInteraction);
client.on('guildMemberRemove', onGuildMemberRemove);

// ─── !!audit-log MESSAGE COMMAND ──────────────────────────────────────────────
client.on('messageCreate', async msg => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith('!!audit-log')) return;

  // HPA only
  const member = msg.guild?.members.cache.get(msg.author.id) ?? await msg.guild?.members.fetch(msg.author.id).catch(() => null);
  if (!member || !isHPA(member)) {
    await msg.reply('You do not have permission to use this command.').catch(() => {});
    return;
  }

  try {
    const errors = await getRecentErrors(10);

    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle(embedTitle('Bot Error Log'))
      .setDescription(embedDescription(errors.length === 0 ? 'No errors recorded.' : `Last ${errors.length} error(s):`))
      .setFooter({ text: embedFooter('Showing last 10 errors. Use /bot-bug to report one.') })
      .setTimestamp();

    for (const e of errors) {
      const ts      = `<t:${Math.floor(new Date(e.created_at).getTime() / 1000)}:R>`;
      const reported = e.reported ? ' (Reported)' : '';
      embed.addFields(embedField(
        `${e.code}${reported} - ${e.command}`,
        `${ts} - <@${e.user_id}>\n\`${String(e.message ?? '').slice(0, 200)}\``,
      ));
    }

    await msg.reply({ embeds: [embed] });
  } catch (err) {
    console.error('!!audit-log error:', err);
    await msg.reply('Failed to fetch error log.').catch(() => {});
  }
});

client.login(process.env.DISCORD_TOKEN);
