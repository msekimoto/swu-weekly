import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`A variável ${name} é obrigatória.`);
  return value;
}

function databaseUrl(): string {
  const direct = process.env.DATABASE_URL?.trim();
  if (direct) return direct;
  const encoded = process.env.DATABASE_URL_BASE64?.trim();
  if (encoded) return Buffer.from(encoded, "base64").toString("utf8");
  throw new Error("A variável DATABASE_URL ou DATABASE_URL_BASE64 é obrigatória.");
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} deve ser um inteiro positivo.`);
  return value;
}

export function loadConfig() {
  return {
    discordToken: required("DISCORD_TOKEN"),
    applicationId: required("DISCORD_APPLICATION_ID"),
    guildId: process.env.DISCORD_GUILD_ID?.trim() || undefined,
    channelId: required("DISCORD_CHANNEL_ID"),
    databaseUrl: databaseUrl(),
    tournamentId: required("MELEE_TOURNAMENT_ID"),
    pollIntervalMs: positiveInteger("POLL_INTERVAL_SECONDS", 30) * 1_000,
    roundDurationMs: positiveInteger("ROUND_DURATION_MINUTES", 60) * 60_000,
    timezone: process.env.TIMEZONE?.trim() || "America/Sao_Paulo",
    announceOnStart: process.env.ANNOUNCE_ON_START !== "false"
  };
}

export type BotConfig = ReturnType<typeof loadConfig>;
