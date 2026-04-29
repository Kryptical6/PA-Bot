import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType, TextChannel } from 'discord.js';
import { isSPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { config } from '../../config';
import { updateScheduleEmbed, buildGameNightEmbed } from '../../services/gameNightService';

export const data = new SlashCommandBuilder()
  .setName('edit_game_night')
  .setDescription('Edit a scheduled game night (SPA+)');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const nights = await sql`SELECT * FROM game_nights WHERE status = 'upcoming' ORDER BY scheduled_at ASC LIMIT 25`;
  if (nights.length === 0) {
    await i.editReply({ embeds: [errorEmbed('No upcoming game nights to edit.')] });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('gn_edit_select')
    .setPlaceholder('Select a game night to edit')
    .addOptions(nights.map((n: any) => {
      const ts = new Date(n.scheduled_at);
      const label = `[#${n.id}] ${n.title}`.slice(0, 100);
      const desc  = `${ts.toDateString()} — ${Array.isArray(n.games) ? n.games.join(', ') : n.games}`.slice(0, 100);
      return new StringSelectMenuOptionBuilder().setLabel(label).setDescription(desc).setValue(String(n.id));
    }));

  const msg = await i.editReply({ content: 'Select a game night to edit:', components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });
  const sel = await msg.awaitMessageComponent({ componentType: ComponentType.StringSelect, filter: s => s.user.id === i.user.id && s.customId === 'gn_edit_select', time: 30_000 }).catch(() => null);
  if (!sel) { await i.editReply({ content: 'Timed out.', components: [] }); return; }

  const nightId = parseInt(sel.values[0]);
  const nights2 = await sql`SELECT * FROM game_nights WHERE id = ${nightId}`;
  const n = nights2[0];

  await sel.showModal({
    customId: `gn_edit_modal:${nightId}`,
    title: `Edit: ${n.title}`,
    components: [
      { type: 1, components: [{ type: 4, customId: 'title', label: 'Title', style: 1, required: true, value: n.title, maxLength: 100 }] },
      { type: 1, components: [{ type: 4, customId: 'date', label: 'Date (YYYY-MM-DD HH:MM)', style: 1, required: true, value: new Date(n.scheduled_at).toISOString().slice(0, 16).replace('T', ' ') }] },
      { type: 1, components: [{ type: 4, customId: 'games', label: 'Games (comma separated)', style: 2, required: true, value: Array.isArray(n.games) ? n.games.join(', ') : n.games, maxLength: 500 }] },
      { type: 1, components: [{ type: 4, customId: 'description', label: 'Description (optional)', style: 2, required: false, value: n.description ?? '', maxLength: 500 }] },
    ]
  });
}
