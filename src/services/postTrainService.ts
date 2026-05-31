import {
  Client, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle,
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} from 'discord.js';
import { sql } from '../database/client';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';

// CATEGORY LABELS
export const TRAIN_CATEGORIES: Record<string, string> = {
  fh:             'For Hire (FH)',
  lfd:            'Looking For Developer (LFD)',
  skill_role:     'Skill Role Applications',
  sell_creations: 'Sell Creations',
  investors:      'Investor Posts',
  advertising:    'Roblox Advertising',
  reviews:        'Reviews',
  mixed:          'Mixed (all categories)',
};

// GENERATED POST STRUCTURE
export interface GeneratedPost {
  title:          string;
  description:    string;
  payment:        string | null;
  category:       string;
  scam_logs:      number;
  member_since:   string;
  has_reviews:    boolean;
  post_id:        string;
  correct_action: 'approve' | 'deny' | 'suspend' | 'request_pof';
  violation:      string | null;
  explanation:    string;
  difficulty:     'easy' | 'medium' | 'hard';
}

// GENERATE POST VIA GPT-4o-mini
export async function generateTrainingPost(category: string): Promise<GeneratedPost | null> {
  const actualCategory = category === 'mixed'
    ? (['fh', 'lfd', 'skill_role', 'sell_creations', 'investors', 'advertising', 'reviews'] as const)[
        Math.floor(Math.random() * 7)
      ]
    : category;

  const difficultyRoll = Math.random();
  const difficulty: 'easy' | 'medium' | 'hard' =
    difficultyRoll < 0.33 ? 'easy' : difficultyRoll < 0.66 ? 'medium' : 'hard';

  const systemPrompt = buildSystemPrompt();
  const userPrompt   = buildUserPrompt(actualCategory, difficulty);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model:       'gpt-4o-mini',
        max_tokens:  1200,
        temperature: 0.9,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[PostTrain] OpenAI error ${response.status}: ${errText}`);
      return null;
    }

    const data  = await response.json() as any;
    const raw   = data.choices?.[0]?.message?.content ?? '';
    const clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed: GeneratedPost = JSON.parse(clean);
    parsed.difficulty = difficulty;
    return parsed;
  } catch (e) {
    console.error('[PostTrain] Generation failed:', e);
    return null;
  }
}

// SYSTEM PROMPT
function buildSystemPrompt(): string {
  return `You are a post generator for a Roblox marketplace staff training tool called RoDevs. You generate fake but realistic marketplace posts for Post Approver trainees to review.

MARKETPLACE CATEGORIES:
- fh: For Hire - developers advertising their services
- lfd: Looking For Developer - users hiring developers
- skill_role: Skill Role Applications - developers proving skill to unlock a posting category
- sell_creations: Sell Creations - users selling ready-made assets
- investors: Investor Posts - developers seeking financial investment
- advertising: Roblox Advertising - advertising a Roblox game/group
- reviews: Reviews - leaving feedback about a developer's service

OFFICIAL RULES (must be followed exactly - from the RoDevs Post Approver Handbook):

== FOR HIRE (FH) ==
- Must state clear payment and payment method (Robux, USD, etc.)
- "Negotiable" alone is NOT acceptable - a fixed minimum or range is required
- Price ranges must NOT exceed 1.5x the base payment (smaller payments can bypass this)
- Percentages are not a valid standalone payment - a fixed price must also be provided
- Posts must be professional, clear, and well formatted
- Poor grammar or spelling that makes the post hard to read = DENY
- Low-quality or poorly described services = DENY
- No plagiarism/stolen assets in any form
- Tutorial work is not acceptable as a portfolio example
- AI-generated work = SUSPEND (punishment request), unless declared as placeholder/filler
- No selling games or groups
- No free models/free vectors (unless declared placeholder/filler)
- No exploit/virus/malware/worm related services
- No commission finders (posting on behalf of others)
- No Discord server links
- No AFK/clicker/scam game advertising
- No server creation or management services
- No multi-hiring in a single post (one service per post)
- No CustomUse
- No idea makers/concept creators/story writers in FH (only lfd-others)
- No selling plugins
- FH posts need at least 2 work examples
- Scripting/animation/video/SFX/sound/VFX need at least 2 VIDEO examples
- Examples must not require a download - must use streaming (e.g. YouTube)
- No low-quality examples or phone camera photos of a screen
- Skill role apps need proof of ownership (layers screenshot, keyframes, topology, etc.)

== LOOKING FOR DEVELOPER (LFD) ==
- Must state a clear payment or range (not just "negotiable")
- No percentage-only payment - a fixed price is required
- Payments must be fair - underpayment = DENY
- No commission finders (project owner must post themselves)
- No downloadable files
- No Discord server links
- No multi-hire (one developer role per post)
- No server creation or management services
- Commission deadline must be at least 3 days - under 3 days = DENY
- 3D rigger posted in lfd-others = wrong channel (should be lfd-animation or lfd-modeler)
- 2 scam logs = DENY

== SKILL ROLE APPLICATIONS ==
- Requires at least 2 examples; scripting/VFX/animation/SFX/sound need VIDEO examples
- Tutorial work = DENY
- No downloadable files
- Proof of ownership required (screenshot showing creation process: layers, keyframes, topology, timelines, etc.)
- If no proof of ownership provided = DENY
- Roblox account must be linked if applying for game/group creator roles

== SELL CREATIONS ==
- No selling games or groups = DENY
- No selling scripted maps = DENY (it's essentially a game)
- At least 2 examples required
- Scripted systems/VFX/Animations need video examples
- Must meet quality standards
- No downloadable files
- 1 scam log = DENY (stricter than FH - Sell Creations requires a clean record)

== INVESTOR POSTS ==
- Must offer at least 15% revenue share - below 15% = DENY
- Must state a clear fixed amount or range for investment
- At least 5 images covering all aspects (maps, UI, models, systems)
- Game must be at least 55% complete
- If 100% complete, must include a game link
- No off-platform games
- 1 scam log = DENY
- 90-100% revenue share offer = DENY (effectively selling the game, which is prohibited)
- No downloadable files

== ROBLOX ADVERTISING ==
- Game must be publicly playable (not private or unpublished)
- No AFK games
- Only Roblox games/groups - no off-platform products
- No scam games
- Services cannot be advertised here (only Roblox platform creations)

== REVIEWS ==
- Must include clear proof of what was received
- Must include payment proof
- No insulting or vulgar language
- No fake reviews
- Scam reports must go to ModMail, not here = DENY
- Only reviews for RoDevs transactions
- Payment must match the review content

== PROOF OF FUNDS (request_pof action) ==
- Required when a post offers 30,000 Robux OR MORE, or $200 USD OR MORE
- The post must FIRST pass all other checks before POF is requested
- If POF threshold is met AND the post is otherwise completely clean = correct_action is "request_pof"
- If POF threshold is met BUT the post also has a rule violation = correct_action is "deny" (fix the violation first)

== SUSPEND action ==
- Used ONLY when there is suspected AI-generated content, free models, or stolen assets AND there is evidence mentioned in the post itself or its examples
- NOT used for simple rule violations - those are "deny"
- Suspension is followed by a punishment request process

== APPROVE action ==
- Post meets ALL rules, no violations, no POF threshold met

You MUST respond with ONLY valid JSON, no markdown fences, no preamble, no extra text.
JSON structure:
{
  "title": "Post title",
  "description": "Full post body (multi-line, realistic, mimics real marketplace posts)",
  "payment": "e.g. '$5 USD' or '500 Robux' or null if not applicable (e.g. reviews)",
  "category": "e.g. 'fh-scripting' or 'lfd-modeling' or 'skill_role-gfx' or 'sell_creations' or 'investors' or 'advertising' or 'reviews'",
  "scam_logs": 0,
  "member_since": "DD Month YYYY",
  "has_reviews": false,
  "post_id": "random 6-digit string",
  "correct_action": "approve" or "deny" or "suspend" or "request_pof",
  "violation": "short label of the rule broken, or null if correct_action is approve",
  "explanation": "2-3 sentences explaining exactly why this action is correct, citing the specific rule",
  "difficulty": "easy"
}`;
}

// USER PROMPT
function buildUserPrompt(category: string, difficulty: 'easy' | 'medium' | 'hard'): string {
  const diffGuide: Record<string, string> = {
    easy:   'Make the violation VERY obvious and immediately visible. For example: no payment at all, a Discord link right in the description, or 0 examples provided.',
    medium: 'The post should look mostly fine at first glance. Include one clear rule violation that a trained reviewer would catch - e.g. percentage-only payment, deadline is exactly 2 days, or price range is 1.8x the base.',
    hard:   'This is an edge case. Options: (1) A completely clean post that should be APPROVED - make it look professional and well-formed. (2) A POF post - clean but offers $250 USD or 35,000 Robux. (3) A subtle violation - e.g. price range is exactly 1.6x base, deadline is 2 days 20 hours described as "roughly 3 days", or proof of ownership is described but is actually a render not a layer screenshot. (4) A SUSPEND case - post mentions AI-generated examples or a reverse image search note in the description.',
  };

  const actionGuide: Record<string, string> = {
    easy:   'correct_action should almost always be "deny".',
    medium: 'correct_action can be "deny", "approve", or "request_pof". Mix it up.',
    hard:   'correct_action can be anything. Lean towards "approve" or "request_pof" for hard - a common training failure is denying clean posts.',
  };

  const catGuide: Record<string, string> = {
    fh:             'Generate a For Hire post where a developer is advertising their services (e.g. scripting, GFX, UI, modeling, animation, music, VFX, video editing).',
    lfd:            'Generate a Looking For Developer post where someone wants to hire a developer for their project.',
    skill_role:     'Generate a Skill Role Application. The person is applying for a role (e.g. Scripter, GFX Designer, Animator) by submitting examples and proof of ownership.',
    sell_creations: 'Generate a Sell Creations post where someone is selling a ready-made asset (e.g. a GUI, a map, a UI kit, a scripted system, a 3D model).',
    investors:      'Generate an Investor Post where a developer is seeking financial investment for their Roblox game in development.',
    advertising:    'Generate a Roblox Advertising post where someone is advertising their Roblox game or group.',
    reviews:        'Generate a Review post where someone is leaving feedback about a completed transaction with a developer.',
  };

  return `Generate a ${difficulty} difficulty training post for category: ${category}.

${catGuide[category] ?? catGuide['fh']}

Difficulty: ${diffGuide[difficulty]}
Action guidance: ${actionGuide[difficulty]}

Additional rules:
- description must look like a REAL marketplace post with realistic Roblox developer language. Include services, examples, payment, contact info as appropriate. 3-10 lines.
- scam_logs: 0 for most posts. Set to 2 for a deny-due-to-scam-logs post in fh/lfd. Set to 1 for sell_creations or investors scam-log denial.
- member_since: a realistic date within the last 2 years.
- has_reviews: mostly false, occasionally true.
- violation: null if correct_action is "approve" or "request_pof" with no violations. Otherwise a SHORT plain label (e.g. "No payment stated", "Discord server link in post", "Commission deadline under 3 days", "Percentage-only payment", "No examples provided").
- explanation: must reference the EXACT rule from the handbook. Be specific. Example: "This post uses percentage-only payment. The handbook states that percentages are not a valid standalone payment - a fixed price must also be provided."
- The post_id should be a realistic 6-digit number.

IMPORTANT: Only output the JSON object. Nothing else.`;
}

// BUILD POST EMBED
export function buildPostEmbed(post: GeneratedPost, sessionScore: number, sessionTotal: number): EmbedBuilder {
  const categoryDisplay = post.category
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' > ');

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(post.title)
    .setDescription(post.description);

  if (post.payment) {
    embed.addFields({ name: 'Payment', value: post.payment });
  }

  const userLines = [
    `<@000000000000000000>`,
    `RoDevs Member since ${post.member_since}`,
    post.scam_logs === 0
      ? 'No scam logs found.'
      : `**${post.scam_logs} scam log${post.scam_logs > 1 ? 's' : ''} found.**`,
  ];

  embed.addFields(
    { name: 'About This User', value: userLines.join('\n') },
    { name: 'Reviews',  value: post.has_reviews ? 'See profile.' : 'None found.', inline: true },
    { name: 'Category', value: categoryDisplay,                                    inline: true },
    { name: 'Post ID',  value: post.post_id,                                       inline: true },
  );

  embed.setFooter({ text: `Training Session  |  Score: ${sessionScore}/${sessionTotal}  |  ${getDifficultyLabel(post.difficulty)}` })
    .setTimestamp();

  return embed;
}

// BUILD ACTION BUTTONS
export function buildPostActionRows(sessionId: number): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`pt_action:${sessionId}:approve`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`pt_action:${sessionId}:deny`)
      .setLabel('Deny')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`pt_action:${sessionId}:suspend`)
      .setLabel('Suspend')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`pt_action:${sessionId}:request_pof`)
      .setLabel('Request Proof of Funds')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row];
}

// BUILD FEEDBACK EMBED
export function buildFeedbackEmbed(
  post: GeneratedPost,
  userAction: string,
  correct: boolean,
  sessionScore: number,
  sessionTotal: number,
): EmbedBuilder {
  const actionLabels: Record<string, string> = {
    approve:     'Approve',
    deny:        'Deny',
    suspend:     'Suspend',
    request_pof: 'Request Proof of Funds',
  };

  const embed = new EmbedBuilder()
    .setColor(correct ? Colors.Green : Colors.Red)
    .setTitle(correct ? 'Correct' : 'Incorrect')
    .addFields(
      { name: 'Your Action',    value: actionLabels[userAction] ?? userAction,                              inline: true },
      { name: 'Correct Action', value: actionLabels[post.correct_action] ?? post.correct_action,           inline: true },
      { name: 'Post',           value: `**${post.title}** (\`${post.post_id}\`)`,                          inline: false },
    );

  if (!correct && post.violation) {
    embed.addFields({ name: 'Rule Violated', value: post.violation });
  }

  embed.addFields({ name: 'Explanation', value: post.explanation });

  embed.setFooter({ text: `Score: ${sessionScore}/${sessionTotal}  |  ${getDifficultyLabel(post.difficulty)}` })
    .setTimestamp();

  return embed;
}

// CONTINUE / END BUTTONS
export function buildContinueRow(sessionId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`pt_continue:${sessionId}`)
      .setLabel('Next Post')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`pt_end:${sessionId}`)
      .setLabel('End Session')
      .setStyle(ButtonStyle.Secondary),
  );
}

// SESSION SUMMARY EMBED
export function buildSummaryEmbed(score: number, total: number, userId: string): EmbedBuilder {
  const pct   = total > 0 ? Math.round((score / total) * 100) : 0;
  const grade =
    pct >= 90 ? { label: 'Excellent', color: Colors.Green  } :
    pct >= 75 ? { label: 'Good',      color: Colors.Blue   } :
    pct >= 60 ? { label: 'Pass',      color: Colors.Yellow } :
                { label: 'Needs Work', color: Colors.Red   };

  return new EmbedBuilder()
    .setColor(grade.color)
    .setTitle('Training Session Complete')
    .setDescription(`Good session, <@${userId}>!`)
    .addFields(
      { name: 'Final Score', value: `**${score}/${total}** (${pct}%)`, inline: true },
      { name: 'Grade',       value: grade.label,                        inline: true },
    )
    .setFooter({ text: 'Use /post-train to start a new session anytime.' })
    .setTimestamp();
}

// CATEGORY SELECT MENU
export function buildCategorySelect(): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('pt_category_select')
      .setPlaceholder('Choose a category to focus on...')
      .addOptions(
        Object.entries(TRAIN_CATEGORIES).map(([value, label]) =>
          new StringSelectMenuOptionBuilder().setLabel(label).setValue(value)
        )
      )
  );
}

// SESSION DB HELPERS
export async function getActiveSession(userId: string): Promise<any | null> {
  const rows = await sql`SELECT * FROM post_train_sessions WHERE user_id = ${userId} AND status = 'active'`;
  return rows[0] ?? null;
}

export async function createSession(userId: string, category: string): Promise<any> {
  await sql`UPDATE post_train_sessions SET status = 'ended', ended_at = NOW() WHERE user_id = ${userId} AND status = 'active'`;
  const [session] = await sql`
    INSERT INTO post_train_sessions (user_id, category, status, score, total)
    VALUES (${userId}, ${category}, 'active', 0, 0)
    RETURNING *
  `;
  return session;
}

export async function endSession(sessionId: number): Promise<any> {
  const [session] = await sql`
    UPDATE post_train_sessions
    SET status = 'ended', ended_at = NOW()
    WHERE id = ${sessionId}
    RETURNING *
  `;
  return session;
}

export async function savePostToSession(sessionId: number, post: GeneratedPost): Promise<void> {
  await sql`
    UPDATE post_train_sessions
    SET last_post_data = ${JSON.stringify(post)}::jsonb
    WHERE id = ${sessionId}
  `;
}

export async function recordAnswer(sessionId: number, correct: boolean): Promise<{ score: number; total: number }> {
  const [updated] = await sql`
    UPDATE post_train_sessions
    SET
      total = total + 1,
      score = score + ${correct ? 1 : 0}
    WHERE id = ${sessionId}
    RETURNING score, total
  `;
  return { score: Number(updated.score), total: Number(updated.total) };
}

function getDifficultyLabel(d: string): string {
  return d === 'easy' ? 'Easy' : d === 'medium' ? 'Medium' : 'Hard';
}
