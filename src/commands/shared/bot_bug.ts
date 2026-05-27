import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, EmbedBuilder, Colors } from 'discord.js';
import { isPA } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { getErrorByCode } from '../../services/errorService';
import { sql } from '../../database/client';

export const data = new SlashCommandBuilder()
  .setName('bot-bug')
  .setDescription('Report a bot error code to HPA for investigation')
  .addStringOption(o => o
    .setName('code')
    .setDescription('The error code you received (e.g. ERR-4A2B)')
    .setRequired(true)
    .setMaxLength(8)
  )
  .addStringOption(o => o
    .setName('description')
    .setDescription('What were you trying to do when the error occurred?')
    .setMaxLength(500)
  );

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const code        = i.options.getString('code', true).toUpperCase().trim();
  const description = i.options.getString('description') ?? null;

  const error = await getErrorByCode(code);
  if (!error) {
    await i.editReply({ embeds: [errorEmbed(`Error code **${code}** not found. Make sure you copied it exactly.`)] });
    return;
  }

  // Mark as reported
  await sql`UPDATE error_log SET reported = true WHERE code = ${code}`;

  // Post to HPA channel
  const REPORT_CHANNEL = '1497723319829401750';
  const embed = new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle(`Bug Report - ${code}`)
    .addFields(
      { name: 'Reported by',  value: `<@${i.user.id}>`,                                                        inline: true },
      { name: 'Error Code',   value: code,                                                                      inline: true },
      { name: 'Command',      value: error.command,                                                             inline: true },
      { name: 'Error',        value: error.message.slice(0, 500) },
    )
    .setTimestamp(new Date(error.created_at));

  if (description) embed.addFields({ name: 'User Description', value: description });
  if (error.stack) embed.addFields({ name: 'Stack (first 500)', value: `\`\`\`${error.stack.slice(0, 500)}\`\`\`` });

  try {
    const ch = await i.client.channels.fetch(REPORT_CHANNEL) as any;
    await ch.send({ embeds: [embed] });
  } catch (e) {
    console.error('Failed to post bug report:', e);
  }

  await i.editReply({ embeds: [successEmbed('Bug Reported', `Error **${code}** has been reported to HPA for investigation. Thank you.`)] });
}
