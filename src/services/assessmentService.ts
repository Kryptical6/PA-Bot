import { Client, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, TextChannel } from 'discord.js';
import { sql } from '../database/client';
import { config } from '../config';
import { dmUser, safeDM } from './dmService';
import { infoEmbed, warningEmbed } from '../utils/embeds';

function parseOrder(raw: any): number[] {
  if (Array.isArray(raw)) return raw.map(Number);
  try { return JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw)).map(Number); } catch { return []; }
}

export async function startAssessmentSession(client: Client, userId: string, assessmentId: number): Promise<void> {
  const [a] = await sql`SELECT * FROM assessments WHERE id = ${assessmentId}`;
  if (!a) return;

  const mainQs = await sql`SELECT id FROM assessment_questions WHERE assessment_id = ${assessmentId} AND is_scripting = false`;
  const shuffled = mainQs.map((q: any) => q.id).sort(() => Math.random() - 0.5);
  const deadline = new Date(Date.now() + Number(a.deadline_ms));

  await sql`
    INSERT INTO assessment_sessions (user_id, assessment_id, question_order, current_index, deadline)
    VALUES (${userId}, ${assessmentId}, ${JSON.stringify(shuffled)}::jsonb, 0, ${deadline.toISOString()})
    ON CONFLICT (user_id, assessment_id) DO UPDATE
    SET question_order = ${JSON.stringify(shuffled)}::jsonb, current_index = 0, deadline = ${deadline.toISOString()}, started_at = NOW()
  `;

  const [session] = await sql`SELECT id FROM assessment_sessions WHERE user_id = ${userId} AND assessment_id = ${assessmentId}`;

  const welcomeEmbed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle(`📝 ${a.title}`)
    .setDescription([
      '**Welcome to your assessment.**',
      '',
      'Each question has a **Post ID**. Review the post then submit your answer.',
      '',
      a.description ? `**Briefing:**\n${a.description}` : null,
      '',
      `**Questions:** ${shuffled.length} | **Deadline:** <t:${Math.floor(deadline.getTime() / 1000)}:R>`,
      `**Pass Threshold:** ${a.pass_threshold}%`,
    ].filter(Boolean).join('\n'))
    .setTimestamp();

  await dmUser(client, userId, { embeds: [welcomeEmbed] });
  await sendQuestion(client, userId, session.id, assessmentId, shuffled, 0);
}

export async function sendQuestion(client: Client, userId: string, sessionId: number, assessmentId: number, questionOrder: number[], index: number): Promise<void> {
  const order = parseOrder(questionOrder);
  if (index >= order.length) { await askScripting(client, userId, sessionId, assessmentId); return; }

  const [q] = await sql`SELECT * FROM assessment_questions WHERE id = ${order[index]}`;
  if (!q) return;

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
      await ch.send(`⚠️ Failed to send assessment question to <@${userId}>.`);
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
  const [session] = await sql`SELECT * FROM assessment_sessions WHERE id = ${sessionId}`;
  const existing = parseOrder(session.question_order);
  const newOrder = [...existing, ...qs.map((q: any) => q.id)];

  await sql`UPDATE assessment_sessions SET has_scripting = true, scripting_started = true, question_order = ${JSON.stringify(newOrder)}::jsonb WHERE id = ${sessionId}`;
  await sendQuestion(client, userId, sessionId, assessmentId, newOrder, session.current_index);
}

export async function finalizeAssessment(client: Client, userId: string, sessionId: number, hasScripting: boolean): Promise<void> {
  await sql`UPDATE assessment_sessions SET has_scripting = ${hasScripting} WHERE id = ${sessionId}`;
  const [s] = await sql`SELECT * FROM assessment_sessions WHERE id = ${sessionId}`;
  const responses = await sql`
    SELECT r.*, q.correct_answer, q.keywords, q.is_scripting, q.post_id
    FROM assessment_responses r JOIN assessment_questions q ON r.question_id = q.id
    WHERE r.session_id = ${sessionId}
  `;

  let correct = 0;
  for (const r of responses) {
    const ok = r.action === r.correct_answer;
    await sql`UPDATE assessment_responses SET is_correct = ${ok} WHERE id = ${r.id}`;
    if (ok) correct++;
  }

  const total = responses.length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const [assessment] = await sql`SELECT * FROM assessments WHERE id = ${s.assessment_id}`;
  const passed = pct >= assessment.pass_threshold;

  const [result] = await sql`
    INSERT INTO assessment_results (user_id, assessment_id, session_id, score, total, percentage, passed)
    VALUES (${userId}, ${s.assessment_id}, ${sessionId}, ${correct}, ${total}, ${pct}, ${passed})
    RETURNING id
  `;

  await dmUser(client, userId, { embeds: [infoEmbed('Assessment Complete', 'Your responses are being processed. Please wait for your result.')] });
  await sendHPAReview(client, userId, sessionId, result.id, responses, assessment, correct, total, pct, passed);
}

async function sendHPAReview(client: Client, userId: string, sessionId: number, resultId: number, responses: any[], assessment: any, score: number, total: number, pct: number, passed: boolean): Promise<void> {
  const channelId = config.channels.assessmentResults || config.channels.hpaReview;

  const summary = new EmbedBuilder()
    .setColor(passed ? Colors.Green : Colors.Red)
    .setTitle(`📊 Assessment Review - ${assessment.title}`)
    .addFields(
      { name: 'User', value: `<@${userId}>`, inline: true },
      { name: 'Score', value: `${score}/${total}`, inline: true },
      { name: 'Result', value: passed ? '✅ Pass' : '❌ Fail', inline: true },
      { name: 'Percentage', value: `${pct}%`, inline: true },
      { name: 'Pass Threshold', value: `${assessment.pass_threshold}%`, inline: true },
      { name: 'Result ID', value: `${resultId}`, inline: true },
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`review_confirm:${resultId}`).setLabel('✅ Confirm').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`review_override:${resultId}`).setLabel('✏️ Override').setStyle(ButtonStyle.Primary),
  );

  const PER_PAGE = 5;
  const pages = Math.ceil(responses.length / PER_PAGE);
  const questionEmbeds = Array.from({ length: pages }, (_, i) => {
    const slice = responses.slice(i * PER_PAGE, (i + 1) * PER_PAGE);
    const embed = new EmbedBuilder().setColor(Colors.Blue).setTitle(`📋 Questions (${i + 1}/${pages})`).setTimestamp();
    slice.forEach((r: any, j: number) => {
      embed.addFields({
        name: `Q${i * PER_PAGE + j + 1}: \`${r.post_id ?? r.question_id}\`${r.is_scripting ? ' [Scripting]' : ''} ${r.is_correct ? '✅' : '❌'}`,
        value: [`Answer: **${r.action}**`, r.reason ? `Reason: ${r.reason}` : null, `Correct: **${r.correct_answer}**`, r.keywords ? `Keywords: ${r.keywords}` : null].filter(Boolean).join('\n'),
      });
    });
    return embed;
  });

  try {
    const ch = await client.channels.fetch(channelId) as TextChannel;
    await ch.send({ content: `<@&${config.roles.HPA}> New assessment result ready`, embeds: [summary], components: [row] });
    for (const qe of questionEmbeds) await ch.send({ embeds: [qe] });
  } catch (e) { console.error('Failed to send assessment review:', e); }
}

export async function sendFinalResult(client: Client, userId: string, resultId: number): Promise<void> {
  const [r] = await sql`SELECT r.*, a.title FROM assessment_results r JOIN assessments a ON r.assessment_id = a.id WHERE r.id = ${resultId}`;
  if (!r) return;

  const finalScore = r.hpa_override_score ?? r.score;
  const finalPassed = r.hpa_override_passed ?? r.passed;

  const embed = new EmbedBuilder()
    .setColor(finalPassed ? Colors.Green : Colors.Red)
    .setTitle(`📊 Assessment Result - ${r.title}`)
    .addFields(
      { name: 'Score', value: `${finalScore}/${r.total}`, inline: true },
      { name: 'Percentage', value: `${r.percentage}%`, inline: true },
      { name: 'Result', value: finalPassed ? '✅ Pass' : '❌ Fail', inline: true },
    )
    .setTimestamp();

  if (r.hpa_feedback) embed.addFields({ name: 'Feedback', value: r.hpa_feedback });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`view_details:${resultId}`).setLabel('📊 View Detailed Results').setStyle(ButtonStyle.Primary)
  );

  await sql`UPDATE assessment_results SET result_sent = true WHERE id = ${resultId}`;
  await dmUser(client, userId, { embeds: [embed], components: [row] });
}
