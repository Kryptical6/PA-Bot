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

  const logs = await sql`SELECT * FROM logs WHERE user_id = ${target.id} AND expires_at > NOW() ORDER BY date DESC`;
  const mistakes = logs.filter((l: any) => l.type === 'mistake');
  const strikes  = logs.filter((l: any) => l.type === 'strike');
  const [rateRow] = await sql`SELECT rate FROM escalation_config WHERE id = 1`;
  const rate = rateRow?.rate ?? config.escalation.defaultRate;
  const mPages = Math.max(1, Math.ceil(mistakes.length / PAGE));
  const sPages = Math.max(1, Math.ceil(strikes.length / PAGE));

  const buildEmbed = (mp: number, sp: number) => {
    const embed = new EmbedBuilder().setColor(Colors.Blue).setTitle(`👤 ${target.displayName}`)
      .addFields(
        { name: 'Mistakes', value: `${mistakes.length}`, inline: true },
        { name: 'Strikes', value: `${strikes.length}`, inline: true },
        { name: 'Escalation Risk', value: `${Math.max(0, rate - mistakes.length)} mistake(s) away from a strike`, inline: true },
      )
      .setThumbnail(target.user.displayAvatarURL()).setTimestamp();

    if (mistakes.length > 0) embed.addFields({ name: `⚠️ Mistakes (${mp + 1}/${mPages})`,
      value: mistakes.slice(mp * PAGE, (mp + 1) * PAGE).map((e: any) => {
        const logger = isHPA(m) ? `\nLogged by <@${e.logged_by}>` : '';
        return `**${e.post_id ?? 'N/A'}** - ${e.reason}\nExpires <t:${Math.floor(new Date(e.expires_at).getTime() / 1000)}:R>${logger}`;
      }).join('\n\n') });

    if (strikes.length > 0) embed.addFields({ name: `❌ Strikes (${sp + 1}/${sPages})`,
      value: strikes.slice(sp * PAGE, (sp + 1) * PAGE).map((e: any) => {
        const logger = isHPA(m) ? `\nLogged by <@${e.logged_by}>` : '';
        return `**${e.post_id ?? 'N/A'}** - ${e.reason}\nExpires <t:${Math.floor(new Date(e.expires_at).getTime() / 1000)}:R>${logger}`;
      }).join('\n\n') });

    if (logs.length === 0) embed.setDescription('No active logs. ✅');
    return embed;
  };

  const buildRow = (mp: number, sp: number) => {
    const btns: ButtonBuilder[] = [];
    if (mp > 0 || sp > 0) btns.push(new ButtonBuilder().setCustomId(`sp_prev:${mp}:${sp}`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary));
    if (mp + 1 < mPages || sp + 1 < sPages) btns.push(new ButtonBuilder().setCustomId(`sp_next:${mp}:${sp}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary));
    return btns.length > 0 ? new ActionRowBuilder<ButtonBuilder>().addComponents(...btns) : null;
  };

  let mp = 0, sp = 0;
  const row = buildRow(mp, sp);
  const msg = await i.editReply({ embeds: [buildEmbed(mp, sp)], components: row ? [row] : [] });
  if (!row) return;

  const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, filter: b => b.user.id === i.user.id, time: 120_000 });
  col.on('collect', async btn => {
    const [action] = btn.customId.split(':');
    if (action === 'sp_next') { if (mp + 1 < mPages) mp++; if (sp + 1 < sPages) sp++; }
    else { if (mp > 0) mp--; if (sp > 0) sp--; }
    const newRow = buildRow(mp, sp);
    await btn.update({ embeds: [buildEmbed(mp, sp)], components: newRow ? [newRow] : [] });
  });
  col.on('end', async () => i.editReply({ components: [] }).catch(() => {}));
}
