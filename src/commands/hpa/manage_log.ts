import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder().setName('manage_log').setDescription('Edit, remove, or transfer a log (HPA only)')
  .addUserOption(o => o.setName('user').setDescription('Staff member').setRequired(true))
  .addStringOption(o => o.setName('action').setDescription('Action').setRequired(true)
    .addChoices({ name: 'Edit', value: 'edit' }, { name: 'Remove', value: 'remove' }, { name: 'Transfer', value: 'transfer' }));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const target = i.options.getMember('user') as GuildMember | null;
  const action = i.options.getString('action', true);
  if (!target) { await i.editReply({ embeds: [errorEmbed('User not found.')] }); return; }

  const logs = await sql`SELECT * FROM logs WHERE user_id = ${target.id} AND expires_at > NOW() ORDER BY date DESC`;
  if (logs.length === 0) { await i.editReply({ embeds: [errorEmbed(`${target.displayName} has no active logs.`)] }); return; }

  const select = new StringSelectMenuBuilder().setCustomId(`ml_sel:${action}`)
    .setPlaceholder('Select a log')
    .addOptions(logs.slice(0, 25).map((l: any) => new StringSelectMenuOptionBuilder()
      .setLabel(`[${l.type.toUpperCase()}] ${(l.post_id ?? l.reason).slice(0, 50)}`)
      .setValue(String(l.id))));

  const msg = await i.editReply({ content: `Select a log to **${action}**:`, components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });
  const col = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, filter: s => s.user.id === i.user.id && s.customId === `ml_sel:${action}`, time: 30_000, max: 1 });

  col.on('collect', async sel => {
    const logId = parseInt(sel.values[0]);
    const [log] = await sql`SELECT * FROM logs WHERE id = ${logId}`;
    if (!log) { await sel.update({ content: '❌ Log not found.', components: [] }); return; }

    if (action === 'remove') {
      await sql`DELETE FROM logs WHERE id = ${logId}`;
      await sel.update({ embeds: [successEmbed('Removed', `Log #${logId} deleted.`)], components: [] });
      return;
    }

    if (action === 'transfer') {
      await sel.showModal({
        customId: `ml_transfer:${logId}`,
        title: 'Transfer Log',
        components: [{ type: 1, components: [{ type: 4, customId: 'new_user', label: 'New user ID or mention', style: 1, required: true }] }]
      });
      const modal = await sel.awaitModalSubmit({ time: 300_000, filter: m => m.customId === `ml_transfer:${logId}` }).catch(() => null);
      if (!modal) return;
      await modal.deferUpdate();
      const newUserId = modal.fields.getTextInputValue('new_user').trim().replace(/\D/g, '');
      await sql`UPDATE logs SET user_id = ${newUserId}, reason = ${log.reason + ` [Transferred from <@${log.user_id}>]`} WHERE id = ${logId}`;
      await i.editReply({ content: '', embeds: [successEmbed('Transferred', `Log #${logId} transferred from <@${log.user_id}> to <@${newUserId}>.`)], components: [] });
      return;
    }

    if (action === 'edit') {
      await sel.showModal({
        customId: `ml_edit:${logId}`,
        title: 'Edit Log',
        components: [
          { type: 1, components: [{ type: 4, customId: 'reason', label: 'Reason', style: 2, required: true, value: log.reason, maxLength: 1000 }] },
          { type: 1, components: [{ type: 4, customId: 'date', label: 'Date (YYYY-MM-DD)', style: 1, required: true, value: log.date }] },
          { type: 1, components: [{ type: 4, customId: 'type', label: 'Type (mistake or strike)', style: 1, required: true, value: log.type }] },
        ]
      });
      const modal = await sel.awaitModalSubmit({ time: 300_000, filter: m => m.customId === `ml_edit:${logId}` }).catch(() => null);
      if (!modal) return;
      await modal.deferUpdate();
      const reason = modal.fields.getTextInputValue('reason').trim();
      const date   = modal.fields.getTextInputValue('date').trim();
      const type   = modal.fields.getTextInputValue('type').trim().toLowerCase();
      if (!['mistake', 'strike'].includes(type)) { await i.editReply({ embeds: [errorEmbed('Type must be "mistake" or "strike".')], components: [] }); return; }
      await sql`UPDATE logs SET reason = ${reason}, date = ${date}, type = ${type} WHERE id = ${logId}`;
      await i.editReply({ content: '', embeds: [successEmbed('Edited', `Log #${logId} updated.\nReason: ${reason}\nDate: ${date}\nType: ${type}`)], components: [] });
    }
  });
}
