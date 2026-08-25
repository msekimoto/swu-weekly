import { Pool } from "pg";

export class Database {
  readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 3, idleTimeoutMillis: 60_000 });
    this.pool.on("error", (error) => console.error("Conexão Neon perdida; o pool tentará reconectar na próxima consulta.", error));
  }

  async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS swu_weekly_player_links (
        guild_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        melee_name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (guild_id, discord_user_id)
      );
      CREATE TABLE IF NOT EXISTS swu_weekly_round_state (
        guild_id TEXT NOT NULL,
        tournament_id TEXT NOT NULL,
        round_id BIGINT NOT NULL,
        round_name TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (guild_id, tournament_id)
      );
    `);
  }

  async close(): Promise<void> { await this.pool.end(); }
}

export interface StoredRoundState { roundId: number; startedAt: Date; }

export class RoundStateStore {
  constructor(private readonly database: Database) {}

  async get(guildId: string, tournamentId: string): Promise<StoredRoundState | undefined> {
    const result = await this.database.pool.query<{ round_id: string; started_at: Date }>(
      "SELECT round_id, started_at FROM swu_weekly_round_state WHERE guild_id = $1 AND tournament_id = $2",
      [guildId, tournamentId]
    );
    const row = result.rows[0];
    return row ? { roundId: Number(row.round_id), startedAt: new Date(row.started_at) } : undefined;
  }

  async save(guildId: string, tournamentId: string, roundId: number, roundName: string, startedAt: Date): Promise<void> {
    await this.database.pool.query(
      `INSERT INTO swu_weekly_round_state (guild_id, tournament_id, round_id, round_name, started_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (guild_id, tournament_id) DO UPDATE SET round_id = EXCLUDED.round_id, round_name = EXCLUDED.round_name, started_at = EXCLUDED.started_at, updated_at = now()`,
      [guildId, tournamentId, roundId, roundName, startedAt]
    );
  }
}
