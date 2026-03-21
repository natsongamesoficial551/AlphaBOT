const { getMsgFixa, saveMsgFixa, deleteMsgFixa } = require('./database');
const {
  embedBoasVindas, embedRegras, embedRegistro,
  embedXitFree, embedComoComprar, embedLojaCoins,
} = require('./embeds');

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

async function seedCanal(guild, tipo, channelName, buildFn) {
  const canal = await findChannel(guild, channelName);
  if (!canal) return;

  const existing = getMsgFixa(guild.id, tipo);

  // Verifica se a mensagem ainda existe no Discord
  if (existing) {
    try {
      await canal.messages.fetch(existing.message_id);
      console.log(`[SEED] ✓ ${tipo} já existe — skip`);
      return;
    } catch {
      // Mensagem sumiu, deleta do DB e reenvia
      deleteMsgFixa(guild.id, tipo);
      console.log(`[SEED] ↻ ${tipo} sumiu do canal, reenviando...`);
    }
  }

  // Envia a mensagem
  const payload = buildFn();
  let msg;

  if (payload.embed && payload.row) {
    msg = await canal.send({ embeds: [payload.embed], components: [payload.row] });
  } else if (payload.embed) {
    msg = await canal.send({ embeds: [payload.embed] });
  } else {
    msg = await canal.send({ embeds: [payload] });
  }

  saveMsgFixa(guild.id, canal.id, tipo, msg.id);
  console.log(`[SEED] ✅ ${tipo} enviado (${msg.id})`);
}

async function seedTodosCanais(guild) {
  console.log(`[SEED] Iniciando seed do servidor ${guild.name}...`);

  await seedCanal(guild, 'boas-vindas',  CANAL_NOMES['boas-vindas'],  () => embedBoasVindas());
  await seedCanal(guild, 'regras',       CANAL_NOMES['regras'],       () => embedRegras());
  await seedCanal(guild, 'registro',     CANAL_NOMES['registro'],     () => embedRegistro());
  await seedCanal(guild, 'xit-free',     CANAL_NOMES['xit-free'],     () => embedXitFree());
  await seedCanal(guild, 'como-comprar', CANAL_NOMES['como-comprar'], () => embedComoComprar());

  // Loja de Coins — seed por ID fixo do canal
  await seedCanalById(guild, 'loja-coins', CANAL_LOJA_COINS_ID, () => embedLojaCoins());

  console.log(`[SEED] ✅ Seed concluído!`);
}

async function seedCanalById(guild, tipo, canalId, buildFn) {
  const canal = guild.channels.cache.get(canalId);
  if (!canal) {
    console.warn(`[SEED] ⚠️ Canal ID ${canalId} (${tipo}) não encontrado.`);
    return;
  }

  const existing = getMsgFixa(guild.id, tipo);
  if (existing) {
    try {
      await canal.messages.fetch(existing.message_id);
      console.log(`[SEED] ✓ ${tipo} já existe — skip`);
      return;
    } catch {
      deleteMsgFixa(guild.id, tipo);
      console.log(`[SEED] ↻ ${tipo} sumiu, reenviando...`);
    }
  }

  const payload = buildFn();
  let msg;
  if (payload.embed && payload.row) {
    msg = await canal.send({ embeds: [payload.embed], components: [payload.row] });
  } else if (payload.embed) {
    msg = await canal.send({ embeds: [payload.embed] });
  } else {
    msg = await canal.send({ embeds: [payload] });
  }

  saveMsgFixa(guild.id, canal.id, tipo, msg.id);
  console.log(`[SEED] ✅ ${tipo} enviado no canal ${canalId}`);
}

module.exports = { seedTodosCanais };
