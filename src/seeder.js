const db = require('./database');
const {
  embedBoasVindas, embedRegras, embedRegistro,
  embedXitFree, embedComoComprar, embedLojaCoins,
} = require('./embeds');
const { embedAuthPayload, AUTH_CHANNEL_ID } = require('./modules/myauth');

const CANAL_NOMES = {
  'boas-vindas'  : '👋・boas-vindas',
  'regras'       : '📜・regras',
  'registro'     : '✅・registro',
  'xit-free'     : '🆓・xit-free',
  'como-comprar' : '🛒・como-comprar',
};

const CANAL_LOJA_COINS_ID = '1484718875450015754';

async function findChannel(guild, nome) {
  return guild.channels.cache.find(c => c.name === nome) || null;
}

async function _enviar(canal, buildFn) {
  const payload = buildFn();
  if (payload.embed && payload.row) return canal.send({ embeds: [payload.embed], components: [payload.row] });
  if (payload.embed)                return canal.send({ embeds: [payload.embed] });
  return canal.send({ embeds: [payload] });
}

// ── Seed por nome de canal ────────────────────────────────────────────────────
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
      console.log(`[SEED] ↻ ${tipo} sumiu do canal, reenviando...`);
    }
  }

  const msg = await _enviar(canal, buildFn);
  await db.saveMsgFixa(guild.id, canal.id, tipo, msg.id);
  console.log(`[SEED] ✅ ${tipo} enviado (${msg.id})`);
}

// ── Seed por ID de canal ──────────────────────────────────────────────────────
async function seedCanalById(guild, tipo, canalId, buildFn) {
  const canal = guild.channels.cache.get(canalId);
  if (!canal) {
    console.warn(`[SEED] ⚠️ Canal ID ${canalId} (${tipo}) não encontrado.`);
    return;
  }

  const existing = await db.getMsgFixa(guild.id, tipo);
  if (existing) {
    try {
      await canal.messages.fetch(existing.message_id);
      console.log(`[SEED] ✓ ${tipo} já existe — skip`);
      return;
    } catch {
      await db.deleteMsgFixa(guild.id, tipo);
      console.log(`[SEED] ↻ ${tipo} sumiu do canal, reenviando...`);
    }
  }

  const msg = await _enviar(canal, buildFn);
  await db.saveMsgFixa(guild.id, canal.id, tipo, msg.id);
  console.log(`[SEED] ✅ ${tipo} enviado no canal ${canalId} (${msg.id})`);
}

async function seedTodosCanais(guild) {
  console.log(`[SEED] Iniciando seed do servidor ${guild.name}...`);
  await seedCanal(guild, 'boas-vindas',  CANAL_NOMES['boas-vindas'],  () => embedBoasVindas());
  await seedCanal(guild, 'regras',       CANAL_NOMES['regras'],       () => embedRegras());
  await seedCanal(guild, 'registro',     CANAL_NOMES['registro'],     () => embedRegistro());
  await seedCanal(guild, 'xit-free',     CANAL_NOMES['xit-free'],     () => embedXitFree());
  await seedCanal(guild, 'como-comprar', CANAL_NOMES['como-comprar'], () => embedComoComprar());
  await seedCanalById(guild, 'loja-coins', CANAL_LOJA_COINS_ID,       () => embedLojaCoins());
  await seedCanalById(guild, 'auth',       AUTH_CHANNEL_ID,           () => embedAuthPayload());
  console.log(`[SEED] ✅ Seed concluído!`);
}

module.exports = { seedTodosCanais };
