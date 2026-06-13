import { EmbedBuilder, Colors } from 'discord.js';

const FALLBACK_TEXT = 'Not provided';

export function truncateText(value: unknown, maxLength: number, fallback = FALLBACK_TEXT): string {
  const text = value === null || value === undefined ? '' : String(value).trim();
  const safe = text.length > 0 ? text : fallback;
  if (safe.length <= maxLength) return safe;
  return `${safe.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function embedTitle(value: unknown): string {
  return truncateText(value, 256, 'Untitled');
}

export function embedDescription(value: unknown): string {
  return truncateText(value, 4096);
}

export function embedFooter(value: unknown): string {
  return truncateText(value, 2048);
}

export function embedField(name: unknown, value: unknown, inline = false): { name: string; value: string; inline?: boolean } {
  return {
    name: truncateText(name, 256, 'Field'),
    value: truncateText(value, 1024),
    inline,
  };
}

export const successEmbed = (title: string, desc: string) =>
  new EmbedBuilder().setColor(Colors.Green).setTitle(embedTitle(title)).setDescription(embedDescription(desc)).setTimestamp();

export const errorEmbed = (desc: string) =>
  new EmbedBuilder().setColor(Colors.Red).setTitle('Error').setDescription(embedDescription(desc)).setTimestamp();

export const infoEmbed = (title: string, desc: string) =>
  new EmbedBuilder().setColor(Colors.Blue).setTitle(embedTitle(title)).setDescription(embedDescription(desc)).setTimestamp();

export const warningEmbed = (title: string, desc: string) =>
  new EmbedBuilder().setColor(Colors.Orange).setTitle(embedTitle(title)).setDescription(embedDescription(desc)).setTimestamp();

export const notifyEmbed = (type: 'warning' | 'info' | 'reminder', message: string) => {
  const map = {
    warning:  { color: Colors.Red,    title: 'Warning' },
    info:     { color: Colors.Blue,   title: 'Information' },
    reminder: { color: Colors.Yellow, title: 'Reminder' },
  };
  return new EmbedBuilder().setColor(map[type].color).setTitle(map[type].title).setDescription(embedDescription(message)).setTimestamp();
};

export const pendingLogEmbed = (d: { userId: string; postId: string; reason: string; loggedBy: string; date: string; pendingId: number; severity?: string }) => {
  const severityColors: Record<string, number> = { minor: Colors.Yellow, moderate: Colors.Orange, severe: Colors.Red };
  const color = severityColors[d.severity ?? 'minor'] ?? Colors.Yellow;
  return new EmbedBuilder()
    .setColor(color)
    .setTitle('Pending Log Review')
    .addFields(
      embedField('Target', `<@${d.userId}>`, true),
      embedField('Logged By', `<@${d.loggedBy}>`, true),
      embedField('Severity', (d.severity ?? 'minor').charAt(0).toUpperCase() + (d.severity ?? 'minor').slice(1), true),
      embedField('Post ID', d.postId, true),
      embedField('Date', d.date, true),
      embedField('Reason', d.reason),
    )
    .setFooter({ text: embedFooter(`Pending ID: ${d.pendingId}`) })
    .setTimestamp();
};

export const appealEmbed = (d: { userId: string; logId: number; reason: string; logType: string; logReason: string; appealId: number }) =>
  new EmbedBuilder()
    .setColor(Colors.Purple)
    .setTitle('Appeal Request')
    .addFields(
      embedField('Appellant', `<@${d.userId}>`, true),
      embedField('Log Type', d.logType, true),
      embedField('Log Reason', d.logReason),
      embedField('Appeal Reason', d.reason),
    )
    .setFooter({ text: embedFooter(`Appeal ID: ${d.appealId} | Log ID: ${d.logId}`) })
    .setTimestamp();
