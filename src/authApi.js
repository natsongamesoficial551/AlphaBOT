/**
 * authApi.js — API REST do sistema Auth Key
 * Usa a instância compartilhada de database.js (Turso)
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
      message: 'Conectado ao servidor. Insira suas credenciais e Auth Key.',
    });
  }

  // ── POST /auth/activate ─────────────────────────────────────────────────
  if (url === '/auth/activate' && method === 'POST') {
    const { username, password, auth_key, hwid } = body;
    if (!username || !password || !auth_key)
      return jsonResponse(res, 400, { success: false, message: 'Preencha usuário, senha e Auth Key!' });

    const user = await db.getAuthUserByKey(auth_key.trim().toUpperCase());
    if (!user) return jsonResponse(res, 401, { success: false, message: 'Auth Key inválida ou não encontrada.' });

    const hash = hashPassword(password);
    if (user.username.toLowerCase() !== username.trim().toLowerCase() || user.password_hash !== hash)
      return jsonResponse(res, 401, { success: false, message: 'Usuário ou senha incorretos para esta Auth Key.' });

    if (!user.ativo) return jsonResponse(res, 403, { success: false, message: 'Esta Auth Key está desativada. Fale com o staff.' });

    if (user.expiry_adm && new Date(user.expiry_adm) < new Date())
      return jsonResponse(res, 403, { success: false, message: 'Sua licença expirou. Fale com o staff.' });

    if (user.cooldown_inicio) {
      const fim = new Date(user.cooldown_inicio);
      fim.setDate(fim.getDate() + 30);
      if (new Date() < fim) {
        const dias = Math.ceil((fim - new Date()) / (1000 * 60 * 60 * 24));
        return jsonResponse(res, 403, { success: false, message: `Suas 24h foram utilizadas. Cooldown ativo — disponível em ${dias} dia(s).` });
      }
      await db.getDB().then(c => c.execute({ sql: `UPDATE auth_users SET uso_segundos=0, cooldown_inicio=NULL, ultimo_heartbeat=NULL WHERE auth_key=?`, args: [auth_key.trim().toUpperCase()] }));
    }

    if (hwid) {
      if (!user.hwid) {
        await db.vincularHwid(auth_key.trim().toUpperCase(), hwid);
      } else if (user.hwid !== hwid) {
        _dmHwidAlerta(user, hwid);
        return jsonResponse(res, 403, { success: false, message: 'Esta Auth Key já está vinculada a outro computador. Fale com o staff.' });
      }
    }

    const limSeg  = user.limite_segundos || 86400;
    const usoSeg  = user.uso_segundos    || 0;
    const restSeg = Math.max(0, limSeg - usoSeg);

    await db.getDB().then(c => c.execute({ sql: `UPDATE auth_users SET ultimo_heartbeat=datetime('now') WHERE auth_key=?`, args: [auth_key.trim().toUpperCase()] }));
    await db.getDB().then(c => c.execute({ sql: `INSERT INTO auth_logs (username, acao) VALUES (?,?)`, args: [user.username, 'activate'] }));

    return jsonResponse(res, 200, {
      success: true, sessionid: generateSession(), message: 'Auth Key ativada com sucesso!',
      info: {
        username: user.username, nome_completo: user.nome_completo,
        auth_key: user.auth_key, hwid: user.hwid || hwid || '',
        createdate: user.criado_em,
        tempo_restante: `${Math.floor(restSeg/3600)}h ${Math.floor((restSeg%3600)/60)}m`,
        uso_segundos: usoSeg,
        subscriptions: [{ subscription: 'alpha_xit', expiry: user.expiry_adm || 'uso_ativo', timeleft: `${Math.floor(restSeg/3600)}h ${Math.floor((restSeg%3600)/60)}m` }],
      },
    });
  }

  // ── POST /auth/heartbeat ────────────────────────────────────────────────
  if (url === '/auth/heartbeat' && method === 'POST') {
    const { auth_key } = body;
    if (!auth_key) return jsonResponse(res, 400, { success: false, message: 'Auth Key obrigatória.' });
    const result = await db.processarHeartbeat(auth_key.trim().toUpperCase());
    if (!result.ok && result.esgotado && body.discord_id) {
      const user = await db.getAuthUserByKey(auth_key.trim().toUpperCase());
      if (user) _dmUsoEsgotado(user);
    }
    return jsonResponse(res, result.ok ? 200 : 200, result);
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
      .setDescription(`Alguém tentou usar sua Auth Key em outro computador!\n\n> 🔑 **Sua key:** \`${user.auth_key}\`\n> 🕐 **Horário:** ${new Date().toLocaleString('pt-BR')}\n\nSe não foi você, o acesso foi bloqueado.\nSe quer trocar de PC, fale com o **staff**.`)
      .setFooter({ text: 'Alpha Xit Auth • Segurança' }).setTimestamp()] });
  } catch (_) {}
}

async function _dmUsoEsgotado(user) {
  try {
    const client = global._discordClient;
    if (!client) return;
    const { EmbedBuilder } = require('discord.js');
    const u = await client.users.fetch(user.discord_id);
    const d = new Date(); d.setDate(d.getDate() + 30);
    await u.send({ embeds: [new EmbedBuilder().setColor(0xF39C12).setTitle('⏱️ Suas 24h foram utilizadas!')
      .setDescription(`Olá, **${user.nome_completo}**!\n\nVocê utilizou todas as suas **24 horas** de acesso ativo.\n\n> 🔄 **Cooldown:** 30 dias\n> 📅 **Disponível em:** ${d.toLocaleDateString('pt-BR')}\n\nApós o cooldown, suas 24h serão renovadas automaticamente.`)
      .setFooter({ text: 'Alpha Xit Auth' }).setTimestamp()] });
  } catch (_) {}
}

module.exports = { handleAuthRequest, hashPassword };
