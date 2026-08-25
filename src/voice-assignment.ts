import { ChannelType, type Guild, type GuildMember } from "discord.js";
import { normalizeName } from "./player-links.js";
import type { TournamentSnapshot } from "./types.js";

export interface VoiceAssignment { userId: string; table: number; meleeName: string; }

export function assignmentsForRound(snapshot: TournamentSnapshot, links: Record<string, string>): VoiceAssignment[] {
  const tableByName = new Map<string, number>();
  for (const match of snapshot.matches) {
    tableByName.set(normalizeName(match.playerOne), match.table);
    tableByName.set(normalizeName(match.playerTwo), match.table);
  }
  return Object.entries(links).flatMap(([userId, meleeName]) => {
    const table = tableByName.get(normalizeName(meleeName));
    return table ? [{ userId, table, meleeName }] : [];
  });
}

export function voiceChannelForTable(guild: Guild, table: number) {
  const prefix = String(table).padStart(2, "0");
  const pattern = new RegExp(`^${prefix}(?:\\s|\\||$)`);
  return guild.channels.cache.find((channel) => channel.type === ChannelType.GuildVoice && pattern.test(channel.name.trim()));
}

export async function moveMemberToTable(guild: Guild, member: GuildMember, table: number): Promise<boolean> {
  if (!member.voice.channelId) return false;
  const destination = voiceChannelForTable(guild, table);
  if (!destination || destination.type !== ChannelType.GuildVoice) return false;
  if (member.voice.channelId === destination.id) return false;
  await member.voice.setChannel(destination, `Mesa ${String(table).padStart(2, "0")} do torneio semanal`);
  return true;
}
