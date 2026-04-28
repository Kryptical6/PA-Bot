import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, TextChannel, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { isSPA, canLogAgainst } from '../../utils/permissions';
import { errorEmbed, successEmbed, pendingLogEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { config } from '../../config';

export const data = new SlashCommandBuilder().setName('log_mistake').setDescription('Submit a mistake for HPA review')
  .addUserOption(o => o.setName('user').setDescription('Staff member to log').setRequired(true));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isSPA(m)) return;

  const target = i.options.getMember('user') as GuildMember | null;
  if (!target) { await i.reply({ embeds: [errorEmbed('User not found.')], ephemeral: true }); return; }
  if (!canLogAgainst(m, target)) { await i.reply({ embeds: [errorEmbed('You cannot log a mistake against this user.')], ephemeral: true }); return; }

  const today = new Date().toISOString().split('T')[0];
  await i.showModal({
    customId: `log_mistake:${target.id}`,
    title: 'Log a Mistake',
    components: [
      { type: 1, components: [{ type: 4, customId: 'post_id', label: 'Post ID', style: 1, required: true, maxLength: 200 }] },
      { type: 1, components: [{ type: 4, customId: 'date', label: 'Date (YYYY-MM-DD)', style: 1, required: true, value: today }] },
      { type: 1, components: [{ type: 4, customId: 'reason', label: 'Reason', style: 2, required: true, minLength: 5, maxLength: 1000 }] },
    ]
  });

  const modal = await i.awaitModalSubmit({ time: 300_000, filter: m => m.customId === `log_mistake:${target.id}` }).catch(() => null);
  if (!modal) return;
  await modal.deferReply({ ephemeral: true });

  const postId = modal.fields.getTextInputValue('post_id').trim();
  const date   = modal.fields.getTextInputValue('date').trim();
  const reason = modal.fields.getTextInputValue('reason').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { await modal.editReply({ embeds: [errorEmbed('Invalid date. Use YYYY-MM-DD.')] }); return; }

  const guild = i.guild!;
  const targetMember = await guild.members.fetch(target.id).catch(() => null);
  if (!targetMember) { await modal.editReply({ embeds: [errorEmbed('This user is no longer in the server.')] }); return; }

  const existing = await sql`SELECT 1 FROM used_post_ids WHERE post_id = ${postId}`;
  if (existing.length > 0) { await modal.editReply({ embeds: [errorEmbed(`Post ID \`${postId}\` has already been logged.`)] }); return; }

  const [result] = await sql`INSERT INTO pending_logs (user_id, post_id, reason, logged_by, date) VALUES (${target.id}, ${postId}, ${reason}, ${i.user.id}, ${date}) RETURNING id`;
  await sql`INSERT INTO used_post_ids (post_id) VALUES (${postId}) ON CONFLICT DO NOTHING`;

  const embed = pendingLogEmbed({ userId: target.id, postId, reason, loggedBy: i.user.id, date, pendingId: result.id });
  const approve = new ButtonBuilder().setCustomId(`log_approve:${result.id}`).setLabel('✅ Approve').setStyle(ButtonStyle.Success);
  const editBtn = new ButtonBuilder().setCustomId(`log_edit:${result.id}`).setLabel('✏️ Edit Reason').setStyle(ButtonStyle.Primary);
  const deny    = new ButtonBuilder().setCustomId(`log_deny:${result.id}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger);

  const ch = await i.client.channels.fetch(config.channels.hpaReview) as TextChannel;
  await ch.send({ embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(approve, editBtn, deny)] });
  await modal.editReply({ embeds: [successEmbed('Submitted', 'Your log has been submitted for HPA review.')] });
}
