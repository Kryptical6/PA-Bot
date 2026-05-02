import { Client, EmbedBuilder, Colors, TextChannel, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { sql } from '../database/client';
import { config } from '../config';
import { dmUser } from './dmService';

const REPORT_CHANNEL = config.channels.appeals; // 1497723319829401750

export const TAGS = ['AI', 'Proof', 'Scams', 'Rules', 'PA Mistakes', 'Low Quality', 'Other'];

const BANNED_PHRASES = ['no issues', 'everything fine', 'n/a', 'nothing', 'all good', 'no problems', 'all fine', 'none', 'nothing to report', 'all clear'];

const SECTION_CATEGORIES: Record<string, string> = {
  issues:      'Issues',
  mistakes:    'Mistakes',
  weaknesses:  'Weaknesses',
  risks:       'Risks',
  suggestions: 'Suggestions',
};

// ─── QUALITY SCORING ──────────────────────────────────────────────────────────
export function scoreReport(pending: any, cfg: any): { score: number; failedSections: string[] } {
  const sections = [
    { key: 'section_issues',      label: 'Marketplace/System Issues' },
    { key: 'section_mistakes',    label: 'Repeated PA Mistakes' },
    { key: 'section_weaknesses',  label: 'System Weaknesses' },
    { key: 'section_risks',       label: 'Risks/Emerging Problems' },
    { key: 'section_suggestions', label: 'Improvement Suggestions' },
    { key: 'section_reflection',  label: 'Self Reflection' },
  ];

  const failedSections: string[] = [];
  let totalLength = 0;
  let bannedCount = 0;
  let tagVariety  = 0;

  for (const { key, label } of sections) {
    const text = (pending[key] ?? '').trim();
    if (text.length < 50) failedSections.push(`**${label}** is too short (minimum 50 characters)`);
    const lower = text.toLowerCase();
    if (BANNED_PHRASES.some(p => lower.includes(p))) {
      failedSections.push(`**${label}** contains a low-effort phrase`);
      bannedCount++;
    }
    totalLength += text.length;
  }

  // Tag variety bonus
  const allTags = [
    ...(pending.tags_issues ?? []),
    ...(pending.tags_mistakes ?? []),
    ...(pending.tags_weaknesses ?? []),
    ...(pending.tags_risks ?? []),
    ...(pending.tags_suggestions ?? []),
  ];
  const uniqueTags = new Set(allTags.filter((t: string) => t !== 'Other'));
  tagVariety = Math.min(uniqueTags.size * 5, 20);

  // Length score (max 80)
  const avgLength = totalLength / 6;
  const lengthScore = Math.min(Math.floor((avgLength / 200) * 80), 80);

  const score = Math.max(0, lengthScore + tagVariety - (bannedCount * 10));
  return { score, failedSections };
}

// ─── CYCLE HELPERS ────────────────────────────────────────────────────────────
export async function getActiveCycle(): Promise<any | null> {
  const rows = await sql`SELECT * FROM weekly_report_cycles WHERE status = 'active' ORDER BY started_at DESC LIMIT 1`;
  return rows[0] ?? null;
}

export async function getReportConfig(): Promise<any> {
  return (await sql`SELECT * FROM weekly_report_config WHERE id = 1`)[0];
}

// ─── START CYCLE ──────────────────────────────────────────────────────────────
export async function startWeeklyCycle(client: Client): Promise<void> {
  const cfg = await getReportConfig();
  const existing = await getActiveCycle();
  if (existing) return; // already active

  const deadlineAt = new Date(Date.now() + cfg.deadline_hours * 3600000);
  const weekNum = Math.ceil((Date.now() - new Date('2024-01-01').getTime()) / (7 * 86400000));

  const [cycle] = await sql`
    INSERT INTO weekly_report_cycles (week_number, deadline_at)
    VALUES (${weekNum}, ${deadlineAt.toISOString()})
    RETURNING *
  `;

  await sendWeeklyDMs(client, cycle);
}

export async function sendWeeklyDMs(client: Client, cycle: any): Promise<void> {
  try {
    const guild = (client as any).guilds.cache.first();
    if (!guild) return;
    await guild.members.fetch();

    const seniors = guild.members.cache.filter((m: any) =>
      m.roles.cache.has(config.roles.SPA) && !m.roles.cache.has(config.roles.HPA) && !m.user.bot
    );

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle('📋 Weekly SPA Report')
      .setDescription('It\'s time to submit your weekly report. Please take this seriously — your insights directly shape how we improve the department.')
      .addFields(
        { name: '⏰ Deadline', value: `<t:${Math.floor(new Date(cycle.deadline_at).getTime() / 1000)}:F>`, inline: true },
        { name: '📝 Sections', value: '6 structured sections across 2 modals', inline: true },
      )
      .setTimestamp();

    const submitBtn = new ButtonBuilder().setCustomId(`wr_submit:${cycle.id}`).setLabel('📝 Submit Report').setStyle(ButtonStyle.Primary);
    const extBtn    = new ButtonBuilder().setCustomId(`wr_extend:${cycle.id}`).setLabel('⏳ Request Extension').setStyle(ButtonStyle.Secondary);

    for (const [, member] of seniors) {
      await dmUser(client, member.id, { embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(submitBtn, extBtn)] });
    }
  } catch (e) { console.error('Failed to send weekly DMs:', e); }
}

// ─── TAG SELECT MENU ──────────────────────────────────────────────────────────
export function buildTagSelect(sectionKey: string, cycleId: number, label: string): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`wr_tags:${cycleId}:${sectionKey}`)
      .setPlaceholder(`Tags for: ${label} (optional, select up to 3)`)
      .setMinValues(0)
      .setMaxValues(3)
      .addOptions(TAGS.map(t => new StringSelectMenuOptionBuilder().setLabel(t).setValue(t)))
  );
}

// ─── SUBMIT REPORT ────────────────────────────────────────────────────────────
export async function finalizeReport(client: Client, userId: string, cycleId: number, pending: any, isLate: boolean): Promise<void> {
  const cfg = await getReportConfig();
  const { score } = scoreReport(pending, cfg);

  await sql`
    INSERT INTO weekly_reports (cycle_id, user_id,
      section_issues, tags_issues, other_label_issues,
      section_mistakes, tags_mistakes, other_label_mistakes,
      section_weaknesses, tags_weaknesses, other_label_weaknesses,
      section_risks, tags_risks, other_label_risks,
      section_suggestions, tags_suggestions, other_label_suggestions,
      section_reflection, quality_score, is_late, submitted_at)
    VALUES (${cycleId}, ${userId},
      ${pending.section_issues}, ${pending.tags_issues ?? []}, ${pending.other_label_issues ?? null},
      ${pending.section_mistakes}, ${pending.tags_mistakes ?? []}, ${pending.other_label_mistakes ?? null},
      ${pending.section_weaknesses}, ${pending.tags_weaknesses ?? []}, ${pending.other_label_weaknesses ?? null},
      ${pending.section_risks}, ${pending.tags_risks ?? []}, ${pending.other_label_risks ?? null},
      ${pending.section_suggestions}, ${pending.tags_suggestions ?? []}, ${pending.other_label_suggestions ?? null},
      ${pending.section_reflection}, ${score}, ${isLate}, NOW())
    ON CONFLICT (cycle_id, user_id) DO UPDATE SET
      section_issues = EXCLUDED.section_issues, tags_issues = EXCLUDED.tags_issues,
      section_mistakes = EXCLUDED.section_mistakes, tags_mistakes = EXCLUDED.tags_mistakes,
      section_weaknesses = EXCLUDED.section_weaknesses, tags_weaknesses = EXCLUDED.tags_weaknesses,
      section_risks = EXCLUDED.section_risks, tags_risks = EXCLUDED.tags_risks,
      section_suggestions = EXCLUDED.section_suggestions, tags_suggestions = EXCLUDED.tags_suggestions,
      section_reflection = EXCLUDED.section_reflection,
      quality_score = EXCLUDED.quality_score, is_late = EXCLUDED.is_late, submitted_at = NOW()
  `;

  await sql`DELETE FROM weekly_report_pending WHERE user_id = ${userId}`;

  // Post individual report to channel
  await postIndividualReport(client, userId, pending, score, isLate, cycleId);

  // Check quality flag
  await checkQualityFlag(client, userId, score, cfg.quality_threshold, cycleId);

  // Check if all seniors submitted
  await checkAllSubmitted(client, cycleId);
}

async function postIndividualReport(client: Client, userId: string, pending: any, score: number, isLate: boolean, cycleId: number): Promise<void> {
  const scoreColor = score >= 70 ? Colors.Green : score >= 40 ? Colors.Yellow : Colors.Red;
  const embed = new EmbedBuilder()
    .setColor(scoreColor)
    .setTitle(`📋 Weekly Report — <@${userId}>`)
    .setDescription(isLate ? '⚠️ **Late Submission**' : null)
    .addFields(
      { name: '📉 Marketplace/System Issues', value: pending.section_issues + formatTags(pending.tags_issues, pending.other_label_issues) },
      { name: '🔁 Repeated PA Mistakes', value: pending.section_mistakes + formatTags(pending.tags_mistakes, pending.other_label_mistakes) },
      { name: '⚖️ System Weaknesses', value: pending.section_weaknesses + formatTags(pending.tags_weaknesses, pending.other_label_weaknesses) },
      { name: '🚨 Risks/Emerging Problems', value: pending.section_risks + formatTags(pending.tags_risks, pending.other_label_risks) },
      { name: '💡 Improvement Suggestions', value: pending.section_suggestions + formatTags(pending.tags_suggestions, pending.other_label_suggestions) },
      { name: '👤 Self Reflection', value: pending.section_reflection },
    )
    .setFooter({ text: `Quality Score: ${score}/100 | Cycle #${cycleId}` })
    .setTimestamp();

  try {
    const ch = await client.channels.fetch(REPORT_CHANNEL) as TextChannel;
    await ch.send({ embeds: [embed] });
  } catch (e) { console.error('Failed to post individual report:', e); }
}

function formatTags(tags: string[] | null, otherLabel: string | null): string {
  if (!tags || tags.length === 0) return '';
  const tagList = tags.map((t: string) => t === 'Other' && otherLabel ? `Other (${otherLabel})` : t);
  return `\n*Tags: ${tagList.join(', ')}*`;
}

// ─── AGGREGATION & SUMMARY ────────────────────────────────────────────────────
export async function generateSummary(client: Client, cycleId: number): Promise<void> {
  const cycle = (await sql`SELECT * FROM weekly_report_cycles WHERE id = ${cycleId}`)[0];
  if (cycle.summary_generated) return;

  const reports = await sql`SELECT * FROM weekly_reports WHERE cycle_id = ${cycleId}`;
  if (reports.length === 0) return;

  // Aggregate themes per category
  const themeCounts: Record<string, Record<string, Set<string>>> = {};
  // category → theme → set of user_ids

  for (const report of reports) {
    const sections = [
      { text: report.section_issues,      tags: report.tags_issues,      otherLabel: report.other_label_issues,      category: 'Issues' },
      { text: report.section_mistakes,    tags: report.tags_mistakes,    otherLabel: report.other_label_mistakes,    category: 'Mistakes' },
      { text: report.section_weaknesses,  tags: report.tags_weaknesses,  otherLabel: report.other_label_weaknesses,  category: 'Weaknesses' },
      { text: report.section_risks,       tags: report.tags_risks,       otherLabel: report.other_label_risks,       category: 'Risks' },
      { text: report.section_suggestions, tags: report.tags_suggestions, otherLabel: report.other_label_suggestions, category: 'Suggestions' },
    ];

    const seenThemesThisReport = new Set<string>();

    for (const section of sections) {
      const themes = extractThemes(section.text, section.tags, section.otherLabel);
      for (const theme of themes) {
        const key = `${section.category}:${theme}`;
        if (seenThemesThisReport.has(key)) continue; // deduplicate within report
        seenThemesThisReport.add(key);

        if (!themeCounts[section.category]) themeCounts[section.category] = {};
        if (!themeCounts[section.category][theme]) themeCounts[section.category][theme] = new Set();
        themeCounts[section.category][theme].add(report.user_id);
      }
    }
  }

  // Get prior cycle for trends
  const priorCycle = await sql`SELECT * FROM weekly_report_cycles WHERE id < ${cycleId} ORDER BY id DESC LIMIT 1`;
  const priorThemes = priorCycle.length > 0
    ? await sql`SELECT * FROM weekly_report_themes WHERE cycle_id = ${priorCycle[0].id}`
    : [];
  const priorMap = new Map(priorThemes.map((t: any) => [`${t.category}:${t.theme}`, t.senior_count]));

  // Store themes and build summary
  const cycleNum = cycle.week_number;
  const categoryResults: Record<string, Array<{ theme: string; count: number; trend: string; delta: number }>> = {};

  for (const [category, themes] of Object.entries(themeCounts)) {
    const sorted = Object.entries(themes)
      .map(([theme, users]) => {
        const count = (users as Set<string>).size;
        const priorCount = priorMap.get(`${category}:${theme}`) ?? 0;
        const delta = cycleNum === 1 ? 0 : count - priorCount;
        const trend = cycleNum <= 1 ? 'new' : delta > 0 ? 'increasing' : delta < 0 ? 'decreasing' : 'stable';

        // Store in DB
        sql`
          INSERT INTO weekly_report_themes (cycle_id, theme, category, mention_count, senior_count, delta_from_last_week, trend)
          VALUES (${cycleId}, ${theme}, ${category}, ${count}, ${count}, ${delta}, ${trend})
          ON CONFLICT (cycle_id, theme, category) DO UPDATE SET
            mention_count = EXCLUDED.mention_count, senior_count = EXCLUDED.senior_count,
            delta_from_last_week = EXCLUDED.delta_from_last_week, trend = EXCLUDED.trend
        `.catch(() => {});

        return { theme, count, trend, delta };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    categoryResults[category] = sorted;
  }

  // Find most reported theme overall (across all categories)
  let topTheme = { theme: '', count: 0, categories: 0 };
  const themeGlobal: Record<string, { count: number; cats: Set<string> }> = {};
  for (const [cat, themes] of Object.entries(themeCounts)) {
    for (const [theme, users] of Object.entries(themes)) {
      if (!themeGlobal[theme]) themeGlobal[theme] = { count: 0, cats: new Set() };
      themeGlobal[theme].count += (users as Set<string>).size;
      themeGlobal[theme].cats.add(cat);
    }
  }
  for (const [theme, data] of Object.entries(themeGlobal)) {
    if (data.count > topTheme.count) topTheme = { theme, count: data.count, categories: data.cats.size };
  }

  // Build summary embed
  const trendIcon = (t: string, n: number) => {
    if (t === 'new') return '🆕';
    if (t === 'increasing') return `⬆️ +${n}`;
    if (t === 'decreasing') return `⬇️ ${n}`;
    return '➖';
  };

  const submitted = reports.length;
  const late = reports.filter((r: any) => r.is_late).length;

  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle(`📊 Weekly SPA Report Summary — Week ${cycle.week_number}`)
    .setTimestamp();

  const categories = ['Issues', 'Weaknesses', 'Mistakes', 'Risks', 'Suggestions'];
  const catEmojis: Record<string, string> = {
    Issues: '📉', Weaknesses: '⚖️', Mistakes: '🔁', Risks: '🚨', Suggestions: '💡'
  };

  for (const cat of categories) {
    const themes = categoryResults[cat] ?? [];
    if (themes.length === 0) continue;
    embed.addFields({
      name: `${catEmojis[cat]} ${cat}`,
      value: themes.map(t =>
        cycleNum === 1
          ? `• ${t.theme} (${t.count} senior${t.count !== 1 ? 's' : ''})`
          : `• ${t.theme} (${t.count} ${trendIcon(t.trend, Math.abs(t.delta))})`
      ).join('\n'),
    });
  }

  if (topTheme.theme) {
    embed.addFields({
      name: '🔥 Most Reported Theme Overall',
      value: `**${topTheme.theme}** — appeared in ${topTheme.categories} categor${topTheme.categories !== 1 ? 'ies' : 'y'}, ${topTheme.count} senior${topTheme.count !== 1 ? 's' : ''}`,
    });
  }

  embed.addFields({
    name: '📈 Participation',
    value: `${submitted} submitted | ${late} late | ${cycleNum <= 1 ? 'N/A (Week 1)' : 'Trends active'}`,
  });

  await sql`UPDATE weekly_report_cycles SET summary_generated = true, status = 'closed' WHERE id = ${cycleId}`;

  try {
    const ch = await client.channels.fetch(REPORT_CHANNEL) as TextChannel;
    const msg = await ch.send({ embeds: [embed] });
    await sql`UPDATE weekly_report_cycles SET summary_message_id = ${msg.id} WHERE id = ${cycleId}`;
  } catch (e) { console.error('Failed to post summary:', e); }
}

function extractThemes(text: string, tags: string[] | null, otherLabel: string | null): string[] {
  const themes: string[] = [];

  // Keyword matching
  const keywords: Record<string, string> = {
    'ai': 'AI Detection', 'artificial intelligence': 'AI Detection', 'gfx': 'AI GFX',
    'scam': 'Scams', 'fraud': 'Scams', 'investment': 'Investment Scams',
    'proof': 'Proof Verification', 'evidence': 'Proof Verification',
    'low quality': 'Low Quality Posts', 'poor quality': 'Low Quality Posts',
    'rule': 'Rule Confusion', 'unclear': 'Rule Confusion',
    'onboard': 'PA Onboarding', 'training': 'PA Training',
    'punishment': 'Punishment System', 'ban': 'Punishment System',
    'loophole': 'System Loopholes',
    'approval': 'Inconsistent Approvals', 'inconsist': 'Inconsistent Approvals',
  };

  const lower = text.toLowerCase();
  for (const [kw, theme] of Object.entries(keywords)) {
    if (lower.includes(kw) && !themes.includes(theme)) themes.push(theme);
  }

  // Tag-based themes
  if (tags) {
    for (const tag of tags) {
      if (tag === 'Other' && otherLabel) {
        themes.push(otherLabel);
      } else if (tag !== 'Other') {
        const tagTheme = tag === 'AI' ? 'AI Detection' : tag === 'PA Mistakes' ? 'PA Mistakes' : tag;
        if (!themes.includes(tagTheme)) themes.push(tagTheme);
      }
    }
  }

  return themes;
}

async function checkAllSubmitted(client: Client, cycleId: number): Promise<void> {
  try {
    const guild = (client as any).guilds.cache.first();
    if (!guild) return;
    await guild.members.fetch();
    const seniors = guild.members.cache.filter((m: any) =>
      m.roles.cache.has(config.roles.SPA) && !m.roles.cache.has(config.roles.HPA) && !m.user.bot
    );
    const submitted = await sql`SELECT user_id FROM weekly_reports WHERE cycle_id = ${cycleId}`;
    const submittedIds = new Set(submitted.map((r: any) => r.user_id));
    const allDone = Array.from(seniors.values()).every((m: any) => submittedIds.has(m.id));
    if (allDone) await generateSummary(client, cycleId);
  } catch { /* silent */ }
}

async function checkQualityFlag(client: Client, userId: string, score: number, threshold: number, cycleId: number): Promise<void> {
  if (score >= threshold) return;

  // Check last 2 cycles
  const recentReports = await sql`
    SELECT quality_score FROM weekly_reports
    WHERE user_id = ${userId} AND cycle_id < ${cycleId}
    ORDER BY cycle_id DESC LIMIT 1
  `;

  if (recentReports.length > 0 && recentReports[0].quality_score < threshold) {
    // 2 consecutive low quality — add behaviour flag
    await sql`
      INSERT INTO spa_behaviour_flags (user_id, flag_type, note, added_by)
      VALUES (${userId}, '⚠️ Low Insight / Repetitive Reports',
        ${'Quality score below threshold for 2 consecutive weeks'}, 'system')
    `;
    try {
      const ch = await client.channels.fetch(REPORT_CHANNEL) as TextChannel;
      await ch.send({ content: `<@&${config.roles.HPA}> ⚠️ **Low Quality Flag** — <@${userId}> has submitted low-quality weekly reports for 2 consecutive weeks (scores: ${recentReports[0].quality_score}/100, ${score}/100).` });
    } catch { /* silent */ }
  }
}

// ─── SCHEDULER CHECK ──────────────────────────────────────────────────────────
export async function checkWeeklyReportSchedule(client: Client): Promise<void> {
  const cfg = await getReportConfig();
  const now = new Date();
  const nowDay  = now.getUTCDay();
  const nowHour = now.getUTCHours();

  // Start cycle
  if (nowDay === cfg.day_of_week && nowHour === cfg.hour_utc) {
    const existing = await getActiveCycle();
    if (!existing) await startWeeklyCycle(client);
  }

  // Check deadline
  const active = await getActiveCycle();
  if (active && new Date(active.deadline_at) <= now && !active.summary_generated) {
    // Send warning DMs and generate summary
    await handleDeadlinePassed(client, active);
  }

  // Check extension deadlines
  const expiredExtensions = await sql`
    SELECT * FROM weekly_report_extensions WHERE expires_at <= NOW()
  `;
  for (const ext of expiredExtensions) {
    const submitted = await sql`SELECT 1 FROM weekly_reports WHERE cycle_id = ${ext.cycle_id} AND user_id = ${ext.user_id}`;
    if (submitted.length === 0) {
      // Extension expired, no report — count as miss
      await recordMiss(client, ext.user_id, ext.cycle_id);
    }
    await sql`DELETE FROM weekly_report_extensions WHERE id = ${ext.id}`;
  }

  // Prompt expiring behaviour flags
  await sql`DELETE FROM spa_behaviour_flags WHERE expires_at <= NOW() AND expiry_prompted = true`.catch(() => {});
}

async function handleDeadlinePassed(client: Client, cycle: any): Promise<void> {
  // Find who hasn't submitted
  const guild = (client as any).guilds.cache.first();
  if (!guild) return;
  await guild.members.fetch();
  const seniors = guild.members.cache.filter((m: any) =>
    m.roles.cache.has(config.roles.SPA) && !m.roles.cache.has(config.roles.HPA) && !m.user.bot
  );
  const submitted = await sql`SELECT user_id FROM weekly_reports WHERE cycle_id = ${cycle.id}`;
  const submittedIds = new Set(submitted.map((r: any) => r.user_id));

  for (const [, member] of seniors) {
    if (!submittedIds.has(member.id)) {
      // Check if they have an active extension
      const ext = await sql`SELECT 1 FROM weekly_report_extensions WHERE cycle_id = ${cycle.id} AND user_id = ${member.id} AND expires_at > NOW()`;
      if (ext.length > 0) continue; // still has extension

      await dmUser(client, member.id, {
        embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('⚠️ Weekly Report Overdue').setDescription('Your weekly report deadline has passed and no submission was received. This has been recorded as a miss.').setTimestamp()]
      });
      await recordMiss(client, member.id, cycle.id);
    }
  }

  await generateSummary(client, cycle.id);
}

async function recordMiss(client: Client, userId: string, cycleId: number): Promise<void> {
  await sql`
    INSERT INTO weekly_report_misses (user_id, consecutive_misses, last_miss_cycle)
    VALUES (${userId}, 1, ${cycleId})
    ON CONFLICT (user_id) DO UPDATE SET
      consecutive_misses = weekly_report_misses.consecutive_misses + 1,
      last_miss_cycle = ${cycleId},
      updated_at = NOW()
  `;

  const miss = (await sql`SELECT * FROM weekly_report_misses WHERE user_id = ${userId}`)[0];
  const cfg  = await getReportConfig();

  if (miss.consecutive_misses >= cfg.miss_threshold) {
    // Stat flag
    await sql`
      INSERT INTO spa_stat_flags (user_id, flag_type, details)
      VALUES (${userId}, 'below_target', ${`Missed ${miss.consecutive_misses} consecutive weekly reports`})
    `;
    try {
      const ch = await client.channels.fetch(REPORT_CHANNEL) as TextChannel;
      await ch.send({ content: `<@&${config.roles.HPA}> 🚨 **Missing Reports Flag** — <@${userId}> has missed **${miss.consecutive_misses}** consecutive weekly reports.` });
    } catch { /* silent */ }
  }
}
