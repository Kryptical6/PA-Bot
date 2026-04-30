import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { successEmbed, infoEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder()
  .setName('clear_stale')
  .setDescription('Clear stale pending logs or appeals the bot is DMing about (HPA only)')
  .addStringOption(o => o.setName('type').setDescription('What to clear').setRequired(true)
    .addChoices(
      { name: 'Pending logs (unreviewed)',    value: 'pending_logs' },
      { name: 'Pending appeals',              value: 'appeals' },
      { name: 'Both',                         value: 'both' },
    ))
  .addStringOption(o => o.setName('user').setDescription('Only clear for a specific user ID (optional)').setRequired(false));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const type    = i.options.getString('type', true);
  const userRaw = i.options.getString('user');
  const userId  = userRaw ? userRaw.trim().replace(/\D/g, '') : null;

  let pendingDeleted = 0;
  let appealsDeleted = 0;

  if (type === 'pending_logs' || type === 'both') {
    const rows = userId
      ? await sql`DELETE FROM pending_logs WHERE user_id = ${userId} RETURNING id, post_id`
      : await sql`DELETE FROM pending_logs RETURNING id, post_id`;
    pendingDeleted = rows.length;
    // Free up the post IDs
    for (const r of rows) {
      await sql`DELETE FROM used_post_ids WHERE post_id = ${r.post_id}`.catch(() => {});
    }
  }

  if (type === 'appeals' || type === 'both') {
    const rows = userId
      ? await sql`DELETE FROM appeals WHERE user_id = ${userId} AND status = 'pending' RETURNING id`
      : await sql`DELETE FROM appeals WHERE status = 'pending' RETURNING id`;
    appealsDeleted = rows.length;
  }

  const parts: string[] = [];
  if (pendingDeleted > 0) parts.push(`**${pendingDeleted}** pending log(s) cleared`);
  if (appealsDeleted > 0) parts.push(`**${appealsDeleted}** pending appeal(s) cleared`);
  const summary = parts.length > 0 ? parts.join('\n') : 'Nothing to clear.';

  await i.editReply({ embeds: [successEmbed('Done', summary)] });
}
