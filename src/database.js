const initSqlJs = require('sql.js');
const fs   = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '..', 'data', 'alphabot.db');

let db;
let _autoSaveStarted = false;

async function getDB() {
  if (db) return db;
  const SQL = await initSqlJs();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  _createTables();
  _save();

  // ── Auto-save a cada 60 segundos para garantir persistência ──────────────
  if (!_autoSaveStarted) {
    _autoSaveStarted = true;
    setInterval(() => {
      try { _save(); } catch (e) { console.error('[DB] Auto-save falhou:', e.message); }
    }, 60_000);
    console.log(`[DB] ✅ Banco carregado em: ${DB_PATH}`);
    if (!process.env.DB_PATH) {
      console.warn('[DB] ⚠️  DB_PATH não definido! Configure no Render:');
      console.warn('[DB]    1. Crie um Disk em /data (Render Dashboard → Disks)');
      console.warn('[DB]    2. Adicione DB_PATH=/data/alphabot.db nas env vars');
      console.warn('[DB]    Sem isso o banco SOME ao reiniciar o bot!');
    }
  }

  return db;
}

function _save() {
  if (!db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function _createTables() {
  db.run(`CREATE TABLE IF NOT EXISTS mensagens_fixas (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id  TEXT NOT NULL,
    canal_id  TEXT NOT NULL,
    tipo      TEXT NOT NULL,
    message_id TEXT NOT NULL,
    UNIQUE(guild_id, tipo)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS membros (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id    TEXT UNIQUE NOT NULL,
    username      TEXT,
    xit_id        TEXT UNIQUE,
    registrado_em TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS produtos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nome        TEXT NOT NULL,
    descricao   TEXT,
    tipo        TEXT DEFAULT 'pago',
    preco       TEXT,
    preco_coins INTEGER DEFAULT 0,
    link        TEXT,
    imagem_url  TEXT,
    categoria   TEXT DEFAULT 'geral',
    ativo       INTEGER DEFAULT 1,
    message_id  TEXT,
    canal_id    TEXT,
    criado_em   TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS carteiras (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id    TEXT UNIQUE NOT NULL,
    saldo         INTEGER DEFAULT 0,
    atualizado_em TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS transacoes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    tipo       TEXT NOT NULL,
    quantidade INTEGER NOT NULL,
    descricao  TEXT,
    criado_em  TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pedidos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id     INTEGER,
    produto_nome   TEXT,
    comprador_id   TEXT NOT NULL,
    comprador_nome TEXT,
    status         TEXT DEFAULT 'aguardando',
    criado_em      TEXT DEFAULT (datetime('now','localtime')),
    confirmado_em  TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS yt_config (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id        TEXT UNIQUE NOT NULL,
    canal_id        TEXT,
    yt_url          TEXT,
    ultimo_video_id TEXT,
    ativo           INTEGER DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id   TEXT,
    tipo       TEXT,
    descricao  TEXT,
    autor_id   TEXT,
    criado_em  TEXT DEFAULT (datetime('now','localtime'))
  )`);

  // ── Tabelas de autenticação própria (substitui KeyAuth) ──────────────────
  db.run(`CREATE TABLE IF NOT EXISTS auth_users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    plan          TEXT DEFAULT 'gratis',
    expiry        TEXT,
    discord_id    TEXT,
    criado_em     TEXT DEFAULT (datetime('now','localtime')),
    ultimo_login  TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS auth_sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionid  TEXT UNIQUE NOT NULL,
    username   TEXT NOT NULL,
    criado_em  TEXT DEFAULT (datetime('now','localtime')),
    expira_em  TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS auth_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT,
    acao       TEXT,
    criado_em  TEXT DEFAULT (datetime('now','localtime'))
  )`);

  _migrate();
}

function _migrate() {
  // Adiciona colunas novas em tabelas existentes sem apagar dados
  const migrations = [
    { table: 'produtos',  column: 'tipo',        def: `TEXT DEFAULT 'pago'` },
    { table: 'produtos',  column: 'preco_coins',  def: `INTEGER DEFAULT 0` },
    { table: 'produtos',  column: 'imagem_url',   def: `TEXT` },
    { table: 'produtos',  column: 'categoria',    def: `TEXT DEFAULT 'geral'` },
    { table: 'produtos',  column: 'message_id',   def: `TEXT` },
    { table: 'produtos',  column: 'canal_id',     def: `TEXT` },
    { table: 'membros',   column: 'xit_id',       def: `TEXT` },
    // HWID — vincula conta ao PC (CPU ID + MAC)
    { table: 'auth_users', column: 'hwid',         def: `TEXT` },
    { table: 'auth_users', column: 'hwid_tentativas', def: `INTEGER DEFAULT 0` },
  ];

  for (const m of migrations) {
    try {
      db.run(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.def}`);
      console.log(`[DB] Migração: coluna '${m.column}' adicionada em '${m.table}'`);
    } catch (_) {
      // Coluna já existe — ignorar
    }
  }
}

function run(sql, params = []) {
  db.run(sql, params);
  _save();
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  return query(sql, params)[0] || null;
}

// ── Mensagens fixas ──────────────────────────────────────
function getMsgFixa(guildId, tipo) {
  return get(`SELECT * FROM mensagens_fixas WHERE guild_id=? AND tipo=?`, [guildId, tipo]);
}

function saveMsgFixa(guildId, canalId, tipo, messageId) {
  run(`INSERT INTO mensagens_fixas (guild_id, canal_id, tipo, message_id)
       VALUES (?,?,?,?)
       ON CONFLICT(guild_id, tipo) DO UPDATE SET canal_id=excluded.canal_id, message_id=excluded.message_id`,
    [guildId, canalId, tipo, messageId]);
}

function deleteMsgFixa(guildId, tipo) {
  run(`DELETE FROM mensagens_fixas WHERE guild_id=? AND tipo=?`, [guildId, tipo]);
}

// ── Membros ──────────────────────────────────────────────
function registrarMembro(discordId, username, xitId) {
  run(`INSERT OR IGNORE INTO membros (discord_id, username, xit_id) VALUES (?,?,?)`, [discordId, username, xitId]);
}

function membroExiste(discordId) {
  return !!get(`SELECT id FROM membros WHERE discord_id=?`, [discordId]);
}

function xitIdEmUso(xitId) {
  return !!get(`SELECT id FROM membros WHERE xit_id=?`, [xitId]);
}

function getMembro(discordId) {
  return get(`SELECT * FROM membros WHERE discord_id=?`, [discordId]);
}

function totalMembros() {
  return get(`SELECT COUNT(*) as total FROM membros`)?.total || 0;
}

// ── Produtos ─────────────────────────────────────────────
function addProduto(nome, descricao, preco, precoCoins, link, imagemUrl, categoria, tipo = 'pago') {
  db.run(
    `INSERT INTO produtos (nome,descricao,tipo,preco,preco_coins,link,imagem_url,categoria) VALUES (?,?,?,?,?,?,?,?)`,
    [nome, descricao, tipo, preco || 'Grátis', precoCoins || 0, link || '', imagemUrl || '', categoria || 'geral']
  );
  const rowid = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  _save();
  return get(`SELECT * FROM produtos WHERE id=?`, [rowid]);
}

// ── Carteiras ─────────────────────────────────────────────
function getCarteira(discordId) {
  let carteira = get(`SELECT * FROM carteiras WHERE discord_id=?`, [discordId]);
  if (!carteira) {
    run(`INSERT OR IGNORE INTO carteiras (discord_id, saldo) VALUES (?,0)`, [discordId]);
    carteira = get(`SELECT * FROM carteiras WHERE discord_id=?`, [discordId]);
  }
  return carteira;
}

function getSaldo(discordId) {
  return getCarteira(discordId)?.saldo || 0;
}

function adicionarSaldo(discordId, quantidade, descricao = 'Crédito') {
  run(`INSERT INTO carteiras (discord_id, saldo) VALUES (?,?)
       ON CONFLICT(discord_id) DO UPDATE SET saldo=saldo+?, atualizado_em=datetime('now','localtime')`,
    [discordId, quantidade, quantidade]);
  run(`INSERT INTO transacoes (discord_id,tipo,quantidade,descricao) VALUES (?,?,?,?)`,
    [discordId, 'credito', quantidade, descricao]);
}

function removerSaldo(discordId, quantidade, descricao = 'Débito') {
  const saldo = getSaldo(discordId);
  if (saldo < quantidade) return false;
  run(`UPDATE carteiras SET saldo=saldo-?, atualizado_em=datetime('now','localtime') WHERE discord_id=?`,
    [quantidade, discordId]);
  run(`INSERT INTO transacoes (discord_id,tipo,quantidade,descricao) VALUES (?,?,?,?)`,
    [discordId, 'debito', quantidade, descricao]);
  return true;
}

function getExtrato(discordId, limite = 10) {
  return query(`SELECT * FROM transacoes WHERE discord_id=? ORDER BY id DESC LIMIT ?`, [discordId, limite]);
}

function listarProdutos(tipo = null) {
  if (tipo) return query(`SELECT * FROM produtos WHERE ativo=1 AND tipo=? ORDER BY id DESC`, [tipo]);
  return query(`SELECT * FROM produtos WHERE ativo=1 ORDER BY id DESC`);
}

function getProduto(id) {
  return get(`SELECT * FROM produtos WHERE id=? AND ativo=1`, [id]);
}

function deletarProduto(id) {
  run(`UPDATE produtos SET ativo=0 WHERE id=?`, [id]);
}

function saveProdutoMsg(id, messageId, canalId) {
  run(`UPDATE produtos SET message_id=?, canal_id=? WHERE id=?`, [messageId, canalId, id]);
}

// ── Pedidos ──────────────────────────────────────────────
function criarPedido(produtoId, produtoNome, compradorId, compradorNome) {
  run(`INSERT INTO pedidos (produto_id,produto_nome,comprador_id,comprador_nome) VALUES (?,?,?,?)`,
    [produtoId, produtoNome, compradorId, compradorNome]);
  return get(`SELECT last_insert_rowid() as id`).id;
}

function confirmarPedido(pedidoId) {
  run(`UPDATE pedidos SET status='confirmado', confirmado_em=datetime('now','localtime') WHERE id=?`, [pedidoId]);
}

function cancelarPedido(pedidoId) {
  run(`UPDATE pedidos SET status='cancelado' WHERE id=?`, [pedidoId]);
}

function getPedidosAbertos() {
  return query(`SELECT * FROM pedidos WHERE status='aguardando' ORDER BY criado_em DESC`);
}

function getPedidosByUser(userId) {
  return query(`SELECT * FROM pedidos WHERE comprador_id=? ORDER BY criado_em DESC LIMIT 10`, [userId]);
}

function getPedido(id) {
  return get(`SELECT * FROM pedidos WHERE id=?`, [id]);
}

// ── YouTube ──────────────────────────────────────────────
function getYTConfig(guildId) {
  return get(`SELECT * FROM yt_config WHERE guild_id=?`, [guildId]);
}

function setYTConfig(guildId, canalId, ytUrl) {
  run(`INSERT INTO yt_config (guild_id,canal_id,yt_url) VALUES (?,?,?)
       ON CONFLICT(guild_id) DO UPDATE SET canal_id=excluded.canal_id, yt_url=excluded.yt_url, ativo=1`,
    [guildId, canalId, ytUrl]);
}

function updateUltimoVideo(guildId, videoId) {
  run(`UPDATE yt_config SET ultimo_video_id=? WHERE guild_id=?`, [videoId, guildId]);
}

// ── Logs ─────────────────────────────────────────────────
function addLog(guildId, tipo, descricao, autorId = '') {
  run(`INSERT INTO logs (guild_id,tipo,descricao,autor_id) VALUES (?,?,?,?)`,
    [guildId, tipo, descricao, autorId]);
}

// ── Auth Users (substitui KeyAuth) ───────────────────────
function authUserExiste(username) {
  return !!get(`SELECT id FROM auth_users WHERE username=?`, [username]);
}

function getAuthUser(username) {
  return get(`SELECT * FROM auth_users WHERE username=?`, [username]);
}

function getAuthUserByDiscord(discordId) {
  return get(`SELECT * FROM auth_users WHERE discord_id=?`, [discordId]);
}

function getAuthUserByHwid(hwid) {
  return get(`SELECT * FROM auth_users WHERE hwid=?`, [hwid]);
}

function setAuthHwid(username, hwid) {
  run(`UPDATE auth_users SET hwid=? WHERE username=?`, [hwid, username]);
}

function incrementHwidTentativa(hwid) {
  run(`UPDATE auth_users SET hwid_tentativas = hwid_tentativas + 1 WHERE hwid=?`, [hwid]);
}

function listarAuthUsers(limite = 100) {
  return query(
    `SELECT username, plan, expiry, discord_id, hwid, criado_em, ultimo_login
     FROM auth_users ORDER BY id DESC LIMIT ?`,
    [limite]
  );
}

function totalAuthUsers() {
  return get(`SELECT COUNT(*) as total FROM auth_users`)?.total || 0;
}

module.exports = {
  getDB,
  run, query, get,
  getMsgFixa, saveMsgFixa, deleteMsgFixa,
  registrarMembro, membroExiste, xitIdEmUso, getMembro, totalMembros,
  addProduto, listarProdutos, getProduto, deletarProduto, saveProdutoMsg,
  criarPedido, confirmarPedido, cancelarPedido, getPedidosAbertos, getPedidosByUser, getPedido,
  getCarteira, getSaldo, adicionarSaldo, removerSaldo, getExtrato,
  getYTConfig, setYTConfig, updateUltimoVideo,
  addLog,
  authUserExiste, getAuthUser, getAuthUserByDiscord, getAuthUserByHwid,
  setAuthHwid, incrementHwidTentativa,
  listarAuthUsers, totalAuthUsers,
};
