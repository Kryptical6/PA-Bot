import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } from 'discord.js';
import { isSPA, isHPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { config } from '../../config';

const PAGE = 5;

export const data = new SlashCommandBuilder().setName('staff_profile').setDescription('View a staff member profile')
  .addUserOption(o => o.setName('user').setDescription('Staff member').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;

  const target = i.options.getMember('user') as GuildMember | null;
  if (!target) { await i.reply({ embeds: [errorEmbed('User not found.')], ephemeral: true }); return; }
  if (!isHPA(m) && target.roles.cache.has(config.roles.HPA)) { await i.reply({ embeds: [errorEmbed('You cannot view the HPA profile.')], ephemeral: true }); return; }

  await i.deferReply();

  // Active non-converted logs
  const logs     = await sql`SELECT * FROM logs WHERE user_id = ${target.id} AND expires_at > NOW() AND (converted_to_strike = false OR converted_to_strike IS NULL) ORDER BY date DESC`;
  const mistakes = logs.filter((l: any) => l.type === 'mistake');
  const strikes  = logs.filter((l: any) => l.type === 'strike');

  // All mistakes including converted ones (for the full history button)
  const allMistakes = await sql`SELECT * FROM logs WHERE user_id = ${target.id} AND type = 'mistake' AND expires_at > NOW() ORDER BY date DESC`;
  const convertedCount = allMistakes.filter((l: any) => l.converted_to_strike).length;

  const mPages = Math.max(1, Math.ceil(mistakes.length / PAGE));
  const sPages = Math.max(1, Math.ceil(strikes.length / PAGE));

  const buildEmbed = (mp: number, sp: number) => {
    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle(target.displayName)
      .addFields(
        { name: 'Active Mistakes', value: String(mistakes.length), inline: true },
        { name: 'Active Strikes',  value: String(strikes.length),  inline: true },
        { name: 'Converted',       value: `${convertedCount} mistake(s) converted to strikes`, inline: true },
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();

    if (mistakes.length > 0) {
      embed.addFields({ name: `Mistakes (${mp + 1}/${mPages})`,
        value: mistakes.slice(mp * PAGE, (mp + 1) * PAGE).map((e: any) => {
          const sev    = e.severity ? ` [${e.severity.charAt(0).toUpperCase() + e.severity.slice(1)}]` : '';
          const logger = isHPA(m) ? `\nLogged by <@${e.logged_by}>` : '';
          return `**${e.post_id ?? 'N/A'}**${sev} - ${e.reason}\nExpires <t:${Math.floor(new Date(e.expires_at).getTime() / 1000)}:R>${logger}`;
        }).join('\n\n'),
      });
    }

    if (strikes.length > 0) {
      embed.addFields({ name: `Strikes (${sp + 1}/${sPages})`,
        value: strikes.slice(sp * PAGE, (sp + 1) * PAGE).map((e: any) => {
          const logger = isHPA(m) ? `\nLogged by <@${e.logged_by}>` : '';
          return `**${e.post_id ?? 'N/A'}** - ${e.reason}\nExpires <t:${Math.floor(new Date(e.expires_at).getTime() / 1000)}:R>${logger}`;
        }).join('\n\n'),
      });
    }

    if (logs.length === 0) embed.setDescription('No active logs.');
    return embed;
  };

  const buildRow = (mp: number, sp: number) => {
    const btns: ButtonBuilder[] = [];
    if (mp > 0 || sp > 0) btns.push(new ButtonBuilder().setCustomId(`sp_prev:${mp}:${sp}`).setLabel('Previous').setStyle(ButtonStyle.Secondary));
    if (mp + 1 < mPages || sp + 1 < sPages) btns.push(new ButtonBuilder().setCustomId(`sp_next:${mp}:${sp}`).setLabel('Next').setStyle(ButtonStyle.Secondary));
    if (allMistakes.length > 0) btns.push(new ButtonBuilder().setCustomId(`sp_all_mistakes:${target.id}:0`).setLabel(`All Mistakes (${allMistakes.length})`).setStyle(ButtonStyle.Primary));
    return btns.length > 0 ? new ActionRowBuilder<ButtonBuilder>().addComponents(...btns) : null;
  };

  let mp = 0, sp = 0;
  const row = buildRow(mp, sp);
  const msg = await i.editReply({ embeds: [buildEmbed(mp, sp)], components: row ? [row] : [] });

  const col = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: b => b.user.id === i.user.id,
    time: 120_000,
  });

  col.on('collect', async btn => {
    const parts = btn.customId.split(':');
    const action = parts[0];

    if (action === 'sp_next') {
      if (mp + 1 < mPages) mp++;
      if (sp + 1 < sPages) sp++;
      const newRow = buildRow(mp, sp);
      await btn.update({ embeds: [buildEmbed(mp, sp)], components: newRow ? [newRow] : [] });

    } else if (action === 'sp_prev') {
      if (mp > 0) mp--;
      if (sp > 0) sp--;
      const newRow = buildRow(mp, sp);
      await btn.update({ embeds: [buildEmbed(mp, sp)], components: newRow ? [newRow] : [] });

    } else if (action === 'sp_all_mistakes') {
      const targetId = parts[1];
      const page     = parseInt(parts[2]) || 0;
      const allPages = Math.max(1, Math.ceil(allMistakes.length / PAGE));
      const slice    = allMistakes.slice(page * PAGE, (page + 1) * PAGE);

      const allEmbed = new EmbedBuilder()
        .setColor(Colors.Orange)
        .setTitle(`All Mistakes - ${target.displayName}`)
        .setDescription(`Showing all non-expired mistakes including those converted to strikes. Total: ${allMistakes.length}`)
        .setFooter({ text: `Page ${page + 1}/${allPages}` })
        .setTimestamp();

      if (slice.length > 0) {
        allEmbed.addFields({ name: 'Mistakes', value: slice.map((e: any) => {
          const sev       = e.severity ? `[${e.severity.charAt(0).toUpperCase() + e.severity.slice(1)}] ` : '';
          const converted = e.converted_to_strike ? ' - Converted to Strike' : '';
          const logger    = isHPA(m) ? `\nLogged by <@${e.logged_by}>` : '';
          return `**${e.post_id ?? 'N/A'}** ${sev}${converted}\n${e.reason}\nExpires <t:${Math.floor(new Date(e.expires_at).getTime() / 1000)}:R>${logger}`;
        }).join('\n\n') });
      }

      const navBtns: ButtonBuilder[] = [];
      if (page > 0) navBtns.push(new ButtonBuilder().setCustomId(`sp_all_mistakes:${targetId}:${page - 1}`).setLabel('Previous').setStyle(ButtonStyle.Secondary));
      if (page + 1 < allPages) navBtns.push(new ButtonBuilder().setCustomId(`sp_all_mistakes:${targetId}:${page + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary));
      navBtns.push(new ButtonBuilder().setCustomId(`sp_back:0:0`).setLabel('Back to Profile').setStyle(ButtonStyle.Secondary));

      await btn.update({ embeds: [allEmbed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...navBtns)] });

    } else if (action === 'sp_back') {
      mp = 0; sp = 0;
      const newRow = buildRow(mp, sp);
      await btn.update({ embeds: [buildEmbed(mp, sp)], components: newRow ? [newRow] : [] });
    }
  });

  col.on('end', async () => i.editReply({ components: [] }).catch(() => {}));
}
