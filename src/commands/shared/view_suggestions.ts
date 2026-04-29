import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors } from 'discord.js';
import { isPA } from '../../utils/permissions';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder()
  .setName('view_suggestions')
  .setDescription('View approved game suggestions sorted by upvotes');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const suggestions = await sql`
    SELECT * FROM game_suggestions WHERE status = 'approved' ORDER BY upvotes DESC, created_at ASC
  `;

  const embed = new EmbedBuilder().setColor(Colors.Purple).setTitle('🎮 Game Suggestions').setTimestamp();

  if (suggestions.length === 0) {
    embed.setDescription('No approved suggestions yet. Use `/suggest_game` to add one!');
  } else {
    embed.setDescription(
      suggestions.map((s: any, idx: number) =>
        `**${idx + 1}. ${s.game_name}** — 👍 ${s.upvotes}\n` +
        (s.description ? `*${s.description}*\n` : '') +
        `Suggested by <@${s.suggested_by}>`
      ).join('\n\n').slice(0, 4000)
    );
  }

  await i.editReply({ embeds: [embed] });
}
