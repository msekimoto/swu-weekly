import { EmbedBuilder } from "discord.js";
import type { Match, TournamentSnapshot } from "./types.js";

const meleeUrl = (id: string) => `https://melee.gg/Tournament/View/${id}`;

export function roundEmbed(snapshot: TournamentSnapshot, title = `⚔️ ${snapshot.round.name} iniciada`) {
  const pairings = snapshot.matches.map(formatMatch).join("\n");
  return new EmbedBuilder().setColor(0x00a6a6).setTitle(title).setURL(meleeUrl(snapshot.tournamentId)).setDescription(pairings || "Aguardando pareamentos.").setFooter({ text: "Fonte oficial: Melee.gg" }).setTimestamp(snapshot.observedAt);
}

export function standingsEmbed(snapshot: TournamentSnapshot) {
  const rows = snapshot.standings.slice(0, 10).map((standing) => `**${standing.rank}.** ${standing.name} — ${standing.points} pts (${standing.record || "—"})`).join("\n");
  return new EmbedBuilder().setColor(0xffc107).setTitle(`Classificação — ${snapshot.round.name}`).setURL(meleeUrl(snapshot.tournamentId)).setDescription(rows || "Classificação ainda não disponível.").setFooter({ text: "Fonte oficial: Melee.gg" }).setTimestamp(snapshot.observedAt);
}

export function resultsText(matches: Match[]) { return matches.map((match) => `Mesa ${match.table}: **${match.playerOne} ${match.result} ${match.playerTwo}**`).join("\n"); }
function formatMatch(match: Match) { return `**Mesa ${match.table}** — ${match.playerOne} × ${match.playerTwo}${match.result ? ` (${match.result})` : ""}`; }
