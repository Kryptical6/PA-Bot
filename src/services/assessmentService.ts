import { Client, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, TextChannel } from 'discord.js';
import { sql } from '../database/client';
import { config } from '../config';
import { dmUser } from './dmService';
import { infoEmbed } from '../utils/embeds';

function parseOrder(raw: any): number[] {
  if (Array.isArray(raw)) return raw.map(Number);
  try { return JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw)).map(Number); } catch { return []; }
}

export async function startAssessmentSession(client: Client, userId: string, assessmentId: number): Promise<void> {
  const rows = await sql`SELECT * FROM assessments WHERE id = ${assessmentId}`;
  if (rows.length === 0) return;
  const a = rows[0];

  const mainQs = await sql`SELECT id FROM assessment_questions WHERE assessment_id = ${assessmentId} AND is_scripting = false`;
  const shuffled = mainQs.map((q: any) => q.id).sort(() => Math.random() - 0.5);
  const deadline = new Date(Date.now() + Number(a.deadline_ms));

  await sql`
    INSERT INTO assessment_sessions (user_id, assessment_id, question_order, current_index, deadline)
    VALUES (${userId}, ${assessmentId}, ${JSON.stringify(shuffled)}::jsonb, 0, ${deadline.toISOString()})
    ON CONFLICT (user_id, assessment_id) DO UPDATE
    SET question_order = ${JSON.stringify(shuffled)}::jsonb, current_index = 0, deadline = ${deadline.toISOString()}, started_at = NOW()
  `;

  const sessionRows = await sql`SELECT id FROM assessment_sessions WHERE user_id = ${userId} AND assessment_id = ${assessmentId}`;
  const sessionId = sessionRows[0].id;

  const descParts: string[] = [
    '**Welcome to your assessment.**',
    '',
    'Each question has a **Post ID**. Review the post then submit your answer.',
    '',
  ];
  if (a.description) descParts.push(`**Briefing:**\n${a.description}`, '');
  descParts.push(
    `**Questions:** ${shuffled.length} | **Deadline:** <t:${Math.floor(deadline.getTime() / 1000)}:R>`,
    `**Pass Threshold:** ${a.pass_threshold}%`
  );

  const welcomeEmbed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle(`📝 ${a.title}`)
    .setDescription(descParts.join('\n'))
    .setTimestamp();

  await dmUser(client, userId, { embeds: [welcomeEmbed] });
  await sendQuestion(client, userId, sessionId, assessmentId, shuffled, 0);
}

export async function sendQuestion(client: Client, userId: string, sessionId: number, assessmentId: number, questionOrder: number[], index: number): Promise<void> {
  const order = parseOrder(questionOrder);
  if (index >= order.length) { await askScripting(client, userId, sessionId, assessmentId); return; }

  const qRows = await sql`SELECT * FROM assessment_questions WHERE id = ${order[index]}`;
  if (qRows.length === 0) return;
  const q = qRows[0];

  const embed = new EmbedBuilder()
    .setColor(Colors.Yellow)
    .setTitle(`Question ${index + 1} of ${order.length}`)
    .addFields({ name: 'Post ID', value: `\`${q.post_id}\`` })
    .setFooter({ text: `Session ID: ${sessionId}` })
    .setTimestamp();

  if (q.context) embed.addFields({ name: 'Context', value: q.context });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`assess:${sessionId}:${order[index]}:approve`).setLabel('✅ Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`assess:${sessionId}:${order[index]}:deny`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`assess:${sessionId}:${order[index]}:suspend`).setLabel('⛔ Suspend').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`assess:${sessionId}:${order[index]}:request_pof`).setLabel('📄 Request POF').setStyle(ButtonStyle.Primary),
  );

  const sent = await dmUser(client, userId, { embeds: [embed], components: [row] });
  if (!sent) {
    try {
      const ch = await client.channels.fetch(config.channels.hpaReview) as TextChannel;
      await ch.send(`⚠️ Failed to DM assessment question to <@${userId}>.`);
    } catch { /* silent */ }
  }
}

async function askScripting(client: Client, userId: string, sessionId: number, assessmentId: number): Promise<void> {
  const scriptingQs = await sql`SELECT id FROM assessment_questions WHERE assessment_id = ${assessmentId} AND is_scripting = true`;
  if (scriptingQs.length === 0) { await finalizeAssessment(client, userId, sessionId, false); return; }

  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle('Scripting Section')
    .setDescription('Main questions complete.\n\nDo you have a **scripting role**? If yes, scripting questions will be included in your score.')
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`scripting:${sessionId}:yes`).setLabel('Yes - I have a scripting role').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`scripting:${sessionId}:no`).setLabel('No - Skip scripting questions').setStyle(ButtonStyle.Secondary),
  );

  await dmUser(client, userId, { embeds: [embed], components: [row] });
}

export async function sendScriptingQuestions(client: Client, userId: string, sessionId: number, assessmentId: number): Promise<void> {
  const qs = await sql`SELECT id FROM assessment_questions WHERE assessment_id = ${assessmentId} AND is_scripting = true`;
  const sessionRows = await sql`SELECT * FROM assessment_sessions WHERE id = ${sessionId}`;
  const session = sessionRows[0];
  const existing = parseOrder(session.question_order);
  const newOrder = [...existing, ...qs.map((q: any) => q.id)];
  await sql`UPDATE assessment_sessions SET has_scripting = true, scripting_started = true, question_order = ${JSON.stringify(newOrder)}::jsonb WHERE id = ${sessionId}`;
  await sendQuestion(client, userId, sessionId, assessmentId, newOrder, session.current_index);
}

export async function finalizeAssessment(client: Client, userId: string, sessionId: number, hasScripting: boolean): Promise<void> {
  await sql`UPDATE assessment_sessions SET has_scripting = ${hasScripting} WHERE id = ${sessionId}`;
  const sessionRows = await sql`SELECT * FROM assessment_sessions WHERE id = ${sessionId}`;
  const s = sessionRows[0];

  const responses = await sql`
    SELECT r.*, q.correct_answer, q.keywords, q.is_scripting, q.post_id
    FROM assessment_responses r JOIN assessment_questions q ON r.question_id = q.id
    WHERE r.session_id = ${sessionId} ORDER BY r.answered_at ASC
  `;

  let correct = 0;
  for (const r of responses) {
    const ok = r.action === r.correct_answer;
    await sql`UPDATE assessment_responses SET is_correct = ${ok} WHERE id = ${r.id}`;
    if (ok) correct++;
  }

  const total = responses.length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const assessmentRows = await sql`SELECT * FROM assessments WHERE id = ${s.assessment_id}`;
  const assessment = assessmentRows[0];
  const passed = pct >= assessment.pass_threshold;

  const resultRows = await sql`
    INSERT INTO assessment_results (user_id, assessment_id, session_id, score, total, percentage, passed)
    VALUES (${userId}, ${s.assessment_id}, ${sessionId}, ${correct}, ${total}, ${pct}, ${passed})
    RETURNING id
  `;
  const resultId = resultRows[0].id;

  console.log(`Assessment finalized: user=${userId} result=${resultId} score=${correct}/${total} (${pct}%)`);
  await dmUser(client, userId, { embeds: [infoEmbed('Assessment Complete', 'Your responses are being processed. Please wait for your result.')] });
  await sendHPAReview(client, userId, sessionId, resultId, responses, assessment, correct, total, pct, passed);
}

export function buildReviewEmbed(
  userId: string,
  assessment: any,
  responses: any[],
  score: number,
  total: number,
  pct: number,
  passed: boolean,
  page: number,
  resultId: number
): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const PER_PAGE = 3;
  const totalPages = Math.max(1, Math.ceil(responses.length / PER_PAGE));
  const slice = responses.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  const embed = new EmbedBuilder()
    .setColor(passed ? Colors.Green : Colors.Red)
    .setTitle(`📊 Assessment Review - ${assessment.title}`)
    .setDescription(
      `**User:** <@${userId}>\n` +
      `**Score:** ${score}/${total} (${pct}%)\n` +
      `**Result:** ${passed ? '✅ Pass' : '❌ Fail'}\n` +
      `**Pass Threshold:** ${assessment.pass_threshold}%\n` +
      `**Result ID:** ${resultId}`
    )
    .setFooter({ text: `Page ${page + 1}/${totalPages} - ${responses.length} questions total` })
    .setTimestamp();

  slice.forEach((r: any, idx: number) => {
    const qNum = page * PER_PAGE + idx + 1;
    const ok = (r.override_correct !== null && r.override_correct !== undefined) ? r.override_correct : r.is_correct;
    const lines = [`**Answer:** ${r.action}  |  **Correct:** ${r.correct_answer}`];
    if (r.reason) lines.push(`**Reason:** ${r.reason}`);
    if (r.keywords) lines.push(`**Expected:** ${r.keywords}`);
    embed.addFields({
      name: `Q${qNum}: \`${r.post_id}\`${r.is_scripting ? ' [Scripting]' : ''} ${ok ? '✅' : '❌'}`,
      value: lines.join('\n'),
    });
  });

  const btns: ButtonBuilder[] = [];
  if (page > 0) btns.push(new ButtonBuilder().setCustomId(`review_page:${resultId}:${page - 1}`).setLabel('◀ Prev').setStyle(ButtonStyle.Secondary));
  btns.push(new ButtonBuilder().setCustomId(`review_confirm:${resultId}`).setLabel('✅ Confirm').setStyle(ButtonStyle.Success));
  btns.push(new ButtonBuilder().setCustomId(`review_override:${resultId}:${page}`).setLabel('✏️ Override').setStyle(ButtonStyle.Primary));
  if (page + 1 < totalPages) btns.push(new ButtonBuilder().setCustomId(`review_page:${resultId}:${page + 1}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary));

  return { embed, row: new ActionRowBuilder<ButtonBuilder>().addComponents(...btns) };
}

async function sendHPAReview(
  client: Client, userId: string, sessionId: number, resultId: number,
  responses: any[], assessment: any, score: number, total: number, pct: number, passed: boolean
): Promise<void> {
  const channelId = config.channels.assessmentResults;
  const { embed, row } = buildReviewEmbed(userId, assessment, responses, score, total, pct, passed, 0, resultId);

  try {
    const ch = await client.channels.fetch(channelId) as TextChannel;
    if (!ch) { console.error(`Assessment results channel not found: ${channelId}`); return; }
    await ch.send({
      content: `<@&${config.roles.HPA}> New assessment result ready for review`,
      embeds: [embed],
      components: [row],
    });
    console.log(`Assessment review sent: channel=${channelId} result=${resultId}`);
  } catch (e) { console.error('Failed to send assessment review:', e); }
}

export async function sendFinalResult(client: Client, userId: string, resultId: number): Promise<void> {
  const rows = await sql`SELECT r.*, a.title FROM assessment_results r JOIN assessments a ON r.assessment_id = a.id WHERE r.id = ${resultId}`;
  if (rows.length === 0) return;
  const r = rows[0];

  const finalScore  = r.hpa_override_score ?? r.score;
  const finalPassed = r.hpa_override_passed ?? r.passed;

  const embed = new EmbedBuilder()
    .setColor(finalPassed ? Colors.Green : Colors.Red)
    .setTitle(`📊 Assessment Result - ${r.title}`)
    .addFields(
      { name: 'Score',      value: `${finalScore}/${r.total}`, inline: true },
      { name: 'Percentage', value: `${r.percentage}%`,         inline: true },
      { name: 'Result',     value: finalPassed ? '✅ Pass' : '❌ Fail', inline: true },
    )
    .setTimestamp();

  if (r.hpa_feedback) embed.addFields({ name: 'Feedback', value: r.hpa_feedback });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`view_details:${resultId}`).setLabel('📊 View Detailed Results').setStyle(ButtonStyle.Primary)
  );

  await sql`UPDATE assessment_results SET result_sent = true WHERE id = ${resultId}`;
  await dmUser(client, userId, { embeds: [embed], components: [row] });
  console.log(`Final result sent to ${userId} for result ${resultId}`);
}

export async function sendRetakeRequest(client: Client, userId: string, assessmentId: number, assessmentTitle: string, reqId: number): Promise<void> {
  const prevRows = await sql`
    SELECT * FROM assessment_results WHERE user_id = ${userId} AND assessment_id = ${assessmentId}
    ORDER BY completed_at DESC LIMIT 1
  `;

  const embed = new EmbedBuilder()
    .setColor(Colors.Orange)
    .setTitle('🔄 Retake Request')
    .addFields(
      { name: 'User',       value: `<@${userId}>`,  inline: true },
      { name: 'Assessment', value: assessmentTitle, inline: true },
    )
    .setFooter({ text: `Request ID: ${reqId}` })
    .setTimestamp();

  if (prevRows.length > 0) {
    const prev = prevRows[0];
    const prevScore  = prev.hpa_override_score ?? prev.score;
    const prevPassed = prev.hpa_override_passed ?? prev.passed;
    embed.addFields({
      name: 'Previous Result',
      value: `${prevScore}/${prev.total} (${prev.percentage}%) - ${prevPassed ? '✅ Pass' : '❌ Fail'}`,
    });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`retake_approve:${reqId}`).setLabel('✅ Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`retake_deny:${reqId}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`retake_reason:${reqId}`).setLabel('❓ Ask for Reason').setStyle(ButtonStyle.Secondary),
  );

  try {
    const ch = await client.channels.fetch(config.channels.appeals) as TextChannel;
    if (!ch) { console.error(`Appeals channel not found: ${config.channels.appeals}`); return; }
    await ch.send({ content: `<@&${config.roles.HPA}>`, embeds: [embed], components: [row] });
    console.log(`Retake request sent: channel=${config.channels.appeals} user=${userId}`);
  } catch (e) { console.error('Failed to send retake request:', e); }
}
