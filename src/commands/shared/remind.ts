import {
  ChatInputCommandInteraction, SlashCommandBuilder, GuildMember,
  EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder
} from 'discord.js';
import { isPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder()
  .setName('remind')
  .setDescription('Set a personal reminder')

  .addSubcommand(sub => sub.setName('set')
    .setDescription('Set a new reminder')
    .addStringOption(o => o.setName('type').setDescription('Quick reminder type').setRequired(true)
      .addChoices(
        { name: 'Review feedback responses', value: 'feedback' },
        { name: 'Handle open escalations',   value: 'escalations' },
        { name: 'Review pending logs',        value: 'pending_logs' },
        { name: 'Check SPA audit reports',    value: 'audit' },
        { name: 'Review weekly reports',      value: 'weekly_reports' },
        { name: 'Custom',                     value: 'custom' },
      ))
    .addStringOption(o => o.setName('when').setDescription('When to remind you: in 30m, 1h, 2h, 4h, 8h, or 24h').setRequired(true)
      .addChoices(
        { name: 'In 30 minutes', value: '30m' },
        { name: 'In 1 hour',     value: '1h' },
        { name: 'In 2 hours',    value: '2h' },
        { name: 'In 4 hours',    value: '4h' },
        { name: 'In 8 hours',    value: '8h' },
        { name: 'In 24 hours',   value: '24h' },
      ))
    .addStringOption(o => o.setName('note').setDescription('Custom reminder text (required if type is Custom)').setMaxLength(500))
  )

  .addSubcommand(sub => sub.setName('list')
    .setDescription('View your pending reminders')
  )

  .addSubcommand(sub => sub.setName('cancel')
    .setDescription('Cancel a pending reminder')
    .addIntegerOption(o => o.setName('id').setDescription('Reminder ID (from /remind list)').setRequired(true))
  );

const TYPE_LABELS: Record<string, string> = {
  feedback:      'Review feedback responses',
  escalations:   'Handle open escalations',
  pending_logs:  'Review pending logs',
  audit:         'Check SPA audit reports',
  weekly_reports: 'Review weekly reports',
  custom:        'Custom reminder',
};

const DURATIONS: Record<string, number> = {
  '30m': 30 * 60 * 1000,
  '1h':  60 * 60 * 1000,
  '2h':  2  * 60 * 60 * 1000,
  '4h':  4  * 60 * 60 * 1000,
  '8h':  8  * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isPA(m)) return;

  const sub = i.options.getSubcommand();

  if (sub === 'set') {
    await i.deferReply({ ephemeral: true });

    const type   = i.options.getString('type', true);
    const when   = i.options.getString('when', true);
    const note   = i.options.getString('note') ?? null;

    if (type === 'custom' && !note) {
      await i.editReply({ embeds: [errorEmbed('Please provide a note for custom reminders.')] }); return;
    }

    const ms = DURATIONS[when];
    if (!ms) { await i.editReply({ embeds: [errorEmbed('Invalid time option.')] }); return; }

    // Check limit: max 5 active reminders
    const existing = await sql`SELECT COUNT(*) as c FROM reminders WHERE user_id = ${i.user.id} AND fires_at > NOW() AND sent = false`;
    if (parseInt(existing[0].c) >= 5) {
      await i.editReply({ embeds: [errorEmbed('You already have 5 pending reminders. Cancel one first with `/remind cancel`.')] }); return;
    }

    const firesAt = new Date(Date.now() + ms);
    const label   = type === 'custom' ? (note ?? 'Custom') : TYPE_LABELS[type];

    const [result] = await sql`
      INSERT INTO reminders (user_id, type, label, note, fires_at)
      VALUES (${i.user.id}, ${type}, ${label}, ${note}, ${firesAt.toISOString()})
      RETURNING id
    `;

    await i.editReply({ embeds: [new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('Reminder Set')
      .addFields(
        { name: 'Reminder',  value: label,                                                          inline: true },
        { name: 'Fires at',  value: `<t:${Math.floor(firesAt.getTime() / 1000)}:F>`,               inline: true },
        { name: 'Time left', value: `<t:${Math.floor(firesAt.getTime() / 1000)}:R>`,               inline: true },
        ...(note && type !== 'custom' ? [{ name: 'Note', value: note }] : []),
        ...(type === 'custom' ? [{ name: 'Message', value: note! }] : []),
      )
      .setFooter({ text: `Reminder ID: ${result.id}` })
      .setTimestamp()
    ] });
  }

  else if (sub === 'list') {
    await i.deferReply({ ephemeral: true });

    const reminders = await sql`
      SELECT * FROM reminders
      WHERE user_id = ${i.user.id} AND fires_at > NOW() AND sent = false
      ORDER BY fires_at ASC
    `;

    if (reminders.length === 0) {
      await i.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Blue).setTitle('Your Reminders').setDescription('You have no pending reminders.').setTimestamp()] }); return;
    }

    const embed = new EmbedBuilder().setColor(Colors.Blue).setTitle('Your Reminders').setTimestamp();
    for (const r of reminders) {
      embed.addFields({
        name: `#${r.id} - ${r.label}`,
        value: `Fires: <t:${Math.floor(new Date(r.fires_at).getTime() / 1000)}:R>${r.note && r.type !== 'custom' ? `\nNote: ${r.note}` : ''}${r.type === 'custom' ? `\nMessage: ${r.note}` : ''}`,
      });
    }
    await i.editReply({ embeds: [embed] });
  }

  else if (sub === 'cancel') {
    await i.deferReply({ ephemeral: true });
    const id = i.options.getInteger('id', true);

    const rows = await sql`SELECT * FROM reminders WHERE id = ${id} AND user_id = ${i.user.id}`;
    if (rows.length === 0) {
      await i.editReply({ embeds: [errorEmbed(`Reminder #${id} not found or not yours.`)] }); return;
    }

    await sql`DELETE FROM reminders WHERE id = ${id}`;
    await i.editReply({ embeds: [successEmbed('Reminder Cancelled', `Reminder #${id} has been cancelled.`)] });
  }
}
