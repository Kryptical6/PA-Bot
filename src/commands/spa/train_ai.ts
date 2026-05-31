import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
  EmbedBuilder,
  Colors,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from 'discord.js';
import { isSPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { TRAIN_CATEGORIES } from '../../services/postTrainService';

// Maps to the subcategory values used in post_train_examples
const CATEGORY_CHOICES = [
  { name: 'For Hire (FH)',           value: 'fh'             },
  { name: 'Looking For Developer',   value: 'lfd'            },
  { name: 'Skill Role Applications', value: 'skill_role'     },
  { name: 'Sell Creations',          value: 'sell_creations' },
  { name: 'Investor Posts',          value: 'investors'      },
  { name: 'Roblox Advertising',      value: 'advertising'    },
  { name: 'Reviews',                 value: 'reviews'        },
];

const ACTION_CHOICES = [
  { name: 'Approve',                value: 'approve'      },
  { name: 'Deny',                   value: 'deny'         },
  { name: 'Request Proof of Funds', value: 'request_pof'  },
];

export const data = new SlashCommandBuilder()
  .setName('train-ai')
  .setDescription('Submit a real post example to improve the training AI (SPA and above only)')
  .addSubcommand(sub => sub
    .setName('add')
    .setDescription('Submit a post example with the correct outcome and reasoning')
    .addStringOption(o => o
      .setName('category')
      .setDescription('The category this post belongs to')
      .setRequired(true)
      .addChoices(...CATEGORY_CHOICES)
    )
    .addStringOption(o => o
      .setName('action')
      .setDescription('The correct action for this post')
      .setRequired(true)
      .addChoices(...ACTION_CHOICES)
    )
    .addStringOption(o => o
      .setName('post_body')
      .setDescription('The full post text as it appeared in the channel (paste the entire thing)')
      .setRequired(true)
      .setMaxLength(2000)
    )
    .addStringOption(o => o
      .setName('reasoning')
      .setDescription('Why this action is correct - cite the specific rule')
      .setRequired(true)
      .setMaxLength(1000)
    )
  )
  .addSubcommand(sub => sub
    .setName('list')
    .setDescription('View submitted training examples for a category')
    .addStringOption(o => o
      .setName('category')
      .setDescription('Category to view examples for')
      .setRequired(true)
      .addChoices(...CATEGORY_CHOICES)
    )
  )
  .addSubcommand(sub => sub
    .setName('remove')
    .setDescription('Remove a training example by ID')
    .addIntegerOption(o => o
      .setName('id')
      .setDescription('The ID of the example to remove (get this from /train-ai list)')
      .setRequired(true)
    )
  )
  .addSubcommand(sub => sub
    .setName('note-add')
    .setDescription('Add a rule note or override that gets injected into the AI prompt')
    .addStringOption(o => o
      .setName('note')
      .setDescription('The rule note or override text to inject (e.g. "The 1.5x price range rule does not apply to FH")')
      .setRequired(true)
      .setMaxLength(500)
    )
    .addStringOption(o => o
      .setName('category')
      .setDescription('Scope to a specific category, or leave blank to apply to all categories')
      .setRequired(false)
      .addChoices(...CATEGORY_CHOICES)
    )
  )
  .addSubcommand(sub => sub
    .setName('note-list')
    .setDescription('View all active AI rule notes')
  )
  .addSubcommand(sub => sub
    .setName('note-remove')
    .setDescription('Remove an AI rule note by ID')
    .addIntegerOption(o => o
      .setName('id')
      .setDescription('The ID of the note to remove (get this from /train-ai note-list)')
      .setRequired(true)
    )
  );

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) {
    await i.reply({ embeds: [errorEmbed('This command is available to SPA and above only.')], ephemeral: true });
    return;
  }

  const sub = i.options.getSubcommand();

  if (sub === 'add') {
    await handleAdd(i);
  } else if (sub === 'list') {
    await handleList(i);
  } else if (sub === 'remove') {
    await handleRemove(i);
  } else if (sub === 'note-add') {
    await handleNoteAdd(i);
  } else if (sub === 'note-list') {
    await handleNoteList(i);
  } else if (sub === 'note-remove') {
    await handleNoteRemove(i);
  }
}

async function handleAdd(i: ChatInputCommandInteraction): Promise<void> {
  const category  = i.options.getString('category', true);
  const action    = i.options.getString('action', true);
  const postBody  = i.options.getString('post_body', true).trim();
  const reasoning = i.options.getString('reasoning', true).trim();

  await i.deferReply({ ephemeral: true });

  // Sanity check: reasoning should be meaningful
  if (reasoning.length < 20) {
    await i.editReply({ embeds: [errorEmbed('Reasoning is too short. Please explain which specific rule applies and why.')] });
    return;
  }

  const [row] = await sql`
    INSERT INTO post_train_examples (category, correct_action, post_body, reasoning, submitted_by, active)
    VALUES (${category}, ${action}, ${postBody}, ${reasoning}, ${i.user.id}, true)
    RETURNING id
  `;

  const count = await sql`SELECT COUNT(*) as c FROM post_train_examples WHERE category = ${category} AND active = true`;

  const embed = new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle('Training Example Submitted')
    .addFields(
      { name: 'Category',       value: TRAIN_CATEGORIES[category] ?? category, inline: true },
      { name: 'Correct Action', value: action,                                  inline: true },
      { name: 'Example ID',     value: String(row.id),                          inline: true },
      { name: 'Post Body',      value: postBody.slice(0, 500) + (postBody.length > 500 ? '...' : '') },
      { name: 'Reasoning',      value: reasoning },
    )
    .setFooter({ text: `${count[0].c} active example(s) for this category` })
    .setTimestamp();

  await i.editReply({ embeds: [embed] });
}

async function handleList(i: ChatInputCommandInteraction): Promise<void> {
  const category = i.options.getString('category', true);

  await i.deferReply({ ephemeral: true });

  const rows = await sql`
    SELECT id, correct_action, post_body, reasoning, submitted_by, created_at
    FROM post_train_examples
    WHERE category = ${category} AND active = true
    ORDER BY created_at DESC
    LIMIT 20
  `;

  if (rows.length === 0) {
    await i.editReply({ embeds: [new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle('No Training Examples')
      .setDescription(`No active training examples found for **${TRAIN_CATEGORIES[category] ?? category}**.\n\nUse \`/train-ai add\` to submit one.`)
      .setTimestamp()
    ]});
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle(`Training Examples - ${TRAIN_CATEGORIES[category] ?? category}`)
    .setDescription(`${rows.length} active example(s). Use \`/train-ai remove id:<id>\` to delete one.`)
    .setTimestamp();

  rows.forEach((row: any) => {
    const preview = row.post_body.slice(0, 120).replace(/\n/g, ' ') + (row.post_body.length > 120 ? '...' : '');
    embed.addFields({
      name: `ID ${row.id} - ${row.correct_action} - submitted by <@${row.submitted_by}>`,
      value: `Post: ${preview}\nReasoning: ${row.reasoning.slice(0, 100)}${row.reasoning.length > 100 ? '...' : ''}`,
    });
  });

  await i.editReply({ embeds: [embed] });
}

async function handleRemove(i: ChatInputCommandInteraction): Promise<void> {
  const id = i.options.getInteger('id', true);

  await i.deferReply({ ephemeral: true });

  const [row] = await sql`SELECT * FROM post_train_examples WHERE id = ${id}`;
  if (!row) {
    await i.editReply({ embeds: [errorEmbed(`No training example found with ID ${id}.`)] });
    return;
  }

  await sql`UPDATE post_train_examples SET active = false WHERE id = ${id}`;

  await i.editReply({ embeds: [successEmbed('Example Removed', `Training example #${id} (${row.category} / ${row.correct_action}) has been deactivated and will no longer be used.`)] });
}

async function handleNoteAdd(i: ChatInputCommandInteraction): Promise<void> {
  const note     = i.options.getString('note', true).trim();
  const category = i.options.getString('category') ?? null;

  await i.deferReply({ ephemeral: true });

  if (note.length < 10) {
    await i.editReply({ embeds: [errorEmbed('Note is too short. Please be specific about the rule change.')] });
    return;
  }

  const [row] = await sql`
    INSERT INTO post_train_notes (note, category, added_by, active)
    VALUES (${note}, ${category}, ${i.user.id}, true)
    RETURNING id
  `;

  const scopeLabel = category ? (TRAIN_CATEGORIES[category] ?? category) : 'All categories';

  await i.editReply({ embeds: [new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle('Rule Note Added')
    .setDescription('This note will be injected into the AI system prompt for every training post generation.')
    .addFields(
      { name: 'Note ID', value: String(row.id), inline: true },
      { name: 'Scope',   value: scopeLabel,       inline: true },
      { name: 'Note',    value: note },
    )
    .setFooter({ text: 'Use /train-ai note-remove to delete this note.' })
    .setTimestamp(),
  ]});
}

async function handleNoteList(i: ChatInputCommandInteraction): Promise<void> {
  await i.deferReply({ ephemeral: true });

  const rows = await sql`
    SELECT id, category, note, added_by, created_at
    FROM post_train_notes
    WHERE active = true
    ORDER BY category NULLS LAST, id ASC
  `;

  if (rows.length === 0) {
    await i.editReply({ embeds: [new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle('No Active Rule Notes')
      .setDescription('No rule notes have been added yet.\n\nUse `/train-ai note-add` to add one.')
      .setTimestamp(),
    ]});
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle('Active AI Rule Notes')
    .setDescription(`${rows.length} active note(s). These are injected into every AI prompt generation. Use \`/train-ai note-remove id:<id>\` to remove one.`)
    .setTimestamp();

  rows.forEach((row: any) => {
    const scopeLabel = row.category ? (TRAIN_CATEGORIES[row.category] ?? row.category) : 'All categories';
    embed.addFields({
      name:  `ID ${row.id} - ${scopeLabel} - added by <@${row.added_by}>`,
      value: row.note,
    });
  });

  await i.editReply({ embeds: [embed] });
}

async function handleNoteRemove(i: ChatInputCommandInteraction): Promise<void> {
  const id = i.options.getInteger('id', true);

  await i.deferReply({ ephemeral: true });

  const [row] = await sql`SELECT * FROM post_train_notes WHERE id = ${id}`;
  if (!row) {
    await i.editReply({ embeds: [errorEmbed(`No rule note found with ID ${id}.`)] });
    return;
  }

  await sql`UPDATE post_train_notes SET active = false WHERE id = ${id}`;

  const scopeLabel = row.category ? (TRAIN_CATEGORIES[row.category] ?? row.category) : 'All categories';
  await i.editReply({ embeds: [successEmbed('Note Removed', `Rule note #${id} (${scopeLabel}) has been deactivated and will no longer be injected into AI prompts.`)] });
}
