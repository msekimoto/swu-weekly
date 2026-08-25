import type { Match, MeleeSource, Round, Standing } from "./types.js";

const MELEE_ORIGIN = "https://melee.gg";
const BROWSER_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
};

/** Isola os endpoints públicos e não documentados do Melee do restante do bot. */
export class MeleePublicSource implements MeleeSource {
  async getRounds(tournamentId: string): Promise<Round[]> {
    const response = await fetch(`${MELEE_ORIGIN}/Tournament/View/${encodeURIComponent(tournamentId)}`, {
      headers: { ...BROWSER_HEADERS, accept: "text/html" }
    });
    if (!response.ok) throw new Error(`Melee respondeu HTTP ${response.status} ao consultar o torneio.`);
    return extractRounds(await response.text());
  }

  async getMatches(tournamentId: string, roundId: number): Promise<Match[]> {
    const rows = await this.fetchTable("/Match/GetRoundMatches/" + roundId, matchForm(), tournamentId);
    return rows.map((row) => {
      const competitors = Array.isArray(row.Competitors) ? row.Competitors : [];
      return {
        table: numberValue(row.TableNumber),
        playerOne: competitorName(competitors[0]),
        playerTwo: competitorName(competitors[1]),
        result: text(row.ResultString) || null
      };
    }).filter((match) => match.table > 0 && match.playerOne && match.playerTwo).sort((a, b) => a.table - b.table);
  }

  async getStandings(tournamentId: string, roundId: number): Promise<Standing[]> {
    const rows = await this.fetchTable("/Standing/GetRoundStandings", standingsForm(roundId), tournamentId);
    return rows.map((row) => ({
      rank: numberValue(row.Rank), name: standingName(row), points: numberValue(row.Points), record: stripHtml(text(row.MatchRecord))
    })).filter((standing) => standing.rank > 0 && standing.name).sort((a, b) => a.rank - b.rank);
  }

  private async fetchTable(path: string, formBase: URLSearchParams, tournamentId: string): Promise<Record<string, unknown>[]> {
    const all: Record<string, unknown>[] = [];
    let start = 0;
    let total = Infinity;
    while (start < total) {
      const form = new URLSearchParams(formBase);
      form.set("start", String(start));
      form.set("draw", String(Math.floor(start / 250) + 1));
      const response = await fetch(MELEE_ORIGIN + path, { method: "POST", headers: { ...BROWSER_HEADERS, accept: "application/json", "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "x-requested-with": "XMLHttpRequest", referer: `${MELEE_ORIGIN}/Tournament/View/${encodeURIComponent(tournamentId)}` }, body: form });
      if (!response.ok) throw new Error(`Melee respondeu HTTP ${response.status} ao consultar a rodada.`);
      const page = await response.json() as { data?: unknown; recordsTotal?: unknown; recordsFiltered?: unknown };
      if (!Array.isArray(page.data) || page.data.length === 0) break;
      all.push(...page.data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object"));
      total = numberValue(page.recordsFiltered) || numberValue(page.recordsTotal) || all.length;
      start += page.data.length;
    }
    return all;
  }
}

export function extractRounds(html: string): Round[] {
  const rounds = new Map<number, Round>();
  const pattern = /data-name=["']([^"']+)["'][^>]*data-id=["'](\d+)["']|data-id=["'](\d+)["'][^>]*data-name=["']([^"']+)["']/gi;
  for (const match of html.matchAll(pattern)) {
    const id = Number(match[2] ?? match[3]);
    const name = (match[1] ?? match[4] ?? "").trim();
    if (Number.isInteger(id) && name) rounds.set(id, { id, name });
  }
  return [...rounds.values()];
}

function matchForm() { return new URLSearchParams({ length: "250", "order[0][column]": "0", "order[0][dir]": "asc", "columns[0][data]": "TableNumber", "columns[1][data]": "PodNumber", "columns[2][data]": "Teams", "columns[3][data]": "Decklists", "columns[4][data]": "ResultString" }); }
function standingsForm(roundId: number) { return new URLSearchParams({ length: "250", "order[0][column]": "0", "order[0][dir]": "asc", "columns[0][data]": "Rank", "columns[1][data]": "Player", "columns[2][data]": "Decklists", "columns[3][data]": "MatchRecord", "columns[4][data]": "GameRecord", "columns[5][data]": "Points", roundId: String(roundId) }); }
function text(value: unknown): string { return typeof value === "string" ? value : typeof value === "number" ? String(value) : ""; }
function stripHtml(value: string): string { return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
function numberValue(value: unknown): number { const parsed = Number(stripHtml(text(value)).replace(/[^\d.-]/g, "")); return Number.isFinite(parsed) ? parsed : 0; }
function competitorName(value: unknown): string { const player = (value as { Team?: { Players?: Array<{ DisplayName?: unknown; Username?: unknown }> } })?.Team?.Players?.[0]; return text(player?.DisplayName) || text(player?.Username); }
function standingName(value: Record<string, unknown>): string { const player = (value.Team as { Players?: Array<{ DisplayName?: unknown; Username?: unknown }> } | undefined)?.Players?.[0]; return text(player?.DisplayName) || text(player?.Username) || stripHtml(text(value.Player)); }
