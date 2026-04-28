import { Client, TextChannel, EmbedBuilder, Colors } from 'discord.js';
import { sql } from '../database/client';

export async function processExpiredVotes(client: Client): Promise<void> {
  const expired = await sql`SELECT * FROM votes WHERE status = 'active' AND deadline <= NOW()`;
  for (const vote of expired) await closeVote(client, vote.id);
}

export async function closeVote(client: Client, voteId: number): Promise<void> {
  const rows = await sql`SELECT * FROM votes WHERE id = ${voteId}`;
  if (rows.length === 0 || rows[0].status === 'closed') return;
  const vote = rows[0];
  await sql`UPDATE votes SET status = 'closed' WHERE id = ${voteId}`;

  const entries = await sql`SELECT * FROM vote_entries WHERE vote_id = ${voteId}`;
  const tally: Record<string, { count: number; voters: string[] }> = {};
  for (const e of entries) {
    if (!tally[e.candidate_id]) tally[e.candidate_id] = { count: 0, voters: [] };
    tally[e.candidate_id].count++;
    if (!e.anonymous) tally[e.candidate_id].voters.push(e.voter_id);
  }

  const sorted = Object.entries(tally).sort((a, b) => b[1].count - a[1].count);
  const embed = new EmbedBuilder().setColor(Colors.Gold).setTitle(`🗳️ Vote Results: ${vote.title}`).setTimestamp();

  if (sorted.length === 0) {
    embed.setDescription('No votes were cast.');
  } else {
    for (const [candidateId, data] of sorted) {
      let voters = '';
      if (vote.anonymity === 'public' && data.voters.length > 0) voters = `\nVoters: ${data.voters.map((v: string) => `<@${v}>`).join(', ')}`;
      else if (vote.anonymity === 'flexible' && data.voters.length > 0) voters = `\nPublic voters: ${data.voters.map((v: string) => `<@${v}>`).join(', ')}`;
      embed.addFields({ name: `<@${candidateId}>`, value: `**${data.count} vote(s)**${voters}` });
    }
  }

  try {
    const channel = await client.channels.fetch(vote.channel_id) as TextChannel;
    await channel.send({ embeds: [embed] });
    if (vote.message_id) {
      try { const msg = await channel.messages.fetch(vote.message_id); await msg.delete(); } catch { /* silent */ }
    }
  } catch (e) { console.error(`Failed to post vote results ${voteId}:`, e); }
}
