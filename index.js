require('dotenv').config();

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { getDB }              = require('./src/database');
const { seedTodosCanais }    = require('./src/seeder');
const { registerCommands }   = require('./src/registerCommands');
const { handleButton, handleModal } = require('./src/modules/buttons');
const { handleCommand }      = require('./src/modules/commands');
const { startYouTubePoller } = require('./src/modules/youtube');
const { startAutoPing }      = require('./src/modules/ping');

// Servidor HTTP para o Render não cancelar o deploy
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('AlphaBot online ✅');
}).listen(PORT, () => console.log(`[HTTP] Servidor rodando na porta ${PORT}`));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

// ── READY ────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`\n✅ AlphaBot online como ${client.user.tag}`);
  console.log(`📡 Conectado em ${client.guilds.cache.size} servidor(es)\n`);

  // 1. Inicia DB
  await getDB();
  console.log('[DB] SQLite pronto.');

  // 2. Registra slash commands
  await registerCommands();

  // 3. Seed de mensagens fixas (lê DB antes de enviar)
  const guildId = process.env.GUILD_ID;
  if (guildId) {
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
      await seedTodosCanais(guild);
    } else {
      console.warn('[SEED] Guild não encontrada. Verifique o GUILD_ID no .env');
    }
  }

  // 4. Inicia poller do YouTube
  startYouTubePoller(client);

  // 5. Auto-ping para não hibernar no Render
  startAutoPing();

  console.log('\n🚀 AlphaBot pronto!\n');
});

// ── INTERAÇÕES (botões + slash commands) ─────────────────
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    }
  } catch (err) {
    console.error('[INTERACTION] Erro:', err);
    const msg = { embeds: [{ color: 0xE74C3C, description: '❌ Ocorreu um erro. Tente novamente.' }], ephemeral: true };
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg);
      } else {
        await interaction.reply(msg);
      }
    } catch (_) {}
  }
});

// ── NOVO MEMBRO ──────────────────────────────────────────
client.on('guildMemberAdd', async (member) => {
  // Dá cargo de Visitante automaticamente
  const cargoVisitante = member.guild.roles.cache.find(r => r.name === '👤 ᴠɪꜱɪᴛᴀɴᴛᴇ');
  if (cargoVisitante) {
    try { await member.roles.add(cargoVisitante); } catch (_) {}
  }

  // Ping no canal de boas-vindas
  const canal = member.guild.channels.cache.find(c => c.name === '👋・boas-vindas');
  if (canal) {
    try {
      await canal.send({ content: `👋 Bem-vindo(a) <@${member.id}>! Registre-se no canal <#${member.guild.channels.cache.find(c => c.name === '✅・registro')?.id || 'registro'}>.` });
    } catch (_) {}
  }
});

// ── ERROR HANDLING ───────────────────────────────────────
client.on('error', err => console.error('[CLIENT ERROR]', err));
process.on('unhandledRejection', err => console.error('[UNHANDLED]', err));

// ── LOGIN ────────────────────────────────────────────────
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN não encontrado no .env');
  process.exit(1);
}

client.login(token).catch(err => {
  console.error('❌ Falha ao conectar:', err.message);
  process.exit(1);
});
