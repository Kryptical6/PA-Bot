import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isSPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

// Common timezones grouped for Discord's 25-choice limit
// We use a select menu in the handler instead since there are too many for slash command choices
export const TIMEZONES: Record<string, string> = {
  'UTC':                 'UTC — Universal Time',
  'Europe/London':       'Europe/London — GMT/BST',
  'Europe/Paris':        'Europe/Paris — CET/CEST',
  'Europe/Berlin':       'Europe/Berlin — CET/CEST',
  'Europe/Amsterdam':    'Europe/Amsterdam — CET/CEST',
  'Europe/Madrid':       'Europe/Madrid — CET/CEST',
  'Europe/Rome':         'Europe/Rome — CET/CEST',
  'Europe/Athens':       'Europe/Athens — EET/EEST',
  'Europe/Moscow':       'Europe/Moscow — MSK',
  'America/New_York':    'America/New_York — EST/EDT',
  'America/Chicago':     'America/Chicago — CST/CDT',
  'America/Denver':      'America/Denver — MST/MDT',
  'America/Los_Angeles': 'America/Los_Angeles — PST/PDT',
  'America/Toronto':     'America/Toronto — EST/EDT',
  'America/Vancouver':   'America/Vancouver — PST/PDT',
  'America/Sao_Paulo':   'America/Sao_Paulo — BRT',
  'America/Mexico_City': 'America/Mexico_City — CST/CDT',
  'Asia/Dubai':          'Asia/Dubai — GST',
  'Asia/Kolkata':        'Asia/Kolkata — IST',
  'Asia/Singapore':      'Asia/Singapore — SGT',
  'Asia/Tokyo':          'Asia/Tokyo — JST',
  'Asia/Shanghai':       'Asia/Shanghai — CST',
  'Asia/Seoul':          'Asia/Seoul — KST',
  'Australia/Sydney':    'Australia/Sydney — AEST/AEDT',
  'Pacific/Auckland':    'Pacific/Auckland — NZST/NZDT',
};

// Convert local hour in a timezone to UTC hour
export function localToUtcHour(localHour: number, timezone: string): number {
  try {
    // Create a date at the local hour in the given timezone and read back UTC hour
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(localHour).padStart(2, '0')}:00:00`;
    const localDate = new Date(new Date(dateStr).toLocaleString('en-US', { timeZone: timezone }));
    const utcDate   = new Date(dateStr);
    const offsetMs  = localDate.getTime() - utcDate.getTime();
    return ((localHour - Math.round(offsetMs / 3600000)) + 24) % 24;
  } catch {
    return localHour; // fallback to treating as UTC
  }
}

// Get current local hour in a timezone
export function getCurrentLocalHour(timezone: string): number {
  try {
    return parseInt(new Date().toLocaleString('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }));
  } catch { return new Date().getUTCHours(); }
}

export const data = new SlashCommandBuilder()
  .setName('set-reminder')
  .setDescription('Set when you receive your daily log reminder')
  .addIntegerOption(o => o
    .setName('hour')
    .setDescription('Hour to receive the reminder (0-23, in your local time)')
    .setRequired(true)
    .setMinValue(0)
    .setMaxValue(23)
  )
  .addStringOption(o => o
    .setName('timezone')
    .setDescription('Your timezone')
    .setRequired(true)
    .addChoices(...Object.entries(TIMEZONES).map(([value, name]) => ({ name: name.slice(0, 100), value })))
  );

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const localHour = i.options.getInteger('hour', true);
  const timezone  = i.options.getString('timezone', true);

  if (!TIMEZONES[timezone]) {
    await i.editReply({ embeds: [errorEmbed('Invalid timezone.')] }); return;
  }

  const utcHour = localToUtcHour(localHour, timezone);

  await sql`
    INSERT INTO spa_audit_config (user_id, reminder_hour, timezone)
    VALUES (${i.user.id}, ${utcHour}, ${timezone})
    ON CONFLICT (user_id) DO UPDATE SET
      reminder_hour = ${utcHour},
      timezone = ${timezone},
      updated_at = NOW()
  `;

  // Format display
  const pad = (n: number) => String(n).padStart(2, '0');
  const localDisplay = `${pad(localHour)}:00`;
  const utcDisplay   = `${pad(utcHour)}:00 UTC`;
  const tzLabel      = TIMEZONES[timezone];

  await i.editReply({ embeds: [successEmbed('Reminder Updated', [
    `Your daily log reminder is now set to **${localDisplay}** (${tzLabel}).`,
    `This is **${utcDisplay}** — takes effect from tomorrow.`,
  ].join('\n'))] });
}
