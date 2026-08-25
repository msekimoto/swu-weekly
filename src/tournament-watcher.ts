import { EventEmitter } from "node:events";
import type { Match, MeleeSource, TournamentSnapshot } from "./types.js";

export type TournamentEvent =
  | { type: "round-started"; snapshot: TournamentSnapshot }
  | { type: "pairings-changed"; snapshot: TournamentSnapshot }
  | { type: "results-updated"; snapshot: TournamentSnapshot; changedMatches: Match[] }
  | { type: "round-complete"; snapshot: TournamentSnapshot };

export class TournamentWatcher extends EventEmitter {
  private timer?: NodeJS.Timeout;
  private current?: TournamentSnapshot;

  constructor(private readonly source: MeleeSource, private readonly tournamentId: string, private readonly intervalMs: number) { super(); }

  get snapshot(): TournamentSnapshot | undefined { return this.current; }

  async poll(): Promise<TournamentSnapshot> {
    const rounds = await this.source.getRounds(this.tournamentId);
    if (!rounds.length) throw new Error("Nenhuma rodada foi encontrada no torneio Melee.");
    let selected: TournamentSnapshot | undefined;
    for (const round of [...rounds].reverse()) {
      const matches = await this.source.getMatches(this.tournamentId, round.id);
      if (!matches.length) continue;
      selected = { tournamentId: this.tournamentId, round, matches, standings: await this.source.getStandings(this.tournamentId, round.id), observedAt: new Date() };
      break;
    }
    if (!selected) throw new Error("O Melee ainda não publicou pareamentos.");
    this.publishChanges(selected);
    this.current = selected;
    return selected;
  }

  start(): void {
    void this.poll().catch((error: unknown) => this.emit("error", error));
    this.timer = setInterval(() => void this.poll().catch((error: unknown) => this.emit("error", error)), this.intervalMs);
  }

  stop(): void { if (this.timer) clearInterval(this.timer); }

  private publishChanges(next: TournamentSnapshot): void {
    const previous = this.current;
    if (!previous) return;
    if (previous.round.id !== next.round.id) { this.emit("event", { type: "round-started", snapshot: next } satisfies TournamentEvent); return; }
    const priorByTable = new Map(previous.matches.map((match) => [match.table, match]));
    const changedResults = next.matches.filter((match) => {
      const previousMatch = priorByTable.get(match.table);
      return match.result && match.result !== previousMatch?.result;
    });
    if (changedResults.length) this.emit("event", { type: "results-updated", snapshot: next, changedMatches: changedResults } satisfies TournamentEvent);
    if (JSON.stringify(previous.matches.map(pairingKey)) !== JSON.stringify(next.matches.map(pairingKey))) this.emit("event", { type: "pairings-changed", snapshot: next } satisfies TournamentEvent);
    if (!isComplete(previous.matches) && isComplete(next.matches)) this.emit("event", { type: "round-complete", snapshot: next } satisfies TournamentEvent);
  }
}

function pairingKey(match: Match) { return [match.table, match.playerOne, match.playerTwo, match.result]; }
function isComplete(matches: Match[]) { return matches.length > 0 && matches.every((match) => Boolean(match.result)); }
