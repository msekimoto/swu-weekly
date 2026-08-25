import type { Database } from "./database.js";

export interface PlayerLink { discordUserId: string; meleeName: string; }

export class PlayerLinkStore {
  constructor(private readonly database: Database, private readonly guildId: string) {}

  async save(discordUserId: string, meleeName: string): Promise<void> {
    await this.database.pool.query(
      `INSERT INTO swu_weekly_player_links (guild_id, discord_user_id, melee_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (guild_id, discord_user_id) DO UPDATE SET melee_name = EXCLUDED.melee_name, updated_at = now()`,
      [this.guildId, discordUserId, meleeName.trim()]
    );
  }

  async get(discordUserId: string): Promise<string | undefined> {
    const result = await this.database.pool.query<{ melee_name: string }>("SELECT melee_name FROM swu_weekly_player_links WHERE guild_id = $1 AND discord_user_id = $2", [this.guildId, discordUserId]);
    return result.rows[0]?.melee_name;
  }

  async all(): Promise<Record<string, string>> {
    const result = await this.database.pool.query<{ discord_user_id: string; melee_name: string }>("SELECT discord_user_id, melee_name FROM swu_weekly_player_links WHERE guild_id = $1", [this.guildId]);
    return Object.fromEntries(result.rows.map((row) => [row.discord_user_id, row.melee_name]));
  }
}

export function normalizeName(name: string): string {
  return name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}
