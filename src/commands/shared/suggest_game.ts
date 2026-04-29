import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, TextChannel } from 'discord.js';
import { isPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { config } from '../../config';

export const data = new SlashCommandBuilder()
  .setName('suggest_game')
  .setDescription('Suggest a game for game night')
  .addStringOption(o => o.setName('game').setDescription('Game name').setRequired(true))
  .addStringOption(o => o.setName('description').setDescription('Why should we play this? (optional)'));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const game = i.options.getString('game', true).trim();
  const desc = i.options.getString('description')?.trim() ?? null;

  // Check for duplicate
  const existing = await sql`SELECT 1 FROM game_suggestions WHERE LOWER(game_name) = LOWER(${game}) AND status != 'denied'`;
  if (existing.length > 0) {
    await i.editReply({ embeds: [errorEmbed(`**${game}** has already been suggested.`)] });
    return;
  }

  const [result] = await sql`
    INSERT INTO game_suggestions (suggested_by, game_name, description)
    VALUES (${i.user.id}, ${game}, ${desc})
    RETURNING id
  `;

  // Send to HPA for approval
  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle('🎮 Game Suggestion')
    .addFields(
      { name: 'Game',         value: game,              inline: true },
      { name: 'Suggested by', value: `<@${i.user.id}>`, inline: true },
    )
    .setFooter({ text: `Suggestion ID: ${result.id}` })
    .setTimestamp();

  if (desc) embed.addFields({ name: 'Why?', value: desc });

  const approve = new ButtonBuilder().setCustomId(`gs_approve:${result.id}`).setLabel('✅ Approve').setStyle(ButtonStyle.Success);
  const deny    = new ButtonBuilder().setCustomId(`gs_deny:${result.id}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger);

  try {
    const ch = await i.client.channels.fetch(config.channels.appeals) as TextChannel;
    await ch.send({ content: `<@&${config.roles.HPA}> New game suggestion`, embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(approve, deny)] });
  } catch (e) { console.error('Failed to send suggestion:', e); }

  await i.editReply({ embeds: [successEmbed('Suggestion Submitted', `**${game}** has been submitted for HPA review.`)] });
}
