import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, TextChannel } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { config } from '../../config';
import { updateScheduleEmbed } from '../../services/gameNightService';
import { dmUser } from '../../services/dmService';
import { warningEmbed } from '../../utils/embeds';

export const data = new SlashCommandBuilder()
  .setName('cancel_game_night')
  .setDescription('Cancel a scheduled game night (HPA only)')
  .addIntegerOption(o => o.setName('id').setDescription('Game night ID').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason for cancellation').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const nightId = i.options.getInteger('id', true);
  const reason  = i.options.getString('reason', true);

  const nights = await sql`SELECT * FROM game_nights WHERE id = ${nightId} AND status = 'upcoming'`;
  if (nights.length === 0) {
    await i.editReply({ embeds: [errorEmbed(`Game night #${nightId} not found or already completed.`)] });
    return;
  }
  const n = nights[0];

  await sql`UPDATE game_nights SET status = 'cancelled' WHERE id = ${nightId}`;

  // DM RSVPd users
  const rsvps = await sql`SELECT user_id FROM game_night_rsvps WHERE game_night_id = ${nightId} AND attending = true`;
  for (const r of rsvps) {
    await dmUser(i.client, r.user_id, {
      embeds: [warningEmbed('Game Night Cancelled', `**${n.title}** has been cancelled.\n\n**Reason:** ${reason}`)]
    });
  }

  // Update announcement message if exists
  if (n.announcement_message_id) {
    try {
      const ch = await i.client.channels.fetch(config.channels.gameNightSchedule) as TextChannel;
      const msg = await ch.messages.fetch(n.announcement_message_id);
      await msg.edit({ content: `~~${msg.content}~~\n\n❌ **CANCELLED** - ${reason}`, components: [] });
    } catch { /* silent */ }
  }

  await updateScheduleEmbed(i.client);
  await i.editReply({ embeds: [successEmbed('Cancelled', `**${n.title}** cancelled. ${rsvps.length} user(s) notified.`)] });
}
