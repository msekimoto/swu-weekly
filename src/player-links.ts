import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface PlayerLink { discordUserId: string; meleeName: string; }

export class PlayerLinkStore {
  constructor(private readonly filePath: string) {}

  async save(discordUserId: string, meleeName: string): Promise<void> {
    const links = await this.all();
    links[discordUserId] = meleeName.trim();
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(links, null, 2) + "\n", "utf8");
  }

  async get(discordUserId: string): Promise<string | undefined> { return (await this.all())[discordUserId]; }

  async all(): Promise<Record<string, string>> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }
}

export function normalizeName(name: string): string {
  return name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}
