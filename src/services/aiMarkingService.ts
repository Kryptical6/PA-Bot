import { Client, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, TextChannel } from 'discord.js';
import { sql } from '../database/client';
import { config } from '../config';
import { dmUser } from './dmService';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';

// ─── AI MARK ASSESSMENT ───────────────────────────────────────────────────────
export async function aiMarkAssessment(
  client: Client,
  userId: string,
  sessionId: number,
  resultId: number,
): Promise<void> {
  const [result] = await sql`SELECT r.*, a.title, a.pass_threshold FROM assessment_results r JOIN assessments a ON r.assessment_id = a.id WHERE r.id = ${resultId}`;
  if (!result) { console.error(`[AI] Result ${resultId} not found`); return; }

  const responses = await sql`
    SELECT r.*, q.correct_answer, q.correct_reason, q.post_id, q.context, q.is_scripting
    FROM assessment_responses r
    JOIN assessment_questions q ON r.question_id = q.id
    WHERE r.session_id = ${sessionId}
    ORDER BY r.answered_at ASC
  `;

  // Build the AI prompt
  const questionsText = responses.map((r: any, idx: number) => {
    return [
      `Question ${idx + 1} — Post ID: ${r.post_id}${r.context ? ` (Context: ${r.context})` : ''}`,
      `  Correct answer: ${r.correct_answer}`,
      `  Expected reasoning: ${r.correct_reason ?? 'No specific reasoning required'}`,
      `  User answered: ${r.action}`,
      `  User reasoning: ${r.reason ?? 'None provided'}`,
    ].join('\n');
  }).join('\n\n');

  const systemPrompt = `You are an assessment marker for a marketplace post approval team. Your job is to review a candidate's answers and reasoning, compare them to the correct answers and expected reasoning, and assign a mark for each question.

Marking rules:
- An answer is CORRECT if the action matches exactly (approve/deny/suspend/request_pof)
- For deny and suspend answers, also evaluate whether the reasoning is broadly on the right lines, even if not word-for-word identical
- Minor differences in phrasing are fine - mark as correct if the core reasoning is sound
- If the action is wrong, mark as incorrect regardless of reasoning
- Output ONLY valid JSON, no markdown, no explanation outside the JSON

Output format:
{
  "questions": [
    {
      "question_number": 1,
      "post_id": "...",
      "user_answer": "...",
      "correct_answer": "...",
      "is_correct": true/false,
      "reasoning_quality": "good/acceptable/poor/na",
      "ai_note": "brief note on why correct or incorrect"
    }
  ],
  "summary": "brief overall summary of performance",
  "suggested_score": 0,
  "suggested_pass": true/false
}`;

  let aiResult: any = null;
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 2000,
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Please mark the following assessment responses:\n\n${questionsText}` },
        ],
      }),
    });

    const data = await response.json() as any;
    const raw = data.choices?.[0]?.message?.content ?? '';
    const clean = raw.replace(/```json|```/g, '').trim();
    aiResult = JSON.parse(clean);
  } catch (e) {
    console.error('[AI] Marking failed:', e);
    // Fall back to original scoring without AI
    await sendReviewToHPA(client, userId, sessionId, resultId, responses, result, null);
    return;
  }

  // Apply AI marks to responses
  let aiScore = 0;
  for (let idx = 0; idx < responses.length; idx++) {
    const r = responses[idx];
    const aiQ = aiResult?.questions?.[idx];
    const isCorrect = aiQ?.is_correct ?? (r.action === r.correct_answer);
    if (isCorrect) aiScore++;
    await sql`UPDATE assessment_responses SET is_correct = ${isCorrect} WHERE id = ${r.id}`;
  }

  const aiSuggestedScore  = aiResult?.suggested_score ?? aiScore;
  const aiPct             = Math.round((aiSuggestedScore / responses.length) * 100);
  const aiPassed          = aiResult?.suggested_pass ?? (aiPct >= result.pass_threshold);
  const aiSummary         = aiResult?.summary ?? null;

  // Store AI result
  await sql`
    UPDATE assessment_results SET
      score       = ${aiScore},
      percentage  = ${aiPct},
      passed      = ${aiPassed},
      hpa_feedback = ${aiSummary}
    WHERE id = ${resultId}
  `;

  await sendReviewToHPA(client, userId, sessionId, resultId, responses, result, aiResult);
}

// ─── SEND REVIEW TO HPA ───────────────────────────────────────────────────────
async function sendReviewToHPA(
  client: Client,
  userId: string,
  sessionId: number,
  resultId: number,
  responses: any[],
  assessment: any,
  aiResult: any | null,
): Promise<void> {
  const [freshResult] = await sql`SELECT * FROM assessment_results WHERE id = ${resultId}`;
  const score  = freshResult.score;
  const total  = freshResult.total;
  const pct    = freshResult.percentage;
  const passed = freshResult.passed;

  const embed = new EmbedBuilder()
    .setColor(passed ? Colors.Green : Colors.Red)
    .setTitle(`Assessment Review${aiResult ? ' (AI Marked)' : ''} - ${assessment.title}`)
    .setDescription([
      `**User:** <@${userId}>`,
      `**Score:** ${score}/${total} (${pct}%)`,
      `**Result:** ${passed ? 'Pass' : 'Fail'}`,
      `**Pass Threshold:** ${assessment.pass_threshold}%`,
      `**Result ID:** ${resultId}`,
      aiResult?.summary ? `\n**AI Summary:** ${aiResult.summary}` : '',
    ].filter(Boolean).join('\n'))
    .setFooter({ text: `Page 1/${Math.max(1, Math.ceil(responses.length / 3))} - ${responses.length} questions total${aiResult ? ' - AI pre-marked' : ''}` })
    .setTimestamp();

  // Show first 3 questions with AI notes
  const slice = responses.slice(0, 3);
  slice.forEach((r: any, idx: number) => {
    const aiQ = aiResult?.questions?.[idx];
    const ok  = r.is_correct;
    const lines = [`Answer: ${r.action}  |  Correct: ${r.correct_answer}`];
    if (r.reason) lines.push(`Reason: ${r.reason}`);
    if (r.correct_reason) lines.push(`Expected: ${r.correct_reason}`);
    if (aiQ?.ai_note) lines.push(`AI Note: ${aiQ.ai_note}`);
    embed.addFields({
      name: `Q${idx + 1}: \`${r.post_id}\`${r.is_scripting ? ' [Scripting]' : ''} ${ok ? '✅' : '❌'}`,
      value: lines.join('\n'),
    });
  });

  const btns: ButtonBuilder[] = [];
  btns.push(new ButtonBuilder().setCustomId(`review_confirm:${resultId}`).setLabel('Confirm & Send').setStyle(ButtonStyle.Success));
  btns.push(new ButtonBuilder().setCustomId(`review_override:${resultId}:0`).setLabel('Override').setStyle(ButtonStyle.Primary));
  if (responses.length > 3) btns.push(new ButtonBuilder().setCustomId(`review_page:${resultId}:1`).setLabel('Next').setStyle(ButtonStyle.Secondary));

  try {
    const ch = await client.channels.fetch(config.channels.assessmentResults) as TextChannel;
    await ch.send({
      content: `<@&${config.roles.HPA}> New assessment result${aiResult ? ' (AI pre-marked - please verify)' : ''}: <@${userId}>`,
      embeds: [embed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...btns)],
    });
    console.log(`[AI] Review sent to ${config.channels.assessmentResults} for result ${resultId}`);
  } catch (e) {
    console.error('[AI] Failed to send review to HPA:', e);
  }
}
