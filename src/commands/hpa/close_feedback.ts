import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';
import { closeFeedbackRound } from '../../services/feedbackService';

export const data = new SlashCommandBuilder()
  .setName('close_feedback')
  .setDescription('Close an active feedback round early (HPA only)');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const rounds = await sql`SELECT * FROM feedback_rounds WHERE status IN ('active', 'reminder_sent') ORDER BY created_at DESC LIMIT 25`;
  if (rounds.length === 0) {
    await i.editReply({ embeds: [errorEmbed('No active feedback rounds.')] });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('close_feedback_sel')
    .setPlaceholder('Select a round to close')
    .addOptions(rounds.map((r: any) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`[#${r.id}] ${r.title}`)
        .setDescription(`Closes <t:${Math.floor(new Date(r.closes_at).getTime() / 1000)}:R>`)
        .setValue(String(r.id))
    ));

  const msg = await i.editReply({ content: 'Select a feedback round to close:', components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });
  const sel = await msg.awaitMessageComponent({ componentType: ComponentType.StringSelect, filter: s => s.user.id === i.user.id, time: 30_000 }).catch(() => null);
  if (!sel) { await i.editReply({ content: 'Timed out.', components: [] }); return; }

  await sel.deferUpdate();
  const roundId = parseInt(sel.values[0]);
  await closeFeedbackRound(i.client, roundId);

  const round = rounds.find((r: any) => r.id === roundId);
  await i.editReply({ content: '', embeds: [successEmbed('Round Closed', `**${round.title}** has been closed.`)], components: [] });
}
