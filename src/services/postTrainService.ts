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
  correct_action: 'approve' | 'deny' | 'request_pof';
  violation:      string | null;
  explanation:    string;
  difficulty:     'easy' | 'medium' | 'hard';
}

// Random variation seeds injected per call so the model cannot settle into a pattern
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildVariationSeed(): string {
  const writerStyles = [
    'bullet points with dashes',
    'short paragraphs with no bullets',
    'a single flowing paragraph',
    'numbered sections',
    'bold headers for each section',
    'casual conversational tone with no formatting',
    'formal business-like tone',
    'very short and terse with minimal words',
    'overly detailed with lots of context',
  ];

  const contactMethods = [
    'DM me on Discord',
    'ping me in this server',
    'reply to this post',
    'contact me via my portfolio link',
    'message me on Roblox',
    'no contact method mentioned',
  ];

  const priceFormats = [
    'exact Robux amount (e.g. 2,500 Robux)',
    'USD amount (e.g. $15 USD)',
    'a range in Robux (e.g. 1,000 to 2,500 Robux)',
    'a range in USD (e.g. $10 to $25 USD)',
    'per-asset pricing (e.g. 500 Robux per icon)',
    'a percentage of revenue plus a fixed base',
    'negotiable with a stated minimum',
    'a high amount triggering POF (e.g. 35,000 Robux or $220 USD)',
    'percentage only with no fixed price (violation)',
    'no payment stated at all (violation)',
  ];

  const developerRoles = [
    'scripter', 'GFX designer', 'UI/UX designer', 'low-poly modeler',
    'high-poly modeler', 'animator', 'VFX artist', 'sound designer',
    'SFX composer', 'video editor', 'thumbnail artist', 'logo designer',
    'clothing designer', 'map builder', 'terrain artist',
  ];

  const postTitles = [
    'a first-person title ("I am a scripter for hire")',
    'a third-person description ("Experienced GFX designer available")',
    'a short noun phrase ("Scripting Services")',
    'an attention-grabbing opener ("Quality UI at fair prices")',
    'a plain factual header ("For Hire: Animator")',
  ];

  const memberDurations = [
    '3 weeks ago', '2 months ago', '5 months ago', '8 months ago',
    '11 months ago', '14 months ago', '18 months ago', '22 months ago',
  ];

  const portfolioStyles = [
    'two YouTube links for video examples',
    'an Imgur album link',
    'a Google Drive folder link',
    'a personal portfolio website',
    'inline description of past projects with no links',
    'a Devforum portfolio thread',
    'no portfolio provided (possible violation)',
    'one example only (possible violation if 2 required)',
    'three strong streaming examples',
  ];

  return [
    `Post writing style: ${pickRandom(writerStyles)}.`,
    `Contact method used: ${pickRandom(contactMethods)}.`,
    `Payment format: ${pickRandom(priceFormats)}.`,
    `Developer role/service: ${pickRandom(developerRoles)}.`,
    `Title style: ${pickRandom(postTitles)}.`,
    `Account age context: member joined roughly ${pickRandom(memberDurations)}.`,
    `Portfolio/examples style: ${pickRandom(portfolioStyles)}.`,
  ].join(' ');
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

  // Load up to 5 senior-submitted training examples for this category
  const exampleRows = await sql`
    SELECT post_body, correct_action, reasoning
    FROM post_train_examples
    WHERE category = ${actualCategory} AND active = true
    ORDER BY RANDOM()
    LIMIT 5
  `.catch(() => []);

  const systemPrompt = buildSystemPrompt(exampleRows as any[]);
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
        max_tokens:  1400,
        temperature: 1.0,
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
function buildSystemPrompt(examples: { post_body: string; correct_action: string; reasoning: string }[]): string {
  let examplesBlock = '';
  if (examples.length > 0) {
    examplesBlock = '\n\nSENIOR STAFF REFERENCE EXAMPLES (real reviewed posts submitted by your senior staff team - use these to calibrate tone, format, and rule application accuracy):\n';
    examples.forEach((ex, idx) => {
      examplesBlock += `\nExample ${idx + 1}:\nPost: ${ex.post_body}\nCorrect action: ${ex.correct_action}\nReasoning: ${ex.reasoning}\n`;
    });
    examplesBlock += '\nUse these examples to understand what real posts in this category look like and how rules are applied. Do NOT copy them directly - generate something new and different.';
  }

  return `You are a post generator for a Roblox marketplace staff training tool called RoDevs. You generate fake but realistic marketplace posts for Post Approver trainees to review.

Your output must be different every single time. Vary the writing style, structure, price, developer name, service type, number of lines, tone, and content. No two posts should feel like they came from the same template.${examplesBlock}

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
- AI-generated work = DENY (note: this is handled as a deny, not a suspend, since post examples are not visible to the reviewer in this training context)
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

== APPROVE action ==
- Post meets ALL rules, no violations, no POF threshold met

IMPORTANT - correct_action must be one of: "approve", "deny", "request_pof". Do NOT use "suspend".

You MUST respond with ONLY valid JSON, no markdown fences, no preamble, no extra text.
JSON structure:
{
  "title": "Post title",
  "description": "Full post body (multi-line, realistic, varied structure - see variation seed in the user message)",
  "payment": "stated payment string, or null if not applicable",
  "category": "specific subcategory e.g. fh-scripting, lfd-modeling, skill_role-gfx, sell_creations, investors, advertising, reviews",
  "scam_logs": 0,
  "member_since": "DD Month YYYY",
  "has_reviews": false,
  "post_id": "random 6-digit number as a string",
  "correct_action": "approve" or "deny" or "request_pof",
  "violation": "short plain label of the rule broken, or null if correct_action is approve or request_pof with no violations",
  "explanation": "2-3 sentences citing the exact rule from the handbook. Be precise.",
  "difficulty": "easy"
}`;
}

// USER PROMPT
function buildUserPrompt(category: string, difficulty: 'easy' | 'medium' | 'hard'): string {
  const diffGuide: Record<string, string> = {
    easy: [
      'The violation must be unmissable. Pick one: no payment whatsoever, a Discord invite link directly in the post body, zero examples where examples are required, deadline explicitly stated as 1 or 2 days, percentage-only payment with no fixed price, or a clear statement that the developer is posting on behalf of someone else.',
      'Write the post as if the author is oblivious to the rules. The violation should be in the first 2 sentences.',
    ].join(' '),
    medium: [
      'The post should look mostly legitimate at first glance. The violation is there but requires knowledge of the rules to catch.',
      'Good options: price range that is 1.7x or 1.8x the base (the rule allows up to 1.5x), deadline described as "around 48 hours" or "just under 3 days", payment described as negotiable with a vague minimum but no actual figure, only one example provided where two are required, or a percentage plus a fixed price where the fixed price is actually below minimum reasonable compensation.',
      'Alternatively, write a completely clean post that should be approved - reviewers must learn to not over-deny.',
    ].join(' '),
    hard: [
      'This is an edge case that will challenge even experienced reviewers. Choose one scenario:',
      '(1) A completely clean, professional, well-formatted post that is 100% correct and should be approved - make it look real and convincing.',
      '(2) A POF post - everything is clean and well-written but the payment is $220 USD or 35,000 Robux, which crosses the POF threshold.',
      '(3) A subtle rule violation that is easy to miss - e.g. price range described as "1,000 to 1,600 Robux" where base is 1,000 (1.6x, over the 1.5x limit), or a deadline of "roughly 72 hours" that is technically exactly 3 days but phrased ambiguously, or proof of ownership described as a rendered image rather than a process screenshot.',
      '(4) A multi-hire post where two different roles are described in one post, which is easy to miss if you focus on payment.',
      'For hard posts leaning towards approve or request_pof: reviewers commonly over-deny clean posts, so this is valuable training.',
    ].join(' '),
  };

  const violationPool: Record<string, string[]> = {
    fh: [
      'no payment stated', 'percentage-only payment', 'price range exceeds 1.5x base',
      'Discord server link included', 'only one example provided (minimum is two)',
      'tutorial used as a portfolio example', 'commission finder (posting for someone else)',
      'multi-hire (two services in one post)', 'plugin for sale',
      'no examples at all', 'downloadable file as the only example',
    ],
    lfd: [
      'deadline under 3 days', 'no payment stated', 'percentage-only payment',
      'underpayment (well below market rate)', 'Discord server link',
      'two roles in one post', '2 scam logs', 'commission finder',
    ],
    skill_role: [
      'no proof of ownership', 'tutorial used as example', 'only one example',
      'downloadable file instead of streaming link', 'no Roblox account linked for game role',
    ],
    sell_creations: [
      'selling a game', 'selling a scripted map', 'only one example', '1 scam log',
      'no examples', 'downloadable file',
    ],
    investors: [
      'revenue share below 15%', 'revenue share at 95% (effectively selling the game)',
      'fewer than 5 images', 'game less than 55% complete with no link',
      'off-platform game', '1 scam log', 'no fixed investment amount stated',
    ],
    advertising: [
      'private or unpublished game', 'AFK game', 'off-platform product', 'service advertised instead of a game',
    ],
    reviews: [
      'no payment proof', 'no proof of what was received', 'scam report instead of a review',
      'vulgar or insulting language', 'transaction was not on RoDevs',
    ],
  };

  const baseCategory = category.split('-')[0] as keyof typeof violationPool;
  const violations   = violationPool[baseCategory] ?? violationPool['fh'];
  const pickedViolation = difficulty === 'easy'
    ? pickRandom(violations.slice(0, 5))
    : difficulty === 'medium'
    ? pickRandom(violations)
    : pickRandom(violations);

  const catGuide: Record<string, string> = {
    fh:             'A developer advertising their own services. Pick a specific niche: scripting, GFX, UI, low-poly modeling, high-poly modeling, animation, VFX, SFX, video editing, thumbnail art, or clothing design.',
    lfd:            'A project owner looking to hire a developer. Include a project description, the role needed, budget, and a deadline.',
    skill_role:     'A developer applying for a skill role on RoDevs. They need to prove ownership of their work with process screenshots or equivalent proof.',
    sell_creations: 'A developer selling a ready-made asset: a GUI kit, a weapon system, a map, a UI template, or similar.',
    investors:      'A developer seeking investment for a Roblox game in development. Must include revenue share offer, game progress %, and visual evidence.',
    advertising:    'Someone advertising their public Roblox game or group to attract players.',
    reviews:        'A user leaving feedback about a completed transaction with a developer on RoDevs. Must include proof of payment and proof of what was received.',
  };

  const variationSeed = buildVariationSeed();

  const actionHint =
    difficulty === 'easy'   ? `The correct_action for this post is "deny". Violation to incorporate: ${pickedViolation}.` :
    difficulty === 'medium' ? `Vary the correct_action. Options: deny (violation: ${pickedViolation}), approve (clean post), or request_pof (clean but high payment). Choose one and commit to it.` :
                              `Choose the correct_action that best fits the edge case you construct. Options: approve, deny, request_pof.`;

  return `Generate a ${difficulty} difficulty training post for category: ${category}.

Category context: ${catGuide[baseCategory] ?? catGuide['fh']}

Difficulty instructions: ${diffGuide[difficulty]}

${actionHint}

Variation seed (you MUST follow all of these to ensure uniqueness):
${variationSeed}

Additional requirements:
- The description field must be the full post body as a trainee would see it in the channel. Write it as a real Discord message - vary the length (anywhere from 3 lines to 12 lines), vary whether it uses bullets, paragraphs, or a mix.
- Do not use generic developer names or placeholder text. If naming a game or project, invent a specific name.
- scam_logs: 0 for most posts. Use 2 for a scam-log deny in fh/lfd. Use 1 for sell_creations or investors scam-log denial.
- member_since: a realistic date within the last 2 years. Use the format DD Month YYYY.
- has_reviews: mostly false.
- violation: null only if correct_action is "approve" or "request_pof" with no other rule broken. Otherwise a short plain label.
- explanation: cite the exact rule. Be specific and concise. 2-3 sentences maximum.
- post_id: a realistic 6-digit number as a string.
- difficulty in the JSON must match the requested difficulty: "${difficulty}".

IMPORTANT: Output ONLY the raw JSON object. No markdown, no explanation outside the JSON.`;
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

// BUILD ACTION BUTTONS (no suspend - examples are not visible to the reviewer)
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
    request_pof: 'Request Proof of Funds',
  };

  const embed = new EmbedBuilder()
    .setColor(correct ? Colors.Green : Colors.Red)
    .setTitle(correct ? 'Correct' : 'Incorrect')
    .addFields(
      { name: 'Your Action',    value: actionLabels[userAction] ?? userAction,                      inline: true },
      { name: 'Correct Action', value: actionLabels[post.correct_action] ?? post.correct_action,   inline: true },
      { name: 'Post',           value: `**${post.title}** (\`${post.post_id}\`)`,                  inline: false },
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
