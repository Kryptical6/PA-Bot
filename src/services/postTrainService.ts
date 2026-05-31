import {
  EmbedBuilder, Colors, ButtonBuilder, ButtonStyle,
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

// DENIAL REASONS PER CATEGORY
// Each entry: { label: short label shown in select, message: exact denial message from handbook }
// label is also used as the action key when scoring
export interface DenialReason {
  label:   string;
  message: string;
}

export const DENIAL_REASONS: Record<string, DenialReason[]> = {
  fh: [
    { label: 'No payment stated',             message: 'Please state a valid range or fixed payment so your fees are clear to clients.' },
    { label: '2 scam logs',                   message: '2 scam logs found. You cannot use the marketplace.' },
    { label: 'Poor grammar or spelling',       message: 'Please ensure your description uses correct grammar and spelling.' },
    { label: 'Commission finder',              message: 'Commission finders are prohibited on the RoDevs marketplace.' },
    { label: 'Downloadable files',             message: 'Please remove any downloadable files. Use a streaming platform like YouTube instead.' },
    { label: 'Discord server link',            message: 'Please do not promote your Discord server in your post.' },
    { label: 'Multi-service post',             message: 'Multi-hiring is prohibited. Please create a separate post for each service in the correct channel.' },
    { label: 'Not enough examples',            message: 'Please provide at least 2 visual examples of your work.' },
    { label: 'Not enough video examples',      message: 'Please provide at least 2 video examples showcasing your work.' },
    { label: 'Examples below quality',         message: 'Work examples do not meet our marketplace quality standards.' },
    { label: 'Idea maker / concept creator',   message: 'Concept creators, story writers, and idea generators are prohibited from the FH category.' },
    { label: 'No structured advertiser service', message: 'Advertisers and marketers must provide a structured explanation of their service, how they work, and what clients should expect. Generic promises of growth are not acceptable.' },
    { label: 'Advertiser - no proof of results', message: 'Please include image or documented proof of successful campaigns you have run.' },
    { label: 'Project manager - no workflow',  message: 'Project managers must demonstrate use of real planning systems such as task boards, schedules, or milestone tracking.' },
    { label: 'Discord server management',      message: 'Server creation and management services are prohibited on the RoDevs marketplace.' },
    { label: 'Game tester - no method',        message: 'Game testers must outline their testing process (bug tracking, reporting structure, scenarios, etc.).' },
    { label: '3D rigger in wrong channel',     message: 'Incorrect channel. Please repost in fh-animation or fh-modeler.' },
    { label: 'Incorrect channel',              message: 'Incorrect channel. Please repost this in the correct channel.' },
  ],
  lfd: [
    { label: 'No payment stated',              message: 'Please state a valid range or fixed budget so developers understand what you are offering.' },
    { label: 'Unfair / underpayment',          message: 'Please ensure you are offering fair payment for the work requested.' },
    { label: 'Percentage-only payment',        message: 'Relying solely on a revenue percentage is prohibited. Please provide a fixed price.' },
    { label: '2 scam logs',                    message: '2 scam logs found. You cannot use our marketplace.' },
    { label: 'Unclear description',            message: 'Please provide a clear description so developers know exactly what is needed.' },
    { label: 'Poor grammar or spelling',       message: 'Please ensure your description uses correct grammar and spelling.' },
    { label: 'Commission finder',              message: 'Commission finders are prohibited on the RoDevs marketplace.' },
    { label: 'Downloadable files',             message: 'Please remove any downloadable files. Use YouTube or a similar streaming platform.' },
    { label: 'Discord server link',            message: 'Please do not promote your Discord server in your post.' },
    { label: 'Multi-hire post',                message: 'Multi-hiring is prohibited. Please create a separate post for each developer role.' },
    { label: 'Discord server services',        message: 'Server creation/management services are prohibited on the RoDevs marketplace.' },
    { label: '3D rigger in wrong channel',     message: 'Incorrect channel. Please repost in lfd-animation or lfd-modeler.' },
    { label: 'Deadline under 3 days',          message: 'Commissions with a deadline under 3 days are not allowed. Please increase the deadline and repost.' },
    { label: 'Incorrect channel',              message: 'Incorrect channel. Please repost this in the correct channel.' },
  ],
  skill_role: [
    { label: 'Below quality standards',        message: 'Work does not meet the marketplace standards for this role. We encourage you to reapply once you have improved!' },
    { label: 'Examples not visible',           message: 'Examples are not visible. Please resubmit in a different format.' },
    { label: 'Not enough video examples',      message: 'Please provide at least 2 video examples showcasing your work.' },
    { label: 'Tutorial work submitted',        message: 'We cannot use tutorial work to assess your skill level.' },
    { label: 'Roblox account not linked',      message: 'Your account is not visibly or directly linked to the game. Please update the game description or provide proof of ownership before resubmitting.' },
    { label: 'Downloadable file submitted',    message: 'Please remove any downloadable files and use a streaming platform such as YouTube.' },
    { label: 'No proof of ownership',          message: 'Please include a screenshot showing your creation process (layers, keyframes, topology, timelines, etc.).' },
  ],
  sell_creations: [
    { label: 'Selling a game or group',        message: 'Selling games or groups is prohibited on the RoDevs marketplace.' },
    { label: 'Selling a scripted map',         message: 'Selling scripted maps is prohibited on the RoDevs marketplace.' },
    { label: 'Not enough examples',            message: 'Please provide at least 2 visual examples of your creation.' },
    { label: 'No video for scripted/VFX/anim', message: 'Please provide a video showcasing how your system works.' },
    { label: 'Bad quality',                    message: 'This creation does not meet the marketplace quality standards.' },
    { label: 'Downloadable files',             message: 'Please remove any downloadable files. Use a streaming platform such as YouTube.' },
    { label: '1 scam log',                     message: '1 scam log found. You cannot post on this channel.' },
  ],
  investors: [
    { label: 'Less than 15% revenue share',    message: 'Please ensure at least 15% of revenue is available for investors.' },
    { label: 'Invalid fund amount',            message: 'Please state a clear, fixed amount or valid range for the investment sought.' },
    { label: 'Not enough images',              message: 'Please provide at least 5 images showcasing every aspect of your game - maps, UI, models, and systems.' },
    { label: 'Game under 55% complete',        message: 'Your game must be at least 55% complete based on the images provided.' },
    { label: 'Game link missing (100%)',        message: 'Please provide a link to your game. A fully complete game must be directly playable for investors to assess.' },
    { label: 'Poor game quality',              message: 'This game does not meet the marketplace quality standards for investment posts.' },
    { label: '1 scam log',                     message: '1 scam log found. You cannot post in the investors channel.' },
    { label: '90-100% share (selling game)',   message: 'Selling games is prohibited on the RoDevs marketplace.' },
    { label: 'Downloadable files',             message: 'Please remove any downloadable files. Use a streaming platform such as YouTube.' },
    { label: 'Not a Roblox game',              message: 'You can only seek investment for Roblox games on the RoDevs marketplace.' },
  ],
  advertising: [
    { label: 'Game not publicly playable',     message: 'Your game must be publicly available to play.' },
    { label: 'AFK game',                       message: 'AFK games are prohibited on the RoDevs marketplace.' },
    { label: 'Advertising a service',          message: 'This category is for advertising games, groups, or Roblox platform products only - not services.' },
    { label: 'Not a Roblox game or group',     message: 'This category is for Roblox platform creations only.' },
    { label: 'Scam game',                      message: 'Advertising games designed to deceive players is strictly prohibited.' },
    { label: 'Commission finder',              message: 'Commission finders are prohibited on the RoDevs marketplace.' },
    { label: 'Poor grammar or spelling',       message: 'Please ensure your description uses correct grammar and spelling.' },
    { label: 'Off-platform product',           message: 'This category is for Roblox platform creations only.' },
  ],
  reviews: [
    { label: 'Unknown product',                message: 'Please include a clear showcase of the product reviewed.' },
    { label: 'Unknown payment',                message: 'Please verify and show the payment has taken place.' },
    { label: 'Insulting or vulgar language',   message: 'Please keep your language respectful and professional.' },
    { label: 'Fake review',                    message: 'Fake reviews to deceive users are prohibited.' },
    { label: 'Scam report (wrong channel)',    message: 'Please file a scam report by DMing ModMail instead. This channel is for service reviews only.' },
    { label: 'Non-RoDevs transaction',         message: 'Please only leave reviews for transactions and services completed within RoDevs.' },
    { label: 'Payment does not match review',  message: 'Please only provide proof of payment for the specific product you are reviewing.' },
  ],
};

// Returns denial reasons for the base category - queries DB first, falls back to hardcoded defaults
export async function getDenialReasons(category: string): Promise<DenialReason[]> {
  const base = category.split('-')[0];
  try {
    const rows = await sql`
      SELECT label, message FROM denial_reasons
      WHERE category = ${base}
      ORDER BY position ASC, id ASC
    `;
    if (rows.length > 0) return rows as DenialReason[];
  } catch { /* fall through to defaults */ }
  return DENIAL_REASONS[base] ?? DENIAL_REASONS['fh'];
}

// Seed the DB with hardcoded defaults if the table is empty for a given category
export async function seedDenialReasons(): Promise<void> {
  try {
    const existing = await sql`SELECT COUNT(*) as c FROM denial_reasons`;
    if (parseInt(existing[0].c) > 0) return; // already seeded
    for (const [category, reasons] of Object.entries(DENIAL_REASONS)) {
      for (let i = 0; i < reasons.length; i++) {
        await sql`
          INSERT INTO denial_reasons (category, label, message, position)
          VALUES (${category}, ${reasons[i].label}, ${reasons[i].message}, ${i})
          ON CONFLICT (category, label) DO NOTHING
        `;
      }
    }
    console.log('[DenialReasons] Seeded default denial reasons into DB.');
  } catch (e) {
    console.error('[DenialReasons] Seed failed:', e);
  }
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
    'numbered sections with bold headers',
    'casual conversational tone, no formatting at all',
    'formal business-like tone',
    'extremely short and terse - 3 to 4 lines only',
    'very detailed with lots of context, 10 or more lines',
    'a mix of a short intro paragraph then bullet points',
    'headers for each section in all-caps',
  ];

  const contactMethods = [
    'DM me on Discord',
    'ping me in this server',
    'reply to this post',
    'contact me via my portfolio link',
    'message me on Roblox',
    'no contact method mentioned at all',
    'says to add them on Discord (gives username)',
  ];

  // Concrete price values to force real variety - model must use the number, not paraphrase it
  const priceSeeds = [
    'exactly 500 Robux flat',
    'exactly 1,200 Robux flat',
    'exactly 3,000 Robux flat',
    'exactly 8,500 Robux flat',
    'exactly 15,000 Robux flat',
    'exactly 22,000 Robux flat',
    'exactly $5 USD flat',
    'exactly $12 USD flat',
    'exactly $30 USD flat',
    'exactly $75 USD flat',
    'exactly $150 USD flat',
    'a range of 800 to 1,000 Robux',
    'a range of 1,500 to 3,000 Robux',
    'a range of 5,000 to 9,000 Robux',
    'a range of $8 to $15 USD',
    'a range of $20 to $40 USD',
    'a range of $50 to $100 USD',
    '300 Robux per icon / asset',
    '1,000 Robux per map section',
    '$5 USD per minute of video',
    '20% revenue share plus 2,000 Robux upfront',
    'negotiable with a stated minimum of 1,500 Robux',
    'negotiable with a stated minimum of $10 USD',
    // POF-triggering amounts (clean post)
    'exactly 35,000 Robux flat (triggers POF - post must be clean)',
    'exactly $220 USD flat (triggers POF - post must be clean)',
    'exactly 50,000 Robux flat (triggers POF - post must be clean)',
    // Violation amounts
    'percentage only - 15% revenue share with no fixed price (VIOLATION)',
    'no payment mentioned anywhere in the post (VIOLATION)',
    'says "negotiable" with no minimum stated (VIOLATION)',
    'a range of 1,000 to 1,800 Robux where base is 1,000 - this is 1.8x (VIOLATION: exceeds 1.5x limit)',
  ];

  const developerRoles = [
    'scripter specialising in combat systems',
    'scripter specialising in datastore and saving',
    'scripter specialising in tycoon systems',
    'GFX designer for thumbnails and game icons',
    'UI/UX designer',
    'low-poly Roblox modeler',
    'high-poly Blender modeler',
    'animator for rigs and cutscenes',
    'VFX artist for particles and beams',
    'sound designer and composer',
    'SFX artist',
    'video editor for trailers and showcases',
    'thumbnail and logo artist',
    'clothing designer for shirts and pants',
    'map builder specialising in medieval or sci-fi themes',
    'terrain artist using studio terrain tools',
    'project manager',
    'game tester',
    'advertiser or social media marketer',
  ];

  const postTitles = [
    'a first-person title such as "I am a scripter looking for work"',
    'a third-person noun phrase such as "Experienced GFX Designer Available"',
    'a short service name such as "Scripting Services"',
    'an attention-grabbing phrase such as "Clean UI at Affordable Prices"',
    'a plain factual header such as "For Hire: Animator"',
    'all lowercase casual title such as "looking to build your game"',
    'a question title such as "Need a reliable scripter?"',
  ];

  const memberDurations = [
    '3 weeks ago', '5 weeks ago', '2 months ago', '4 months ago',
    '6 months ago', '9 months ago', '11 months ago', '14 months ago',
    '17 months ago', '20 months ago', '22 months ago',
  ];

  const portfolioStyles = [
    'two YouTube video links listed as examples',
    'one YouTube link and one Devforum post',
    'an Imgur album link',
    'a Google Drive folder link',
    'a personal portfolio website URL',
    'a Devforum portfolio thread link',
    'inline descriptions of 3 past projects with no external links',
    'no portfolio or examples provided',
    'only one YouTube link (possible violation)',
    'three strong streaming examples across different projects',
    'screenshots embedded via Imgur links',
  ];

  return [
    `Post writing style: ${pickRandom(writerStyles)}.`,
    `Contact method: ${pickRandom(contactMethods)}.`,
    `Payment: use ${pickRandom(priceSeeds)}.`,
    `Service type: ${pickRandom(developerRoles)}.`,
    `Title style: ${pickRandom(postTitles)}.`,
    `Account age: member joined roughly ${pickRandom(memberDurations)}.`,
    `Portfolio/examples: ${pickRandom(portfolioStyles)}.`,
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

  // Load active rule notes - global ones + category-specific ones
  const noteRows = await sql`
    SELECT note FROM post_train_notes
    WHERE active = true AND (category IS NULL OR category = ${actualCategory})
    ORDER BY category NULLS LAST, id ASC
  `.catch(() => []);

  const systemPrompt = buildSystemPrompt(exampleRows as any[], noteRows.map((r: any) => r.note));
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
function buildSystemPrompt(examples: { post_body: string; correct_action: string; reasoning: string }[], notes: string[]): string {
  let examplesBlock = '';
  if (examples.length > 0) {
    examplesBlock = '\n\nSENIOR STAFF REFERENCE EXAMPLES (real reviewed posts submitted by your senior staff team - use these to calibrate tone, format, and rule application accuracy):\n';
    examples.forEach((ex, idx) => {
      examplesBlock += `\nExample ${idx + 1}:\nPost: ${ex.post_body}\nCorrect action: ${ex.correct_action}\nReasoning: ${ex.reasoning}\n`;
    });
    examplesBlock += '\nUse these examples to understand what real posts in this category look like and how rules are applied. Do NOT copy them directly - generate something new and different.';
  }

  let notesBlock = '';
  if (notes.length > 0) {
    notesBlock = '\n\nSTAFF RULE NOTES AND OVERRIDES (these take priority over the standard rules above - follow them exactly):\n';
    notes.forEach((note, idx) => {
      notesBlock += `\n${idx + 1}. ${note}`;
    });
    notesBlock += '\n';
  }

  return `You are a post generator for a Roblox marketplace staff training tool called RoDevs. You generate fake but realistic marketplace posts for Post Approver trainees to review.

Your output must be different every single time. Vary the writing style, structure, price, developer name, service type, number of lines, tone, and content. No two posts should feel like they came from the same template. You will be given a variation seed - follow every instruction in it exactly, especially the payment amount.${examplesBlock}

MARKETPLACE CATEGORIES:
- fh: For Hire - developers advertising their services
- lfd: Looking For Developer - users hiring developers
- skill_role: Skill Role Applications - developers proving skill to unlock a posting category
- sell_creations: Sell Creations - users selling ready-made assets
- investors: Investor Posts - developers seeking financial investment
- advertising: Roblox Advertising - advertising a Roblox game/group
- reviews: Reviews - leaving feedback about a developer's service

OFFICIAL RULES (from the RoDevs Post Approver Handbook):

== FOR HIRE (FH) ==
- Must state clear payment and payment method (Robux or USD)
- "Negotiable" alone is not acceptable - a fixed minimum or range is required
- Price ranges must not exceed 1.5x the base payment
- Percentages are not a valid standalone payment - a fixed price must also be provided
- Posts must be professional, clear, and well formatted
- Poor grammar or spelling = DENY
- Low-quality or poorly described services = DENY
- No plagiarism or stolen assets
- Tutorial work is not an acceptable portfolio example
- No selling games or groups
- No free models/free vectors unless declared placeholder/filler
- No exploit/virus/malware related services
- No commission finders (posting on behalf of others)
- No Discord server links
- No AFK/clicker/scam game advertising
- No server creation or management services
- No multi-hiring in a single post
- No CustomUse
- No idea makers/concept creators/story writers in FH
- No selling plugins
- FH posts need at least 2 work examples
- Scripting/animation/video/SFX/sound/VFX require at least 2 VIDEO examples
- Examples must not require a download - use streaming platforms
- No low-quality examples or phone photos of a screen

== LOOKING FOR DEVELOPER (LFD) ==
- Must state a clear payment or range
- No percentage-only payment
- Payments must be fair
- No commission finders
- No downloadable files
- No Discord server links
- No multi-hire (one role per post)
- No server creation or management services
- Commission deadline must be at least 3 days
- 2 scam logs = DENY

== SKILL ROLE APPLICATIONS ==
- At least 2 examples required; scripting/VFX/animation/SFX/sound need VIDEO examples
- Tutorial work = DENY
- No downloadable files
- Proof of ownership required (layers, keyframes, topology, timelines, etc.)
- Roblox account must be linked if applying for game/group creator roles

== SELL CREATIONS ==
- No selling games or groups
- No selling scripted maps
- At least 2 examples required
- Scripted systems/VFX/Animations need video examples
- No downloadable files
- 1 scam log = DENY

== INVESTOR POSTS ==
- Must offer at least 15% revenue share
- Must state a clear fixed amount or range for investment
- At least 5 images required
- Game must be at least 55% complete
- If 100% complete, must include a game link
- No off-platform games
- 1 scam log = DENY
- 90-100% revenue share = DENY (effectively selling the game)
- No downloadable files

== ROBLOX ADVERTISING ==
- Game must be publicly playable
- No AFK games
- Only Roblox games/groups
- No scam games
- Services cannot be advertised here

== REVIEWS ==
- Must include proof of what was received
- Must include payment proof
- No insulting or vulgar language
- No fake reviews
- Scam reports must go to ModMail, not here
- Only reviews for RoDevs transactions
- Payment must match the review content

== PROOF OF FUNDS ==
- Required when a post offers 30,000 Robux or more, or $200 USD or more
- Post must pass all other checks first
- If threshold met AND post is clean = correct_action is "request_pof"
- If threshold met AND post has a violation = correct_action is "deny"

== APPROVE ==
- Post meets all rules, no violations, POF threshold not met

correct_action must be one of: "approve", "deny", "request_pof". Do NOT use "suspend".
${notesBlock}
Respond with ONLY valid raw JSON, no markdown fences, no preamble.
JSON structure:
{
  "title": "string",
  "description": "string - the full post body the trainee sees",
  "payment": "string or null",
  "category": "string - specific subcategory e.g. fh-scripting, lfd-modeling, skill_role-gfx, sell_creations, investors, advertising, reviews",
  "scam_logs": 0,
  "member_since": "DD Month YYYY",
  "has_reviews": false,
  "post_id": "6-digit number as a string",
  "correct_action": "approve" | "deny" | "request_pof",
  "violation": "short plain label or null",
  "explanation": "2-3 sentences citing the exact rule",
  "difficulty": "easy" | "medium" | "hard"
}`;
}

// USER PROMPT
function buildUserPrompt(category: string, difficulty: 'easy' | 'medium' | 'hard'): string {
  const diffGuide: Record<string, string> = {
    easy: 'The violation must be completely unmissable - it should appear in the first 1-2 sentences or be stated plainly. The post author seems unaware of the rules entirely. Examples of good easy violations: no payment at all, a Discord invite link in the first line, zero examples provided, deadline explicitly stated as 1 or 2 days, flat statement that they are posting on behalf of another person.',
    medium: 'The post should look mostly legitimate on first read. The violation requires actual rule knowledge to catch. Good options: price range that is 1.7x or 1.8x the base (rule allows up to 1.5x), deadline described as "around 48 hours", only one example where two are required, underpayment that is clearly below market rate but not zero. Alternatively write a completely clean post that should be approved - over-denying clean posts is a common trainee failure.',
    hard: 'This is a genuine edge case. Choose one scenario: (1) A completely clean professional post that is 100% correct and must be approved. (2) A clean post that triggers POF - everything correct but payment is 35,000 Robux or $220 USD or higher. (3) A subtle violation - e.g. price range is 1,000 to 1,600 Robux (1.6x the base, over the 1.5x limit), or deadline is "roughly 72 hours" which is borderline, or proof of ownership is described as a render not a process screenshot. (4) A multi-hire post where two roles are buried in the description. Lean towards approve or request_pof for hard difficulty - trainees must practice not over-denying.',
  };

  const violationPool: Record<string, string[]> = {
    fh: [
      'no payment stated anywhere', 'percentage-only payment with no fixed price',
      'price range exceeds 1.5x the base payment', 'Discord server link in the post body',
      'only one example provided where two are required', 'tutorial used as a portfolio example',
      'developer is posting on behalf of someone else (commission finder)',
      'two different services advertised in one post (multi-hire)',
      'no work examples provided at all', 'downloadable file as the only example',
      'very poor grammar making the post unclear',
    ],
    lfd: [
      'deadline explicitly stated as under 3 days', 'no payment mentioned at all',
      'percentage-only payment', 'payment is clearly underpaying for the work described',
      'Discord server link included', 'two developer roles in one post',
      'two scam logs visible', 'posting on behalf of someone else',
    ],
    skill_role: [
      'no proof of ownership provided', 'tutorial used as the only example',
      'only one example where two are required', 'downloadable file instead of a streaming link',
      'no Roblox account linked for a game creator role',
    ],
    sell_creations: [
      'seller is selling a game', 'selling a scripted map', 'only one example provided',
      '1 scam log visible', 'no examples provided at all', 'downloadable file as example',
    ],
    investors: [
      'revenue share offered is below 15%', 'revenue share offered is 90-100% (game sale)',
      'fewer than 5 images provided', 'game appears to be under 55% complete',
      'game is stated as 100% complete but no link is provided',
      '1 scam log visible', 'no clear investment amount stated', 'not a Roblox game',
    ],
    advertising: [
      'game is private or unpublished', 'game is an AFK game',
      'post is advertising a service not a game', 'product is not a Roblox game or group',
    ],
    reviews: [
      'no proof of what was received', 'no payment proof provided',
      'post is a scam report not a review', 'review uses insulting language',
      'transaction was not on RoDevs', 'payment proof does not match what is being reviewed',
    ],
  };

  const baseCategory = category.split('-')[0] as keyof typeof violationPool;
  const violations = violationPool[baseCategory] ?? violationPool['fh'];
  const pickedViolation = pickRandom(difficulty === 'easy' ? violations.slice(0, 5) : violations);

  const catGuide: Record<string, string> = {
    fh:             'A developer advertising their own services. Pick a specific niche from the variation seed.',
    lfd:            'A project owner looking to hire a developer. Include a project description, role needed, budget, and a deadline.',
    skill_role:     'A developer applying for a skill role on RoDevs. They need to prove ownership of their work.',
    sell_creations: 'A developer selling a ready-made asset such as a GUI kit, weapon system, map, or UI template.',
    investors:      'A developer seeking financial investment for a Roblox game in development. Include revenue share offer, game progress percentage, and description of visual assets.',
    advertising:    'Someone advertising their public Roblox game or group to attract players.',
    reviews:        'A user leaving feedback about a completed transaction with a developer on RoDevs. Include proof of payment and proof of what was received.',
  };

  const variationSeed = buildVariationSeed();

  const actionHint =
    difficulty === 'easy'
      ? `correct_action must be "deny". The violation to build into the post: ${pickedViolation}.`
      : difficulty === 'medium'
      ? `Choose one: deny (violation: ${pickedViolation}), approve (clean post), or request_pof (clean but payment triggers POF threshold). Pick one and commit.`
      : `Choose the correct_action that fits your chosen edge case. Options: approve, deny, request_pof.`;

  return `Generate a ${difficulty} difficulty training post for category: ${category}.

Category: ${catGuide[baseCategory] ?? catGuide['fh']}

Difficulty instructions: ${diffGuide[difficulty]}

Action: ${actionHint}

Variation seed - follow every item exactly, especially the payment amount:
${variationSeed}

Requirements:
- description is the full post body the trainee will read. Match the writing style from the variation seed exactly.
- Vary the length - easy posts can be short (3-5 lines), hard posts should be longer (8-12 lines).
- Invent a specific non-generic name for any game, project, or developer username mentioned.
- scam_logs: 0 almost always. Use 2 for a scam-log deny in fh/lfd. Use 1 for sell_creations or investors scam-log denial.
- member_since: realistic date within the last 2 years in format DD Month YYYY.
- has_reviews: false most of the time.
- violation: null only if correct_action is "approve" or "request_pof" with no rule broken. Otherwise a short plain label matching the violation.
- explanation: 2-3 sentences, cite the exact rule.
- post_id: a realistic 6-digit number as a string.
- difficulty field in JSON must be "${difficulty}".

Output ONLY the raw JSON object.`;
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
// Deny opens a dropdown - no suspend button (examples are not generated/visible to the reviewer in training)
export function buildPostActionRows(sessionId: number, category: string): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`pt_action:${sessionId}:approve`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`pt_action:${sessionId}:request_pof`)
      .setLabel('Request Proof of Funds')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`pt_deny_open:${sessionId}`)
      .setLabel('Deny')
      .setStyle(ButtonStyle.Danger),
  );

  return [actionRow];
}

// BUILD DENY REASON SELECT - filtered to the post's category, async because it queries DB
export async function buildDenyReasonSelect(sessionId: number, category: string): Promise<ActionRowBuilder<StringSelectMenuBuilder>> {
  const reasons = await getDenialReasons(category);

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`pt_deny_sel:${sessionId}`)
      .setPlaceholder('Select the denial reason...')
      .addOptions(
        reasons.map(r =>
          new StringSelectMenuOptionBuilder()
            .setLabel(r.label.slice(0, 100))
            .setValue(r.label.slice(0, 100))
            .setDescription(r.message.slice(0, 100))
        )
      )
  );
}

// BUILD FEEDBACK EMBED
export function buildFeedbackEmbed(
  post: GeneratedPost,
  userAction: string,
  userDenyLabel: string | null,
  correct: boolean,
  sessionScore: number,
  sessionTotal: number,
): EmbedBuilder {
  const actionLabels: Record<string, string> = {
    approve:     'Approve',
    deny:        'Deny',
    request_pof: 'Request Proof of Funds',
  };

  const yourActionDisplay = userAction === 'deny' && userDenyLabel
    ? `Deny - ${userDenyLabel}`
    : actionLabels[userAction] ?? userAction;

  const correctActionDisplay = post.correct_action === 'deny' && post.violation
    ? `Deny - ${post.violation}`
    : actionLabels[post.correct_action] ?? post.correct_action;

  const embed = new EmbedBuilder()
    .setColor(correct ? Colors.Green : Colors.Red)
    .setTitle(correct ? 'Correct' : 'Incorrect')
    .addFields(
      { name: 'Your Action',    value: yourActionDisplay,    inline: true },
      { name: 'Correct Action', value: correctActionDisplay, inline: true },
      { name: 'Post',           value: `**${post.title}** (\`${post.post_id}\`)`, inline: false },
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
