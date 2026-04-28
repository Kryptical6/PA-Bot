import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } from 'discord.js';
import { sql } from '../../database/client';
import { isPA } from '../../utils/permissions';

const PAGE = 4;

export const data = new SlashCommandBuilder().setName('my_logs').setDescription('View your active mistakes and strikes');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const logs = await sql`SELECT * FROM logs WHERE user_id = ${i.user.id} AND expires_at > NOW() ORDER BY date DESC`;
  const mistakes = logs.filter((l: any) => l.type === 'mistake');
  const strikes  = logs.filter((l: any) => l.type === 'strike');
  const mPages = Math.max(1, Math.ceil(mistakes.length / PAGE));
  const sPages = Math.max(1, Math.ceil(strikes.length / PAGE));

  const buildEmbed = (mp: number, sp: number) => {
    const embed = new EmbedBuilder().setColor(Colors.Blue).setTitle('📋 My Logs')
      .addFields({ name: 'Mistakes', value: `${mistakes.length}`, inline: true }, { name: 'Strikes', value: `${strikes.length}`, inline: true })
      .setTimestamp();

    if (mistakes.length > 0) embed.addFields({ name: `⚠️ Mistakes (${mp + 1}/${mPages})`,
      value: mistakes.slice(mp * PAGE, (mp + 1) * PAGE).map((m: any) =>
        `**${m.post_id ?? 'N/A'}** - ${m.reason}\nExpires <t:${Math.floor(new Date(m.expires_at).getTime() / 1000)}:R>`
      ).join('\n\n') });

    if (strikes.length > 0) embed.addFields({ name: `❌ Strikes (${sp + 1}/${sPages})`,
      value: strikes.slice(sp * PAGE, (sp + 1) * PAGE).map((s: any) =>
        `**${s.post_id ?? 'N/A'}** - ${s.reason}\nExpires <t:${Math.floor(new Date(s.expires_at).getTime() / 1000)}:R>`
      ).join('\n\n') });

    if (logs.length === 0) embed.setDescription('No active logs. Keep it up! ✅');
    return embed;
  };

  const buildRow = (mp: number, sp: number) => {
    const btns: ButtonBuilder[] = [];
    if (mp > 0 || sp > 0) btns.push(new ButtonBuilder().setCustomId(`ml_prev:${mp}:${sp}`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary));
    if (mp + 1 < mPages || sp + 1 < sPages) btns.push(new ButtonBuilder().setCustomId(`ml_next:${mp}:${sp}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary));
    return btns.length > 0 ? new ActionRowBuilder<ButtonBuilder>().addComponents(...btns) : null;
  };

  let mp = 0, sp = 0;
  const row = buildRow(mp, sp);
  const msg = await i.editReply({ embeds: [buildEmbed(mp, sp)], components: row ? [row] : [] });
  if (!row) return;

  const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, filter: b => b.user.id === i.user.id, time: 120_000 });
  col.on('collect', async btn => {
    const [action] = btn.customId.split(':');
    if (action === 'ml_next') { if (mp + 1 < mPages) mp++; if (sp + 1 < sPages) sp++; }
    else { if (mp > 0) mp--; if (sp > 0) sp--; }
    const newRow = buildRow(mp, sp);
    await btn.update({ embeds: [buildEmbed(mp, sp)], components: newRow ? [newRow] : [] });
  });
  col.on('end', async () => i.editReply({ components: [] }).catch(() => {}));
}
