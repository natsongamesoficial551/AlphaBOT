require('dotenv').config();

console.log('=== ALPHABOT DEBUG ===');
console.log('[1] dotenv carregado');
console.log('[ENV] TOKEN:', process.env.DISCORD_TOKEN ? `✅ (${process.env.DISCORD_TOKEN.length} chars)` : '❌ VAZIO');
console.log('[ENV] GUILD:', process.env.GUILD_ID || '❌ VAZIO');
console.log('[ENV] NODE_VERSION:', process.version);

// HTTP primeiro — Render precisa de porta
const http = require('http');
console.log('[2] http carregado');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('AlphaBot online ✅');
}).listen(PORT, () => console.log(`[3] HTTP na porta ${PORT}`));

console.log('[4] Carregando discord.js...');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
console.log('[5] discord.js carregado');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});
console.log('[6] Client criado');

client.once('ready', async () => {
  console.log(`[7] ✅ READY! Bot: ${client.user.tag}`);

  const { getDB }              = require('./src/database');
  const { seedTodosCanais }    = require('./src/seeder');
  const { registerCommands }   = require('./src/registerCommands');
  const { startYouTubePoller } = require('./src/modules/youtube');
  const { startAutoPing }      = require('./src/modules/ping');

  console.log('[8] Módulos importados');

  await getDB();
  console.log('[9] DB pronto');

  await registerCommands();
  console.log('[10] Commands registrados');

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (guild) {
    await seedTodosCanais(guild);
    console.log('[11] Seed concluído');
  } else {
    console.warn('[11] ⚠️ Guild não encontrada');
  }

  startYouTubePoller(client);
  startAutoPing();
  console.log('[12] 🚀 Bot 100% pronto!');
});

client.on('interactionCreate', async (interaction) => {
  try {
    const { handleButton, handleModal } = require('./src/modules/buttons');
    const { handleCommand }             = require('./src/modules/commands');
    if (interaction.isButton())               await handleButton(interaction);
    else if (interaction.isChatInputCommand()) await handleCommand(interaction);
    else if (interaction.isModalSubmit())      await handleModal(interaction);
  } catch (err) {
    console.error('[INTERACTION]', err.message);
    try {
      const payload = { embeds: [{ color: 0xE74C3C, description: `❌ Erro: \`${err.message}\`` }], flags: 64 };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.reply(payload);
    } catch (_) {}
  }
});

client.on('guildMemberAdd', async (member) => {
  const cargoVisitante = member.guild.roles.cache.find(r => r.name === '👤 ᴠɪꜱɪᴛᴀɴᴛᴇ');
  if (cargoVisitante) try { await member.roles.add(cargoVisitante); } catch (_) {}
  const chBV  = member.guild.channels.cache.find(c => c.name === '👋・boas-vindas');
  const chReg = member.guild.channels.cache.find(c => c.name === '✅・registro');
  if (chBV) try { await chBV.send(`👋 Bem-vindo(a) <@${member.id}>! Registre-se em ${chReg ? `<#${chReg.id}>` : '#registro'}.`); } catch (_) {}
});

client.on('error',   err => console.error('[CLIENT ERROR]', err.message));
client.on('warn',    msg => console.warn('[CLIENT WARN]', msg));
client.on('debug',   msg => { if (msg.includes('error') || msg.includes('fail')) console.log('[DEBUG]', msg); });
process.on('unhandledRejection', err => console.error('[UNHANDLED]', err?.message || err));
process.on('uncaughtException',  err => console.error('[UNCAUGHT]',  err?.message || err));

const token = process.env.DISCORD_TOKEN;
if (!token) { console.error('❌ TOKEN VAZIO — abortando'); process.exit(1); }

console.log('[LOGIN] Iniciando login...');
client.login(token)
  .then(() => console.log('[LOGIN] ✅ login() resolveu'))
  .catch(err => {
    console.error('[LOGIN] ❌ ERRO:', err.message);
    console.error('[LOGIN] Stack:', err.stack);
    process.exit(1);
  });

console.log('[FIM] Fim do script síncrono — aguardando eventos...');
