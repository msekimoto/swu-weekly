import assert from "node:assert/strict";
import test from "node:test";
import { assignmentsForRound } from "../src/voice-assignment.js";
import type { TournamentSnapshot } from "../src/types.js";

const snapshot: TournamentSnapshot = { tournamentId: "457371", round: { id: 1, name: "Ronda 1" }, matches: [{ table: 1, playerOne: "Minnie Mouse", playerTwo: "Bat Man", result: null }], standings: [], observedAt: new Date() };

test("associa jogadores vinculados à mesa do pareamento, ignorando maiúsculas e acentos", () => {
  assert.deepEqual(assignmentsForRound(snapshot, { "discord-1": "minnie mouse", "discord-2": "BÁT MAN", "discord-3": "Outro" }), [
    { userId: "discord-1", meleeName: "minnie mouse", table: 1 },
    { userId: "discord-2", meleeName: "BÁT MAN", table: 1 }
  ]);
});
