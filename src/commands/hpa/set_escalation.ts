import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { successEmbed } from '../../utils/embeds';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder().setName('set_escalation').setDescription('Set escalation rate (HPA only)')
  .addIntegerOption(o => o.setName('rate').setDescription('Mistakes to trigger a strike').setRequired(true).setMinValue(1).setMaxValue(20));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });
  const rate = i.options.getInteger('rate', true);
  await sql`UPDATE escalation_config SET rate = ${rate}, updated_at = NOW() WHERE id = 1`;
  await i.editReply({ embeds: [successEmbed('Updated', `Escalation rate set to **${rate} mistakes = 1 strike**.`)] });
}
