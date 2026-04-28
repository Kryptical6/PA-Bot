import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder().setName('restrict_assessment').setDescription('Restrict assessment access (HPA only)')
  .addIntegerOption(o => o.setName('assessment_id').setDescription('Assessment ID').setRequired(true))
  .addUserOption(o => o.setName('user').setDescription('User to allow/remove').setRequired(true))
  .addBooleanOption(o => o.setName('allow').setDescription('True to allow, false to remove').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const id    = i.options.getInteger('assessment_id', true);
  const user  = i.options.getUser('user', true);
  const allow = i.options.getBoolean('allow', true);

  const [a] = await sql`SELECT * FROM assessments WHERE id = ${id}`;
  if (!a) { await i.editReply({ embeds: [errorEmbed(`Assessment ${id} not found.`)] }); return; }

  if (allow) {
    await sql`INSERT INTO assessment_allowed_users (assessment_id, user_id) VALUES (${id}, ${user.id}) ON CONFLICT DO NOTHING`;
    await sql`UPDATE assessments SET restricted = true WHERE id = ${id}`;
    await i.editReply({ embeds: [successEmbed('Access Granted', `<@${user.id}> can now access **${a.title}**.`)] });
  } else {
    await sql`DELETE FROM assessment_allowed_users WHERE assessment_id = ${id} AND user_id = ${user.id}`;
    await i.editReply({ embeds: [successEmbed('Access Removed', `<@${user.id}> removed from **${a.title}**.`)] });
  }
}
