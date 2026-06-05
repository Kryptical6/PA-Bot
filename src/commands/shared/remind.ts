import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import { isPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

// Parses strings like 30m, 4h, 2d, 7d into milliseconds
// Returns null if invalid
function parseDuration(input: string): number | null {
  const match = input.trim().toLowerCase().match(/^(\d+)(m|h|d)$/);
  if (!match) return null;
  const n = parseInt(match[1]);
  if (n <= 0) return null;
  switch (match[2]) {
    case 'm': return n * 60 * 1000;
    case 'h': return n * 60 * 60 * 1000;
    case 'd': return n * 24 * 60 * 60 * 1000;
    default:  return null;
  }
}

function formatDuration(input: string): string {
  const match = input.trim().toLowerCase().match(/^(\d+)(m|h|d)$/);
  if (!match) return input;
  const n = parseInt(match[1]);
  switch (match[2]) {
    case 'm': return `${n} minute${n !== 1 ? 's' : ''}`;
    case 'h': return `${n} hour${n !== 1 ? 's' : ''}`;
    case 'd': return `${n} day${n !== 1 ? 's' : ''}`;
    default:  return input;
  }
}

export const data = new SlashCommandBuilder()
  .setName('remind')
  .setDescription('Set a personal reminder that DMs you when it fires')

  .addSubcommand(sub => sub
    .setName('set')
    .setDescription('Set a new reminder')
    .addStringOption(o => o
      .setName('message')
      .setDescription('What to remind you about')
      .setRequired(true)
      .setMaxLength(500)
    )
    .addStringOption(o => o
      .setName('in')
      .setDescription('When to fire - e.g. 30m, 4h, 2d, 7d')
      .setRequired(true)
      .setMaxLength(10)
    )
  )

  .addSubcommand(sub => sub
    .setName('list')
    .setDescription('View your pending reminders')
  )

  .addSubcommand(sub => sub
    .setName('cancel')
    .setDescription('Cancel a pending reminder')
    .addIntegerOption(o => o
      .setName('id')
      .setDescription('Reminder ID (shown in /remind list)')
      .setRequired(true)
    )
  );

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isPA(m)) return;

  const sub = i.options.getSubcommand();

  if (sub === 'set') {
    await i.deferReply({ ephemeral: true });

    const message = i.options.getString('message', true).trim();
    const whenRaw = i.options.getString('in', true).trim();
    const ms      = parseDuration(whenRaw);

    if (!ms) {
      await i.editReply({ embeds: [errorEmbed(
        `Invalid time format. Use a number followed by m, h, or d.\n` +
        `Examples: \`30m\`, \`4h\`, \`2d\`, \`7d\``
      )] });
      return;
    }

    // Max 30 days
    if (ms > 30 * 24 * 60 * 60 * 1000) {
      await i.editReply({ embeds: [errorEmbed('Maximum reminder time is 30 days.')] });
      return;
    }

    // Max 5 active reminders
    const existing = await sql`
      SELECT COUNT(*) as c FROM reminders
      WHERE user_id = ${i.user.id} AND fires_at > NOW() AND sent = false
    `;
    if (parseInt(existing[0].c) >= 5) {
      await i.editReply({ embeds: [errorEmbed('You already have 5 pending reminders. Cancel one first with `/remind cancel`.')] });
      return;
    }

    const firesAt = new Date(Date.now() + ms);
    const [result] = await sql`
      INSERT INTO reminders (user_id, type, label, note, fires_at)
      VALUES (${i.user.id}, 'custom', ${message}, ${message}, ${firesAt.toISOString()})
      RETURNING id
    `;

    await i.editReply({ embeds: [new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('Reminder Set')
      .setDescription(message)
      .addFields(
        { name: 'Fires',     value: `<t:${Math.floor(firesAt.getTime() / 1000)}:F>`, inline: true },
        { name: 'Time left', value: `<t:${Math.floor(firesAt.getTime() / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: `ID: ${result.id}  |  You will be DM'd when this fires.` })
      .setTimestamp()
    ]});
  }

  else if (sub === 'list') {
    await i.deferReply({ ephemeral: true });

    const reminders = await sql`
      SELECT * FROM reminders
      WHERE user_id = ${i.user.id} AND fires_at > NOW() AND sent = false
      ORDER BY fires_at ASC
    `;

    if (reminders.length === 0) {
      await i.editReply({ embeds: [new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Your Reminders')
        .setDescription('You have no pending reminders.')
        .setTimestamp()
      ]});
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle(`Your Reminders (${reminders.length}/5)`)
      .setTimestamp();

    for (const r of reminders) {
      embed.addFields({
        name:  `ID ${r.id}  -  <t:${Math.floor(new Date(r.fires_at).getTime() / 1000)}:R>`,
        value: r.label ?? r.note ?? 'No message',
      });
    }

    await i.editReply({ embeds: [embed] });
  }

  else if (sub === 'cancel') {
    await i.deferReply({ ephemeral: true });

    const id   = i.options.getInteger('id', true);
    const rows = await sql`SELECT * FROM reminders WHERE id = ${id} AND user_id = ${i.user.id}`;

    if (rows.length === 0) {
      await i.editReply({ embeds: [errorEmbed(`Reminder #${id} not found or does not belong to you.`)] });
      return;
    }

    await sql`DELETE FROM reminders WHERE id = ${id}`;
    await i.editReply({ embeds: [successEmbed('Reminder Cancelled', `Reminder #${id} cancelled.`)] });
  }
}
