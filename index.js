require('dotenv').config();

const _token = process.env.DISCORD_TOKEN;
const _guild = process.env.GUILD_ID;
console.log(`[ENV] DISCORD_TOKEN: ${_token ? '✅ carregado' : '❌ NÃO ENCONTRADO'}`);
console.log(`[ENV] GUILD_ID:      ${_guild ? '✅ ' + _guild : '❌ NÃO ENCONTRADO'}`);

const { Client, GatewayIntentBits, Partials } = require('discord.js');

// ── HTTP server (Render precisa de porta aberta) ──────────
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('AlphaBot online ✅');
}).listen(PORT, () => console.log(`[HTTP] Porta ${PORT} aberta`));

// ── Cliente Discord ───────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

// ── READY ─────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ AlphaBot online como ${client.user.tag}`);
  console.log(`📡 ${client.guilds.cache.size} servidor(es)`);

  // Lazy load dos módulos pesados APÓS o login
  const { getDB }              = require('./src/database');
  const { seedTodosCanais }    = require('./src/seeder');
  const { registerCommands }   = require('./src/registerCommands');
  const { startYouTubePoller } = require('./src/modules/youtube');
  const { startAutoPing }      = require('./src/modules/ping');

  console.log('[BOOT] Carregando banco de dados...');
  await getDB();
  console.log('[BOOT] ✅ DB pronto');

  console.log('[BOOT] Registrando slash commands...');
  await registerCommands();
  console.log('[BOOT] ✅ Commands registrados');

  const guildId = process.env.GUILD_ID;
  if (guildId) {
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
      console.log('[BOOT] Iniciando seed...');
      await seedTodosCanais(guild);
      console.log('[BOOT] ✅ Seed concluído');
    } else {
      console.warn('[BOOT] ⚠️ Guild não encontrada. Verifique o GUILD_ID.');
    }
  }

  startYouTubePoller(client);
  startAutoPing();

  console.log('🚀 AlphaBot 100% pronto!');
});

// ── INTERAÇÕES ────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  try {
    const { handleButton, handleModal } = require('./src/modules/buttons');
    const { handleCommand }             = require('./src/modules/commands');

    if (interaction.isButton())          await handleButton(interaction);
    else if (interaction.isChatInputCommand()) await handleCommand(interaction);
    else if (interaction.isModalSubmit()) await handleModal(interaction);
  } catch (err) {
    console.error('[INTERACTION]', err.message);
    try {
      const payload = { embeds: [{ color: 0xE74C3C, description: `❌ Erro: \`${err.message}\`` }], flags: 64 };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.reply(payload);
    } catch (_) {}
  }
});

// ── NOVO MEMBRO ───────────────────────────────────────────
client.on('guildMemberAdd', async (member) => {
  const cargoVisitante = member.guild.roles.cache.find(r => r.name === '👤 ᴠɪꜱɪᴛᴀɴᴛᴇ');
  if (cargoVisitante) try { await member.roles.add(cargoVisitante); } catch (_) {}

  const chBV = member.guild.channels.cache.find(c => c.name === '👋・boas-vindas');
  const chReg = member.guild.channels.cache.find(c => c.name === '✅・registro');
  if (chBV) try {
    await chBV.send(`👋 Bem-vindo(a) <@${member.id}>! Registre-se em ${chReg ? `<#${chReg.id}>` : '#registro'}.`);
  } catch (_) {}
});

// ── ERRORS ────────────────────────────────────────────────
client.on('error', err => console.error('[CLIENT ERROR]', err.message));
process.on('unhandledRejection', err => console.error('[UNHANDLED]', err?.message || err));

// ── LOGIN ─────────────────────────────────────────────────
if (!_token) { console.error('❌ DISCORD_TOKEN não encontrado'); process.exit(1); }

console.log('[LOGIN] Conectando ao Discord...');
client.login(_token)
  .then(() => console.log('[LOGIN] ✅ Conectado!'))
  .catch(err => { console.error('[LOGIN] ❌', err.message); process.exit(1); });
