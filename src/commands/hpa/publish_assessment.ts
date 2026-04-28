import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder().setName('publish_assessment').setDescription('Publish or unpublish an assessment (HPA only)')
  .addIntegerOption(o => o.setName('assessment_id').setDescription('Assessment ID').setRequired(true))
  .addBooleanOption(o => o.setName('published').setDescription('True to publish, false to unpublish').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const id        = i.options.getInteger('assessment_id', true);
  const published = i.options.getBoolean('published', true);

  const [a] = await sql`SELECT * FROM assessments WHERE id = ${id}`;
  if (!a) { await i.editReply({ embeds: [errorEmbed(`Assessment ${id} not found.`)] }); return; }

  if (published) {
    const [count] = await sql`SELECT COUNT(*) as c FROM assessment_questions WHERE assessment_id = ${id} AND is_scripting = false`;
    if (parseInt(count.c) === 0) { await i.editReply({ embeds: [errorEmbed('Cannot publish with no main questions.')] }); return; }
  }

  await sql`UPDATE assessments SET published = ${published} WHERE id = ${id}`;
  await i.editReply({ embeds: [successEmbed('Updated', `**${a.title}** is now **${published ? 'published' : 'unpublished'}**.`)] });
}
