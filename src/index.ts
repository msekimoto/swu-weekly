import { Client, Events, GatewayIntentBits, PermissionFlagsBits, REST, Routes, SlashCommandBuilder, type GuildMember, type SendableChannels } from "discord.js";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { roundEmbed, resultsText, standingsEmbed } from "./messages.js";
import { MeleePublicSource } from "./melee-source.js";
import { PlayerLinkStore } from "./player-links.js";
import { TournamentWatcher, type TournamentEvent } from "./tournament-watcher.js";
import type { TournamentSnapshot } from "./types.js";
import { assignmentsForRound, moveMemberToTable } from "./voice-assignment.js";

const config = loadConfig();
const commands = [
  new SlashCommandBuilder().setName("rodada").setDescription("Mostra os pareamentos da rodada atual no Melee."),
  new SlashCommandBuilder().setName("classificacao").setDescription("Mostra a classificação atual do Melee."),
  new SlashCommandBuilder().setName("melee").setDescription("Mostra o link do torneio oficial no Melee."),
  new SlashCommandBuilder().setName("vincular-melee").setDescription("Vincula sua conta Discord ao seu nome exibido no Melee.").addStringOption((option) => option.setName("nome").setDescription("Nome exatamente como aparece no Melee").setRequired(true)),
  new SlashCommandBuilder().setName("minha-vinculacao").setDescription("Mostra seu nome do Melee vinculado."),
  new SlashCommandBuilder().setName("publicar-rodada").setDescription("Publica os pareamentos atuais no canal de avisos.").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName("mover-rodada").setDescription("Move os jogadores conectados para as salas da rodada atual.").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map((command) => command.toJSON());

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const watcher = new TournamentWatcher(new MeleePublicSource(), config.tournamentId, config.pollIntervalMs);
const playerLinks = new PlayerLinkStore(join(process.cwd(), "data", "player-links.json"));
let roundStartedAt: Date | undefined;
let timerRoundId: number | undefined;

client.once(Events.ClientReady, async (readyClient) => {
  try {
    await registerCommands();
    watcher.start();
    console.log(`Bot conectado como ${readyClient.user.tag}; acompanhando Melee ${config.tournamentId}.`);
  } catch (error) {
    console.error("Não foi possível registrar os comandos. Confirme que o bot foi instalado no servidor configurado.", error);
    client.destroy();
    process.exitCode = 1;
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const snapshot = watcher.snapshot;
  if (interaction.commandName === "melee") return void interaction.reply({ content: `Fonte oficial: https://melee.gg/Tournament/View/${config.tournamentId}`, ephemeral: true });
  if (interaction.commandName === "vincular-melee") {
    const meleeName = interaction.options.getString("nome", true).trim();
    await playerLinks.save(interaction.user.id, meleeName);
    return void interaction.reply({ content: `Conta vinculada a **${meleeName}**. Entre em um canal de voz para ser movido à sua mesa quando a rodada estiver ativa.`, ephemeral: true });
  }
  if (interaction.commandName === "minha-vinculacao") {
    const meleeName = await playerLinks.get(interaction.user.id);
    return void interaction.reply({ content: meleeName ? `Seu nome vinculado no Melee é **${meleeName}**.` : "Você ainda não vinculou sua conta. Use `/vincular-melee nome:<seu nome no Melee>`.", ephemeral: true });
  }
  if (!snapshot) return void interaction.reply({ content: "Ainda estou buscando a rodada atual no Melee.", ephemeral: true });
  if (interaction.commandName === "rodada") return void interaction.reply({ embeds: [roundEmbed(snapshot)] });
  if (interaction.commandName === "classificacao") return void interaction.reply({ embeds: [standingsEmbed(snapshot)] });
  if (interaction.commandName === "publicar-rodada") { await publishRound(snapshot); return void interaction.reply({ content: "Pareamentos publicados.", ephemeral: true }); }
  if (interaction.commandName === "mover-rodada") { const moved = await moveRoundPlayers(snapshot); return void interaction.reply({ content: `${moved} jogador(es) conectado(s) movido(s) para suas mesas.`, ephemeral: true }); }
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  if (!newState.channelId || newState.channelId === oldState.channelId || !newState.member || !watcher.snapshot) return;
  void movePlayerIfAssigned(newState.member, watcher.snapshot).catch((error) => console.error("Falha ao mover jogador que entrou no canal de voz", error));
});

watcher.on("event", async (event: TournamentEvent) => {
  try {
    if (event.type === "snapshot-ready") {
      if (config.announceOnStart) await publishRound(event.snapshot);
      else scheduleRoundTimers(event.snapshot);
    }
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
  const moved = await moveRoundPlayers(snapshot);
  console.log(`${moved} jogador(es) movido(s) para as salas de ${snapshot.round.name}.`);
  scheduleRoundTimers(snapshot);
}

async function moveRoundPlayers(snapshot: TournamentSnapshot): Promise<number> {
  if (!config.guildId) throw new Error("DISCORD_GUILD_ID é obrigatório para mover jogadores.");
  const guild = await client.guilds.fetch(config.guildId);
  const assignments = assignmentsForRound(snapshot, await playerLinks.all());
  let moved = 0;
  for (const assignment of assignments) {
    try {
      const member = await guild.members.fetch(assignment.userId);
      if (await moveMemberToTable(guild, member, assignment.table)) moved += 1;
    } catch (error) {
      console.warn(`Não foi possível mover ${assignment.meleeName} para a mesa ${assignment.table}.`, error);
    }
  }
  return moved;
}

async function movePlayerIfAssigned(member: GuildMember, snapshot: TournamentSnapshot): Promise<void> {
  const meleeName = await playerLinks.get(member.id);
  if (!meleeName) return;
  const assignment = assignmentsForRound(snapshot, { [member.id]: meleeName })[0];
  if (assignment && await moveMemberToTable(member.guild, member, assignment.table)) console.log(`${meleeName} movido para a mesa ${assignment.table}.`);
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
