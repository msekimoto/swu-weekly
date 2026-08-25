import assert from "node:assert/strict";
import test from "node:test";
import { TournamentWatcher } from "../src/tournament-watcher.js";
import type { MeleeSource } from "../src/types.js";

function source(result: string | null): MeleeSource {
  return { getRounds: async () => [{ id: 1, name: "Round 1" }], getMatches: async () => [{ table: 1, playerOne: "Leia", playerTwo: "Luke", result }], getStandings: async () => [] };
}

test("emite atualização quando um resultado chega do Melee", async () => {
  const watcher = new TournamentWatcher(source(null), "457371", 30_000);
  await watcher.poll();
  const events: string[] = [];
  watcher.on("event", (event) => events.push(event.type));
  (watcher as unknown as { source: MeleeSource }).source = source("2-0");
  await watcher.poll();
  assert.deepEqual(events, ["results-updated", "round-complete"]);
});

test("emite snapshot pronto na primeira leitura", async () => {
  const watcher = new TournamentWatcher(source(null), "457371", 30_000);
  const events: string[] = [];
  watcher.on("event", (event) => events.push(event.type));
  await watcher.poll();
  assert.deepEqual(events, ["snapshot-ready"]);
});
