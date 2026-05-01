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
      await i.editReply({ embeds: [errorEmbed('Provide at least one value to update.')] });
      return;
    }

    await sql`
      UPDATE spa_audit_global SET
        accuracy_threshold = COALESCE(${acc}, accuracy_threshold),
        below_target_days  = COALESCE(${below}, below_target_days),
        underperform_pct   = COALESCE(${under}, underperform_pct),
        improvement_days   = COALESCE(${impr}, improvement_days),
        updated_at = NOW()
      WHERE id = 1
    `;

    const current = (await sql`SELECT * FROM spa_audit_global WHERE id = 1`)[0];
    await i.editReply({ embeds: [successEmbed('Global Config Updated', [
      `Accuracy Threshold: **${current.accuracy_threshold}%**`,
      `Below-Target Days: **${current.below_target_days}**`,
      `Underperform %: **${current.underperform_pct}%** of target`,
      `Improvement Days: **${current.improvement_days}**`,
    ].join('\n'))] });
  }

  if (sub === 'senior') {
    const user  = i.options.getUser('user', true);
    const hour  = i.options.getInteger('reminder_hour');
    const tgt   = i.options.getInteger('soft_target');
    const acc   = i.options.getInteger('accuracy_threshold');
    const below = i.options.getInteger('below_target_days');
    const impr  = i.options.getInteger('improvement_days');

    await sql`INSERT INTO spa_audit_config (user_id) VALUES (${user.id}) ON CONFLICT DO NOTHING`;
    await sql`
      UPDATE spa_audit_config SET
        reminder_hour      = COALESCE(${hour},  reminder_hour),
        soft_target        = COALESCE(${tgt},   soft_target),
        accuracy_threshold = COALESCE(${acc},   accuracy_threshold),
        below_target_days  = COALESCE(${below}, below_target_days),
        improvement_days   = COALESCE(${impr},  improvement_days),
        updated_at = NOW()
      WHERE user_id = ${user.id}
    `;

    const current = (await sql`SELECT * FROM spa_audit_config WHERE user_id = ${user.id}`)[0];
    await i.editReply({ embeds: [successEmbed(`Config Updated — ${user.username}`, [
      `Reminder Time: **${current.reminder_hour}:00 UTC**`,
      `Soft Target: **${current.soft_target} logs/day**`,
      tgt   ? `Accuracy Threshold: **${current.accuracy_threshold}%**` : null,
      below ? `Below-Target Days: **${current.below_target_days}**` : null,
      impr  ? `Improvement Days: **${current.improvement_days}**` : null,
    ].filter(Boolean).join('\n'))] });
  }
}
