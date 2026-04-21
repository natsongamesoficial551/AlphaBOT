/**
 * database.js — Turso (Versão de Compatibilidade Máxima Corrigida)
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
    console.log('[DB] ✅ Conectado ao Turso');
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
  await getDB();
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
  // 1. Garante que as tabelas básicas existam
  const stmts = [
    `CREATE TABLE IF NOT EXISTS mensagens_fixas (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, canal_id TEXT, tipo TEXT, message_id TEXT, UNIQUE(guild_id, tipo))`,
    `CREATE TABLE IF NOT EXISTS produtos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, descricao TEXT, preco TEXT, link TEXT, imagem_url TEXT, ativo INTEGER DEFAULT 1)`,
    `CREATE TABLE IF NOT EXISTS pedidos (id INTEGER PRIMARY KEY AUTOINCREMENT, produto_id INTEGER, produto_nome TEXT, comprador_id TEXT, comprador_nome TEXT, status TEXT DEFAULT 'aguardando', payment_id TEXT, criado_em TEXT DEFAULT (datetime('now','localtime')))`,
    `CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, tipo TEXT, descricao TEXT, autor_id TEXT, criado_em TEXT DEFAULT (datetime('now','localtime')))`,
    `CREATE TABLE IF NOT EXISTS auth_users (id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT UNIQUE, discord_tag TEXT, username TEXT UNIQUE, password_hash TEXT, auth_key TEXT UNIQUE, hwid TEXT, expiry_adm TEXT, ativo INTEGER DEFAULT 1, criado_em TEXT DEFAULT (datetime('now','localtime')), ultimo_heartbeat TEXT)`,
    `CREATE TABLE IF NOT EXISTS auth_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT UNIQUE, discord_tag TEXT, nome_completo TEXT, username TEXT, password_hash TEXT, status TEXT DEFAULT 'pendente', staff_msg_id TEXT, criado_em TEXT DEFAULT (datetime('now','localtime')))`,
    `CREATE TABLE IF NOT EXISTS auth_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, acao TEXT, criado_em TEXT DEFAULT (datetime('now','localtime')))`,
    `CREATE TABLE IF NOT EXISTS yt_config (guild_id TEXT PRIMARY KEY, yt_url TEXT, canal_id TEXT, ultimo_video_id TEXT)`
  ];
  for (const sql of stmts) { await client.execute({ sql, args: [] }); }

  // 2. Migrations Seguras
  const columns = [
    { table: 'produtos', column: 'recursos', type: 'TEXT' },
    { table: 'produtos', column: 'preco_diario', type: 'REAL DEFAULT 0' },
    { table: 'produtos', column: 'preco_semanal', type: 'REAL DEFAULT 0' },
    { table: 'produtos', column: 'preco_mensal', type: 'REAL DEFAULT 0' },
    { table: 'produtos', column: 'preco_bimestral', type: 'REAL DEFAULT 0' },
    { table: 'produtos', column: 'estoque', type: 'INTEGER DEFAULT 0' },
    { table: 'produtos', column: 'message_id', type: 'TEXT' },
    { table: 'produtos', column: 'canal_id', type: 'TEXT' },
    { table: 'pedidos', column: 'payment_id', type: 'TEXT' },
    { table: 'pedidos', column: 'confirmado_em', type: 'TEXT' },
    { table: 'auth_users', column: 'ultimo_heartbeat', type: 'TEXT' },
    { table: 'auth_users', column: 'criado_em', type: 'TEXT DEFAULT (datetime(\'now\',\'localtime\'))' },
    { table: 'auth_requests', column: 'staff_msg_id', type: 'TEXT' }
  ];

  for (const c of columns) {
    try { await client.execute({ sql: `ALTER TABLE ${c.table} ADD COLUMN ${c.column} ${c.type}`, args: [] }); } catch (e) { /* Coluna já existe */ }
  }
}

module.exports = {
  getDB, queryAsync, getAsync,
  run: _exec, // Atalho comum usado em vários módulos

  // Mensagens Fixas
  getMsgFixa: (g, t) => getAsync(`SELECT * FROM mensagens_fixas WHERE guild_id=? AND tipo=?`, [g, t]),
  saveMsgFixa: (g, c, t, m) => _exec(`INSERT INTO mensagens_fixas (guild_id, canal_id, tipo, message_id) VALUES (?,?,?,?) ON CONFLICT(guild_id, tipo) DO UPDATE SET canal_id=excluded.canal_id, message_id=excluded.message_id`, [g, c, t, m]),
  deleteMsgFixa: (g, t) => _exec(`DELETE FROM mensagens_fixas WHERE guild_id=? AND tipo=?`, [g, t]),
  
  // Produtos
  addProdutoFull: async (nome, desc, recs, pD, pS, pM, pB, link, img, est) => {
    const r = await _exec(`INSERT INTO produtos (nome, descricao, recursos, preco_diario, preco_semanal, preco_mensal, preco_bimestral, link, imagem_url, estoque) VALUES (?,?,?,?,?,?,?,?,?,?)`, [nome, desc, recs, pD, pS, pM, pB, link, img, est]);
    return getAsync(`SELECT * FROM produtos WHERE id=?`, [Number(r.lastInsertRowid)]);
  },
  listarProdutos: () => queryAsync(`SELECT * FROM produtos WHERE ativo=1 ORDER BY id DESC`),
  getProduto: (id) => getAsync(`SELECT * FROM produtos WHERE id=? AND ativo=1`, [id]),
  saveProdutoMsg: (id, m, c) => _exec(`UPDATE produtos SET message_id=?, canal_id=? WHERE id=?`, [m, c, id]),
  decrementarEstoque: (idOrTipo) => _exec(`UPDATE produtos SET estoque = MAX(0, estoque - 1) WHERE id=? OR nome LIKE ?`, [idOrTipo, `%${idOrTipo}%`]),

  // Pedidos
  criarPedido: (pId, pNome, cId, cNome) => _exec(`INSERT INTO pedidos (produto_id, produto_nome, comprador_id, comprador_nome) VALUES (?,?,?,?)`, [pId, pNome, cId, cNome]).then(r => Number(r.lastInsertRowid)),
  confirmarPedido: (id) => _exec(`UPDATE pedidos SET status='confirmado', confirmado_em=datetime('now','localtime') WHERE id=?`, [id]),
  cancelarPedido: (id) => _exec(`UPDATE pedidos SET status='cancelado' WHERE id=?`, [id]),
  getPedido: (id) => getAsync(`SELECT * FROM pedidos WHERE id=?`, [id]),
  getPedidoPorPagamentoMP: (pId) => getAsync(`SELECT * FROM pedidos WHERE payment_id=?`, [pId]),

  // Logs
  addLog: (g, t, d, a) => _exec(`INSERT INTO logs (guild_id, tipo, descricao, autor_id) VALUES (?,?,?,?)`, [g, t, d, a]),

  // Auth
  getAuthUserByDiscord: (id) => getAsync(`SELECT * FROM auth_users WHERE discord_id=?`, [id]),
  getAuthUserByKey: (k) => getAsync(`SELECT * FROM auth_users WHERE auth_key=?`, [k]),
  getAuthUserByUsername: (u) => getAsync(`SELECT * FROM auth_users WHERE LOWER(username)=LOWER(?)`, [u]),
  vincularHwid: (k, h) => _exec(`UPDATE auth_users SET hwid=? WHERE auth_key=?`, [h, k]),
  setExpiryAdm: (dId, e) => _exec(`UPDATE auth_users SET expiry_adm=? WHERE discord_id=?`, [e, dId]),
  
  // Auth Requests
  getSolicitacao: (dId) => getAsync(`SELECT * FROM auth_requests WHERE discord_id=? AND status='pendente' ORDER BY id DESC`, [dId]),
  getSolicitacaoPorId: (id) => getAsync(`SELECT * FROM auth_requests WHERE id=?`, [id]),
  criarSolicitacao: async (dId, dTag, nome, user, pass, status = 'pendente') => {
    try {
      await _exec(`INSERT INTO auth_requests (discord_id, discord_tag, nome_completo, username, password_hash, status) VALUES (?,?,?,?,?,?) ON CONFLICT(discord_id) DO UPDATE SET discord_tag=excluded.discord_tag, nome_completo=excluded.nome_completo, username=excluded.username, password_hash=excluded.password_hash, status=excluded.status`, [dId, dTag, nome, user, pass, status]);
      return { ok: true };
    } catch (e) {
      const req = await getAsync(`SELECT status FROM auth_requests WHERE discord_id = ?`, [dId]);
      return { ok: false, status: req ? req.status : 'desconhecido' };
    }
  },
  aprovarSolicitacao: async (reqId, key) => {
    const req = await getAsync(`SELECT * FROM auth_requests WHERE id=?`, [reqId]);
    if (!req) return false;
    try {
      await _exec(`INSERT INTO auth_users (discord_id, discord_tag, username, password_hash, auth_key) VALUES (?,?,?,?,?)`, [req.discord_id, req.discord_tag, req.username, req.password_hash, key]);
      await _exec(`UPDATE auth_requests SET status='aprovado' WHERE id=?`, [reqId]);
      return true;
    } catch (e) { return false; }
  },
  atualizarStatusSolicitacao: (id, s) => _exec(`UPDATE auth_requests SET status=? WHERE id=?`, [s, id]),
  salvarStaffMsgId: (id, mId) => _exec(`UPDATE auth_requests SET staff_msg_id=? WHERE id=?`, [id, mId]),

  // Heartbeat & Sync
  processarHeartbeat: async (key) => {
    const user = await getAsync(`SELECT * FROM auth_users WHERE auth_key=?`, [key]);
    if (!user) return { ok: false, message: 'Auth Key inválida.' };
    if (!user.ativo) return { ok: false, message: 'Conta desativada.' };
    if (user.expiry_adm && new Date(user.expiry_adm) < new Date()) return { ok: false, message: 'Licença expirada.' };
    await _exec(`UPDATE auth_users SET ultimo_heartbeat=datetime('now') WHERE auth_key=?`, [key]);
    return { ok: true };
  },

  // YouTube
  getYTConfig: (gId) => getAsync(`SELECT * FROM yt_config WHERE guild_id=?`, [gId]),
  updateUltimoVideo: (gId, vId) => _exec(`INSERT INTO yt_config (guild_id, ultimo_video_id) VALUES (?,?) ON CONFLICT(guild_id) DO UPDATE SET ultimo_video_id=excluded.ultimo_video_id`, [gId, vId]),
  
  // Planos (Legado)
  getPlanos: () => queryAsync(`SELECT * FROM planos`),
  getPlano: (t) => getAsync(`SELECT * FROM planos WHERE tipo=?`, [t]),
};
