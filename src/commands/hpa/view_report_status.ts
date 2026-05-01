import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { getActiveCycle, generateSummary } from '../../services/weeklyReportService';
import { dmUser } from '../../services/dmService';
import { config } from '../../config';

export const data = new SlashCommandBuilder()
  .setName('view_report_status')
  .setDescription('View who has submitted their weekly report (HPA only)')
  .addIntegerOption(o => o.setName('cycle').setDescription('Cycle ID (defaults to current)'));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const cycleIdOpt = i.options.getInteger('cycle');
  let cycle: any;

  if (cycleIdOpt) {
    const rows = await sql`SELECT * FROM weekly_report_cycles WHERE id = ${cycleIdOpt}`;
    if (rows.length === 0) { await i.editReply({ embeds: [errorEmbed(`Cycle #${cycleIdOpt} not found.`)] }); return; }
    cycle = rows[0];
  } else {
    cycle = await getActiveCycle();
    if (!cycle) {
      // Get last closed cycle
      const rows = await sql`SELECT * FROM weekly_report_cycles ORDER BY id DESC LIMIT 1`;
      if (rows.length === 0) { await i.editReply({ embeds: [errorEmbed('No report cycles found.')] }); return; }
      cycle = rows[0];
    }
  }

  await i.guild!.members.fetch();
  const seniors = Array.from(i.guild!.members.cache.values()).filter(m =>
    m.roles.cache.has(config.roles.SPA) && !m.roles.cache.has(config.roles.HPA) && !m.user.bot
  );

  const submitted = await sql`SELECT * FROM weekly_reports WHERE cycle_id = ${cycle.id}`;
  const extensions = await sql`SELECT * FROM weekly_report_extensions WHERE cycle_id = ${cycle.id}`;
  const submittedIds = new Set(submitted.map((r: any) => r.user_id));
  const extIds       = new Set(extensions.map((e: any) => e.user_id));

  const submittedList   = seniors.filter(s => submittedIds.has(s.id));
  const extendedList    = seniors.filter(s => extIds.has(s.id) && !submittedIds.has(s.id));
  const notSubmitted    = seniors.filter(s => !submittedIds.has(s.id) && !extIds.has(s.id));

  const embed = new EmbedBuilder()
    .setColor(cycle.status === 'active' ? Colors.Blue : Colors.Grey)
    .setTitle(`📋 Report Status — Week ${cycle.week_number}`)
    .addFields(
      { name: '⏰ Deadline', value: `<t:${Math.floor(new Date(cycle.deadline_at).getTime() / 1000)}:R>`, inline: true },
      { name: '📊 Status', value: cycle.status === 'active' ? '🟢 Active' : '🔴 Closed', inline: true },
      { name: `✅ Submitted (${submittedList.length})`,
        value: submittedList.length > 0
          ? submittedList.map(s => {
              const r = submitted.find((r: any) => r.user_id === s.id);
              return `<@${s.id}>${r?.is_late ? ' ⚠️ Late' : ''} — Score: ${r?.quality_score ?? '?'}/100`;
            }).join('\n')
          : 'None yet' },
      { name: `⏳ Extended (${extendedList.length})`,
        value: extendedList.length > 0 ? extendedList.map(s => `<@${s.id}>`).join('\n') : 'None' },
      { name: `❌ Not Submitted (${notSubmitted.length})`,
        value: notSubmitted.length > 0 ? notSubmitted.map(s => `<@${s.id}>`).join('\n') : 'All submitted! ✅' },
    )
    .setTimestamp();

  const nudgeBtn    = new ButtonBuilder().setCustomId(`wr_nudge_all:${cycle.id}`).setLabel('📨 Nudge Non-Submitters').setStyle(ButtonStyle.Primary).setDisabled(notSubmitted.length === 0);
  const summaryBtn  = new ButtonBuilder().setCustomId(`wr_force_summary:${cycle.id}`).setLabel('📊 Generate Summary Now').setStyle(ButtonStyle.Secondary).setDisabled(cycle.summary_generated);

  const msg = await i.editReply({ embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(nudgeBtn, summaryBtn)] });

  const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, filter: b => b.user.id === i.user.id, time: 60_000 });
  col.on('collect', async btn => {
    const [btnAction, , cycleId] = btn.customId.split(':');
    if (btnAction === 'wr_nudge_all') {
      await btn.deferUpdate();
      for (const s of notSubmitted) {
        await dmUser(i.client, s.id, {
          embeds: [new EmbedBuilder().setColor(Colors.Orange).setTitle('📋 Reminder: Weekly Report Due').setDescription(`Your weekly report is still outstanding. Deadline: <t:${Math.floor(new Date(cycle.deadline_at).getTime() / 1000)}:R>`).setTimestamp()]
        });
      }
      await i.editReply({ content: `✅ Nudged ${notSubmitted.length} senior(s).`, components: [] });
    } else if (btnAction === 'wr_force_summary') {
      await btn.deferUpdate();
      await generateSummary(i.client, parseInt(cycleId));
      await i.editReply({ content: '✅ Summary generated.', components: [] });
    }
  });
}
