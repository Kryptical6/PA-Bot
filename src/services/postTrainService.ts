import {
  EmbedBuilder, Colors, ButtonBuilder, ButtonStyle,
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} from 'discord.js';
import { sql } from '../database/client';
import { embedDescription, embedField, embedFooter, embedTitle } from '../utils/embeds';


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
  scenario_id:    string;
  base_scenario_id?: string;
  correct_action: 'approve' | 'deny' | 'request_pof';
  correct_denial_labels?: string[];
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
  // Sourced verbatim from Module 5 - Marketplace Sections (FH table)
  fh: [
    { label: 'No payment stated or range makes no sense',      message: 'Please state a valid range/fixed payment, so that your fees are clear to developers.' },
    { label: '2 scam logs found',                              message: '2 scam logs found. You cannot use our marketplace.' },
    { label: 'Poor grammar and spelling',                      message: 'Please ensure you use correct grammar/spelling in your description.' },
    { label: 'Lots of info but tasks not detailed enough',     message: 'Description too vague, please elaborate on the tasks expected from the developer and repost.' },
    { label: 'Post structure is messy and hard to read',       message: 'Description format makes it hard to read. Please provide a more structured post.' },
    { label: 'Posting on someone else\'s or a group\'s behalf', message: 'Recruiters are prohibited on the RoDevs marketplace.' },
    { label: 'Examples are downloadable files',                message: 'Please ensure your post does not include downloadable files. You can use a streaming platform such as YouTube.' },
    { label: 'Discord server links in the post',               message: 'Please do not promote your discord server in your post.' },
    { label: 'Promoting multiple services',                    message: 'Multi-hiring is prohibited on the RoDevs marketplace. Please make separate posts for each service in the designated channels.' },
    { label: 'Incorrect channel',                              message: 'Incorrect channel. Please post this in [X].' },
    { label: 'Fewer than 2 examples provided',                 message: 'Please provide at least 2 visual examples of your work.' },
    { label: 'Fewer than 2 video examples (Scripter/VFX/Anim/SFX)', message: 'Please provide at least 2 video examples showcasing your work.' },
    { label: 'Work examples do not meet quality standards',    message: 'Work examples do not meet our marketplace quality standards.' },
  ],
  // Sourced verbatim from Module 6 - Marketplace Sections Part 2 (LFD table)
  lfd: [
    { label: 'No payment stated or range is too wide',         message: 'Please state a valid range/fixed payment, so that your budget is clear to developers.' },
    { label: 'Payment range is too wide',                      message: 'Payment range is too wide. Please decrease it before posting again.' },
    { label: 'Underpayment for the scope of work',             message: 'Underpayment. Please ensure that you are paying developers fairly.' },
    { label: 'Offering only % or uncertain game revenue',      message: 'Payment relying solely on percentage of game revenue is prohibited on the RoDevs marketplace.' },
    { label: '2 scam logs found',                              message: '2 scam logs found. You cannot use our marketplace.' },
    { label: 'Unclear description or tasks not well defined',  message: 'Lack of information. Please provide a clear description so developers understand what you are looking for.' },
    { label: 'Poor grammar and spelling',                      message: 'Please ensure you use correct grammar/spelling in your description.' },
    { label: 'Info heavy but tasks not detailed enough',       message: 'Description too vague, please elaborate on the tasks expected from the developer and repost.' },
    { label: 'Post structure is messy and hard to read',       message: 'Description format makes it hard to read. Please provide a more structured post.' },
    { label: 'Posting on someone else\'s or a group\'s behalf', message: 'Recruiters are prohibited on the RoDevs marketplace.' },
    { label: 'Examples attached are downloadable files',       message: 'Please ensure your post does not include downloadable files. You can use a streaming platform such as YouTube.' },
    { label: 'Discord server links in the post',               message: 'Please do not promote your discord server in your post.' },
    { label: 'Hiring for a commission finder group',           message: 'Commission finders are prohibited on the RoDevs marketplace.' },
    { label: 'Hiring multiple different skill roles in one post', message: 'Multi-hiring is prohibited on the RoDevs marketplace. Please make separate posts for each developer in the designated channels.' },
    { label: 'Incorrect channel',                              message: 'Incorrect channel. Please post this in [X].' },
    { label: 'Looking for 3D riggers in lfd-others',           message: 'Incorrect channel, please repost in lfd-animation or lfd-modeler.' },
  ],
  // Sourced verbatim from Module 6 - Marketplace Sections Part 2 (Skill Role table)
  skill_role: [
    { label: 'Work does not meet the standard for the role',   message: 'Work does not meet the marketplace standards required for this role. We encourage you to reapply once you have improved!' },
    { label: 'Examples are not visible or accessible',         message: "Examples aren't visible. Please resubmit using a different format." },
    { label: 'Fewer than 2 video examples (Scripter/VFX/Anim/SFX)', message: 'Please provide at least 2 video examples showcasing your work.' },
    { label: 'Tutorial work identified',                       message: 'You cannot use tutorial work to apply for this skill.' },
    { label: 'Roblox account not linked to the game or group', message: 'Your post has been rejected due to your account not being visibly or directly linked to the game. Please update the game description, or make identifiable proof of your ownership prior to re-submitting a game creator/group owner request.' },
    { label: 'Not enough examples for the role',               message: 'Please provide the required number of examples for this skill role.' },
    { label: 'Application contains downloadable examples',     message: 'Please ensure your post does not include downloadable files. You can use a streaming platform such as YouTube.' },
  ],
  // Sourced verbatim from Module 5 - Marketplace Sections (SC table)
  sell_creations: [
    { label: 'Selling a game or group',                        message: 'Selling games/groups is prohibited on the RoDevs marketplace.' },
    { label: 'Selling a scripted map',                         message: 'Selling scripted maps is prohibited on the RoDevs marketplace.' },
    { label: 'Fewer than 2 examples',                          message: 'Please provide at least 2 visual examples.' },
    { label: 'Scripted system with no video',                  message: 'Please provide a video showcasing your system.' },
    { label: 'Not enough information about the product',       message: 'Please provide an explanation/description about the product you are selling.' },
    { label: 'Bad quality',                                    message: 'Creation does not meet the marketplace quality standards.' },
    { label: 'Examples are downloadable files',                message: 'Please ensure your post does not contain any downloadable files. You can use a streaming platform such as YouTube.' },
    { label: '1 scam log found',                               message: '1 scam log found. You cannot post in this channel.' },
    { label: 'Too many free filler or placeholder assets',     message: 'Excess use of free filler/placeholder assets. Please replace these with your own assets.' },
  ],
  // Sourced verbatim from Module 6 - Marketplace Sections Part 2 (Investors table)
  investors: [
    { label: 'Offering less than 15% revenue share',           message: 'Please ensure at least 15% of the revenue is available for investors.' },
    { label: 'Fund amount or range does not make sense',       message: 'Please state a valid range/fixed amount to allow investors to understand the fund amount.' },
    { label: 'Fewer than 5 examples or not enough shown',      message: 'Investment posts must contain at least 5 images showing the map and every other aspect of the game (UI, systems, maps, models etc.)' },
    { label: 'Game is less than 55% complete',                 message: 'Game must be at least 55% complete.' },
    { label: 'Game does not meet quality standards',           message: 'Game does not meet the marketplace quality standards.' },
    { label: '1 scam log found',                               message: '1 scam log found. You cannot post in the investors channel.' },
    { label: 'Share offered is above 90%',                     message: 'Selling games is prohibited on the RoDevs marketplace.' },
    { label: 'Examples are downloadable files',                message: 'Please ensure your post does not contain any downloadable files. You can use streaming platforms such as YouTube.' },
    { label: 'Game is 100% complete but no game link provided', message: 'Please provide a link to your game.' },
    { label: 'Not a Roblox game',                              message: 'You can only look for investors for Roblox games on the RoDevs marketplace.' },
  ],
  // Sourced verbatim from Module 5 - Marketplace Sections (Ads table)
  advertising: [
    { label: 'Game is not playable',                           message: 'Game must be available to play.' },
    { label: 'AFK game',                                       message: 'AFK games are prohibited on the RoDevs marketplace.' },
    { label: 'Commission finder',                              message: 'Commission finders are prohibited on the RoDevs marketplace.' },
    { label: 'Poor grammar and spelling',                      message: 'Please ensure you use correct grammar/spelling in your description.' },
    { label: 'Scam game or deceptive game',                    message: 'Advertising scam games or games meant to deceive users is strictly prohibited in the RoDevs marketplace.' },
    { label: 'Advertising services instead of a game/group/product', message: 'Advertising services in this category are prohibited. This category is meant for advertising a game, group, or a product on the Roblox platform.' },
    { label: 'Not advertising a Roblox game, group, or product', message: "This category is meant to advertise users' creations on the Roblox platform (games, groups, or products on the Roblox platform)." },
  ],
  // Sourced verbatim from Module 5 - Marketplace Sections (Reviewals table)
  reviews: [
    { label: 'Product is unknown or not shown',                message: 'Please provide image proof showcasing the product.' },
    { label: 'Payment is unknown or not verified',             message: 'Please provide image evidence verifying the payment.' },
    { label: 'Insults or vulgar language used',                message: 'Please refrain from using any insults or vulgar language.' },
    { label: 'Fake review',                                    message: 'Please do not attempt to make fake reviews to deceive users.' },
    { label: 'Review is about being scammed',                  message: 'Please make a scam report by DMing modmail to report this user for scamming.' },
    { label: 'Reviewing a service not on RoDevs or outside RoDevs', message: 'Please only make reviews for transactions and services made inside RoDevs.' },
    { label: 'Payment does not match the product being reviewed', message: 'Please only post proof of payment for the product you are reviewing.' },
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

// Seed the DB with the current hardcoded defaults, overwriting any existing rows.
// Called on startup to keep DB in sync with the source of truth in this file.
export async function seedDenialReasons(): Promise<void> {
  try {
    for (const [category, reasons] of Object.entries(DENIAL_REASONS)) {
      // Delete all existing rows for this category and re-insert from source
      await sql`DELETE FROM denial_reasons WHERE category = ${category}`;
      for (let i = 0; i < reasons.length; i++) {
        await sql`
          INSERT INTO denial_reasons (category, label, message, position)
          VALUES (${category}, ${reasons[i].label}, ${reasons[i].message}, ${i})
        `;
      }
    }
    console.log('[DenialReasons] Seeded denial reasons from source.');
  } catch (e) {
    console.error('[DenialReasons] Seed failed:', e);
  }
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

type TrainingScenario = Omit<GeneratedPost, 'post_id' | 'member_since' | 'difficulty'> & {
  scenario_id: string;
  difficulty?: 'easy' | 'medium' | 'hard';
};

const BASE_SCENARIOS: Record<string, TrainingScenario[]> = {
  fh: [
    {
      scenario_id: 'fh-ui-clean',
      title: 'For Hire - UI Designer',
      description: [
        'TITLE: Clean UI Designer For Hire',
        'DESCRIPTION: I create Roblox menus, shop interfaces, and HUD layouts. I provide wireframes, polished frames, and Roblox Studio imports.',
        'PAYMENT: 4,000-5,500 Robux per interface package',
        'WORK EXAMPLES: https://imgur.com/ui-pack-1 | https://imgur.com/ui-pack-2 | https://imgur.com/ui-pack-3',
        'CONTACT: DM me on Discord.',
      ].join('\n'),
      payment: '4,000-5,500 Robux',
      category: 'fh-ui',
      scam_logs: 0,
      has_reviews: false,
      correct_action: 'approve',
      violation: null,
      explanation: 'The post has a clear payment range within the 1.5x rule, describes one service, and includes enough viewable examples. No denial rule is triggered.',
      difficulty: 'medium',
    },
    {
      scenario_id: 'fh-builder-negotiable',
      title: 'For Hire - Builder',
      description: [
        'TITLE: Builder For Hire',
        'DESCRIPTION: I can build maps, interiors, terrain, and simulator lobbies. I have worked on several roleplay maps and cafe builds.',
        'PAYMENT: Negotiable, we can discuss after you DM me.',
        'WORK EXAMPLES: https://imgur.com/build-a | https://imgur.com/build-b',
      ].join('\n'),
      payment: 'Negotiable',
      category: 'fh-building',
      scam_logs: 0,
      has_reviews: false,
      correct_action: 'deny',
      correct_denial_labels: ['No payment stated or range makes no sense'],
      violation: 'No valid payment stated',
      explanation: 'The handbook says negotiable alone is not valid payment. A fixed price, fixed minimum, or valid range is required.',
      difficulty: 'easy',
    },
    {
      scenario_id: 'fh-scripter-download-discord',
      title: 'For Hire - Scripter',
      description: [
        'TITLE: Scripter For Hire',
        'DESCRIPTION: I make combat, inventory, and datastore systems.',
        'PAYMENT: 12,000 Robux per system',
        'WORK EXAMPLES: https://example.com/combat-system.rbxl',
        'CONTACT: Join discord.gg/example to order.',
      ].join('\n'),
      payment: '12,000 Robux',
      category: 'fh-scripting',
      scam_logs: 0,
      has_reviews: false,
      correct_action: 'deny',
      correct_denial_labels: ['Discord server links in the post', 'Examples are downloadable files', 'Fewer than 2 video examples (Scripter/VFX/Anim/SFX)'],
      violation: 'Discord server link and downloadable example',
      explanation: 'Discord server advertising is not allowed in posts, and examples must not require a download. Scripting posts also need at least two video examples.',
      difficulty: 'easy',
    },
    {
      scenario_id: 'fh-animator-pof',
      title: 'For Hire - Animator',
      description: [
        'TITLE: Animator Available',
        'DESCRIPTION: I create combat and movement animations for Roblox rigs.',
        'PAYMENT: 35,000 Robux for a full combat pack',
        'WORK EXAMPLES: https://youtube.com/watch?v=anim1 | https://youtube.com/watch?v=anim2 | https://youtube.com/watch?v=anim3',
      ].join('\n'),
      payment: '35,000 Robux',
      category: 'fh-animation',
      scam_logs: 0,
      has_reviews: false,
      correct_action: 'approve',
      violation: null,
      explanation: 'The post is otherwise clean, includes the required video examples, and is a For Hire post. Proof of Funds is not requested for FH posts.',
      difficulty: 'hard',
    },
  ],
  lfd: [
    {
      scenario_id: 'lfd-combat-clean',
      title: 'Looking For Developer - Combat Scripter',
      description: [
        'TITLE: Hiring Combat Scripter',
        'DESCRIPTION: Need a scripter for melee hitboxes, cooldowns, stamina, and basic data saving.',
        'PAYMENT: 18,000-24,000 Robux',
        'DEADLINE: 2 weeks',
        'CONTACT: DM me with previous systems.',
      ].join('\n'),
      payment: '18,000-24,000 Robux',
      category: 'lfd-scripting',
      scam_logs: 0,
      has_reviews: false,
      correct_action: 'approve',
      violation: null,
      explanation: 'The post has a clear scope, valid payment, and one developer role. No denial rule is triggered.',
      difficulty: 'medium',
    },
    {
      scenario_id: 'lfd-builder-revshare-deadline',
      title: 'Looking For Developer - Builder',
      description: [
        'TITLE: Need Builder Today',
        'DESCRIPTION: Need a full simulator lobby, shop area, portals, terrain, and spawn area.',
        'PAYMENT: 20% revenue share only',
        'DEADLINE: 48 hours',
      ].join('\n'),
      payment: '20% revenue share',
      category: 'lfd-building',
      scam_logs: 0,
      has_reviews: false,
      correct_action: 'deny',
      correct_denial_labels: ['Offering only % or uncertain game revenue'],
      violation: 'Percentage-only payment',
      explanation: 'Revenue share cannot be the only payment. The deadline is not used as the denial reason for this scenario.',
      difficulty: 'easy',
    },
    {
      scenario_id: 'lfd-ui-wide-range',
      title: 'Looking For Developer - UI Designer',
      description: [
        'TITLE: Hiring UI Designer',
        'DESCRIPTION: Need someone to design and import a complete shop, inventory, settings menu, and daily rewards UI.',
        'PAYMENT: 1,000-2,000 Robux',
        'DEADLINE: 1 week',
      ].join('\n'),
      payment: '1,000-2,000 Robux',
      category: 'lfd-ui',
      scam_logs: 0,
      has_reviews: false,
      correct_action: 'deny',
      correct_denial_labels: ['Payment range is too wide'],
      violation: 'Payment range exceeds 1.5x base',
      explanation: 'A 1,000-2,000 Robux range is 2x the base payment. The handbook caps ranges at 1.5x the base unless the payment is small enough to bypass the rule.',
      difficulty: 'medium',
    },
  ],
  skill_role: [
    {
      scenario_id: 'skill-builder-clean',
      title: 'Skill Role Application - Builder',
      description: [
        'APPLICATION FOR: Builder - Beginner',
        'EXAMPLES: https://imgur.com/build1 | https://imgur.com/build2 | https://imgur.com/build3',
        'NOTES: All builds are original and finished.',
      ].join('\n'),
      payment: null,
      category: 'skill_role-builder-beginner',
      scam_logs: 0,
      has_reviews: false,
      correct_action: 'approve',
      violation: null,
      explanation: 'This application provides enough examples for the requested role. Proof of ownership is only needed when requested, so no denial rule is triggered.',
      difficulty: 'medium',
    },
    {
      scenario_id: 'skill-gfx-clean',
      title: 'Skill Role Application - GFX',
      description: [
        'APPLICATION FOR: Graphics Designer - Beginner',
        'EXAMPLES: https://imgur.com/gfx1 | https://imgur.com/gfx2 | https://imgur.com/gfx3',
      ].join('\n'),
      payment: null,
      category: 'skill_role-gfx-beginner',
      scam_logs: 0,
      has_reviews: false,
      correct_action: 'approve',
      violation: null,
      explanation: 'The application includes enough viewable examples for the role. No denial rule is triggered.',
      difficulty: 'easy',
    },
    {
      scenario_id: 'skill-animator-two-examples',
      title: 'Skill Role Application - Animator',
      description: [
        'APPLICATION FOR: Animator - Beginner',
        'EXAMPLES: https://youtube.com/watch?v=idlepack | https://youtube.com/watch?v=walkcycle',
      ].join('\n'),
      payment: null,
      category: 'skill_role-animation-beginner',
      scam_logs: 0,
      has_reviews: false,
      correct_action: 'deny',
      correct_denial_labels: ['Not enough examples for the role'],
      violation: 'Not enough examples',
      explanation: 'The role guidelines require a minimum of 3 examples unless otherwise specified. This application only provides two animation examples.',
      difficulty: 'medium',
    },
  ],
  sell_creations: [
    {
      scenario_id: 'sc-ui-pack-clean',
      title: 'Sell Creations - UI Pack',
      description: [
        'TITLE: Selling Sci-Fi UI Pack',
        'DESCRIPTION: Includes shop, inventory, settings, and notification frames. Fully editable PSD and Roblox Studio import included.',
        'PAYMENT: 8,000 Robux',
        'SHOWCASE: https://imgur.com/uipack1 | https://imgur.com/uipack2 | https://imgur.com/uipack3',
      ].join('\n'),
      payment: '8,000 Robux',
      category: 'sell_creations',
      scam_logs: 0,
      has_reviews: false,
      correct_action: 'approve',
      violation: null,
      explanation: 'The post is selling an allowed asset, includes a clear payment, and provides enough directly viewable examples.',
      difficulty: 'medium',
    },
    {
      scenario_id: 'sc-tycoon-game',
      title: 'Sell Creations - Complete Tycoon Game',
      description: [
        'TITLE: Selling Complete Tycoon Game',
        'DESCRIPTION: Fully scripted tycoon game with map, datastore, shop, rebirths, and monetization.',
        'PAYMENT: 50,000 Robux',
        'SHOWCASE: https://youtube.com/watch?v=tycoonshowcase',
      ].join('\n'),
      payment: '50,000 Robux',
      category: 'sell_creations',
      scam_logs: 0,
      has_reviews: false,
      correct_action: 'deny',
      correct_denial_labels: ['Selling a game or group'],
      violation: 'Selling a game',
      explanation: 'Selling games or groups is prohibited in Sell Creations. This should be denied even though it has payment and a showcase.',
      difficulty: 'easy',
    },
    {
      scenario_id: 'sc-props-scam-log',
      title: 'Sell Creations - Asset Pack',
      description: [
        'TITLE: Selling Medieval Props',
        'DESCRIPTION: A pack of crates, banners, barrels, and shop stands.',
        'PAYMENT: 2,500 Robux',
        'SHOWCASE: https://imgur.com/props1 | https://imgur.com/props2',
        'ABOUT THIS USER: 1 scam log found.',
      ].join('\n'),
      payment: '2,500 Robux',
      category: 'sell_creations',
      scam_logs: 1,
      has_reviews: false,
      correct_action: 'deny',
      correct_denial_labels: ['1 scam log found'],
      violation: '1 scam log',
      explanation: 'Sell Creations requires a clean record due to fraud risk. One scam log is enough to deny the post.',
      difficulty: 'easy',
    },
  ],
  investors: [
    {
      scenario_id: 'investors-dungeon-clean',
      title: 'Investors - Dungeon RPG',
      description: [
        'TITLE: Seeking Investors for Dungeon RPG',
        'DESCRIPTION: Game is around 70% complete with combat, inventory, quests, UI, maps, and monetization implemented.',
        'INVESTMENT SOUGHT: 80,000 Robux',
        'REVENUE SHARE: 20%',
        'SHOWCASE: 6 images covering map, UI, combat, inventory, shop, and quest systems.',
      ].join('\n'),
      payment: '80,000 Robux sought, 20% revenue share',
      category: 'investors',
      scam_logs: 0,
      has_reviews: false,
      correct_action: 'approve',
      violation: null,
      explanation: 'The post offers at least 15% revenue share, gives a clear investment amount, shows enough images, and the game is over 55% complete.',
      difficulty: 'hard',
    },
    {
      scenario_id: 'investors-simulator-low-share',
      title: 'Investors - Simulator',
      description: [
        'TITLE: Need Investors for Simulator',
        'DESCRIPTION: Game is about 35% complete. Basic map and one pet system are done.',
        'INVESTMENT SOUGHT: 25,000 Robux',
        'REVENUE SHARE: 10%',
        'SHOWCASE: 3 images.',
      ].join('\n'),
      payment: '25,000 Robux sought, 10% revenue share',
      category: 'investors',
      scam_logs: 0,
      has_reviews: false,
      correct_action: 'deny',
      correct_denial_labels: ['Offering less than 15% revenue share', 'Game is less than 55% complete'],
      violation: 'Below 15% revenue share and under 55% complete',
      explanation: 'Investors posts must offer at least 15% revenue share and the game must be at least 55% complete based on the images.',
      difficulty: 'easy',
    },
    {
      scenario_id: 'investors-complete-no-link',
      title: 'Investors - Finished Obby',
      description: [
        'TITLE: Seeking Investor for Finished Obby',
        'DESCRIPTION: Game is 100% complete and ready to advertise.',
        'INVESTMENT SOUGHT: 30,000 Robux',
        'REVENUE SHARE: 25%',
        'SHOWCASE: 5 images attached.',
        'GAME LINK: Not available yet.',
      ].join('\n'),
      payment: '30,000 Robux sought, 25% revenue share',
      category: 'investors',
      scam_logs: 0,
      has_reviews: false,
      correct_action: 'deny',
      correct_denial_labels: ['Game is 100% complete but no game link provided'],
      violation: 'Complete game missing link',
      explanation: 'A game declared 100% complete must include a playable game link so investors can assess it.',
      difficulty: 'medium',
    },
  ],
  advertising: [
    {
      scenario_id: 'ads-td-clean',
      title: 'Roblox Advertising - Tower Defense Game',
      description: [
        'TITLE: Play Neon Tower Defense',
        'DESCRIPTION: Public Roblox tower defense game with waves, upgrades, bosses, and trading.',
        'GAME LINK: https://roblox.com/games/123456/neon-td',
      ].join('\n'),
      payment: null,
      category: 'advertising',
      scam_logs: 0,
      has_reviews: false,
      correct_action: 'approve',
      violation: null,
      explanation: 'Advertising posts must be for a Roblox game, group, or platform product. This is a public playable Roblox game.',
      difficulty: 'medium',
    },
    {
      scenario_id: 'ads-service-promo',
      title: 'Roblox Advertising - Development Services',
      description: [
        'TITLE: Advertising My Building Services',
        'DESCRIPTION: I build maps, cafes, and simulator lobbies. Join my server for prices and examples.',
        'LINK: discord.gg/builderhub',
      ].join('\n'),
      payment: null,
      category: 'advertising',
      scam_logs: 0,
      has_reviews: false,
      correct_action: 'deny',
      correct_denial_labels: ['Advertising services instead of a game/group/product'],
      violation: 'Advertising services instead of a Roblox creation',
      explanation: 'The advertising category is for Roblox games, groups, or platform products only. Services and Discord server promotion do not belong there.',
      difficulty: 'easy',
    },
  ],
  reviews: [
    {
      scenario_id: 'reviews-ui-clean',
      title: 'Review - UI Commission',
      description: [
        'TITLE: Review for pixelNova',
        'PRODUCT: Custom inventory and shop UI delivered in Roblox Studio.',
        'PRODUCT PROOF: https://imgur.com/product-proof',
        'PAYMENT PROOF: https://imgur.com/payment-proof',
        'REVIEW: Fast communication and delivered exactly what I requested.',
      ].join('\n'),
      payment: null,
      category: 'reviews',
      scam_logs: 0,
      has_reviews: true,
      correct_action: 'approve',
      violation: null,
      explanation: 'The review includes product proof, matching payment proof, and is about a RoDevs developer service.',
      difficulty: 'medium',
    },
    {
      scenario_id: 'reviews-scam-report',
      title: 'Review - Scam Report',
      description: [
        'TITLE: Bad review for user123',
        'PRODUCT: They never delivered anything.',
        'PAYMENT PROOF: https://imgur.com/payment',
        'REVIEW: This user scammed me, please ban them.',
      ].join('\n'),
      payment: null,
      category: 'reviews',
      scam_logs: 0,
      has_reviews: false,
      correct_action: 'deny',
      correct_denial_labels: ['Review is about being scammed'],
      violation: 'Review is a scam report',
      explanation: 'Reviews are for completed service feedback. Scam reports must go through ModMail instead of the reviews channel.',
      difficulty: 'easy',
    },
  ],
};

function randomPostId(category: string): string {
  const n = String(Math.floor(100000 + Math.random() * 900000));
  return category.startsWith('skill_role') ? `a${n}` : n;
}

function randomMemberSince(): string {
  const monthsAgo = Math.floor(2 + Math.random() * 22);
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(Math.floor(1 + Math.random() * 24));
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function parseScenarioLines(description: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of description.split('\n').map(l => l.trim()).filter(Boolean)) {
    const match = line.match(/^([^:]{2,40}):\s*(.+)$/);
    if (match) {
      parsed[match[1].toLowerCase()] = match[2];
    } else {
      parsed.description = parsed.description ? `${parsed.description} ${line}` : line;
    }
  }
  return parsed;
}

function randomCode(): string {
  return Math.random().toString(36).slice(2, 7);
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sample<T>(items: T[], min: number, max: number): T[] {
  const count = Math.max(min, Math.min(max, Math.floor(min + Math.random() * (max - min + 1))));
  return shuffle(items).slice(0, count);
}

function varyLinks(text: string): string {
  return text
    .replace(/ui-pack-(\d+)/g, `ui-${randomCode()}-$1`)
    .replace(/build-([ab])/g, `build-${randomCode()}-$1`)
    .replace(/anim(\d+)/g, `anim-${randomCode()}-$1`)
    .replace(/gfx(\d+)/g, `gfx-${randomCode()}-$1`)
    .replace(/props(\d+)/g, `props-${randomCode()}-$1`)
    .replace(/product-proof/g, `product-${randomCode()}`)
    .replace(/payment-proof|payment(?!\\s)/g, `payment-${randomCode()}`)
    .replace(/123456/g, String(Math.floor(100000 + Math.random() * 900000)));
}

function randomUsername(): string {
  const starts = ['orbit', 'lunar', 'byte', 'nova', 'pixel', 'signal', 'vector', 'craft', 'ember', 'atlas'];
  const ends = ['dev', 'works', 'studio', 'rbx', 'forge', 'labs', 'maker', 'builds', 'ui', 'scripts'];
  return `${pickRandom(starts)}_${pickRandom(ends)}${Math.floor(10 + Math.random() * 90)}`;
}

function randomProjectName(): string {
  const first = ['Neon', 'Cobalt', 'Skyline', 'Moonlit', 'Pixel', 'Arcade', 'Ironwood', 'Nova', 'Harbor', 'Crystal'];
  const second = ['Vale', 'Quest', 'District', 'Labs', 'Rush', 'Frontier', 'Haven', 'Forge', 'Arena', 'Tycoon'];
  return `${pickRandom(first)} ${pickRandom(second)}`;
}

function randomAvailability(): string {
  return pickRandom([
    'I can start after the scope is confirmed.',
    'I am usually active in the evening and can reply the same day.',
    'Please include references or a short brief when messaging.',
    'I can discuss exact timing once the post is approved.',
    'I prefer to agree on milestones before any work starts.',
  ]);
}

function uniquePostDetail(category: string): string {
  const base = category.split('-')[0];
  const project = randomProjectName();
  const username = randomUsername();
  const ref = `${randomCode().toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
  const variants: Record<string, string[]> = {
    fh: [
      `Portfolio note: most of my recent work is under the name ${username}, folder ${ref}.`,
      `Preferred project style: ${project}-type commissions with clear references, ref ${ref}.`,
      `Current queue: ${Math.floor(1 + Math.random() * 4)} open slot${Math.random() > 0.5 ? 's' : ''}; booking ref ${ref}.`,
    ],
    lfd: [
      `Project codename: ${project}, brief ${ref}.`,
      `Team contact: ${username}, please send examples first and mention ${ref}.`,
      `Current build status: ${pickRandom(['prototype', 'early alpha', 'menu and map started', 'systems planned'])}; task ref ${ref}.`,
    ],
    skill_role: [
      `Application handle: ${username}, portfolio ref ${ref}.`,
      `Most recent example was made for ${project}, proof ref ${ref}.`,
      `Portfolio update: ${Math.floor(2 + Math.random() * 6)} examples were made this month, batch ${ref}.`,
    ],
    sell_creations: [
      `Pack name: ${project} Bundle, listing ${ref}.`,
      `Seller handle: ${username}, listing ref ${ref}.`,
      `Included items: ${Math.floor(6 + Math.random() * 18)} usable assets, bundle ${ref}.`,
    ],
    investors: [
      `Game codename: ${project}, investor brief ${ref}.`,
      `Owner handle: ${username}, pitch ref ${ref}.`,
      `Development note: latest showcase batch is marked ${ref}.`,
    ],
    advertising: [
      `Experience name: ${project}, update ${ref}.`,
      `Creator handle: ${username}, promo ref ${ref}.`,
      `Current update version: v${Math.floor(1 + Math.random() * 4)}.${Math.floor(Math.random() * 9)}, build ${ref}.`,
    ],
    reviews: [
      `Transaction reference: ${ref}.`,
      `Reviewer handle: ${username}, transaction ${ref}.`,
      `Commission nickname: ${project}, order ${ref}.`,
    ],
  };
  return pickRandom(variants[base] ?? variants.fh);
}

function categoryIntro(category: string): string {
  const base = category.split('-')[0];
  const intros: Record<string, string[]> = {
    fh: [
      'I am opening a few commission slots.',
      'Available for a small number of projects this week.',
      'Taking on Roblox work for teams that need a clean turnaround.',
    ],
    lfd: [
      'Looking for someone reliable to help with this project.',
      'We need one developer for a focused commission.',
      'Hiring for a Roblox project that already has the basic direction planned.',
    ],
    skill_role: [
      'Applying for this skill role with recent examples.',
      'Submitting my portfolio for review.',
      'Here is my application and proof for the role.',
    ],
    sell_creations: [
      'Selling a ready-made Roblox asset pack.',
      'This is a finished asset package available for purchase.',
      'Offering this creation as a completed resource.',
    ],
    investors: [
      'Looking for investment support for a Roblox game.',
      'Seeking funding to help push this game further.',
      'Opening an investment post for an in-development Roblox experience.',
    ],
    advertising: [
      'Sharing a Roblox creation for people to check out.',
      'Advertising this Roblox project to bring in new players.',
      'Posting a quick promotion for my Roblox experience.',
    ],
    reviews: [
      'Leaving a review for a completed RoDevs transaction.',
      'Posting feedback about a developer I worked with.',
      'Reviewing the result of a recent commission.',
    ],
  };
  return pickRandom(intros[base] ?? intros.fh);
}

function neutralExtra(category: string): string {
  const base = category.split('-')[0];
  const extras: Record<string, string[]> = {
    fh: [
      'I can share more previews in DMs if needed.',
      'Turnaround depends on the final scope.',
      'I prefer clear references before starting.',
    ],
    lfd: [
      'Please send relevant previous work when reaching out.',
      'More project details can be discussed after contact.',
      'The final scope can be confirmed before work begins.',
    ],
    skill_role: [
      'All examples are recent and represent my current skill level.',
      'I can provide additional proof if requested.',
      'The linked examples are the ones I want reviewed.',
    ],
    sell_creations: [
      'The buyer will receive the listed files after payment.',
      'Small edits can be discussed before purchase.',
      'The showcase links show what is included.',
    ],
    investors: [
      'Funding would mainly go toward ads and final polish.',
      'I can provide extra development details in DMs.',
      'The game systems shown are the current build state.',
    ],
    advertising: [
      'Feedback is welcome from anyone who tries it.',
      'The linked experience is the main thing being advertised.',
      'The post is meant to bring attention to the Roblox creation.',
    ],
    reviews: [
      'This review is based on my own transaction.',
      'The proof links show what I received and paid.',
      'I am keeping the review focused on the completed work.',
    ],
  };
  return pickRandom(extras[base] ?? extras.fh);
}

function makeVariantTitle(baseTitle: string, category: string): string {
  const projects = [randomProjectName(), randomProjectName(), randomProjectName(), 'Skyline Studio', 'Moonlit Labs', 'Pixel Harbor'];
  const suffixes = ['quick review', 'open slot', 'commission', 'portfolio check', 'project help', 'showcase'];
  const base = category.split('-')[0];
  const title = baseTitle.replace(/^Looking For Developer - /, 'Lf ').replace(/^Roblox Advertising - /, '');
  return pickRandom([
    title,
    `${title} - ${pickRandom(projects)}`,
    `${title} (${pickRandom(suffixes)})`,
    base === 'lfd' ? `${title} for ${pickRandom(projects)}` : `${pickRandom(projects)} - ${title}`,
  ]);
}

function pickDescriptionLine(parsed: Record<string, string>, scenario: TrainingScenario): { key: string | null; value: string } {
  const preferredKeys = ['description', 'review', 'product', 'application for', 'notes'];
  for (const key of preferredKeys) {
    if (parsed[key]) return { key, value: parsed[key] };
  }
  return { key: null, value: scenario.title };
}

function renderScenarioVariant(scenario: TrainingScenario): TrainingScenario {
  const parsed = parseScenarioLines(scenario.description);
  const title = makeVariantTitle(parsed.title ?? scenario.title, scenario.category);
  const primaryDescription = pickDescriptionLine(parsed, scenario);
  const description = varyLinks(primaryDescription.value);
  const details = shuffle(Object.entries(parsed)
    .filter(([key]) => !['title', primaryDescription.key, 'payment', 'about this user', 'post id'].includes(key))
    .map(([key, value]) => ({ label: key.replace(/\b\w/g, c => c.toUpperCase()), value: varyLinks(value) })));

  const intro = categoryIntro(scenario.category);
  const selectedExtras = shuffle([
    uniquePostDetail(scenario.category),
    ...sample([neutralExtra(scenario.category), randomAvailability()], 0, 2),
  ]);
  const style = pickRandom(['paragraph', 'compact', 'sections', 'bullets', 'detailed']);
  let body: string;

  if (style === 'paragraph') {
    body = [
      `${intro} ${description}`,
      details.map(d => `${d.label}: ${d.value}`).join(' | '),
      selectedExtras.join(' '),
    ].filter(Boolean).join('\n\n');
  } else if (style === 'compact') {
    body = [
      description,
      ...details.slice(0, Math.max(1, Math.min(details.length, 2))).map(d => `${d.label}: ${d.value}`),
      ...selectedExtras,
    ].join('\n');
  } else if (style === 'bullets') {
    body = [
      intro,
      `- ${description}`,
      ...details.map(d => `- ${d.label}: ${d.value}`),
      ...selectedExtras.map(extra => `- ${extra}`),
    ].join('\n');
  } else if (style === 'detailed') {
    body = [
      intro,
      '',
      description,
      '',
      ...details.map(d => `${d.label}: ${d.value}`),
      '',
      ...selectedExtras,
      pickRandom(['Please read the full post before deciding.', 'Only judge based on what is shown in this post.', 'I can answer questions after approval if needed.']),
    ].join('\n');
  } else {
    body = [
      `Description: ${description}`,
      ...details.map(d => `${d.label}: ${d.value}`),
      `Notes: ${selectedExtras.join(' ')}`,
    ].join('\n');
  }

  return {
    ...scenario,
    scenario_id: `${scenario.scenario_id}:${Date.now().toString(36)}:${randomCode()}`,
    base_scenario_id: scenario.scenario_id,
    title,
    description: body,
  };
}

function getScenarioPool(category: string): TrainingScenario[] {
  if (category === 'mixed') {
    return Object.values(BASE_SCENARIOS).flat();
  }
  return BASE_SCENARIOS[category] ?? BASE_SCENARIOS.fh;
}

// Generate deterministic handbook-based posts instead of relying on AI to invent rules.
export async function generateTrainingPost(category: string, usedScenarioIds: string[] = []): Promise<GeneratedPost | null> {
  const scenarios = getScenarioPool(category);
  const used = new Set(usedScenarioIds);
  const freshScenarios = scenarios.filter(scenario => !used.has(scenario.scenario_id));
  const recentScenarioCount = Math.max(1, Math.min(3, scenarios.length - 1));
  const recent = new Set(usedScenarioIds.slice(-recentScenarioCount));
  const fallbackScenarios = scenarios.filter(scenario => !recent.has(scenario.scenario_id));
  const pickedBase = pickRandom(
    freshScenarios.length > 0
      ? freshScenarios
      : fallbackScenarios.length > 0
      ? fallbackScenarios
      : scenarios,
  );
  const picked = renderScenarioVariant(pickedBase);

  return {
    ...picked,
    post_id: randomPostId(picked.category),
    member_since: randomMemberSince(),
    difficulty: picked.difficulty ?? 'medium',
  };
}

function formatTrainingPostBody(post: GeneratedPost): string {
  const lines = post.description
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^title\s*:/i.test(line))
    .filter(line => !/^payment\s*:/i.test(line))
    .filter(line => !/^about this user\s*:/i.test(line))
    .filter(line => !/^post id\s*:/i.test(line));

  return lines
    .map(line => line.replace(/^description\s*:\s*/i, ''))
    .map(line => line.replace(/^(work examples|examples|showcase|game showcase|creation showcase|contact|deadline|revenue share|investment sought|notes|review|product|payment proof|application for)\s*:\s*/i, '**$1:** '))
    .join('\n\n');
}

function formatPayment(post: GeneratedPost): string {
  return post.payment ? post.payment : 'No payment stated.';
}

// BUILD POST EMBED
export function buildPostEmbed(post: GeneratedPost, sessionScore: number, sessionTotal: number): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(embedTitle(post.title))
    .setDescription(embedDescription(formatTrainingPostBody(post)));

  const userLines = [
    `<@000000000000000000>`,
    `RoDevs Member since ${post.member_since}`,
    post.scam_logs === 0
      ? 'No scam logs found.'
      : `**${post.scam_logs} scam log${post.scam_logs > 1 ? 's' : ''} found.**`,
  ];

  embed.addFields(
    embedField('Payment', formatPayment(post)),
    embedField('About This User', userLines.join('\n')),
    embedField('Reviews', post.has_reviews ? 'See profile.' : 'None found.', true),
    embedField('Post ID', post.post_id, true),
  );

  embed.setFooter({ text: embedFooter(`Training Session  |  Score: ${sessionScore}/${sessionTotal}  |  ${getDifficultyLabel(post.difficulty)}`) })
    .setTimestamp();

  return embed;
}

// BUILD ACTION BUTTONS
export async function buildPostActionRows(
  sessionId: number,
  category: string,
  disabled = false,
): Promise<ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[]> {
  const reasons = await getDenialReasons(category);
  const baseCategory = category.split('-')[0];
  const showSuspend = ['fh', 'skill_role', 'sell_creations', 'investors'].includes(baseCategory);
  const showRequestPof = baseCategory === 'lfd';

  const decisionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`pt_action:${sessionId}:approve`)
      .setEmoji('✅')
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`pt_action:${sessionId}:deny`)
      .setEmoji('🛑')
      .setLabel('Deny (custom reason)')
      .setStyle(ButtonStyle.Danger),
  );

  const denialReasonRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`pt_deny_sel:${sessionId}`)
      .setPlaceholder('Pre-built denial reasons')
      .setDisabled(disabled)
      .addOptions(
        reasons.slice(0, 25).map(r =>
          new StringSelectMenuOptionBuilder()
            .setLabel(r.label.slice(0, 100))
            .setValue(r.label.slice(0, 100))
            .setDescription(r.message.slice(0, 100))
        )
      )
  );

  const toolButtons: ButtonBuilder[] = [];

  if (showSuspend) {
    toolButtons.push(new ButtonBuilder()
      .setCustomId(`pt_action:${sessionId}:suspend`)
      .setEmoji('✋')
      .setLabel('Suspend')
      .setStyle(ButtonStyle.Primary));
  }

  if (showRequestPof) {
    toolButtons.push(new ButtonBuilder()
      .setCustomId(`pt_action:${sessionId}:request_pof`)
      .setEmoji('✋')
      .setLabel('Request Proof of Funds')
      .setStyle(ButtonStyle.Primary));
  }

  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [decisionRow, denialReasonRow];
  const toolRow = toolButtons.length > 0
    ? new ActionRowBuilder<ButtonBuilder>().addComponents(...toolButtons)
    : null;
  if (toolRow) rows.push(toolRow);

  for (const row of [decisionRow, toolRow].filter(Boolean) as ActionRowBuilder<ButtonBuilder>[]) {
    row.components.forEach(component => component.setDisabled(disabled));
  }

  return rows;
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
      embedField('Your Action', yourActionDisplay, true),
      embedField('Correct Action', correctActionDisplay, true),
      embedField('Post', `**${post.title}** (\`${post.post_id}\`)`, false),
    );

  if (!correct && post.violation) {
    embed.addFields(embedField('Rule Violated', post.violation));
  }

  embed.addFields(embedField('Explanation', post.explanation));

  embed.setFooter({ text: embedFooter(`Score: ${sessionScore}/${sessionTotal}  |  ${getDifficultyLabel(post.difficulty)}`) })
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
async function ensurePostTrainSessionSchema(): Promise<void> {
  try {
    await sql`ALTER TABLE post_train_sessions ADD COLUMN IF NOT EXISTS shown_post_keys JSONB NOT NULL DEFAULT '[]'::jsonb`;
  } catch (e) {
    console.error('[PostTrain] Failed to ensure session schema:', e);
  }
}

function getShownPostKeys(session: any): string[] {
  const raw = session?.shown_post_keys;
  if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === 'string');
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function getShownScenarioIds(session: any): string[] {
  return getShownPostKeys(session);
}

export async function getActiveSession(userId: string): Promise<any | null> {
  const rows = await sql`SELECT * FROM post_train_sessions WHERE user_id = ${userId} AND status = 'active'`;
  return rows[0] ?? null;
}

export async function createSession(userId: string, category: string): Promise<any> {
  await ensurePostTrainSessionSchema();
  await sql`UPDATE post_train_sessions SET status = 'ended', ended_at = NOW() WHERE user_id = ${userId} AND status = 'active'`;
  const [session] = await sql`
    INSERT INTO post_train_sessions (user_id, category, status, score, total, shown_post_keys)
    VALUES (${userId}, ${category}, 'active', 0, 0, '[]'::jsonb)
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
  await ensurePostTrainSessionSchema();
  const scenarioId = post.base_scenario_id ?? post.scenario_id ?? `${post.category}:${post.title}`;
  await sql`
    UPDATE post_train_sessions
    SET
      last_post_data = ${JSON.stringify(post)}::jsonb,
      shown_post_keys = (
        SELECT COALESCE(jsonb_agg(recent.key ORDER BY recent.ord), '[]'::jsonb)
        FROM (
          SELECT shown.key, shown.ord
          FROM jsonb_array_elements_text(shown_post_keys || ${JSON.stringify([scenarioId])}::jsonb)
            WITH ORDINALITY AS shown(key, ord)
          ORDER BY shown.ord DESC
          LIMIT 50
        ) AS recent
      )
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
