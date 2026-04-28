import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType, ButtonBuilder, ButtonStyle } from 'discord.js';
import { isSPA, isHPA } from '../../utils/permissions';
import { sql } from '../../database/client';
import { config } from '../../config';

export const data = new SlashCommandBuilder().setName('staff_overview').setDescription('View all staff logs');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;
  await i.deferReply();

  const select = new StringSelectMenuBuilder().setCustomId('overview_sort').setPlaceholder('Choose sort order')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('Most Mistakes').setValue('mistakes').setEmoji('⚠️'),
      new StringSelectMenuOptionBuilder().setLabel('Most Strikes').setValue('strikes').setEmoji('❌'),
      new StringSelectMenuOptionBuilder().setLabel('Cleanest Staff').setValue('clean').setEmoji('✅'),
    );

  const msg = await i.editReply({ content: 'Select sort order:', components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });

  const col = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, filter: s => s.user.id === i.user.id && s.customId === 'overview_sort', time: 30_000, max: 1 });
  col.on('collect', async sel => {
    await sel.deferUpdate();
    const sort = sel.values[0];

    await i.guild!.members.fetch();
    const staff = Array.from(i.guild!.members.cache.values()).filter(m => (m.roles.cache.has(config.roles.PA) || m.roles.cache.has(config.roles.SPA)) && !m.user.bot);
    const [rateRow] = await sql`SELECT rate FROM escalation_config WHERE id = 1`;
    const rate = rateRow?.rate ?? config.escalation.defaultRate;

    const data = await Promise.all(staff.map(async sm => {
      const logs = await sql`SELECT type FROM logs WHERE user_id = ${sm.id} AND expires_at > NOW()`;
      const mistakes = logs.filter((l: any) => l.type === 'mistake').length;
      const strikes  = logs.filter((l: any) => l.type === 'strike').length;
      return { member: sm, mistakes, strikes };
    }));

    if (sort === 'mistakes') data.sort((a, b) => b.mistakes - a.mistakes);
    else if (sort === 'strikes') data.sort((a, b) => b.strikes - a.strikes);
    else data.sort((a, b) => (a.mistakes + a.strikes) - (b.mistakes + b.strikes));

    const PAGE = 10;
    const totalPages = Math.max(1, Math.ceil(data.length / PAGE));
    const label = sort === 'mistakes' ? 'Most Mistakes' : sort === 'strikes' ? 'Most Strikes' : 'Cleanest';

    const buildEmbed = (p: number) => {
      const slice = data.slice(p * PAGE, (p + 1) * PAGE);
      const embed = new EmbedBuilder().setColor(Colors.Blue).setTitle(`📊 Staff Overview - ${label}`)
        .setFooter({ text: `Page ${p + 1}/${totalPages} - ${data.length} staff` }).setTimestamp();
      if (slice.length === 0) { embed.setDescription('No data.'); return embed; }
      embed.setDescription(slice.map((s, idx) => {
        const risk = isHPA(m) ? `  •  ${Math.max(0, rate - s.mistakes)} away from strike` : '';
        return `${p * PAGE + idx + 1}. **${s.member.displayName}**\n⚠️ ${s.mistakes}  ❌ ${s.strikes}${risk}`;
      }).join('\n\n'));
      return embed;
    };

    const buildRow = (p: number) => {
      const btns: ButtonBuilder[] = [];
      if (p > 0) btns.push(new ButtonBuilder().setCustomId(`ov_prev:${sort}:${p}`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary));
      if (p + 1 < totalPages) btns.push(new ButtonBuilder().setCustomId(`ov_next:${sort}:${p}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary));
      return btns.length > 0 ? new ActionRowBuilder<ButtonBuilder>().addComponents(...btns) : null;
    };

    let page = 0;
    const pageRow = buildRow(page);
    const reply = await i.editReply({ content: '', embeds: [buildEmbed(page)], components: pageRow ? [pageRow] : [] });
    if (!pageRow) return;

    const btnCol = reply.createMessageComponentCollector({ componentType: ComponentType.Button, filter: b => b.user.id === i.user.id, time: 120_000 });
    btnCol.on('collect', async btn => {
      const [action, , pageStr] = btn.customId.split(':');
      page = action === 'ov_next' ? parseInt(pageStr) + 1 : parseInt(pageStr) - 1;
      const newRow = buildRow(page);
      await btn.update({ embeds: [buildEmbed(page)], components: newRow ? [newRow] : [] });
    });
    btnCol.on('end', async () => i.editReply({ components: [] }).catch(() => {}));
  });
}
