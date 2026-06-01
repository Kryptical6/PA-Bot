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
  // Exact wording sourced from Module 5 (FH) and the Post Approver Handbook
  fh: [
    { label: 'No payment / range too wide',    message: 'Please state a valid range/fixed payment, so that your fees are clear to developers.' },
    { label: '2 scam logs',                    message: '2 scam logs found. You cannot use our marketplace.' },
    { label: 'Poor grammar or spelling',        message: 'Please ensure you use correct grammar/spelling in your description.' },
    { label: 'Description too vague',           message: 'Description too vague, please elaborate on the tasks expected from the developer and repost.' },
    { label: 'Post structure hard to read',     message: 'Description format makes it hard to read. Please provide a more structured post.' },
    { label: 'Recruiters / commission finder',  message: 'Recruiters are prohibited on the RoDevs marketplace.' },
    { label: 'Downloadable files',              message: 'Please ensure your post does not include downloadable files. You can use a streaming platform such as YouTube.' },
    { label: 'Discord server link',             message: 'Please do not promote your discord server in your post.' },
    { label: 'Multi-service post',              message: 'Multi-hiring is prohibited on the RoDevs marketplace. Please make separate posts for each service in the designated channels.' },
    { label: 'Incorrect channel',               message: 'Incorrect channel. Please post this in [X].' },
    { label: 'Not enough examples',             message: 'Please provide at least 2 visual examples of your work.' },
    { label: 'Not enough video examples',       message: 'Please provide at least 2 video examples showcasing your work.' },
    { label: 'Examples below quality',          message: 'Work examples do not meet our marketplace quality standards.' },
  ],
  // Exact wording sourced from Module 6 (LFD) and the Post Approver Handbook
  lfd: [
    { label: 'No payment / range too wide',     message: 'Please state a valid range/fixed payment, so that your budget is clear to developers.' },
    { label: 'Payment range too wide',          message: 'Payment range is too wide. Please decrease it before posting again.' },
    { label: 'Underpayment',                    message: 'Underpayment. Please ensure that you are paying developers fairly.' },
    { label: 'Percentage-only payment',         message: 'Payment relying solely on percentage of game revenue is prohibited on the RoDevs marketplace.' },
    { label: '2 scam logs',                     message: '2 scam logs found. You cannot use our marketplace.' },
    { label: 'Lack of information / vague',     message: 'Lack of information. Please provide a clear description so developers understand what you are looking for.' },
    { label: 'Poor grammar or spelling',        message: 'Please ensure you use correct grammar/spelling in your description.' },
    { label: 'Tasks not detailed enough',       message: 'Description too vague, please elaborate on the tasks expected from the developer and repost.' },
    { label: 'Post structure hard to read',     message: 'Description format makes it hard to read. Please provide a more structured post.' },
    { label: 'Recruiters / commission finder',  message: 'Recruiters are prohibited on the RoDevs marketplace.' },
    { label: 'Downloadable files',              message: 'Please ensure your post does not include downloadable files. You can use a streaming platform such as YouTube.' },
    { label: 'Discord server link',             message: 'Please do not promote your discord server in your post.' },
    { label: 'Multi-hire post',                 message: 'Multi-hiring is prohibited on the RoDevs marketplace. Please make separate posts for each developer in the designated channels.' },
    { label: 'Incorrect channel',               message: 'Incorrect channel. Please post this in [X].' },
    { label: '3D rigger in wrong channel',      message: 'Incorrect channel, please repost in lfd-animation or lfd-modeler.' },
    { label: 'Deadline under 3 days',           message: 'Commissions with a deadline under 3 days are not allowed. Please increase the deadline and repost.' },
  ],
  // Exact wording sourced from Module 6 (Skill Roles) and the Post Approver Handbook
  skill_role: [
    { label: 'Below quality standards',         message: 'Work does not meet the marketplace standards required for this role. We encourage you to reapply once you have improved!' },
    { label: 'Examples not visible',            message: "Examples aren't visible. Please resubmit using a different format." },
    { label: 'Not enough video examples',       message: 'Please provide at least 2 video examples showcasing your work.' },
    { label: 'Tutorial work submitted',         message: 'You cannot use tutorial work to apply for this skill.' },
    { label: 'Roblox account not linked',       message: 'Your post has been rejected due to your account not being visibly or directly linked to the game. Please update the game description, or make identifiable proof of your ownership prior to re-submitting a game creator/group owner request.' },
    { label: 'Downloadable file submitted',     message: 'Please ensure your post does not include downloadable files. You can use a streaming platform such as YouTube.' },
  ],
  // Exact wording sourced from Module 5 (SC) and the Post Approver Handbook
  sell_creations: [
    { label: 'Selling a game or group',         message: 'Selling games/groups is prohibited on the RoDevs marketplace.' },
    { label: 'Selling a scripted map',          message: 'Selling scripted maps is prohibited on the RoDevs marketplace.' },
    { label: 'Not enough examples',             message: 'Please provide at least 2 visual examples.' },
    { label: 'No video for scripted system',    message: 'Please provide a video showcasing your system.' },
    { label: 'No description of product',       message: 'Please provide an explanation/description about the product you are selling.' },
    { label: 'Bad quality',                     message: 'Creation does not meet the marketplace quality standards.' },
    { label: 'Downloadable files',              message: 'Please ensure your post does not contain any downloadable files. You can use a streaming platform such as YouTube.' },
    { label: '1 scam log',                      message: '1 scam log found. You cannot post in this channel.' },
    { label: 'Excess free filler assets',       message: 'Excess use of free filler/placeholder assets. Please replace these with your own assets.' },
  ],
  // Exact wording sourced from Module 6 (Investors) and the Post Approver Handbook
  investors: [
    { label: 'Less than 15% revenue share',     message: 'Please ensure at least 15% of the revenue is available for investors.' },
    { label: 'Invalid fund amount or range',    message: 'Please state a valid range/fixed amount to allow investors to understand the fund amount.' },
    { label: 'Not enough images',               message: 'Investment posts must contain at least 5 images showing the map and every other aspect of the game (UI, systems, maps, models etc.)' },
    { label: 'Game under 55% complete',         message: 'Game must be at least 55% complete.' },
    { label: 'Poor game quality',               message: 'Game does not meet the marketplace quality standards.' },
    { label: '1 scam log',                      message: '1 scam log found. You cannot post in the investors channel.' },
    { label: 'Share above 90% (selling game)',  message: 'Selling games is prohibited on the RoDevs marketplace.' },
    { label: 'Downloadable files',              message: 'Please ensure your post does not contain any downloadable files. You can use streaming platforms such as YouTube.' },
    { label: 'Game link missing (100%)',        message: 'Please provide a link to your game.' },
    { label: 'Not a Roblox game',               message: 'You can only look for investors for Roblox games on the RoDevs marketplace.' },
  ],
  // Exact wording sourced from Module 5 (Ads) and the Post Approver Handbook
  advertising: [
    { label: 'Game not playable',               message: 'Game must be available to play.' },
    { label: 'AFK game',                        message: 'AFK games are prohibited on the RoDevs marketplace.' },
    { label: 'Commission finder',               message: 'Commission finders are prohibited on the RoDevs marketplace.' },
    { label: 'Poor grammar or spelling',        message: 'Please ensure you use correct grammar/spelling in your description.' },
    { label: 'Scam or deceptive game',          message: 'Advertising scam games or games meant to deceive users is strictly prohibited in the RoDevs marketplace.' },
    { label: 'Advertising a service',           message: 'Advertising services in this category are prohibited. This category is meant for advertising a game, group, or a product on the Roblox platform.' },
    { label: 'Not a Roblox game/group/product', message: "This category is meant to advertise users' creations on the Roblox platform (games, groups, or products on the Roblox platform)." },
  ],
  // Exact wording sourced from Module 5 (Reviewals) and the Post Approver Handbook
  reviews: [
    { label: 'Product not shown',               message: 'Please provide image proof showcasing the product.' },
    { label: 'Payment not verified',            message: 'Please provide image evidence verifying the payment.' },
    { label: 'Insulting or vulgar language',    message: 'Please refrain from using any insults or vulgar language.' },
    { label: 'Fake review',                     message: 'Please do not attempt to make fake reviews to deceive users.' },
    { label: 'Scam report (wrong channel)',     message: 'Please make a scam report by DMing modmail to report this user for scamming.' },
    { label: 'Non-RoDevs transaction',          message: 'Please only make reviews for transactions and services made inside RoDevs.' },
    { label: 'Payment does not match product',  message: 'Please only post proof of payment for the product you are reviewing.' },
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
    'exactly 35,000 Robux flat (triggers POF - post must be clean)',
    'exactly $220 USD flat (triggers POF - post must be clean)',
    'exactly 50,000 Robux flat (triggers POF - post must be clean)',
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

  const exampleRows = await sql`
    SELECT post_body, correct_action, reasoning
    FROM post_train_examples
    WHERE category = ${actualCategory} AND active = true
    ORDER BY RANDOM()
    LIMIT 5
  `.catch(() => []);

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
- sell_creations: Sell Creations (SC) - users selling ready-made completed assets
- investors: Investor Posts - developers seeking financial investment for a Roblox game
- advertising: Roblox Advertising (Ads) - advertising a Roblox game, group, or platform product
- reviews: Reviewals - users leaving feedback about a completed developer transaction

OFFICIAL RULES (sourced directly from the Post Approver Handbook and RoDevs training modules):

== GENERAL RULES (apply to ALL categories) ==
- Every post must state a clear payment and payment method (Robux or USD). "Negotiable" or "can be discussed" alone is not acceptable - a fixed minimum or price range is required.
- Price ranges must NOT exceed 1.5x the minimum. Example: base 5,000 R$ -> max allowed 7,500 R$. Base 1,000 R$ -> max 1,500 R$.
- Percentages (revenue share) are NOT a valid standalone payment. A fixed price must also be provided.
- Posts must be professional, clear, and well formatted. Poor grammar or spelling that makes a post hard to read = DENY.
- Low-quality or poorly described services = DENY.
- No plagiarism or stolen assets of any kind.
- Tutorial work is not acceptable as a portfolio example.
- AI-generated work as examples = suspension in real reviews, but in training treat as DENY since examples cannot be seen.
- Selling games or groups is not allowed in any category.
- Free models/free vectors prohibited unless explicitly declared as filler/placeholder.
- No exploit, virus, malware, or worm related services.
- Posting on behalf of others (commission finders, recruiters) is prohibited. Denial: "Recruiters are prohibited on the RoDevs marketplace."
- No Discord server links in posts.
- No AFK/clicker/scam games.
- No server creation or management services.
- Multi-hiring in a single post is prohibited. One service/role per post.
- No CustomUse.
- Idea makers, concept creators, and story writers are prohibited from FH (they may post in lfd-others only).
- Selling plugins is not allowed.
- LFD posts with a commission deadline under 3 days are not allowed.

== PAYMENT TIER MINIMUMS FOR LFD (critical for underpayment violations) ==
Tier assignment: Beginner = 1-2 hours, one very simple task | Simple = a few hours, one small polished task | Standard = several hours to a couple days, multiple assets or one proper system | Complex = multiple days to weeks, large systems or many deliverables. When in doubt, tier up. Multiple small tasks combined = bump up a tier.

Scripter (Roblox Lua): Beginner 2,000 R$/$8 | Simple 5,000 R$/$20 | Standard 18,000 R$/$70 | Complex 70,000 R$/$280
Programmer (external code/bots/APIs): Beginner 4,000 R$/$15 | Simple 10,000 R$/$40 | Standard 30,000 R$/$120 | Complex 100,000 R$/$400
GFX Designer: Beginner 1,000 R$/$4 | Simple 2,000 R$/$8 | Standard 5,000 R$/$20 | Complex 12,000 R$/$50
UI Designer: Beginner 2,000 R$/$8 | Simple 5,000 R$/$20 | Standard 15,000 R$/$60 | Complex 35,000 R$/$140
Clothing Designer: Beginner 800 R$/$3 | Simple 1,500 R$/$6 | Standard 4,000 R$/$15 | Complex 10,000 R$/$40
Builder: Beginner 2,000 R$/$8 | Simple 5,000 R$/$20 | Standard 18,000 R$/$70 | Complex 45,000 R$/$180
Modeler: Beginner 2,000 R$/$8 | Simple 5,000 R$/$20 | Standard 15,000 R$/$60 | Complex 40,000 R$/$160
Animator: Beginner 1,500 R$/$6 | Simple 3,000 R$/$12 | Standard 8,000 R$/$30 | Complex 25,000 R$/$100
VFX Artist: Beginner 2,000 R$/$8 | Simple 5,000 R$/$20 | Standard 10,000 R$/$40 | Complex 25,000 R$/$100
SFX Artist: Beginner 800 R$/$3 | Simple 1,500 R$/$6 | Standard 4,000 R$/$15 | Complex 10,000 R$/$40
Music Artist: Beginner 1,000 R$/$4 | Simple 2,000 R$/$8 | Standard 6,000 R$/$25 | Complex 15,000 R$/$60
Video Editor: Beginner 1,500 R$/$6 | Simple 3,000 R$/$12 | Standard 8,000 R$/$30 | Complex 20,000 R$/$80

== FOR HIRE (FH) ==
- At least 2 work examples required for all FH posts.
- Scripting, animation, VFX, SFX, sound, and video posts require at least 2 VIDEO examples.
- Examples must not require a download to view - streaming platforms only.
- Low-quality examples or phone camera photos of a screen = DENY.
- FH does NOT use tier minimum payment tables (those are for LFD only). Any clearly stated fixed payment or valid range is acceptable for FH.
- Description must be clear and structured. Vague tasks: "Description too vague, please elaborate on the tasks expected from the developer and repost." Hard to read layout: "Description format makes it hard to read. Please provide a more structured post."

== LOOKING FOR DEVELOPER (LFD) ==
- Must clearly describe the scope of work, offer fair payment (meeting tier minimums), and have a deadline of at least 3 days.
- Denial for underpayment: "Underpayment. Please ensure that you are paying developers fairly."
- Denial for range too wide: "Payment range is too wide. Please decrease it before posting again."
- Denial for no payment: "Please state a valid range/fixed payment, so that your budget is clear to developers."
- Denial for percentage-only: "Payment relying solely on percentage of game revenue is prohibited on the RoDevs marketplace."
- Denial for vague description: "Lack of information. Please provide a clear description so developers understand what you are looking for."
- Denial for tasks not detailed: "Description too vague, please elaborate on the tasks expected from the developer and repost."
- Denial for poor structure: "Description format makes it hard to read. Please provide a more structured post."
- 2 scam logs = DENY.

== SKILL ROLE APPLICATIONS ==
- At least 3 examples required (skill roles require more evidence than standard FH).
- Scripting, VFX, Animation, SFX, and Sound roles require at least 2 VIDEO examples.
- Tutorial work = DENY: "You cannot use tutorial work to apply for this skill."
- No downloadable files.
- Roblox account must be linked for game creator or group owner applications.
- Standard post format: APPLICATION FOR: [role-tier] | Experience: [X years] | Examples: [links] | Created by: [username] ([userID]) | ID: [postID].

== SELL CREATIONS (SC) ==
- No selling games, groups, or scripted maps.
- At least 2 examples required. Scripted systems, VFX, and animations require a video example.
- Denial for no product description: "Please provide an explanation/description about the product you are selling."
- Denial for excess free filler: "Excess use of free filler/placeholder assets. Please replace these with your own assets."
- No downloadable files.
- 1 scam log = DENY.

== INVESTOR POSTS ==
- Must offer at least 15% revenue share. Below 15% = DENY.
- Revenue share above 90% = effectively selling the game = DENY.
- Must state a clear fixed amount or valid range for investment sought.
- At least 5 images required covering all aspects of the game.
- Game must be at least 55% complete.
- If game is 100% complete, a playable game link must be included.
- 1 scam log = DENY.
- Free models are allowed in small amounts in investor posts.

== ROBLOX ADVERTISING ==
- Must be a publicly playable Roblox game, group, or Roblox platform product.
- No AFK games, scam games, services, or off-platform content.
- Denial for services: "Advertising services in this category are prohibited. This category is meant for advertising a game, group, or a product on the Roblox platform."
- Denial for not Roblox: "This category is meant to advertise users' creations on the Roblox platform (games, groups, or products on the Roblox platform)."
- Denial for not playable: "Game must be available to play."

== REVIEWALS ==
- Must include image proof of the product received. Denial: "Please provide image proof showcasing the product."
- Must include image evidence of payment. Denial: "Please provide image evidence verifying the payment."
- No insulting/vulgar language: "Please refrain from using any insults or vulgar language."
- No fake reviews: "Please do not attempt to make fake reviews to deceive users."
- Scam reports go to ModMail: "Please make a scam report by DMing modmail to report this user for scamming."
- Transaction must be from RoDevs: "Please only make reviews for transactions and services made inside RoDevs."
- Payment proof must match product: "Please only post proof of payment for the product you are reviewing."

== PROOF OF FUNDS (request_pof action) ==
- Required when a post offers 30,000 Robux or more, or $200 USD or more.
- The post must pass ALL other checks first. Never request POF on a post that has any rule violation.
- If threshold met AND post is completely clean = correct_action is "request_pof".
- If threshold met AND post has any violation = correct_action is "deny".

== APPROVE ==
- Post meets all rules, no violations, POF threshold not met.

correct_action must be one of: "approve", "deny", "request_pof". Do NOT use "suspend".
${notesBlock}
Respond with ONLY valid raw JSON, no markdown fences, no preamble.
JSON structure:
{
  "title": "string",
  "description": "string - the full post body formatted like a real marketplace post with correct section headers",
  "payment": "string or null",
  "category": "string - e.g. fh-scripting, fh-gfx, fh-ui, fh-animation, fh-modeling, fh-sfx, fh-vfx, fh-video, lfd-scripting, lfd-modeling, lfd-animation, lfd-gfx, lfd-ui, lfd-sfx, lfd-music, skill_role-builder-beginner, skill_role-gfx-standard, sell_creations, investors, advertising, reviews",
  "scam_logs": 0,
  "member_since": "DD Month YYYY",
  "has_reviews": false,
  "post_id": "6-digit number as a string",
  "correct_action": "approve" or "deny" or "request_pof",
  "violation": "short specific plain label or null",
  "explanation": "2-3 sentences. Name the exact rule, state the specific threshold or requirement violated, and confirm why the correct_action is right.",
  "difficulty": "easy" or "medium" or "hard"
}`;
}

// USER PROMPT
function buildUserPrompt(category: string, difficulty: 'easy' | 'medium' | 'hard'): string {
  const diffGuide: Record<string, string> = {
    easy: [
      'The violation must be completely unmissable - visible in the first 1-2 sentences or stated plainly.',
      'Best easy violations: FH/LFD - no payment at all, a discord.gg link in the first line, zero examples provided, deadline explicitly stated as 1 or 2 days, developer openly states posting on behalf of someone else.',
      'SC - developer says they are selling a Roblox game or a scripted map. 1 scam log shown.',
      'Investors - offers 5% revenue share, posts only 2 images, or game is 10% complete.',
      'Advertising - post is a service advertisement not a game, or game is private/unpublished.',
      'Reviews - post is a scam report saying the developer scammed them, or no payment proof at all.',
    ].join(' '),
    medium: [
      'The post looks mostly legitimate on first read. The violation requires rule knowledge to catch.',
      'Good options: FH/LFD - price range that is 1.7x or 1.8x the base (e.g. 1,000 to 1,800 R$ where base is 1,000, max allowed is 1,500), only one example where two are required, LFD deadline of "about 48 hours" or "2 days", LFD underpayment that is below the tier minimum but not zero.',
      'LFD underpayment example: hiring a scripter for a full inventory system with datastore (Standard tier, minimum 18,000 R$) but offering only 3,000 R$.',
      'SC: no description of the product at all.',
      'Alternatively: write a completely clean correct post - APPROVE is the most common missed answer for trainees.',
    ].join(' '),
    hard: [
      'This is a genuine edge case. Choose one:',
      '(1) Completely clean professional post - must be APPROVED. Make it convincingly realistic.',
      '(2) Clean post triggering POF - everything correct but payment is 35,000 R$ or $220 USD or more.',
      '(3) Subtle range violation: price is exactly 1,000-1,600 R$ where base is 1,000 (1.6x, limit is 1.5x = max 1,500 R$).',
      '(4) LFD underpayment requiring tier tables: e.g. complex builder commission (full open world map, multiple biomes, minimum 45,000 R$) offered at 8,000 R$.',
      '(5) Skill role with only 2 examples instead of the required 3.',
      'Lean towards approve or request_pof for hard.',
    ].join(' '),
  };

  const violationPool: Record<string, string[]> = {
    fh: [
      'no payment stated anywhere in the post',
      'price range exceeds 1.5x the base - e.g. 1,000 to 2,000 R$ where max allowed is 1,500',
      'Discord server invite link in the post body',
      'only one example provided where at least two are required',
      'developer explicitly states they are posting on behalf of a client or group',
      'two different services advertised in one post (multi-hire)',
      'no work examples provided at all',
      'downloadable file is the only example link',
      'very poor grammar making the post difficult to understand',
    ],
    lfd: [
      'deadline explicitly stated as 1 or 2 days',
      'no payment mentioned anywhere',
      'percentage-only revenue share with no fixed price',
      'payment is clearly below the tier minimum for the scope described',
      'payment range exceeds 1.5x the lower bound',
      'Discord server link included',
      'two developer roles in a single post',
      'two scam logs shown at the bottom of the post',
      'description so vague the scope cannot be determined',
    ],
    skill_role: [
      'only 2 examples where at least 3 are required',
      'tutorial used as the primary example',
      'downloadable file instead of a streaming link',
      'no Roblox account linked for a game creator or group owner application',
      'examples are not visible - links are broken or private',
    ],
    sell_creations: [
      'seller is explicitly selling a Roblox game',
      'selling a scripted map',
      'only one example provided where two are required',
      '1 scam log shown at the bottom of the post',
      'no description or explanation of the product whatsoever',
      'excess free model usage not declared as filler',
    ],
    investors: [
      'revenue share offered is below 15% (e.g. 5% or 8%)',
      'revenue share above 90%',
      'only 2 or 3 images provided where 5 are required',
      'game clearly appears under 55% complete from the images described',
      'game stated as 100% complete but no game link provided',
      '1 scam log shown at the bottom of the post',
      'no investment amount stated',
    ],
    advertising: [
      'game is described as private or not yet published',
      'post is advertising an AFK game',
      'post is advertising a development service not a game',
      'product being advertised is not on the Roblox platform',
    ],
    reviews: [
      'no image proof of the product received',
      'no payment proof provided',
      'post is a scam report not a review',
      'review contains insulting or vulgar language',
      'transaction described was not on RoDevs',
      'payment proof shown does not match the product being reviewed',
    ],
  };

  const baseCategory = category.split('-')[0] as keyof typeof violationPool;
  const violations = violationPool[baseCategory] ?? violationPool['fh'];
  const pickedViolation = pickRandom(difficulty === 'easy' ? violations.slice(0, 4) : violations);

  const catGuide: Record<string, string> = {
    fh:             'A developer advertising their own services. Use the role type from the variation seed. Include what they offer, their pricing, examples, and contact method.',
    lfd:            'A project owner hiring a developer. Include project description, scope of work, role needed, budget, and deadline. Use the tier minimums to make payment either correct or violating.',
    skill_role:     'A developer applying for a verified skill role. Format: APPLICATION FOR: [role-tier] | Experience: [X years] | Examples: [links] | Created by: [username] ([userID]) | ID: [postID].',
    sell_creations: 'A developer selling a ready-made asset (GUI kit, combat system, UI template, clothing pack, etc.). Include features, what is included, examples, and payment.',
    investors:      'A developer seeking investment for a Roblox game. Include game name, % complete, revenue share offered, investment amount sought, and description of images/features.',
    advertising:    'Someone advertising their Roblox game or group. Include game name, gameplay description, features, and a game link.',
    reviews:        'A user reviewing a completed developer transaction. Show: who is reviewed, what was purchased, proof of product (image links), proof of payment (image link), written comment, and speed/quality/value ratings.',
  };

  const variationSeed = buildVariationSeed();

  const actionHint =
    difficulty === 'easy'
      ? `correct_action must be "deny". Violation to build into the post: ${pickedViolation}.`
      : difficulty === 'medium'
      ? `Choose one and commit: deny (violation: ${pickedViolation}), approve (clean post - over-denying clean posts is the most common trainee mistake), or request_pof (clean post but payment meets the POF threshold).`
      : `Choose the correct_action that best fits your edge case: approve, deny, or request_pof.`;

  return `Generate a ${difficulty} difficulty training post for category: ${category}.

Category context: ${catGuide[baseCategory] ?? catGuide['fh']}

Difficulty instructions: ${diffGuide[difficulty]}

Action: ${actionHint}

Variation seed - follow every item exactly, especially the payment amount:
${variationSeed}

Requirements:
- description is the full post body the trainee reads. Format it like a real RoDevs post with correct section headers (TITLE, DESCRIPTION, PAYMENT, WORK EXAMPLES or CREATION SHOWCASE or GAME SHOWCASE, ABOUT THIS USER, POST ID) as appropriate for the category.
- ABOUT THIS USER must show: "RoDevs Member since [date]", scam log status (e.g. "No scam logs found." or "2 scam logs found."), and reviews status (e.g. "Reviews: None found.").
- Easy posts: 4-6 lines. Hard posts: 10-15 lines.
- Invent specific non-generic names for games, projects, and developer usernames.
- scam_logs: 0 for almost all posts. 2 for FH/LFD scam-log deny. 1 for sell_creations or investors scam-log denial.
- member_since: realistic date within the last 2 years in format DD Month YYYY.
- has_reviews: false most of the time.
- violation: null only if correct_action is "approve" or "request_pof" with no other rule broken. Otherwise a short specific label describing exactly what is wrong (e.g. "price range is 1.8x the base - 1,000 to 1,800 R$, max allowed is 1,500 R$").
- explanation: 2-3 sentences. State the exact rule, the precise threshold or requirement, and why the correct_action is right.
- post_id: 6-digit number as a string.
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
