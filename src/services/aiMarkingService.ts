import { Client, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, TextChannel } from 'discord.js';
import { sql } from '../database/client';
import { config } from '../config';
import { embedDescription, embedField, embedFooter, embedTitle } from '../utils/embeds';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';

// ─── AI MARK ASSESSMENT ───────────────────────────────────────────────────────
export async function aiMarkAssessment(
  client: Client,
  userId: string,
  sessionId: number,
  resultId: number,
): Promise<void> {
  const [assessment] = await sql`
    SELECT r.*, a.title, a.pass_threshold
    FROM assessment_results r
    JOIN assessments a ON r.assessment_id = a.id
    WHERE r.id = ${resultId}
  `;
  if (!assessment) { console.error(`[AI] Result ${resultId} not found`); return; }

  const responses = await sql`
    SELECT r.id, r.action, r.reason, r.session_id,
           q.correct_answer, q.correct_reason, q.post_id, q.context, q.is_scripting
    FROM assessment_responses r
    JOIN assessment_questions q ON r.question_id = q.id
    WHERE r.session_id = ${sessionId}
    ORDER BY r.answered_at ASC
  `;

  if (responses.length === 0) {
    console.error(`[AI] No responses found for session ${sessionId}`);
    return;
  }

  console.log(`[AI] Marking ${responses.length} responses for result ${resultId}`);

  // Build prompt
  const questionsText = responses.map((r: any, idx: number) => [
    `Question ${idx + 1} - Post ID: ${r.post_id}${r.context ? ` (Context: ${r.context})` : ''}`,
    `  Correct action: ${r.correct_answer}`,
    `  Expected reasoning: ${r.correct_reason ?? 'No specific reasoning required'}`,
    `  Candidate action: ${r.action}`,
    `  Candidate reasoning: ${r.reason ?? 'None provided'}`,
  ].join('\n')).join('\n\n');

  const systemPrompt = `You are an assessment marker for a marketplace post approval team. Mark each response fairly.

MARKING RULES:
1. The action (approve/deny/suspend/request_pof) MUST match exactly to be correct. Wrong action = incorrect, regardless of reasoning.
2. For deny and suspend, the reasoning must be broadly correct - similar meaning is fine, exact wording is not required.
3. If no correct_reason is specified, only the action matters.
4. Be lenient with phrasing - if the candidate clearly understood the issue, mark correct.

IMPORTANT: suggested_score must be the COUNT of correct answers (an integer, e.g. 18), NOT a percentage.

Respond with ONLY this exact JSON structure, no markdown fences, no extra text:
{
  "questions": [
    {
      "question_number": 1,
      "post_id": "string",
      "user_answer": "string",
      "correct_answer": "string",
      "is_correct": true,
      "reasoning_quality": "good",
      "ai_note": "brief explanation"
    }
  ],
  "summary": "brief overall summary",
  "suggested_score": 18,
  "suggested_pass": true
}`;

  let aiResult: any = null;
  let aiError: any = null;

  try {
    console.log(`[AI] Calling OpenAI for ${responses.length} questions, key present: ${!!OPENAI_API_KEY}`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 4000,
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: `Mark these ${responses.length} assessment responses:\n\n${questionsText}` },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json() as any;
    console.log(`[AI] OpenAI response received, tokens used: ${data.usage?.total_tokens}`);

    const raw   = data.choices?.[0]?.message?.content ?? '';
    const clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    console.log(`[AI] Raw response (first 500 chars): ${clean.slice(0, 500)}`);

    aiResult = JSON.parse(clean);

    // Validate structure
    if (!Array.isArray(aiResult.questions)) throw new Error('AI response missing questions array');
    if (aiResult.questions.length !== responses.length) {
      console.warn(`[AI] Question count mismatch: expected ${responses.length}, got ${aiResult.questions.length}`);
    }

  } catch (e) {
    aiError = e;
    console.error('[AI] Marking failed, falling back to exact-match scoring:', e);
  }

  // Apply marks - use AI result if available, fall back to exact match
  let score = 0;
  const markedResponses: any[] = [];

  for (let idx = 0; idx < responses.length; idx++) {
    const r    = responses[idx];
    let isCorrect: boolean;
    let aiNote: string | null = null;

    if (aiResult && aiResult.questions[idx]) {
      const aiQ = aiResult.questions[idx];
      isCorrect = aiQ.is_correct === true;
      aiNote    = aiQ.ai_note ?? null;
    } else {
      // Exact match fallback
      isCorrect = r.action === r.correct_answer;
    }

    if (isCorrect) score++;
    await sql`UPDATE assessment_responses SET is_correct = ${isCorrect} WHERE id = ${r.id}`;
    markedResponses.push({ ...r, is_correct: isCorrect, ai_note: aiNote });
  }

  const total  = responses.length;
  const pct    = total > 0 ? Math.round((score / total) * 100) : 0;
  const passed = pct >= assessment.pass_threshold;
  const summary = aiResult?.summary ?? (aiError ? `AI marking unavailable - exact match used. ${score}/${total} correct.` : null);

  console.log(`[AI] Marking complete: ${score}/${total} (${pct}%) - ${passed ? 'PASS' : 'FAIL'}`);

  // Update result with correct scores
  await sql`
    UPDATE assessment_results SET
      score        = ${score},
      percentage   = ${pct},
      passed       = ${passed},
      hpa_feedback = ${summary}
    WHERE id = ${resultId}
  `;

  await sendReviewToHPA(client, userId, resultId, markedResponses, assessment, score, total, pct, passed, !!aiResult);
}

// ─── SEND REVIEW TO HPA ───────────────────────────────────────────────────────
async function sendReviewToHPA(
  client: Client,
  userId: string,
  resultId: number,
  responses: any[],
  assessment: any,
  score: number,
  total: number,
  pct: number,
  passed: boolean,
  aiMarked: boolean,
): Promise<void> {
  const totalPages = Math.max(1, Math.ceil(responses.length / 3));

  const embed = new EmbedBuilder()
    .setColor(passed ? Colors.Green : Colors.Red)
    .setTitle(embedTitle(`Assessment Review${aiMarked ? ' (AI Marked)' : ' (Exact Match)'} - ${assessment.title}`))
    .setDescription(embedDescription([
      `**User:** <@${userId}>`,
      `**Score:** ${score}/${total} (${pct}%)`,
      `**Result:** ${passed ? 'Pass' : 'Fail'}`,
      `**Pass Threshold:** ${assessment.pass_threshold}%`,
      `**Result ID:** ${resultId}`,
      assessment.hpa_feedback ? `\n**AI Summary:** ${assessment.hpa_feedback}` : '',
    ].filter(Boolean).join('\n')))
    .setFooter({ text: embedFooter(`Page 1/${totalPages} - ${total} questions total - ${aiMarked ? 'AI pre-marked' : 'exact match fallback'}`) })
    .setTimestamp();

  // Show first 3 questions
  responses.slice(0, 3).forEach((r: any, idx: number) => {
    const ok    = r.is_correct === true;
    const lines = [`Answer: ${r.action}  |  Correct: ${r.correct_answer}`];
    if (r.reason)        lines.push(`Reason: ${r.reason}`);
    if (r.correct_reason) lines.push(`Expected: ${r.correct_reason}`);
    if (r.ai_note)       lines.push(`AI Note: ${r.ai_note}`);
    embed.addFields(embedField(
      `Q${idx + 1}: \`${r.post_id}\`${r.is_scripting ? ' [Scripting]' : ''} ${ok ? '✅' : '❌'}`,
      lines.join('\n'),
    ));
  });

  const btns: ButtonBuilder[] = [
    new ButtonBuilder().setCustomId(`review_confirm:${resultId}`).setLabel('Confirm & Send').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`review_override:${resultId}:0`).setLabel('Override').setStyle(ButtonStyle.Primary),
  ];
  if (responses.length > 3) {
    btns.push(new ButtonBuilder().setCustomId(`review_page:${resultId}:1`).setLabel('Next').setStyle(ButtonStyle.Secondary));
  }

  try {
    const ch = await client.channels.fetch(config.channels.assessmentResults) as TextChannel;
    await ch.send({
      content: `<@&${config.roles.HPA}> New assessment result${aiMarked ? ' (AI pre-marked - please verify)' : ''}: <@${userId}>`,
      embeds: [embed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...btns)],
    });
    console.log(`[AI] Review sent to channel ${config.channels.assessmentResults} for result ${resultId}`);
  } catch (e) {
    console.error('[AI] Failed to send review to HPA:', e);
  }
}
