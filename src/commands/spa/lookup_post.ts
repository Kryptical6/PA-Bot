import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors } from 'discord.js';
import { isSPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder().setName('lookup_post').setDescription('Search for a post ID')
  .addStringOption(o => o.setName('post_id').setDescription('Post ID (partial match)').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const query = i.options.getString('post_id', true).trim();
  const results = await sql`
    SELECT u.post_id,
      COALESCE(l.user_id, p.user_id) as user_id,
      COALESCE(l.created_at, p.created_at) as created_at
    FROM used_post_ids u
    LEFT JOIN logs l ON l.post_id = u.post_id
    LEFT JOIN pending_logs p ON p.post_id = u.post_id
    WHERE u.post_id ILIKE ${'%' + query + '%'}
    LIMIT 10
  `;

  const embed = new EmbedBuilder().setColor(Colors.Blue).setTitle(`🔍 Post ID Search: "${query}"`).setTimestamp();
  if (results.length === 0) {
    embed.setDescription('No matching post IDs found - this post has not been logged.');
  } else {
    embed.setDescription(results.map((r: any) =>
      `• **${r.post_id}** - logged against <@${r.user_id}> on <t:${Math.floor(new Date(r.created_at).getTime() / 1000)}:D>`
    ).join('\n'));
  }
  await i.editReply({ embeds: [embed] });
}
