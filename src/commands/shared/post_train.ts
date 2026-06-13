import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import { errorEmbed } from '../../utils/embeds';
import { getActiveSession, buildCategorySelect } from '../../services/postTrainService';

const ALLOWED_ROLES = [
  '995665374349631590', // HPA
  '995663941436973086', // SPA
  '995664003323940904', // PA
  '995663756879212604', // Trial PA
];

function canUseTrain(m: GuildMember): boolean {
  return ALLOWED_ROLES.some(r => m.roles.cache.has(r));
}

export const data = new SlashCommandBuilder()
  .setName('post-train')
  .setDescription('Start a post review training session in your DMs');

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!canUseTrain(m)) {
    await i.reply({ embeds: [errorEmbed('You do not have permission to use this command.')], ephemeral: true });
    return;
  }

  const existing = await getActiveSession(i.user.id);
  if (existing) {
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Orange)
        .setTitle('Session Already Active')
        .setDescription(
          `You already have an active training session running in your DMs.\n\n` +
          `**Score so far:** ${existing.score}/${existing.total}\n\n` +
          `Check your DMs to continue, or end your current session first.`
        )
        .setTimestamp()],
      ephemeral: true,
    });
    return;
  }

  try {
    await i.user.createDM();
    await i.user.send({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Post Review Training')
        .setDescription(
          `Welcome to the **Post Approver Training** system.\n\n` +
          `You will be shown fake marketplace posts one at a time. For each post, choose the correct action:\n\n` +
          `**Approve** - post meets all rules\n` +
          `**Deny** - post violates one or more rules\n` +
          `**Request Proof of Funds** - post is clean but meets the POF threshold (30,000 R$ / $200 USD or more)\n\n` +
          `Select a category below to begin.`
        )
        .setTimestamp()],
      components: [buildCategorySelect()],
    });

    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('Check your DMs')
        .setDescription('A DM has been sent to start your training session.')
        .setTimestamp()],
      ephemeral: true,
    });
  } catch {
    await i.reply({
      embeds: [errorEmbed('Could not send you a DM. Please enable DMs from server members and try again.')],
      ephemeral: true,
    });
  }
}
