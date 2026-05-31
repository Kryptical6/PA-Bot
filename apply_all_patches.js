// Run once from staff-bot-v2 directory:  node apply_all_patches.js
// Applies all patches: post-train wiring + escalation button/embed fixes.
// Idempotent — safe to run multiple times.

const fs   = require('fs');
const path = require('path');

const ihPath = path.join(__dirname, 'src', 'handlers', 'interactionHandler.ts');
let src = fs.readFileSync(ihPath, 'utf8');

// Restore from git if placeholder
if (src.trim() === 'PLACEHOLDER' || src.trim() === 'PART1_PLACEHOLDER') {
  console.log('⚠️  File is placeholder — restoring from git...');
  require('child_process').execSync('git checkout HEAD -- src/handlers/interactionHandler.ts', { stdio: 'inherit' });
  src = fs.readFileSync(ihPath, 'utf8');
  console.log('✅ Restored from git.');
}

let n = 0;

function patch(desc, find, replace) {
  if (src.includes(find)) {
    src = src.replace(find, replace);
    console.log(`✅ ${desc}`);
    n++;
  } else if (!src.includes(replace.slice(0, 40))) {
    console.log(`⚠️  Could not apply: ${desc}`);
  } else {
    console.log(`⏭  Already applied: ${desc}`);
  }
}

// ── 1. post-train imports ────────────────────────────────────────────────────
patch(
  'post-train imports',
  `import * as severityGuide from '../commands/hpa/severity_guide';`,
  `import * as severityGuide from '../commands/hpa/severity_guide';
import * as postTrain from '../commands/shared/post_train';
import { handlePostTrainInteraction } from './postTrainHandler';`
);

// ── 2. post-train in command map ─────────────────────────────────────────────
patch(
  'command map entry',
  `remind, 'bot-bug': botBug,`,
  `remind, 'bot-bug': botBug,\n  'post-train': postTrain,`
);

// ── 3. handleButton routing ──────────────────────────────────────────────────
patch(
  'handleButton pt_ routing',
  `async function handleButton(i: any): Promise<void> {\n  const [action, ...rest] = i.customId.split(':');\n\n  // Staff profile`,
  `async function handleButton(i: any): Promise<void> {
  const [action, ...rest] = i.customId.split(':');

  // Post training buttons
  if (action === 'pt_action' || action === 'pt_continue' || action === 'pt_end') {
    await handlePostTrainInteraction(i); return;
  }

  // Staff profile`
);

// ── 4. handleSelect routing ──────────────────────────────────────────────────
patch(
  'handleSelect pt_category_select routing',
  `async function handleSelect(i: any): Promise<void> {\n  const [action, ...rest] = i.customId.split(':');\n\n  if (action === 'esc_outcome_sel')`,
  `async function handleSelect(i: any): Promise<void> {
  const [action, ...rest] = i.customId.split(':');

  // Post training category select
  if (i.customId === 'pt_category_select') {
    await handlePostTrainInteraction(i); return;
  }

  if (action === 'esc_outcome_sel')`
);

// ── 5. Fix escalation accepted_banned: deferUpdate → deferReply + channel fetch ──
patch(
  'escalation accepted_banned: fix deferUpdate + i.message.edit',
  `    // accepted_banned - no modal needed
    if (outcome === 'accepted_banned') {
      await i.deferUpdate();
      const notes = \`Accepted - User Banned\`;
      await sql\`UPDATE post_escalations SET status = 'handled', resolution_notes = \${notes}, updated_at = NOW() WHERE id = \${escalationId}\`;
      const updated = (await sql\`SELECT * FROM post_escalations WHERE id = \${escalationId}\`)[0];

      // Update embed
      try { await i.message.edit({ embeds: [buildEscalationEmbed(updated)], components: [] }); } catch { /* silent */ }

      // DM logger
      await safeDM(i.client, e.submitted_by, new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('Escalation Handled')
        .setDescription(\`Your punishment request for post \\\`\${e.post_id}\\\` has been accepted.\\n\\n**Outcome:** User Banned\\n\\nYou may now unsuspend and deny post \\\`\${e.post_id}\\\`.\`)
        .setTimestamp(), 'escalation handled');

      await i.editReply({ content: \`Outcome recorded: **Accepted - User Banned**. Logger has been notified.\`, embeds: [], components: [] });
      return;
    }`,
  `    // accepted_banned - no modal needed
    if (outcome === 'accepted_banned') {
      await i.deferReply({ ephemeral: true });
      const notes = \`Accepted - User Banned\`;
      await sql\`UPDATE post_escalations SET status = 'handled', resolution_notes = \${notes}, updated_at = NOW() WHERE id = \${escalationId}\`;
      const updated = (await sql\`SELECT * FROM post_escalations WHERE id = \${escalationId}\`)[0];

      // Update the channel embed via stored message_id
      if (e.message_id) {
        try {
          const ch = await i.client.channels.fetch(config.channels.escalations) as TextChannel;
          const msg = await ch.messages.fetch(e.message_id);
          await msg.edit({ embeds: [buildEscalationEmbed(updated)], components: [] });
        } catch { /* silent */ }
      }

      // DM logger
      await safeDM(i.client, e.submitted_by, new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('Escalation Handled')
        .setDescription(\`Your punishment request for post \\\`\${e.post_id}\\\` has been accepted.\\n\\n**Outcome:** User Banned\\n\\nYou may now unsuspend and deny post \\\`\${e.post_id}\\\`.\`)
        .setTimestamp(), 'escalation handled');

      await i.editReply({ content: \`Outcome recorded: **Accepted - User Banned**. Logger has been notified.\` });
      return;
    }`
);

// ── 6. Fix escalation other outcomes: deferUpdate → deferReply + channel fetch ─
patch(
  'escalation other outcomes: fix deferUpdate + i.message.edit',
  `    // All other outcomes (approved, escalated, role_revoked, role_kept, takeover_resolved, takeover_pending, no_action)
    await i.deferUpdate();
    const label = OUTCOME_LABELS[outcome] ?? outcome;
    await sql\`UPDATE post_escalations SET status = 'handled', resolution_notes = \${label}, updated_at = NOW() WHERE id = \${escalationId}\`;
    const updated = (await sql\`SELECT * FROM post_escalations WHERE id = \${escalationId}\`)[0];

    try { await i.message.edit({ embeds: [buildEscalationEmbed(updated)], components: [] }); } catch { /* silent */ }

    // DM logger
    await safeDM(i.client, e.submitted_by, new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('Escalation Handled')
      .setDescription(\`Your escalation for post \\\`\${e.post_id}\\\` has been handled.\\n\\n**Outcome:** \${label}\`)
      .setTimestamp(), 'escalation handled');

    await i.editReply({ content: \`Outcome recorded: **\${label}**.\`, embeds: [], components: [] });
    return;
  }`,
  `    // All other outcomes (approved, escalated, role_revoked, role_kept, takeover_resolved, takeover_pending, no_action)
    await i.deferReply({ ephemeral: true });
    const label = OUTCOME_LABELS[outcome] ?? outcome;
    await sql\`UPDATE post_escalations SET status = 'handled', resolution_notes = \${label}, updated_at = NOW() WHERE id = \${escalationId}\`;
    const updated = (await sql\`SELECT * FROM post_escalations WHERE id = \${escalationId}\`)[0];

    // Update the channel embed via stored message_id
    if (e.message_id) {
      try {
        const ch = await i.client.channels.fetch(config.channels.escalations) as TextChannel;
        const msg = await ch.messages.fetch(e.message_id);
        await msg.edit({ embeds: [buildEscalationEmbed(updated)], components: [] });
      } catch { /* silent */ }
    }

    // DM logger
    await safeDM(i.client, e.submitted_by, new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('Escalation Handled')
      .setDescription(\`Your escalation for post \\\`\${e.post_id}\\\` has been handled.\\n\\n**Outcome:** \${label}\`)
      .setTimestamp(), 'escalation handled');

    await i.editReply({ content: \`Outcome recorded: **\${label}**.\` });
    return;
  }`
);

// ── 7. Fix esc_resolve_modal (reject path): deferUpdate → deferReply + channel fetch ─
patch(
  'esc_resolve_modal: fix deferUpdate + i.message.edit',
  `  else if (action === 'esc_resolve_modal') {
    const escalationId = parseInt(rest[0]);
    const newStatus    = rest[1];
    const notes        = i.fields.getTextInputValue('notes').trim();

    await i.deferUpdate().catch(() => {});

    await sql\`UPDATE post_escalations SET status = \${newStatus}, resolution_notes = \${notes}, updated_at = NOW() WHERE id = \${escalationId}\`;
    const updated = (await sql\`SELECT * FROM post_escalations WHERE id = \${escalationId}\`)[0];

    try { await i.message.edit({ embeds: [buildEscalationEmbed(updated)], components: [] }); } catch { /* silent */ }
  }`,
  `  else if (action === 'esc_resolve_modal') {
    const escalationId = parseInt(rest[0]);
    const newStatus    = rest[1];
    const notes        = i.fields.getTextInputValue('notes').trim();

    await i.deferReply({ ephemeral: true });

    const [eRow] = await sql\`SELECT * FROM post_escalations WHERE id = \${escalationId}\`;
    await sql\`UPDATE post_escalations SET status = \${newStatus}, resolution_notes = \${notes}, updated_at = NOW() WHERE id = \${escalationId}\`;
    const updated = (await sql\`SELECT * FROM post_escalations WHERE id = \${escalationId}\`)[0];

    // Update the channel embed via stored message_id
    if (eRow?.message_id) {
      try {
        const ch = await i.client.channels.fetch(config.channels.escalations) as TextChannel;
        const msg = await ch.messages.fetch(eRow.message_id);
        await msg.edit({ embeds: [buildEscalationEmbed(updated)], components: [] });
      } catch { /* silent */ }
    }

    // DM submitter about rejection
    if (eRow) {
      await safeDM(i.client, eRow.submitted_by, new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle('Escalation Rejected')
        .setDescription(\`Your escalation for post \\\`\${eRow.post_id}\\\` has been rejected.\\n\\n**Notes:** \${notes}\`)
        .setTimestamp(), 'escalation rejected');
    }

    await i.editReply({ content: \`Escalation marked as **\${newStatus}**. Logger has been notified.\` });
  }`
);

fs.writeFileSync(ihPath, src, 'utf8');
console.log(`\n✅ Done. ${n} patch(es) applied to interactionHandler.ts`);
