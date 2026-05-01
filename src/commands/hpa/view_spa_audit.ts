import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType, TextChannel } from 'discord.js';
import { isHPA } from '../../utils/permissions';
import { errorEmbed } from '../../utils/embeds';
import { buildAuditReport } from '../../services/spaAuditService';
import { config } from '../../config';

export const data = new SlashCommandBuilder()
  .setName('view_spa_audit')
  .setDescription('View a full SPA audit report (HPA only)')
  .addUserOption(o => o.setName('senior').setDescription('Senior to audit (or use dropdown)'));

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  const m = i.member as GuildMember;
  if (!isHPA(m)) return;
  await i.deferReply({ ephemeral: true });

  const directUser = i.options.getUser('senior');

  if (directUser) {
    const { embeds, rows } = await buildAuditReport(i.client, directUser.id, i.user.id);
    try {
      const ch = await i.client.channels.fetch(config.channels.appeals) as TextChannel;
      await ch.send({ embeds, components: rows });
    } catch (e) { console.error('Failed to post audit report:', e); }
    await i.editReply({ content: `✅ Audit report for <@${directUser.id}> posted in <#${config.channels.appeals}>.` });
    return;
  }

  // Dropdown of all SPA members
  await i.guild!.members.fetch();
  const seniors = Array.from(i.guild!.members.cache.values()).filter(m =>
    m.roles.cache.has(config.roles.SPA) && !m.roles.cache.has(config.roles.HPA) && !m.user.bot
  );

  if (seniors.length === 0) {
    await i.editReply({ embeds: [errorEmbed('No senior staff found.')] });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('audit_senior_sel')
    .setPlaceholder('Select a senior to audit')
    .addOptions(seniors.slice(0, 25).map(s =>
      new StringSelectMenuOptionBuilder().setLabel(s.displayName).setValue(s.id)
    ));

  const msg = await i.editReply({ content: 'Select a senior:', components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });
  const sel = await msg.awaitMessageComponent({ componentType: ComponentType.StringSelect, filter: s => s.user.id === i.user.id, time: 30_000 }).catch(() => null);
  if (!sel) { await i.editReply({ content: 'Timed out.', components: [] }); return; }

  await sel.deferUpdate();
  const targetId = sel.values[0];
  const { embeds, rows } = await buildAuditReport(i.client, targetId, i.user.id);

  try {
    const ch = await i.client.channels.fetch(config.channels.appeals) as TextChannel;
    await ch.send({ embeds, components: rows });
  } catch (e) { console.error('Failed to post audit report:', e); }

  await i.editReply({ content: `✅ Audit report posted in <#${config.channels.appeals}>.`, components: [] });
}
