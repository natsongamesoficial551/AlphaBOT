/**
 * database.js — Turso (SQLite na nuvem, gratuito)
 *
 * Configurar no Render → Environment Variables:
 *   TURSO_URL    = libsql://seu-banco.turso.io
 *   TURSO_TOKEN  = eyJ...  (token do Turso)
 */

let client;
let _ready = false;

async function getDB() {
  if (_ready) return client;

  const url   = process.env.TURSO_URL;
  const token = process.env.TURSO_TOKEN;
  const { createClient } = require('@libsql/client');

  if (url && token) {
    client = createClient({ url, authToken: token });
    console.log('[DB] ✅ Conectado ao Turso (nuvem persistente)');
  } else {
    const path = require('path');
    const fs   = require('fs');
    const dir  = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    client = createClient({ url: `file:${path.join(dir, 'alphabot.db')}` });
    console.warn('[DB] ⚠️  TURSO_URL/TURSO_TOKEN não definidos — usando SQLite LOCAL (some no Render!)');
  }

  await _createTables();
  _ready = true;
  return client;
}

async function _exec(sql, args = []) {
  return client.execute({ sql, args });
}

async function queryAsync(sql, params = []) {
  await getDB();
  const result = await client.execute({ sql, args: params });
  return result.rows.map(row => {
    const obj = {};
    result.columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

async function getAsync(sql, params = []) {
  const rows = await queryAsync(sql, params);
  return rows[0] || null;
}

// Shims síncronos mantidos para não quebrar código legado simples
// (retornam vazio — só use queryAsync/getAsync em código novo)
function run(sql, params = []) {
  _exec(sql, params).catch(e => console.error('[DB run]', e.message));
}
function query() { return []; }
function get()   { return null; }

async function _createTables() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS mensagens_fixas (
      id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL,
      canal_id TEXT NOT NULL, tipo TEXT NOT NULL, message_id TEXT NOT NULL,
      UNIQUE(guild_id, tipo))`,
    `CREATE TABLE IF NOT EXISTS membros (
      id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT UNIQUE NOT NULL,
      username TEXT, xit_id TEXT UNIQUE,
      registrado_em TEXT DEFAULT (datetime('now','localtime')))`,
    `CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, descricao TEXT,
      tipo TEXT DEFAULT 'pago', preco TEXT, preco_coins INTEGER DEFAULT 0,
      link TEXT, imagem_url TEXT, categoria TEXT DEFAULT 'geral',
      ativo INTEGER DEFAULT 1, message_id TEXT, canal_id TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime')))`,
    `CREATE TABLE IF NOT EXISTS carteiras (
      id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT UNIQUE NOT NULL,
      saldo INTEGER DEFAULT 0,
      atualizado_em TEXT DEFAULT (datetime('now','localtime')))`,
    `CREATE TABLE IF NOT EXISTS transacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT NOT NULL,
      tipo TEXT NOT NULL, quantidade INTEGER NOT NULL, descricao TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime')))`,
    `CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, produto_id INTEGER,
      produto_nome TEXT, comprador_id TEXT NOT NULL, comprador_nome TEXT,
      status TEXT DEFAULT 'aguardando', mp_payment_id TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime')), confirmado_em TEXT)`,
    `CREATE TABLE IF NOT EXISTS yt_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT UNIQUE NOT NULL,
      canal_id TEXT, yt_url TEXT, ultimo_video_id TEXT, ativo INTEGER DEFAULT 1)`,
    `CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, tipo TEXT,
      descricao TEXT, autor_id TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime')))`,
    `CREATE TABLE IF NOT EXISTS auth_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT UNIQUE NOT NULL,
      discord_tag TEXT, nome_completo TEXT NOT NULL, username TEXT NOT NULL,
      password_hash TEXT NOT NULL, status TEXT DEFAULT 'pendente',
      staff_msg_id TEXT, criado_em TEXT DEFAULT (datetime('now','localtime')))`,
    `CREATE TABLE IF NOT EXISTS auth_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT UNIQUE NOT NULL,
      discord_tag TEXT, nome_completo TEXT, username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, auth_key TEXT UNIQUE NOT NULL, hwid TEXT,
      ultimo_heartbeat TEXT, expiry_adm TEXT,
      ativo INTEGER DEFAULT 1, criado_em TEXT DEFAULT (datetime('now','localtime')))`,
    `CREATE TABLE IF NOT EXISTS auth_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sessionid TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL, criado_em TEXT DEFAULT (datetime('now','localtime')),
      expira_em TEXT)`,
    `CREATE TABLE IF NOT EXISTS auth_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, acao TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime')))`,
    `CREATE TABLE IF NOT EXISTS pix_pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comprador_id TEXT NOT NULL,
      comprador_tag TEXT,
      pacote INTEGER NOT NULL,
      valor_reais TEXT NOT NULL,
      nome_completo TEXT NOT NULL,
      cpf TEXT NOT NULL,
      telefone TEXT NOT NULL,
      status TEXT DEFAULT 'aguardando',
      staff_dm_msg_id TEXT,
      guild_id TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime')),
      resolvido_em TEXT)`,
  ];
  for (const sql of stmts) {
    await client.execute({ sql, args: [] });
  }
  // Migrations
  const migrations = [
    { table: 'produtos', column: 'tipo',              def: `TEXT DEFAULT 'pago'` },
    { table: 'produtos', column: 'preco_coins',        def: `INTEGER DEFAULT 0` },
    { table: 'produtos', column: 'imagem_url',         def: `TEXT` },
    { table: 'produtos', column: 'imagem_url_banner',  def: `TEXT` },
    { table: 'produtos', column: 'recursos',           def: `TEXT DEFAULT ''` },
    { table: 'produtos', column: 'categoria',          def: `TEXT DEFAULT 'geral'` },
    { table: 'produtos', column: 'message_id',         def: `TEXT` },
    { table: 'produtos', column: 'canal_id',           def: `TEXT` },
    { table: 'membros',  column: 'xit_id',             def: `TEXT` },
    { table: 'pedidos',  column: 'mp_payment_id',      def: `TEXT` },
  ];
  for (const m of migrations) {
    try { await client.execute({ sql: `ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.def}`, args: [] }); } catch (_) {}
  }
}

// ── Mensagens fixas ───────────────────────────────────────────────────────────
async function getMsgFixa(guildId, tipo) {
  return getAsync(`SELECT * FROM mensagens_fixas WHERE guild_id=? AND tipo=?`, [guildId, tipo]);
}
async function saveMsgFixa(guildId, canalId, tipo, messageId) {
  await _exec(
    `INSERT INTO mensagens_fixas (guild_id, canal_id, tipo, message_id) VALUES (?,?,?,?)
     ON CONFLICT(guild_id, tipo) DO UPDATE SET canal_id=excluded.canal_id, message_id=excluded.message_id`,
    [guildId, canalId, tipo, messageId]
  );
}
async function deleteMsgFixa(guildId, tipo) {
  await _exec(`DELETE FROM mensagens_fixas WHERE guild_id=? AND tipo=?`, [guildId, tipo]);
}

// ── Membros ───────────────────────────────────────────────────────────────────
async function registrarMembro(discordId, username, xitId) {
  await _exec(`INSERT OR IGNORE INTO membros (discord_id, username, xit_id) VALUES (?,?,?)`, [discordId, username, xitId]);
}
async function membroExiste(discordId) {
  return !!(await getAsync(`SELECT id FROM membros WHERE discord_id=?`, [discordId]));
}
async function xitIdEmUso(xitId) {
  return !!(await getAsync(`SELECT id FROM membros WHERE xit_id=?`, [xitId]));
}
async function getMembro(discordId) {
  return getAsync(`SELECT * FROM membros WHERE discord_id=?`, [discordId]);
}
async function totalMembros() {
  return (await getAsync(`SELECT COUNT(*) as total FROM membros`))?.total || 0;
}

// ── Produtos ──────────────────────────────────────────────────────────────────
async function addProduto(nome, descricao, preco, precoCoins, link, imagemUrl, categoria, tipo = 'pago', imagemUrlBanner = '', recursos = '') {
  const r = await _exec(
    `INSERT INTO produtos (nome,descricao,tipo,preco,preco_coins,link,imagem_url,categoria,imagem_url_banner,recursos) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [nome, descricao, tipo, preco || 'Grátis', precoCoins || 0, link || '', imagemUrl || '', categoria || 'geral', imagemUrlBanner || '', recursos || '']
  );
  return getAsync(`SELECT * FROM produtos WHERE id=?`, [Number(r.lastInsertRowid)]);
}
async function listarProdutos(tipo = null) {
  if (tipo) return queryAsync(`SELECT * FROM produtos WHERE ativo=1 AND tipo=? ORDER BY id DESC`, [tipo]);
  return queryAsync(`SELECT * FROM produtos WHERE ativo=1 ORDER BY id DESC`);
}
async function getProduto(id) { return getAsync(`SELECT * FROM produtos WHERE id=? AND ativo=1`, [id]); }
async function deletarProduto(id) { await _exec(`UPDATE produtos SET ativo=0 WHERE id=?`, [id]); }
async function saveProdutoMsg(id, messageId, canalId) {
  await _exec(`UPDATE produtos SET message_id=?, canal_id=? WHERE id=?`, [messageId, canalId, id]);
}

// ── Carteiras ─────────────────────────────────────────────────────────────────
async function getCarteira(discordId) {
  let c = await getAsync(`SELECT * FROM carteiras WHERE discord_id=?`, [discordId]);
  if (!c) {
    await _exec(`INSERT OR IGNORE INTO carteiras (discord_id, saldo) VALUES (?,0)`, [discordId]);
    c = await getAsync(`SELECT * FROM carteiras WHERE discord_id=?`, [discordId]);
  }
  return c;
}
async function getSaldo(discordId) { return (await getCarteira(discordId))?.saldo || 0; }
async function adicionarSaldo(discordId, quantidade, descricao = 'Crédito') {
  await _exec(
    `INSERT INTO carteiras (discord_id, saldo) VALUES (?,?) ON CONFLICT(discord_id) DO UPDATE SET saldo=saldo+?, atualizado_em=datetime('now','localtime')`,
    [discordId, quantidade, quantidade]
  );
  await _exec(`INSERT INTO transacoes (discord_id,tipo,quantidade,descricao) VALUES (?,?,?,?)`, [discordId, 'credito', quantidade, descricao]);
}
async function removerSaldo(discordId, quantidade, descricao = 'Débito') {
  const saldo = await getSaldo(discordId);
  if (saldo < quantidade) return false;
  await _exec(`UPDATE carteiras SET saldo=saldo-?, atualizado_em=datetime('now','localtime') WHERE discord_id=?`, [quantidade, discordId]);
  await _exec(`INSERT INTO transacoes (discord_id,tipo,quantidade,descricao) VALUES (?,?,?,?)`, [discordId, 'debito', quantidade, descricao]);
  return true;
}
async function getExtrato(discordId, limite = 10) {
  return queryAsync(`SELECT * FROM transacoes WHERE discord_id=? ORDER BY id DESC LIMIT ?`, [discordId, limite]);
}

// ── Pedidos ───────────────────────────────────────────────────────────────────
async function criarPedido(produtoId, produtoNome, compradorId, compradorNome) {
  const r = await _exec(`INSERT INTO pedidos (produto_id,produto_nome,comprador_id,comprador_nome) VALUES (?,?,?,?)`, [produtoId, produtoNome, compradorId, compradorNome]);
  return Number(r.lastInsertRowid);
}
async function confirmarPedido(id) { await _exec(`UPDATE pedidos SET status='confirmado', confirmado_em=datetime('now','localtime') WHERE id=?`, [id]); }
async function cancelarPedido(id) { await _exec(`UPDATE pedidos SET status='cancelado' WHERE id=?`, [id]); }
async function getPedidosAbertos() { return queryAsync(`SELECT * FROM pedidos WHERE status='aguardando' ORDER BY criado_em DESC`); }
async function getPedidosByUser(userId) { return queryAsync(`SELECT * FROM pedidos WHERE comprador_id=? ORDER BY criado_em DESC LIMIT 10`, [userId]); }
async function getPedido(id) { return getAsync(`SELECT * FROM pedidos WHERE id=?`, [id]); }

async function vincularPagamentoMP(pedidoId, mpPaymentId) {
  await _exec(`UPDATE pedidos SET mp_payment_id=? WHERE id=?`, [mpPaymentId, pedidoId]);
}

async function getPedidoPorPagamentoMP(mpPaymentId) {
  return getAsync(`SELECT * FROM pedidos WHERE mp_payment_id=?`, [mpPaymentId]);
}

// ── YouTube ───────────────────────────────────────────────────────────────────
async function getYTConfig(guildId) { return getAsync(`SELECT * FROM yt_config WHERE guild_id=?`, [guildId]); }
async function setYTConfig(guildId, canalId, ytUrl) {
  await _exec(`INSERT INTO yt_config (guild_id,canal_id,yt_url) VALUES (?,?,?) ON CONFLICT(guild_id) DO UPDATE SET canal_id=excluded.canal_id, yt_url=excluded.yt_url, ativo=1`, [guildId, canalId, ytUrl]);
}
async function updateUltimoVideo(guildId, videoId) {
  // ✅ CORREÇÃO CRÍTICA: Se a linha não existir, o UPDATE não faz nada. 
  // Usamos INSERT ... ON CONFLICT para garantir que o ID seja salvo sempre.
  await _exec(
    `INSERT INTO yt_config (guild_id, ultimo_video_id) VALUES (?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET ultimo_video_id = excluded.ultimo_video_id`,
    [guildId, videoId]
  );
}

// ── Logs ──────────────────────────────────────────────────────────────────────
async function addLog(guildId, tipo, descricao, autorId = '') {
  await _exec(`INSERT INTO logs (guild_id,tipo,descricao,autor_id) VALUES (?,?,?,?)`, [guildId, tipo, descricao, autorId]);
}

// ── Pix Pedidos (compra segura de coins) ─────────────────────────────────────
async function criarPixPedido(compradorId, compradorTag, pacote, valorReais, nomeCompleto, cpf, telefone, guildId) {
  const r = await _exec(
    `INSERT INTO pix_pedidos (comprador_id, comprador_tag, pacote, valor_reais, nome_completo, cpf, telefone, guild_id) VALUES (?,?,?,?,?,?,?,?)`,
    [compradorId, compradorTag, pacote, valorReais, nomeCompleto, cpf, telefone, guildId || '']
  );
  return Number(r.lastInsertRowid);
}
async function getPixPedido(id) { return getAsync(`SELECT * FROM pix_pedidos WHERE id=?`, [id]); }
async function aprovarPixPedido(id) { await _exec(`UPDATE pix_pedidos SET status='aprovado', resolvido_em=datetime('now','localtime') WHERE id=?`, [id]); }
async function reprovarPixPedido(id) { await _exec(`UPDATE pix_pedidos SET status='reprovado', resolvido_em=datetime('now','localtime') WHERE id=?`, [id]); }
async function salvarStaffDmMsgId(id, msgId) { await _exec(`UPDATE pix_pedidos SET staff_dm_msg_id=? WHERE id=?`, [msgId, id]); }
async function getPixPedidosAbertos() { return queryAsync(`SELECT * FROM pix_pedidos WHERE status='aguardando' ORDER BY criado_em DESC`); }

// ── Auth Key System ───────────────────────────────────────────────────────────
async function criarSolicitacao(discordId, discordTag, nomeCompleto, username, passwordHash) {
  const existe = await getAsync(`SELECT id, status FROM auth_requests WHERE discord_id=?`, [discordId]);
  if (existe) return { ok: false, status: existe.status };
  await _exec(`INSERT INTO auth_requests (discord_id, discord_tag, nome_completo, username, password_hash) VALUES (?,?,?,?,?)`, [discordId, discordTag, nomeCompleto, username, passwordHash]);
  return { ok: true };
}
async function getSolicitacao(discordId) { return getAsync(`SELECT * FROM auth_requests WHERE discord_id=?`, [discordId]); }
async function getSolicitacaoPorId(id) { return getAsync(`SELECT * FROM auth_requests WHERE id=?`, [id]); }
async function atualizarStatusSolicitacao(id, status) { await _exec(`UPDATE auth_requests SET status=? WHERE id=?`, [status, id]); }
async function salvarStaffMsgId(id, msgId) { await _exec(`UPDATE auth_requests SET staff_msg_id=? WHERE id=?`, [msgId, id]); }

async function aprovarSolicitacao(reqId, authKey) {
  const req = await getSolicitacaoPorId(reqId);
  if (!req) return false;
  const jaAprovado = await getAsync(`SELECT id FROM auth_users WHERE discord_id=?`, [req.discord_id]);
  if (jaAprovado) return false;
  await _exec(
    `INSERT INTO auth_users (discord_id, discord_tag, nome_completo, username, password_hash, auth_key) VALUES (?,?,?,?,?,?)`,
    [req.discord_id, req.discord_tag, req.nome_completo, req.username, req.password_hash, authKey]
  );
  await atualizarStatusSolicitacao(reqId, 'aprovado');
  return true;
}
async function getAuthUserByKey(authKey) { return getAsync(`SELECT * FROM auth_users WHERE auth_key=?`, [authKey]); }
async function getAuthUserByDiscord(discordId) { return getAsync(`SELECT * FROM auth_users WHERE discord_id=?`, [discordId]); }
async function getAuthUserByUsername(username) { return getAsync(`SELECT * FROM auth_users WHERE username=?`, [username]); }

/**
 * processarHeartbeat — Auth ID permanente por padrão.
 * Apenas verifica se o Auth ID está ativo e se não expirou (expiry_adm).
 * Não há mais limite de 24h nem cooldown.
 */
async function processarHeartbeat(authKey) {
  const user = await getAuthUserByKey(authKey);
  if (!user || !user.ativo) return { ok: false, message: 'Auth ID inválido.' };

  const agora = new Date();

  // Verifica expiração administrativa (se definida)
  if (user.expiry_adm && new Date(user.expiry_adm) < agora) {
    return { ok: false, message: 'Sua licença expirou. Fale com o staff.' };
  }

  // Atualiza último heartbeat
  await _exec(`UPDATE auth_users SET ultimo_heartbeat=? WHERE auth_key=?`, [agora.toISOString(), authKey]);

  // Calcula tempo restante (se houver expiração)
  let tempoRestante = '♾️ Permanente';
  if (user.expiry_adm) {
    const restMs = new Date(user.expiry_adm) - agora;
    const restH  = Math.floor(restMs / (1000 * 60 * 60));
    const restM  = Math.floor((restMs % (1000 * 60 * 60)) / (1000 * 60));
    tempoRestante = `${restH}h ${restM}m`;
  }

  return { ok: true, tempo_restante: tempoRestante };
}

async function vincularHwid(authKey, hwid) { await _exec(`UPDATE auth_users SET hwid=? WHERE auth_key=? AND hwid IS NULL`, [hwid, authKey]); }
async function getHwidByKey(authKey) { return (await getAsync(`SELECT hwid FROM auth_users WHERE auth_key=?`, [authKey]))?.hwid || null; }
async function setExpiryAdm(discordId, dataExpiry) { await _exec(`UPDATE auth_users SET expiry_adm=? WHERE discord_id=?`, [dataExpiry, discordId]); }
async function listarAuthUsers(limite = 100) {
  return queryAsync(`SELECT username, discord_tag, nome_completo, auth_key, expiry_adm, hwid, criado_em FROM auth_users ORDER BY id DESC LIMIT ?`, [limite]);
}
async function totalAuthUsers() { return (await getAsync(`SELECT COUNT(*) as total FROM auth_users`))?.total || 0; }

module.exports = {
  getDB, run, query, get, queryAsync, getAsync,
  getMsgFixa, saveMsgFixa, deleteMsgFixa,
  registrarMembro, membroExiste, xitIdEmUso, getMembro, totalMembros,
  addProduto, listarProdutos, getProduto, deletarProduto, saveProdutoMsg,
  criarPedido, confirmarPedido, cancelarPedido, getPedidosAbertos, getPedidosByUser, getPedido,
  getCarteira, getSaldo, adicionarSaldo, removerSaldo, getExtrato,
  getYTConfig, setYTConfig, updateUltimoVideo, addLog,
  criarPixPedido, getPixPedido, aprovarPixPedido, reprovarPixPedido, salvarStaffDmMsgId, getPixPedidosAbertos,
  criarSolicitacao, getSolicitacao, getSolicitacaoPorId,
  atualizarStatusSolicitacao, salvarStaffMsgId,
  aprovarSolicitacao, getAuthUserByKey, getAuthUserByDiscord,
  getAuthUserByUsername, processarHeartbeat,
  vincularHwid, getHwidByKey, setExpiryAdm,
  listarAuthUsers, totalAuthUsers,
};
