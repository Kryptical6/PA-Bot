import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors } from 'discord.js';
import { isSPA } from '../../utils/permissions';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder()
  .setName('search_suggestions')
  .setDescription('Search suggestions by keyword (SPA+)')
  .addStringOption(o => o.setName('keyword').setDescription('Keyword to search').setRequired(true))
  .addStringOption(o => o.setName('status').setDescription('Filter by status')
    .addChoices(
      { name: 'All',          value: 'all' },
      { name: 'Pending',      value: 'pending' },
      { name: 'Considered',   value: 'considered' },
      { name: 'Implemented',  value: 'implemented' },
      { name: 'Declined',     value: 'declined' },
      { name: 'Rejected',     value: 'rejected' },
    ));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const kw     = i.options.getString('keyword', true).trim();
  const status = i.options.getString('status') ?? 'all';

  const results = status === 'all'
    ? await sql`SELECT * FROM suggestions WHERE title ILIKE ${'%' + kw + '%'} OR core_idea ILIKE ${'%' + kw + '%'} OR further_details ILIKE ${'%' + kw + '%'} ORDER BY created_at DESC LIMIT 10`
    : await sql`SELECT * FROM suggestions WHERE status = ${status} AND (title ILIKE ${'%' + kw + '%'} OR core_idea ILIKE ${'%' + kw + '%'} OR further_details ILIKE ${'%' + kw + '%'}) ORDER BY created_at DESC LIMIT 10`;

  const embed = new EmbedBuilder().setColor(Colors.Blue).setTitle(`🔍 Suggestion Search — "${kw}"`).setTimestamp();

  if (results.length === 0) {
    embed.setDescription('No suggestions found.');
  } else {
    embed.setDescription(
      results.map((s: any) =>
        `**#${s.id} — ${s.title}** [${s.status}]\n<@${s.submitted_by}> — ${s.core_idea.slice(0, 80)}${s.core_idea.length > 80 ? '...' : ''}`
      ).join('\n\n')
    );
  }

  await i.editReply({ embeds: [embed] });
}
