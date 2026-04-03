/**
 * authApi.js — API REST do sistema Auth Key
 * Auth ID permanente por padrão; expiração apenas se admin definir via /timeauth ou modal de aprovação.
 */

const crypto = require('crypto');
const db     = require('./database');

function hashPassword(password) {
  const salt = process.env.AUTH_SALT || 'alphaxitsalt2024';
  return crypto.createHash('sha256').update(password + salt).digest('hex');
}

function generateSession() {
  return crypto.randomBytes(32).toString('hex');
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch (_) { resolve({}); } });
  });
}

function jsonResponse(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

async function handleAuthRequest(req, res) {
  const url    = req.url.split('?')[0];
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  let body = {};
  if (method === 'POST') body = await readBody(req);

  // ── GET /auth/health ────────────────────────────────────────────────────
  if (url === '/auth/health' && method === 'GET') {
    const total = await db.totalAuthUsers();
    return jsonResponse(res, 200, { success: true, message: 'Alpha Xit Auth API online', users: total });
  }

  // ── POST /auth/init ─────────────────────────────────────────────────────
  if (url === '/auth/init' && method === 'POST') {
    return jsonResponse(res, 200, {
      success: true, sessionid: generateSession(), newSession: true,
      message: 'Conectado ao servidor. Insira suas credenciais e Auth ID.',
    });
  }

  // ── POST /auth/activate ─────────────────────────────────────────────────
  if (url === '/auth/activate' && method === 'POST') {
    const { username, password, auth_key, hwid } = body;
    if (!username || !password || !auth_key)
      return jsonResponse(res, 400, { success: false, message: 'Preencha usuário, senha e Auth ID!' });

    const user = await db.getAuthUserByKey(auth_key.trim().toUpperCase());
    if (!user) return jsonResponse(res, 401, { success: false, message: 'Auth ID inválido ou não encontrado.' });

    const hash = hashPassword(password);
    if (user.username.toLowerCase() !== username.trim().toLowerCase() || user.password_hash !== hash)
      return jsonResponse(res, 401, { success: false, message: 'Usuário ou senha incorretos para este Auth ID.' });

    if (!user.ativo)
      return jsonResponse(res, 403, { success: false, message: 'Este Auth ID está desativado. Fale com o staff.' });

    // Verifica expiração administrativa (se definida)
    if (user.expiry_adm && new Date(user.expiry_adm) < new Date())
      return jsonResponse(res, 403, { success: false, message: 'Sua licença expirou. Fale com o staff.' });

    // Vincula ou verifica HWID
    if (hwid) {
      if (!user.hwid) {
        await db.vincularHwid(auth_key.trim().toUpperCase(), hwid);
      } else if (user.hwid !== hwid) {
        _dmHwidAlerta(user, hwid);
        return jsonResponse(res, 403, { success: false, message: 'Este Auth ID já está vinculado a outro computador. Fale com o staff.' });
      }
    }

    // Calcula tempo restante (se houver expiração)
    let tempoRestante = '♾️ Permanente';
    let expiryLabel   = 'permanente';
    if (user.expiry_adm) {
      const restMs = new Date(user.expiry_adm) - new Date();
      const restH  = Math.floor(restMs / (1000 * 60 * 60));
      const restM  = Math.floor((restMs % (1000 * 60 * 60)) / (1000 * 60));
      tempoRestante = `${restH}h ${restM}m`;
      expiryLabel   = user.expiry_adm;
    }

    await db.getDB().then(c => c.execute({ sql: `UPDATE auth_users SET ultimo_heartbeat=datetime('now') WHERE auth_key=?`, args: [auth_key.trim().toUpperCase()] }));
    await db.getDB().then(c => c.execute({ sql: `INSERT INTO auth_logs (username, acao) VALUES (?,?)`, args: [user.username, 'activate'] }));

    return jsonResponse(res, 200, {
      success: true, sessionid: generateSession(), message: 'Auth ID ativado com sucesso!',
      info: {
        username: user.username, nome_completo: user.nome_completo,
        auth_key: user.auth_key, hwid: user.hwid || hwid || '',
        createdate: user.criado_em,
        tempo_restante: tempoRestante,
        subscriptions: [{ subscription: 'alpha_xit', expiry: expiryLabel, timeleft: tempoRestante }],
      },
    });
  }

  // ── POST /auth/heartbeat ────────────────────────────────────────────────
  if (url === '/auth/heartbeat' && method === 'POST') {
    const { auth_key } = body;
    if (!auth_key) return jsonResponse(res, 400, { success: false, message: 'Auth ID obrigatório.' });
    const result = await db.processarHeartbeat(auth_key.trim().toUpperCase());
    return jsonResponse(res, 200, result);
  }

  // ── POST /auth/log ──────────────────────────────────────────────────────
  if (url === '/auth/log' && method === 'POST') {
    const { username, message: msg } = body;
    if (username) await db.getDB().then(c => c.execute({ sql: `INSERT INTO auth_logs (username, acao) VALUES (?,?)`, args: [username, msg || 'log'] }));
    return jsonResponse(res, 200, { success: true });
  }

  // ── GET /auth/users ─────────────────────────────────────────────────────
  if (url === '/auth/users' && method === 'GET') {
    const users = await db.listarAuthUsers(100);
    return jsonResponse(res, 200, { success: true, count: users.length, users });
  }

  return jsonResponse(res, 404, { success: false, message: 'Endpoint não encontrado.' });
}

async function _dmHwidAlerta(user, hwidTentativa) {
  try {
    const client = global._discordClient;
    if (!client) return;
    const { EmbedBuilder } = require('discord.js');
    const u = await client.users.fetch(user.discord_id);
    await u.send({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle('🚨 Tentativa de uso em outro PC!')
      .setDescription(`Alguém tentou usar seu Auth ID em outro computador!\n\n> 🔑 **Seu Auth ID:** \`${user.auth_key}\`\n> 🕐 **Horário:** ${new Date().toLocaleString('pt-BR')}\n\nSe não foi você, o acesso foi bloqueado.\nSe quer trocar de PC, fale com o **staff**.`)
      .setFooter({ text: 'Alpha Xit Auth • Segurança' }).setTimestamp()] });
  } catch (_) {}
}

module.exports = { handleAuthRequest, hashPassword };
