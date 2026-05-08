import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { successEmbed, errorEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder()
  .setName('configure_audit')
  .setDescription('Configure SPA audit settings (HPA only)')
  .addSubcommand(sub => sub.setName('global')
    .setDescription('Set global thresholds for all seniors')
    .addIntegerOption(o => o.setName('accuracy_threshold').setDescription('Accuracy % below which to auto-flag (default 70)').setMinValue(1).setMaxValue(100))
    .addIntegerOption(o => o.setName('below_target_days').setDescription('Consecutive days below target before auto-flag (default 3)').setMinValue(1).setMaxValue(14))
    .addIntegerOption(o => o.setName('underperform_pct').setDescription('% of target = underperformed (default 50)').setMinValue(1).setMaxValue(99))
    .addIntegerOption(o => o.setName('improvement_days').setDescription('Consecutive good days to auto-clear flag (default 3)').setMinValue(1).setMaxValue(14))
  )
  .addSubcommand(sub => sub.setName('senior')
    .setDescription('Set per-senior reminder time and target')
    .addUserOption(o => o.setName('user').setDescription('Senior to configure').setRequired(true))
    .addIntegerOption(o => o.setName('reminder_hour').setDescription('UTC hour for daily reminder (0-23)').setMinValue(0).setMaxValue(23))
    .addIntegerOption(o => o.setName('soft_target').setDescription('Recommended daily log count').setMinValue(1).setMaxValue(100))
    .addIntegerOption(o => o.setName('accuracy_threshold').setDescription('Override global accuracy threshold for this senior').setMinValue(1).setMaxValue(100))
    .addIntegerOption(o => o.setName('below_target_days').setDescription('Override global below-target days for this senior').setMinValue(1).setMaxValue(14))
    .addIntegerOption(o => o.setName('improvement_days').setDescription('Override global improvement days for this senior').setMinValue(1).setMaxValue(14))
    .addUserOption(o => o.setName('reminder_person').setDescription('User to ping in the daily reminder DM'))
    .addStringOption(o => o.setName('reminder_channel').setDescription('Channel ID or Discord link to reference in the reminder'))
    .addStringOption(o => o.setName('timezone').setDescription("Set the senior's timezone (e.g. Europe/London, America/New_York)"))
  )
  .addSubcommand(sub => sub.setName('reset')
    .setDescription('Reset specific per-senior options to default')
    .addUserOption(o => o.setName('user').setDescription('Senior to reset options for').setRequired(true))
    .addBooleanOption(o => o.setName('reminder_person').setDescription('Clear the reminder person ping'))
    .addBooleanOption(o => o.setName('reminder_channel').setDescription('Clear the reminder channel link'))
    .addBooleanOption(o => o.setName('reminder_hour').setDescription('Reset reminder hour to 9am UTC'))
    .addBooleanOption(o => o.setName('soft_target').setDescription('Reset soft target to 10'))
    .addBooleanOption(o => o.setName('accuracy_threshold').setDescription('Reset accuracy threshold to global default'))
    .addBooleanOption(o => o.setName('below_target_days').setDescription('Reset below-target days to global default'))
    .addBooleanOption(o => o.setName('improvement_days').setDescription('Reset improvement days to global default'))
  );

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const sub = i.options.getSubcommand();

  if (sub === 'global') {
    const acc   = i.options.getInteger('accuracy_threshold');
    const below = i.options.getInteger('below_target_days');
    const under = i.options.getInteger('underperform_pct');
    const impr  = i.options.getInteger('improvement_days');

    if (!acc && !below && !under && !impr) {
      await i.editReply({ embeds: [errorEmbed('Provide at least one value to update.')] }); return;
    }

    await sql`
      UPDATE spa_audit_global SET
        accuracy_threshold = COALESCE(${acc},   accuracy_threshold),
        below_target_days  = COALESCE(${below}, below_target_days),
        underperform_pct   = COALESCE(${under}, underperform_pct),
        improvement_days   = COALESCE(${impr},  improvement_days),
        updated_at = NOW()
      WHERE id = 1
    `;

    const current = (await sql`SELECT * FROM spa_audit_global WHERE id = 1`)[0];
    await i.editReply({ embeds: [successEmbed('Global Config Updated', [
      `Accuracy Threshold: **${current.accuracy_threshold}%**`,
      `Below-Target Days: **${current.below_target_days}**`,
      `Underperform: **${current.underperform_pct}%** of target`,
      `Improvement Days: **${current.improvement_days}**`,
    ].join('\n'))] });
  }

  else if (sub === 'senior') {
    const user    = i.options.getUser('user', true);
    const hour    = i.options.getInteger('reminder_hour');
    const tgt     = i.options.getInteger('soft_target');
    const acc     = i.options.getInteger('accuracy_threshold');
    const below   = i.options.getInteger('below_target_days');
    const impr    = i.options.getInteger('improvement_days');
    const personUser = i.options.getUser('reminder_person');
    const chanRaw    = i.options.getString('reminder_channel');
    const tz         = i.options.getString('timezone');
    const personId   = personUser ? personUser.id : null;
    const channelId  = chanRaw
      ? (chanRaw.match(/(\d{17,20})(?:\s*$)/)?.[1] ?? chanRaw.trim())
      : null;

    // If timezone provided with hour, convert local hour to UTC
    let utcHour = hour;
    if (hour !== null && tz) {
      const { localToUtcHour } = await import('../../commands/spa/set_reminder');
      utcHour = localToUtcHour(hour, tz);
    }

    await sql`INSERT INTO spa_audit_config (user_id) VALUES (${user.id}) ON CONFLICT DO NOTHING`;
    await sql`
      UPDATE spa_audit_config SET
        reminder_hour      = COALESCE(${utcHour},   reminder_hour),
        soft_target        = COALESCE(${tgt},        soft_target),
        accuracy_threshold = COALESCE(${acc},        accuracy_threshold),
        below_target_days  = COALESCE(${below},      below_target_days),
        improvement_days   = COALESCE(${impr},       improvement_days),
        reminder_person    = COALESCE(${personId},   reminder_person),
        reminder_channel   = COALESCE(${channelId},  reminder_channel),
        timezone           = COALESCE(${tz},         timezone),
        updated_at = NOW()
      WHERE user_id = ${user.id}
    `;

    const current = (await sql`SELECT * FROM spa_audit_config WHERE user_id = ${user.id}`)[0];
    await i.editReply({ embeds: [successEmbed(`Config Updated — ${user.username}`, [
      `Reminder Time: **${current.reminder_hour}:00 UTC**`,
      current.timezone !== 'UTC' ? `Timezone: **${current.timezone}**` : null,
      `Soft Target: **${current.soft_target} logs/day**`,
      acc       ? `Accuracy Threshold: **${current.accuracy_threshold}%**` : null,
      below     ? `Below-Target Days: **${current.below_target_days}**` : null,
      impr      ? `Improvement Days: **${current.improvement_days}**` : null,
      personId  ? `Reminder Person: <@${current.reminder_person}>` : null,
      channelId ? `Reminder Channel: <#${current.reminder_channel}>` : null,
    ].filter(Boolean).join('\n'))] });
  }

  else if (sub === 'reset') {
    const user    = i.options.getUser('user', true);
    const rPerson = i.options.getBoolean('reminder_person');
    const rChan   = i.options.getBoolean('reminder_channel');
    const rHour   = i.options.getBoolean('reminder_hour');
    const rTarget = i.options.getBoolean('soft_target');
    const rAcc    = i.options.getBoolean('accuracy_threshold');
    const rBelow  = i.options.getBoolean('below_target_days');
    const rImpr   = i.options.getBoolean('improvement_days');

    if (!rPerson && !rChan && !rHour && !rTarget && !rAcc && !rBelow && !rImpr) {
      await i.editReply({ embeds: [errorEmbed('Select at least one option to reset.')] }); return;
    }

    await sql`INSERT INTO spa_audit_config (user_id) VALUES (${user.id}) ON CONFLICT DO NOTHING`;
    await sql`
      UPDATE spa_audit_config SET
        reminder_person    = CASE WHEN ${rPerson ?? false} THEN NULL ELSE reminder_person END,
        reminder_channel   = CASE WHEN ${rChan   ?? false} THEN NULL ELSE reminder_channel END,
        reminder_hour      = CASE WHEN ${rHour   ?? false} THEN 9    ELSE reminder_hour END,
        soft_target        = CASE WHEN ${rTarget ?? false} THEN 10   ELSE soft_target END,
        accuracy_threshold = CASE WHEN ${rAcc    ?? false} THEN NULL ELSE accuracy_threshold END,
        below_target_days  = CASE WHEN ${rBelow  ?? false} THEN NULL ELSE below_target_days END,
        improvement_days   = CASE WHEN ${rImpr   ?? false} THEN NULL ELSE improvement_days END,
        updated_at = NOW()
      WHERE user_id = ${user.id}
    `;

    const reset: string[] = [];
    if (rPerson) reset.push('Reminder Person (cleared)');
    if (rChan)   reset.push('Reminder Channel (cleared)');
    if (rHour)   reset.push('Reminder Hour (reset to 9:00 UTC)');
    if (rTarget) reset.push('Soft Target (reset to 10)');
    if (rAcc)    reset.push('Accuracy Threshold (reset to global)');
    if (rBelow)  reset.push('Below-Target Days (reset to global)');
    if (rImpr)   reset.push('Improvement Days (reset to global)');

    await i.editReply({ embeds: [successEmbed(`Reset — ${user.username}`, reset.map(r => `• ${r}`).join('\n'))] });
  }
}
