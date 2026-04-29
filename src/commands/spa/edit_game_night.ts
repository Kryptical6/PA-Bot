import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, TextChannel } from 'discord.js';
import { isSPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { config } from '../../config';
import { updateScheduleEmbed, buildGameNightEmbed } from '../../services/gameNightService';

export const data = new SlashCommandBuilder()
  .setName('edit_game_night')
  .setDescription('Edit a scheduled game night (SPA+)')
  .addIntegerOption(o => o.setName('id').setDescription('Game night ID').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;

  const nightId = i.options.getInteger('id', true);
  const nights = await sql`SELECT * FROM game_nights WHERE id = ${nightId} AND status = 'upcoming'`;
  if (nights.length === 0) {
    await i.reply({ embeds: [errorEmbed(`Game night #${nightId} not found or already completed.`)], ephemeral: true });
    return;
  }
  const n = nights[0];

  await i.showModal({
    customId: `gn_edit_modal:${nightId}`,
    title: 'Edit Game Night',
    components: [
      { type: 1, components: [{ type: 4, customId: 'title', label: 'Title', style: 1, required: true, value: n.title, maxLength: 100 }] },
      { type: 1, components: [{ type: 4, customId: 'date', label: 'Date (YYYY-MM-DD HH:MM)', style: 1, required: true, value: new Date(n.scheduled_at).toISOString().slice(0, 16).replace('T', ' ') }] },
      { type: 1, components: [{ type: 4, customId: 'games', label: 'Games (comma separated)', style: 2, required: true, value: Array.isArray(n.games) ? n.games.join(', ') : n.games, maxLength: 500 }] },
      { type: 1, components: [{ type: 4, customId: 'description', label: 'Description (optional)', style: 2, required: false, value: n.description ?? '', maxLength: 500 }] },
    ]
  });
}
