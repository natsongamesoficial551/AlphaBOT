/**
 * seeder.js — Envia embeds fixas nos canais ao iniciar o bot
 * Removido: loja-coins (moeda virtual removida)
 */

const db = require('./database');
const {
  embedBoasVindas, embedRegras,
  embedXitFree, embedComoComprar,
} = require('./embeds');
const { embedAuthPayload, AUTH_CHANNEL_ID } = require('./modules/myauth');

// Canal de registro removido (XIT ID não existe mais)
// Novo registro: ao entrar no servidor, bot dá cargo visitante e orienta sobre o auth

const CANAL_NOMES = {
  'boas-vindas'  : '👋・boas-vindas',
  'regras'       : '📜・regras',
  'registro'     : '🪪・registro',
  'loja'         : '🗂️・loja',
  'logs'         : '📋・bot-logs',
  'staff'        : '🔒・staff-chat',
};

async function findChannel(guild, nome) {
  return guild.channels.cache.find(c => c.name === nome) || null;
}

async function _enviar(canal, buildFn) {
  const payload = buildFn();
  if (payload && payload.embed && payload.row) return canal.send({ embeds: [payload.embed], components: [payload.row] });
  if (payload && payload.embed)                return canal.send({ embeds: [payload.embed] });
  if (payload)                                 return canal.send({ embeds: [payload] });
}

async function seedCanal(guild, tipo, channelName, buildFn) {
  const canal = await findChannel(guild, channelName);
  if (!canal) return;

  const existing = await db.getMsgFixa(guild.id, tipo);
  if (existing) {
    try {
      await canal.messages.fetch(existing.message_id);
      console.log(`[SEED] ✓ ${tipo} já existe — skip`);
      return;
    } catch {
      await db.deleteMsgFixa(guild.id, tipo);
      console.log(`[SEED] ↻ ${tipo} sumiu, reenviando...`);
    }
  }

  const msg = await _enviar(canal, buildFn);
  await db.saveMsgFixa(guild.id, canal.id, tipo, msg.id);
  console.log(`[SEED] ✅ ${tipo} enviado (${msg.id})`);
}

async function seedCanalById(guild, tipo, canalId, buildFn) {
  if (!canalId) return;
  const canal = guild.channels.cache.get(canalId);
  if (!canal) { console.warn(`[SEED] ⚠️ Canal ${canalId} (${tipo}) não encontrado.`); return; }

  const existing = await db.getMsgFixa(guild.id, tipo);
  if (existing) {
    try {
      await canal.messages.fetch(existing.message_id);
      console.log(`[SEED] ✓ ${tipo} já existe — skip`);
      return;
    } catch {
      await db.deleteMsgFixa(guild.id, tipo);
    }
  }

  const msg = await _enviar(canal, buildFn);
  await db.saveMsgFixa(guild.id, canal.id, tipo, msg.id);
  console.log(`[SEED] ✅ ${tipo} enviado no canal ${canalId}`);
}

async function seedTodosCanais(guild) {
  console.log(`[SEED] Iniciando seed — ${guild.name}...`);
  const { embedRegistro } = require('./modules/registration');
  const { embedLoja } = require('./modules/store');

  await seedCanal(guild, 'boas-vindas',  CANAL_NOMES['boas-vindas'],  () => embedBoasVindas());
  await seedCanal(guild, 'regras',       CANAL_NOMES['regras'],       () => embedRegras());
  await seedCanal(guild, 'registro',     CANAL_NOMES['registro'],     () => embedRegistro());
  await seedCanal(guild, 'loja',         CANAL_NOMES['loja'],         () => embedLoja());
  
  console.log(`[SEED] ✅ Seed concluído!`);
}

module.exports = { seedTodosCanais };
