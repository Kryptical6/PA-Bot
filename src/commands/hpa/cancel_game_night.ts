import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType, TextChannel } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed, warningEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { config } from '../../config';
import { updateScheduleEmbed } from '../../services/gameNightService';
import { dmUser } from '../../services/dmService';

export const data = new SlashCommandBuilder()
  .setName('cancel_game_night')
  .setDescription('Cancel a scheduled game night (HPA only)')
  .addStringOption(o => o.setName('reason').setDescription('Reason for cancellation').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const reason = i.options.getString('reason', true);
  const nights = await sql`SELECT * FROM game_nights WHERE status = 'upcoming' ORDER BY scheduled_at ASC LIMIT 25`;

  if (nights.length === 0) {
    await i.editReply({ embeds: [errorEmbed('No upcoming game nights to cancel.')] });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('gn_cancel_select')
    .setPlaceholder('Select a game night to cancel')
    .addOptions(nights.map((n: any) => {
      const ts = new Date(n.scheduled_at);
      const label = `[#${n.id}] ${n.title}`.slice(0, 100);
      const desc  = `${ts.toDateString()} — ${Array.isArray(n.games) ? n.games.join(', ') : n.games}`.slice(0, 100);
      return new StringSelectMenuOptionBuilder().setLabel(label).setDescription(desc).setValue(String(n.id));
    }));

  const msg = await i.editReply({ content: 'Select a game night to cancel:', components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });
  const sel = await msg.awaitMessageComponent({ componentType: ComponentType.StringSelect, filter: s => s.user.id === i.user.id && s.customId === 'gn_cancel_select', time: 30_000 }).catch(() => null);
  if (!sel) { await i.editReply({ content: 'Timed out.', components: [] }); return; }

  await sel.deferUpdate();
  const nightId = parseInt(sel.values[0]);
  const nights2 = await sql`SELECT * FROM game_nights WHERE id = ${nightId}`;
  const n = nights2[0];

  await sql`UPDATE game_nights SET status = 'cancelled' WHERE id = ${nightId}`;

  // DM RSVPd users
  const rsvps = await sql`SELECT user_id FROM game_night_rsvps WHERE game_night_id = ${nightId} AND attending = true`;
  for (const r of rsvps) {
    await dmUser(i.client, r.user_id, {
      embeds: [warningEmbed('Game Night Cancelled', `**${n.title}** has been cancelled.\n\n**Reason:** ${reason}`)]
    });
  }

  // Update announcement message
  if (n.announcement_message_id) {
    try {
      const ch = await i.client.channels.fetch(config.channels.gameNightSchedule) as TextChannel;
      const msg2 = await ch.messages.fetch(n.announcement_message_id);
      await msg2.edit({ content: `❌ **CANCELLED** — ${reason}`, components: [] });
    } catch { /* silent */ }
  }

  await updateScheduleEmbed(i.client);
  await i.editReply({ content: '', embeds: [successEmbed('Cancelled', `**${n.title}** cancelled. ${rsvps.length} user(s) notified.`)], components: [] });
}
