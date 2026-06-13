import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { isSPA, isHPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { config } from '../../config';

const PAGE = 5;

export const data = new SlashCommandBuilder()
  .setName('staff-profile')
  .setDescription('View a staff member profile')
  .addUserOption(o => o.setName('user').setDescription('Staff member').setRequired(true));

export function buildProfileEmbed(target: GuildMember, logs: any[], mistakes: any[], strikes: any[], convertedCount: number, mp: number, sp: number, mPages: number, sPages: number, showLoggedBy: boolean): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle(target.displayName)
    .addFields(
      { name: 'Active Mistakes', value: String(mistakes.length),                                    inline: true },
      { name: 'Active Strikes',  value: String(strikes.length),                                     inline: true },
      { name: 'Converted',       value: `${convertedCount} converted to strike(s)`,                 inline: true },
    )
    .setThumbnail(target.user.displayAvatarURL())
    .setTimestamp();

  if (mistakes.length > 0) {
    embed.addFields({ name: `Mistakes (${mp + 1}/${mPages})`,
      value: mistakes.slice(mp * PAGE, (mp + 1) * PAGE).map((e: any) => {
        const sev    = e.severity ? ` [${e.severity.charAt(0).toUpperCase() + e.severity.slice(1)}]` : '';
        const logger = showLoggedBy ? `\nLogged by <@${e.logged_by}>` : '';
        return `**${e.post_id ?? 'N/A'}**${sev} - ${e.reason}\nExpires <t:${Math.floor(new Date(e.expires_at).getTime() / 1000)}:R>${logger}`;
      }).join('\n\n'),
    });
  }

  if (strikes.length > 0) {
    embed.addFields({ name: `Strikes (${sp + 1}/${sPages})`,
      value: strikes.slice(sp * PAGE, (sp + 1) * PAGE).map((e: any) => {
        const logger = showLoggedBy ? `\nLogged by <@${e.logged_by}>` : '';
        return `**${e.post_id ?? 'N/A'}** - ${e.reason}\nExpires <t:${Math.floor(new Date(e.expires_at).getTime() / 1000)}:R>${logger}`;
      }).join('\n\n'),
    });
  }

  if (logs.length === 0) embed.setDescription('No active logs.');
  return embed;
}

export function buildProfileRow(targetId: string, mp: number, sp: number, mPages: number, sPages: number, allMistakesCount: number): ActionRowBuilder<ButtonBuilder> | null {
  const btns: ButtonBuilder[] = [];
  if (mp > 0 || sp > 0) btns.push(new ButtonBuilder().setCustomId(`sp_prev:${targetId}:${mp}:${sp}`).setLabel('Previous').setStyle(ButtonStyle.Secondary));
  if (mp + 1 < mPages || sp + 1 < sPages) btns.push(new ButtonBuilder().setCustomId(`sp_next:${targetId}:${mp}:${sp}`).setLabel('Next').setStyle(ButtonStyle.Secondary));
  if (allMistakesCount > 0) btns.push(new ButtonBuilder().setCustomId(`sp_all_mistakes:${targetId}:0`).setLabel(`All Mistakes (${allMistakesCount})`).setStyle(ButtonStyle.Primary));
  return btns.length > 0 ? new ActionRowBuilder<ButtonBuilder>().addComponents(...btns) : null;
}

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;

  const target = i.options.getMember('user') as GuildMember | null;
  if (!target) { await i.reply({ embeds: [errorEmbed('User not found.')], ephemeral: true }); return; }
  if (!isHPA(m) && target.roles.cache.has(config.roles.HPA)) {
    await i.reply({ embeds: [errorEmbed('You cannot view the HPA profile.')], ephemeral: true }); return;
  }

  await i.deferReply();

  const logs         = await sql`SELECT * FROM logs WHERE user_id = ${target.id} AND expires_at > NOW() AND (converted_to_strike = false OR converted_to_strike IS NULL) ORDER BY date DESC`;
  const mistakes     = logs.filter((l: any) => l.type === 'mistake');
  const strikes      = logs.filter((l: any) => l.type === 'strike');
  const allMistakes  = await sql`SELECT * FROM logs WHERE user_id = ${target.id} AND type = 'mistake' AND expires_at > NOW() ORDER BY date DESC`;
  const convertedCount = allMistakes.filter((l: any) => l.converted_to_strike).length;

  const mPages = Math.max(1, Math.ceil(mistakes.length / PAGE));
  const sPages = Math.max(1, Math.ceil(strikes.length / PAGE));
  const showLoggedBy = isHPA(m);

  const embed = buildProfileEmbed(target, logs, mistakes, strikes, convertedCount, 0, 0, mPages, sPages, showLoggedBy);
  const row   = buildProfileRow(target.id, 0, 0, mPages, sPages, allMistakes.length);

  await i.editReply({ embeds: [embed], components: row ? [row] : [] });
}
