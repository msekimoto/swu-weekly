import { Client, Events, GatewayIntentBits, PermissionFlagsBits, REST, Routes, SlashCommandBuilder, type SendableChannels } from "discord.js";
import { loadConfig } from "./config.js";
import { roundEmbed, resultsText, standingsEmbed } from "./messages.js";
import { MeleePublicSource } from "./melee-source.js";
import { TournamentWatcher, type TournamentEvent } from "./tournament-watcher.js";
import type { TournamentSnapshot } from "./types.js";

const config = loadConfig();
const commands = [
  new SlashCommandBuilder().setName("rodada").setDescription("Mostra os pareamentos da rodada atual no Melee."),
  new SlashCommandBuilder().setName("classificacao").setDescription("Mostra a classificação atual do Melee."),
  new SlashCommandBuilder().setName("melee").setDescription("Mostra o link do torneio oficial no Melee."),
  new SlashCommandBuilder().setName("publicar-rodada").setDescription("Publica os pareamentos atuais no canal de avisos.").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map((command) => command.toJSON());

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const watcher = new TournamentWatcher(new MeleePublicSource(), config.tournamentId, config.pollIntervalMs);
let roundStartedAt: Date | undefined;
let timerRoundId: number | undefined;

client.once(Events.ClientReady, async (readyClient) => {
  try {
    await registerCommands();
    const snapshot = await watcher.poll();
    if (config.announceOnStart) await publishRound(snapshot);
    else scheduleRoundTimers(snapshot);
    watcher.start();
    console.log(`Bot conectado como ${readyClient.user.tag}; acompanhando Melee ${config.tournamentId}.`);
  } catch (error) {
    console.error("Não foi possível iniciar o bot. Confirme que ele foi instalado no servidor configurado e que possui acesso ao canal de anúncios.", error);
    client.destroy();
    process.exitCode = 1;
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const snapshot = watcher.snapshot;
  if (interaction.commandName === "melee") return void interaction.reply({ content: `Fonte oficial: https://melee.gg/Tournament/View/${config.tournamentId}`, ephemeral: true });
  if (!snapshot) return void interaction.reply({ content: "Ainda estou buscando a rodada atual no Melee.", ephemeral: true });
  if (interaction.commandName === "rodada") return void interaction.reply({ embeds: [roundEmbed(snapshot)] });
  if (interaction.commandName === "classificacao") return void interaction.reply({ embeds: [standingsEmbed(snapshot)] });
  if (interaction.commandName === "publicar-rodada") { await publishRound(snapshot); return void interaction.reply({ content: "Pareamentos publicados.", ephemeral: true }); }
});

watcher.on("event", async (event: TournamentEvent) => {
  try {
    if (event.type === "round-started") await publishRound(event.snapshot);
    if (event.type === "pairings-changed") await (await announcements()).send({ content: "Os pareamentos foram atualizados no Melee.", embeds: [roundEmbed(event.snapshot, `⚔️ ${event.snapshot.round.name} atualizada`)] });
    if (event.type === "results-updated") await (await announcements()).send(`Resultado atualizado no Melee:\n${resultsText(event.changedMatches)}`);
    if (event.type === "round-complete") await (await announcements()).send({ content: `✅ ${event.snapshot.round.name} concluída.`, embeds: [standingsEmbed(event.snapshot)] });
  } catch (error) { console.error("Falha ao publicar atualização no Discord", error); }
});
watcher.on("error", (error) => console.error("Falha ao consultar o Melee", error));

async function publishRound(snapshot: TournamentSnapshot) {
  roundStartedAt = new Date();
  await (await announcements()).send({ embeds: [roundEmbed(snapshot)] });
  scheduleRoundTimers(snapshot);
}

function scheduleRoundTimers(snapshot: TournamentSnapshot) {
  if (timerRoundId === snapshot.round.id) return;
  timerRoundId = snapshot.round.id;
  roundStartedAt ??= new Date();
  const alerts = [30, 10, 5];
  for (const minutesRemaining of alerts) {
    const delay = config.roundDurationMs - minutesRemaining * 60_000 - (Date.now() - roundStartedAt.getTime());
    if (delay > 0) setTimeout(() => void sendTimerAlert(minutesRemaining, snapshot.round.name), delay);
  }
}

async function sendTimerAlert(minutesRemaining: number, roundName: string) {
  await (await announcements()).send(`⏰ **${minutesRemaining} minutos restantes** em ${roundName}. Registrem o resultado no Melee quando a partida terminar.`);
}

async function announcements(): Promise<SendableChannels> {
  const channel = await client.channels.fetch(config.channelId);
  if (!channel?.isSendable()) throw new Error("DISCORD_CHANNEL_ID não é um canal de texto válido.");
  return channel;
}

async function registerCommands() {
  const rest = new REST().setToken(config.discordToken);
  const route = config.guildId ? Routes.applicationGuildCommands(config.applicationId, config.guildId) : Routes.applicationCommands(config.applicationId);
  await rest.put(route, { body: commands });
}

process.on("SIGINT", () => { watcher.stop(); client.destroy(); process.exit(0); });
client.login(config.discordToken);
