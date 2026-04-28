import { EmbedBuilder, Colors } from 'discord.js';

export const successEmbed = (title: string, desc: string) =>
  new EmbedBuilder().setColor(Colors.Green).setTitle(`✅ ${title}`).setDescription(desc).setTimestamp();

export const errorEmbed = (desc: string) =>
  new EmbedBuilder().setColor(Colors.Red).setTitle('❌ Error').setDescription(desc).setTimestamp();

export const infoEmbed = (title: string, desc: string) =>
  new EmbedBuilder().setColor(Colors.Blue).setTitle(`ℹ️ ${title}`).setDescription(desc).setTimestamp();

export const warningEmbed = (title: string, desc: string) =>
  new EmbedBuilder().setColor(Colors.Orange).setTitle(`⚠️ ${title}`).setDescription(desc).setTimestamp();

export const notifyEmbed = (type: 'warning' | 'info' | 'reminder', message: string) => {
  const map = {
    warning:  { color: Colors.Red,    title: '⚠️ Warning' },
    info:     { color: Colors.Blue,   title: 'ℹ️ Information' },
    reminder: { color: Colors.Yellow, title: '🔔 Reminder' },
  };
  return new EmbedBuilder().setColor(map[type].color).setTitle(map[type].title).setDescription(message).setTimestamp();
};

export const pendingLogEmbed = (d: { userId: string; postId: string; reason: string; loggedBy: string; date: string; pendingId: number }) =>
  new EmbedBuilder()
    .setColor(Colors.Yellow)
    .setTitle('📋 Pending Log Review')
    .addFields(
      { name: 'Target',     value: `<@${d.userId}>`,   inline: true },
      { name: 'Logged By',  value: `<@${d.loggedBy}>`, inline: true },
      { name: 'Post ID',    value: d.postId,            inline: true },
      { name: 'Date',       value: d.date,              inline: true },
      { name: 'Reason',     value: d.reason },
    )
    .setFooter({ text: `Pending ID: ${d.pendingId}` })
    .setTimestamp();

export const appealEmbed = (d: { userId: string; logId: number; reason: string; logType: string; logReason: string; appealId: number }) =>
  new EmbedBuilder()
    .setColor(Colors.Purple)
    .setTitle('⚖️ Appeal Request')
    .addFields(
      { name: 'Appellant',   value: `<@${d.userId}>`, inline: true },
      { name: 'Log Type',    value: d.logType,         inline: true },
      { name: 'Log Reason',  value: d.logReason },
      { name: 'Appeal Reason', value: d.reason },
    )
    .setFooter({ text: `Appeal ID: ${d.appealId} | Log ID: ${d.logId}` })
    .setTimestamp();
