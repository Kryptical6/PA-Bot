import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, TextChannel } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { config } from '../../config';
import { updateScheduleEmbed, buildGameNightEmbed } from '../../services/gameNightService';

export const data = new SlashCommandBuilder()
  .setName('create_game_night')
  .setDescription('Schedule a game night (HPA only)')
  .addStringOption(o => o.setName('title').setDescription('Event title').setRequired(true))
  .addStringOption(o => o.setName('date').setDescription('Date and time (YYYY-MM-DD HH:MM)').setRequired(true))
  .addStringOption(o => o.setName('description').setDescription('Optional description'));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;

  const title = i.options.getString('title', true);
  const dateStr = i.options.getString('date', true);
  const desc = i.options.getString('description') ?? null;

  const scheduledAt = new Date(dateStr);
  if (isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
    await i.reply({ embeds: [errorEmbed('Invalid date. Use YYYY-MM-DD HH:MM and ensure it\'s in the future.')], ephemeral: true });
    return;
  }

  await i.deferReply({ ephemeral: true });

  // Load approved suggestions for game selection
  const suggestions = await sql`SELECT * FROM game_suggestions WHERE status = 'approved' ORDER BY upvotes DESC LIMIT 25`;

  const games: string[] = [];

  const addFromPool = async (): Promise<void> => {
    if (suggestions.length === 0) return;
    const select = new StringSelectMenuBuilder()
      .setCustomId('gn_pick_game')
      .setPlaceholder('Pick a game from suggestions (or skip to type manually)')
      .addOptions([
        new StringSelectMenuOptionBuilder().setLabel('🖊️ Type game name manually').setValue('__manual__'),
        ...suggestions.slice(0, 24).map((s: any) =>
          new StringSelectMenuOptionBuilder().setLabel(`${s.game_name} (👍 ${s.upvotes})`).setValue(s.game_name)
        )
      ]);

    const msg = await i.editReply({
      content: `**Games selected so far:** ${games.length > 0 ? games.join(', ') : 'none'}\n\nPick a game or finish:`,
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('gn_done').setLabel('✅ Done - Create Game Night').setStyle(ButtonStyle.Success),
        )
      ]
    });

    const selection = await msg.awaitMessageComponent({
      filter: c => c.user.id === i.user.id && (c.customId === 'gn_pick_game' || c.customId === 'gn_done'),
      time: 120_000,
    }).catch(() => null);

    if (!selection) return;

    if (selection.customId === 'gn_done') {
      await selection.deferUpdate();
      return;
    }

    const picked = (selection as any).values[0];
    if (picked === '__manual__') {
      await selection.showModal({
        customId: 'gn_manual_game',
        title: 'Enter Game Name',
        components: [{ type: 1, components: [{ type: 4, customId: 'game_name', label: 'Game name', style: 1, required: true, maxLength: 100 }] }]
      });
      const modal = await selection.awaitModalSubmit({ time: 60_000, filter: m => m.customId === 'gn_manual_game' }).catch(() => null);
      if (modal) {
        await modal.deferUpdate();
        const name = modal.fields.getTextInputValue('game_name').trim();
        if (name && !games.includes(name)) games.push(name);
      }
    } else {
      await selection.deferUpdate();
      if (!games.includes(picked)) games.push(picked);
    }

    await addFromPool();
  };

  await addFromPool();

  if (games.length === 0) {
    await i.editReply({ content: '❌ No games selected. Game night cancelled.', components: [] });
    return;
  }

  // Create game night
  const [night] = await sql`
    INSERT INTO game_nights (title, games, scheduled_at, host, description)
    VALUES (${title}, ${games}, ${scheduledAt.toISOString()}, ${i.user.id}, ${desc})
    RETURNING id
  `;

  // Post announcement with RSVP
  const { embed, row } = await buildGameNightEmbed(night.id);
  try {
    const ch = await i.client.channels.fetch(config.channels.gameNightSchedule) as TextChannel;
    const pingRole = config.roles.gameNight !== '000000000000000000' ? `<@&${config.roles.gameNight}> ` : '';
    const msg = await ch.send({ content: `${pingRole}🎮 New game night scheduled!`, embeds: [embed], components: [row] });
    await sql`UPDATE game_nights SET announcement_message_id = ${msg.id} WHERE id = ${night.id}`;
  } catch (e) { console.error('Failed to post game night announcement:', e); }

  await updateScheduleEmbed(i.client);
  await i.editReply({ content: '', embeds: [successEmbed('Game Night Created', `**${title}** scheduled for <t:${Math.floor(scheduledAt.getTime() / 1000)}:F>!\nGames: ${games.join(', ')}`)], components: [] });
}
