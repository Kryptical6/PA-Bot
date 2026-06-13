import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors, AttachmentBuilder } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

const VALID_ANSWERS = ['approve', 'deny', 'suspend', 'request_pof'];

export const data = new SlashCommandBuilder()
  .setName('import-assessment-questions')
  .setDescription('Bulk import questions from CSV (HPA only)')
  .addIntegerOption(o => o.setName('assessment_id').setDescription('Assessment ID to import into').setRequired(true).setMinValue(1))
  .addAttachmentOption(o => o.setName('csv_file').setDescription('CSV file: post_id,answer,reason,context — one per line').setRequired(true))
  .addBooleanOption(o => o.setName('scripting').setDescription('Mark all imported questions as scripting questions'));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const assessmentId = i.options.getInteger('assessment_id', true);
  const isScripting  = i.options.getBoolean('scripting') ?? false;
  const attachment   = i.options.getAttachment('csv_file', true);

  const assessment = await sql`SELECT * FROM assessments WHERE id = ${assessmentId}`;
  if (assessment.length === 0) {
    await i.editReply({ embeds: [errorEmbed(`Assessment #${assessmentId} not found.`)] }); return;
  }

  // Fetch file content
  let csvText: string;
  try {
    const res = await fetch(attachment.url);
    csvText = await res.text();
  } catch (e) {
    await i.editReply({ embeds: [errorEmbed('Failed to download the file. Make sure it is a plain text or CSV file.')] }); return;
  }

  const lines = csvText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('post_id'));
  if (lines.length === 0) {
    await i.editReply({ embeds: [errorEmbed('No valid lines found in the file.')] }); return;
  }

  let success = 0;
  const failures: string[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    // Split on first 3 commas only — context may contain commas
    const parts = line.split(',');
    if (parts.length < 2) { failures.push(`Line ${idx + 1}: too few fields — "${line.slice(0, 50)}"`); continue; }

    const postId  = parts[0].trim();
    const answer  = parts[1].trim().toLowerCase();
    const reason  = parts[2]?.trim() || null;
    const context = parts.slice(3).join(',').trim() || null;

    if (!postId) { failures.push(`Line ${idx + 1}: missing post ID`); continue; }
    if (!VALID_ANSWERS.includes(answer)) {
      failures.push(`Line ${idx + 1}: invalid answer "${answer}" — must be approve/deny/suspend/request_pof`);
      continue;
    }

    try {
      await sql`
        INSERT INTO assessment_questions (assessment_id, post_id, correct_answer, correct_reason, context, is_scripting)
        VALUES (${assessmentId}, ${postId}, ${answer}, ${reason}, ${context}, ${isScripting})
      `;
      success++;
    } catch (e: any) {
      failures.push(`Line ${idx + 1}: DB error — ${e?.message?.slice(0, 80) ?? 'unknown'}`);
    }
  }

  // Log the import
  await sql`
    INSERT INTO assessment_import_log (assessment_id, imported_by, total_lines, successful, failed)
    VALUES (${assessmentId}, ${i.user.id}, ${lines.length}, ${success}, ${failures.length})
  `.catch(() => {});

  const embed = new EmbedBuilder()
    .setColor(failures.length === 0 ? Colors.Green : success > 0 ? Colors.Yellow : Colors.Red)
    .setTitle('Import Complete')
    .setDescription(`Importing into **${(assessment[0] as any).title}** (Assessment #${assessmentId})`)
    .addFields(
      { name: 'Imported',  value: String(success),         inline: true },
      { name: 'Failed',    value: String(failures.length), inline: true },
      { name: 'Total',     value: String(lines.length),    inline: true },
    )
    .setTimestamp();

  if (failures.length > 0) {
    const failText = failures.slice(0, 20).join('\n');
    if (failures.length <= 20) {
      embed.addFields({ name: 'Failures', value: failText });
    } else {
      // Too many failures — send as a file
      const file = new AttachmentBuilder(
        Buffer.from(failures.join('\n'), 'utf-8'),
        { name: 'import_failures.txt' }
      );
      await i.editReply({ embeds: [embed], files: [file] }); return;
    }
  }

  await i.editReply({ embeds: [embed] });
}
