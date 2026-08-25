# SWU Discord Bot

Bot de acompanhamento para torneios semanais de **Star Wars: Unlimited**. O Melee é a fonte oficial: o bot apenas consulta os pareamentos, resultados e classificação e publica mudanças no Discord.

## O que ele faz

- Publica uma rodada e seus pareamentos quando o Melee lança a rodada.
- Avisa aos 30, 10 e 5 minutos restantes (a duração é configurável).
- Publica resultados que chegarem ao Melee e a classificação quando a rodada termina.
- Disponibiliza `/rodada`, `/classificacao`, `/melee` e `/publicar-rodada`.
- Move jogadores vinculados que estejam em voz para a sala `01`–`16` correspondente à mesa.

O bot não envia resultados nem cria pareamentos no Melee. Essas ações continuam no Tournament Controller, que é a fonte de verdade.

## Configuração local

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

No Discord Developer Portal, crie uma aplicação/bot e habilite os escopos `bot` e `applications.commands`. Convide-o para o servidor com permissão de ver/enviar mensagens no canal configurado. Preencha no `.env`:

- `DISCORD_TOKEN`, `DISCORD_APPLICATION_ID` e `DISCORD_CHANNEL_ID`.
- `DISCORD_GUILD_ID` no servidor de testes, para que os comandos sejam registrados imediatamente.
- `MELEE_TOURNAMENT_ID=457371` para o torneio teste atual.
- `DATABASE_URL` com a connection string do Neon. O bot cria suas tabelas automaticamente na primeira inicialização.

## Salas de voz por mesa

Crie as salas de voz com o número de mesa no início do nome, por exemplo `01 | HOME ONE`, `02 | VICTOR TWO`, até `16`. Dê ao cargo do bot a permissão **Move Members**. Cada jogador deve executar uma única vez:

```
/vincular-melee nome:Seu nome no Melee
```

Ao publicar uma nova rodada, o bot move os jogadores vinculados que já estiverem em uma sala de voz. Quem entrar depois é movido automaticamente para a sala da mesa atual. Um organizador pode executar `/mover-rodada` para mover novamente todos os jogadores conectados.

Os vínculos e o horário da rodada são persistidos no PostgreSQL. Assim, reinicializações não apagam os jogadores vinculados nem reiniciam o cronômetro da rodada atual.

## Limitações conhecidas

O Melee não oferece uma API pública estável para esses dados. O bot usa os mesmos endpoints públicos que a página de torneio usa, isolados em `src/melee-source.ts`; se o Melee mudar o HTML/endpoints, apenas esse adaptador precisará ser ajustado. Nenhuma credencial do Melee é armazenada.
