import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
  EmbedBuilder,
  Colors,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Interaction,
  StringSelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { TRAIN_CATEGORIES, DENIAL_REASONS } from '../../services/postTrainService';

// Categories that can have denial reasons (no 'mixed')
const REASON_CATEGORIES = Object.entries(TRAIN_CATEGORIES)
  .filter(([k]) => k !== 'mixed')
  .map(([value, name]) => ({ value, name }));

// ─── SLASH COMMAND ────────────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('manage-denial-reasons')
  .setDescription('View, add, edit, or remove post training denial reasons (HPA only)')
  .addSubcommand(sub => sub
    .setName('view')
    .setDescription('View all denial reasons for a category')
  )
  .addSubcommand(sub => sub
    .setName('add')
    .setDescription('Add a new denial reason to a category')
  )
  .addSubcommand(sub => sub
    .setName('edit')
    .setDescription('Edit an existing denial reason')
  )
  .addSubcommand(sub => sub
    .setName('remove')
    .setDescription('Remove a denial reason from a category')
  )
  .addSubcommand(sub => sub
    .setName('reset')
    .setDescription('Reset a category back to the default handbook reasons')
  );

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  if (!isHPA(i.member as GuildMember)) {
    await i.reply({ embeds: [errorEmbed('This command is HPA only.')], ephemeral: true });
    return;
  }

  const sub = i.options.getSubcommand();

  const categorySelect = buildCategorySelect(`dr_${sub}_cat_sel`);

  const subTitles: Record<string, string> = {
    view:   'Select a category to view its denial reasons.',
    add:    'Select a category to add a new denial reason to.',
    edit:   'Select a category to edit a denial reason in.',
    remove: 'Select a category to remove a denial reason from.',
    reset:  'Select a category to reset back to the default handbook reasons.',
  };

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle(`Manage Denial Reasons - ${sub.charAt(0).toUpperCase() + sub.slice(1)}`)
      .setDescription(subTitles[sub] ?? 'Select a category.')
      .setTimestamp()],
    components: [categorySelect],
    ephemeral: true,
  });
}

// ─── INTERACTION HANDLER ──────────────────────────────────────────────────────
// Called from interactionHandler.ts for customIds starting with "dr_"

export async function handleDenialReasonsInteraction(i: Interaction): Promise<void> {
  if (i.isStringSelectMenu()) {
    const id = i.customId;
    if (id === 'dr_view_cat_sel')                  { await handleViewCat(i);         return; }
    if (id === 'dr_add_cat_sel')                   { await handleAddCat(i);          return; }
    if (id === 'dr_edit_cat_sel')                  { await handleEditCat(i);         return; }
    if (id.startsWith('dr_edit_reason_sel:'))      { await handleEditReasonSel(i);   return; }
    if (id === 'dr_remove_cat_sel')                { await handleRemoveCat(i);       return; }
    if (id.startsWith('dr_remove_reason_sel:'))    { await handleRemoveReasonSel(i); return; }
    if (id === 'dr_reset_cat_sel')                 { await handleResetCat(i);        return; }
  }

  if (i.isButton() && i.customId.startsWith('dr_remove_confirm:')) {
    await handleRemoveConfirm(i as ButtonInteraction);
    return;
  }

  if (i.isModalSubmit()) {
    const id = i.customId;
    if (id.startsWith('dr_add_modal:'))  { await handleAddModal(i as ModalSubmitInteraction);  return; }
    if (id.startsWith('dr_edit_modal:')) { await handleEditModal(i as ModalSubmitInteraction); return; }
  }
}

// ─── VIEW ─────────────────────────────────────────────────────────────────────

async function handleViewCat(i: StringSelectMenuInteraction): Promise<void> {
  const category = i.values[0];
  await i.deferUpdate();

  const rows = await getReasons(category);

  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle(`Denial Reasons - ${TRAIN_CATEGORIES[category] ?? category}`)
    .setDescription(`${rows.length} reason(s) configured. Use \`/manage-denial-reasons edit\` or \`remove\` to change them.`)
    .setTimestamp();

  if (rows.length === 0) {
    embed.setDescription('No denial reasons found for this category. Use `/manage-denial-reasons add` to add one.');
  } else {
    rows.forEach((r, idx) => {
      embed.addFields({
        name:  `${idx + 1}. ${r.label}`,
        value: r.message.slice(0, 200),
      });
    });
  }

  await i.editReply({ embeds: [embed], components: [buildCategorySelect('dr_view_cat_sel')] });
}

// ─── ADD ──────────────────────────────────────────────────────────────────────

async function handleAddCat(i: StringSelectMenuInteraction): Promise<void> {
  const category = i.values[0];

  await i.showModal({
    customId: `dr_add_modal:${category}`,
    title:    `Add Denial Reason - ${TRAIN_CATEGORIES[category] ?? category}`,
    components: [
      { type: 1, components: [{ type: 4, customId: 'label', label: 'Label (short name shown in the dropdown)', style: 1, required: true, maxLength: 100, placeholder: 'e.g. No payment stated' }] },
      { type: 1, components: [{ type: 4, customId: 'message', label: 'Denial message (sent to the user)', style: 2, required: true, maxLength: 500, minLength: 10, placeholder: 'e.g. Please state a valid range or fixed payment.' }] },
    ],
  });
}

async function handleAddModal(i: ModalSubmitInteraction): Promise<void> {
  const category = i.customId.split(':')[1];
  const label    = i.fields.getTextInputValue('label').trim();
  const message  = i.fields.getTextInputValue('message').trim();

  await i.deferReply({ ephemeral: true });

  // Check for duplicate label in this category
  const existing = await sql`SELECT 1 FROM denial_reasons WHERE category = ${category} AND label = ${label}`;
  if (existing.length > 0) {
    await i.editReply({ embeds: [errorEmbed(`A reason with the label "${label}" already exists in this category. Use \`/manage-denial-reasons edit\` to change it.`)] });
    return;
  }

  // Insert at the end
  const [countRow] = await sql`SELECT COUNT(*) as c FROM denial_reasons WHERE category = ${category}`;
  const position = parseInt(countRow.c);

  await sql`
    INSERT INTO denial_reasons (category, label, message, position)
    VALUES (${category}, ${label}, ${message}, ${position})
  `;

  await i.editReply({ embeds: [new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle('Denial Reason Added')
    .addFields(
      { name: 'Category', value: TRAIN_CATEGORIES[category] ?? category, inline: true },
      { name: 'Label',    value: label,                                   inline: true },
      { name: 'Message',  value: message },
    )
    .setTimestamp(),
  ]});
}

// ─── EDIT ─────────────────────────────────────────────────────────────────────

async function handleEditCat(i: StringSelectMenuInteraction): Promise<void> {
  const category = i.values[0];
  await i.deferUpdate();

  const rows = await getReasons(category);
  if (rows.length === 0) {
    await i.editReply({ embeds: [errorEmbed(`No denial reasons found for ${TRAIN_CATEGORIES[category] ?? category}.`)], components: [] });
    return;
  }

  const reasonSelect = buildReasonSelect(`dr_edit_reason_sel:${category}`, rows, 'Select a reason to edit...');

  await i.editReply({
    embeds: [new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle(`Edit Denial Reason - ${TRAIN_CATEGORIES[category] ?? category}`)
      .setDescription('Select the reason you want to edit.')
      .setTimestamp()],
    components: [reasonSelect],
  });
}

async function handleEditReasonSel(i: StringSelectMenuInteraction): Promise<void> {
  const category = i.customId.split(':')[1];
  const id       = parseInt(i.values[0]);

  const [row] = await sql`SELECT * FROM denial_reasons WHERE id = ${id}`;
  if (!row) { await i.reply({ embeds: [errorEmbed('Reason not found.')], ephemeral: true }); return; }

  await i.showModal({
    customId: `dr_edit_modal:${id}`,
    title:    `Edit - ${row.label.slice(0, 40)}`,
    components: [
      { type: 1, components: [{ type: 4, customId: 'label', label: 'Label', style: 1, required: true, maxLength: 100, value: row.label }] },
      { type: 1, components: [{ type: 4, customId: 'message', label: 'Denial message', style: 2, required: true, maxLength: 500, minLength: 10, value: row.message }] },
    ],
  });
}

async function handleEditModal(i: ModalSubmitInteraction): Promise<void> {
  const id      = parseInt(i.customId.split(':')[1]);
  const label   = i.fields.getTextInputValue('label').trim();
  const message = i.fields.getTextInputValue('message').trim();

  await i.deferReply({ ephemeral: true });

  const [existing] = await sql`SELECT * FROM denial_reasons WHERE id = ${id}`;
  if (!existing) { await i.editReply({ embeds: [errorEmbed('Reason not found.')] }); return; }

  // Check label uniqueness (allow keeping the same label)
  if (label !== existing.label) {
    const conflict = await sql`SELECT 1 FROM denial_reasons WHERE category = ${existing.category} AND label = ${label}`;
    if (conflict.length > 0) {
      await i.editReply({ embeds: [errorEmbed(`A reason with the label "${label}" already exists in this category.`)] });
      return;
    }
  }

  await sql`
    UPDATE denial_reasons
    SET label = ${label}, message = ${message}, updated_at = NOW()
    WHERE id = ${id}
  `;

  await i.editReply({ embeds: [new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle('Denial Reason Updated')
    .addFields(
      { name: 'Category',     value: TRAIN_CATEGORIES[existing.category] ?? existing.category, inline: true },
      { name: 'New Label',    value: label,                                                      inline: true },
      { name: 'New Message',  value: message },
    )
    .setTimestamp(),
  ]});
}

// ─── REMOVE ───────────────────────────────────────────────────────────────────

async function handleRemoveCat(i: StringSelectMenuInteraction): Promise<void> {
  const category = i.values[0];
  await i.deferUpdate();

  const rows = await getReasons(category);
  if (rows.length === 0) {
    await i.editReply({ embeds: [errorEmbed(`No denial reasons found for ${TRAIN_CATEGORIES[category] ?? category}.`)], components: [] });
    return;
  }

  const reasonSelect = buildReasonSelect(`dr_remove_reason_sel:${category}`, rows, 'Select a reason to remove...');

  await i.editReply({
    embeds: [new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle(`Remove Denial Reason - ${TRAIN_CATEGORIES[category] ?? category}`)
      .setDescription('Select the reason you want to remove. You will be asked to confirm.')
      .setTimestamp()],
    components: [reasonSelect],
  });
}

async function handleRemoveReasonSel(i: StringSelectMenuInteraction): Promise<void> {
  const category = i.customId.split(':')[1];
  const id       = parseInt(i.values[0]);
  await i.deferUpdate();

  const [row] = await sql`SELECT * FROM denial_reasons WHERE id = ${id}`;
  if (!row) { await i.editReply({ embeds: [errorEmbed('Reason not found.')], components: [] }); return; }

  const confirmBtn = new ButtonBuilder()
    .setCustomId(`dr_remove_confirm:${id}`)
    .setLabel('Confirm Remove')
    .setStyle(ButtonStyle.Danger);

  const cancelBtn = new ButtonBuilder()
    .setCustomId(`dr_remove_cancel`)
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary);

  await i.editReply({
    embeds: [new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle('Confirm Removal')
      .setDescription(`Are you sure you want to remove this denial reason from **${TRAIN_CATEGORIES[category] ?? category}**?`)
      .addFields(
        { name: 'Label',   value: row.label },
        { name: 'Message', value: row.message },
      )
      .setFooter({ text: 'This cannot be undone. Use /manage-denial-reasons add to re-add it.' })
      .setTimestamp()],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, cancelBtn)],
  });
}

async function handleRemoveConfirm(i: ButtonInteraction): Promise<void> {
  const id = parseInt(i.customId.split(':')[1]);
  await i.deferUpdate();

  const [row] = await sql`SELECT * FROM denial_reasons WHERE id = ${id}`;
  if (!row) { await i.editReply({ embeds: [errorEmbed('Reason not found.')], components: [] }); return; }

  await sql`DELETE FROM denial_reasons WHERE id = ${id}`;

  // Re-sequence positions for remaining reasons in this category
  const remaining = await sql`SELECT id FROM denial_reasons WHERE category = ${row.category} ORDER BY position ASC, id ASC`;
  for (let idx = 0; idx < remaining.length; idx++) {
    await sql`UPDATE denial_reasons SET position = ${idx} WHERE id = ${remaining[idx].id}`;
  }

  await i.editReply({
    embeds: [successEmbed('Reason Removed', `"${row.label}" has been removed from **${TRAIN_CATEGORIES[row.category] ?? row.category}**.`)],
    components: [],
  });
}

// ─── RESET ────────────────────────────────────────────────────────────────────

async function handleResetCat(i: StringSelectMenuInteraction): Promise<void> {
  const category = i.values[0];
  await i.deferUpdate();

  const defaults = DENIAL_REASONS[category];
  if (!defaults) {
    await i.editReply({ embeds: [errorEmbed('No default reasons found for this category.')], components: [] });
    return;
  }

  // Delete all current reasons and re-insert defaults
  await sql`DELETE FROM denial_reasons WHERE category = ${category}`;
  for (let idx = 0; idx < defaults.length; idx++) {
    await sql`
      INSERT INTO denial_reasons (category, label, message, position)
      VALUES (${category}, ${defaults[idx].label}, ${defaults[idx].message}, ${idx})
    `;
  }

  await i.editReply({
    embeds: [new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('Category Reset')
      .setDescription(`**${TRAIN_CATEGORIES[category] ?? category}** has been reset to the ${defaults.length} default handbook reasons.`)
      .setTimestamp()],
    components: [],
  });
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function getReasons(category: string): Promise<Array<{ id: number; label: string; message: string }>> {
  const rows = await sql`
    SELECT id, label, message FROM denial_reasons
    WHERE category = ${category}
    ORDER BY position ASC, id ASC
  `;
  return rows as any[];
}

function buildCategorySelect(customId: string): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('Select a category...')
      .addOptions(
        REASON_CATEGORIES.map(c =>
          new StringSelectMenuOptionBuilder().setLabel(c.name).setValue(c.value)
        )
      )
  );
}

function buildReasonSelect(
  customId: string,
  rows: Array<{ id: number; label: string; message: string }>,
  placeholder: string,
): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOptions(
        rows.slice(0, 25).map(r =>
          new StringSelectMenuOptionBuilder()
            .setLabel(r.label.slice(0, 100))
            .setValue(String(r.id))
            .setDescription(r.message.slice(0, 100))
        )
      )
  );
}
