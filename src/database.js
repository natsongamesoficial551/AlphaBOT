/**
 * database.js — Turso (SQLite na nuvem, gratuito)
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
    console.warn('[DB] ⚠️  SQLite LOCAL');
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
      recursos TEXT, preco_diario REAL DEFAULT 0, preco_semanal REAL DEFAULT 0,
      preco_mensal REAL DEFAULT 0, preco_bimestral REAL DEFAULT 0,
      imagem_url TEXT, link TEXT, estoque INTEGER DEFAULT 0,
      message_id TEXT, canal_id TEXT, ativo INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now','localtime')))`,
    `CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, produto_id INTEGER,
      produto_nome TEXT, comprador_id TEXT NOT NULL, comprador_nome TEXT,
      status TEXT DEFAULT 'aguardando', criado_em TEXT DEFAULT (datetime('now','localtime')), confirmado_em TEXT)`,
    `CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, tipo TEXT,
      descricao TEXT, autor_id TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime')))`,
    `CREATE TABLE IF NOT EXISTS auth_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT UNIQUE NOT NULL,
      discord_tag TEXT, nome_completo TEXT, username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, auth_key TEXT UNIQUE NOT NULL, hwid TEXT,
      ultimo_heartbeat TEXT, expiry_adm TEXT,
      ativo INTEGER DEFAULT 1, criado_em TEXT DEFAULT (datetime('now','localtime')))`,
    `CREATE TABLE IF NOT EXISTS auth_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT UNIQUE NOT NULL,
      discord_tag TEXT, nome_completo TEXT NOT NULL, username TEXT NOT NULL,
      password_hash TEXT NOT NULL, status TEXT DEFAULT 'pendente',
      criado_em TEXT DEFAULT (datetime('now','localtime')))`,
    `CREATE TABLE IF NOT EXISTS planos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT UNIQUE NOT NULL,
      preco REAL NOT NULL,
      estoque INTEGER DEFAULT 0,
      atualizado_em TEXT DEFAULT (datetime('now','localtime')))`,
  ];
  for (const sql of stmts) {
    await client.execute({ sql, args: [] });
  }
}

// ── Exportações ───────────────────────────────────────────────────────────────
module.exports = {
  getDB, queryAsync, getAsync,
  
  // Mensagens Fixas
  getMsgFixa: (g, t) => getAsync(`SELECT * FROM mensagens_fixas WHERE guild_id=? AND tipo=?`, [g, t]),
  saveMsgFixa: (g, c, t, m) => _exec(`INSERT INTO mensagens_fixas (guild_id, canal_id, tipo, message_id) VALUES (?,?,?,?) ON CONFLICT(guild_id, tipo) DO UPDATE SET canal_id=excluded.canal_id, message_id=excluded.message_id`, [g, c, t, m]),
  
  // Produtos
  addProdutoFull: async (nome, desc, recs, pD, pS, pM, pB, link, img, est) => {
    const r = await _exec(`INSERT INTO produtos (nome, descricao, recursos, preco_diario, preco_semanal, preco_mensal, preco_bimestral, link, imagem_url, estoque) VALUES (?,?,?,?,?,?,?,?,?,?)`, [nome, desc, recs, pD, pS, pM, pB, link, img, est]);
    return getAsync(`SELECT * FROM produtos WHERE id=?`, [Number(r.lastInsertRowid)]);
  },
  listarProdutos: () => queryAsync(`SELECT * FROM produtos WHERE ativo=1 ORDER BY id DESC`),
  getProduto: (id) => getAsync(`SELECT * FROM produtos WHERE id=? AND ativo=1`, [id]),
  saveProdutoMsg: (id, m, c) => _exec(`UPDATE produtos SET message_id=?, canal_id=? WHERE id=?`, [m, c, id]),
  decrementarEstoque: (id) => _exec(`UPDATE produtos SET estoque = MAX(0, estoque - 1) WHERE id=?`, [id]),

  // Pedidos
  criarPedido: (pId, pNome, cId, cNome) => _exec(`INSERT INTO pedidos (produto_id, produto_nome, comprador_id, comprador_nome) VALUES (?,?,?,?)`, [pId, pNome, cId, cNome]).then(r => Number(r.lastInsertRowid)),
  confirmarPedido: (id) => _exec(`UPDATE pedidos SET status='confirmado', confirmado_em=datetime('now','localtime') WHERE id=?`, [id]),
  getPedido: (id) => getAsync(`SELECT * FROM pedidos WHERE id=?`, [id]),

  // Logs
  addLog: (g, t, d, a) => _exec(`INSERT INTO logs (guild_id, tipo, descricao, autor_id) VALUES (?,?,?,?)`, [g, t, d, a]),

  // Auth
  getAuthUserByDiscord: (id) => getAsync(`SELECT * FROM auth_users WHERE discord_id=?`, [id]),
  getAuthUserByKey: (k) => getAsync(`SELECT * FROM auth_users WHERE auth_key=?`, [k]),
  aprovarSolicitacao: (id, key) => _exec(`INSERT INTO auth_users (discord_id, username, password_hash, auth_key) SELECT discord_id, username, password_hash, ? FROM auth_requests WHERE id=?`, [key, id]),

  // Planos (Legado/Suporte)
  getPlanos: () => queryAsync(`SELECT * FROM planos`),
  getPlano: (t) => getAsync(`SELECT * FROM planos WHERE tipo=?`, [t]),
};
