/**
 * authApi.js — API REST do sistema Auth Key (VERSÃO SEGURA)
 *
 * SEGURANÇA:
 * - Rate limiting por IP (anti-brute force)
 * - HMAC-SHA256 nos session tokens (impossível falsificar)
 * - Respostas genéricas em erros de auth (anti-enumeração)
 * - Comparação em tempo constante (anti-timing attack)
 * - Sem rota GET /auth/users pública
 * - Sem CORS wildcard
 * - Sem dados sensíveis no retorno
 */

const crypto = require('crypto');
const db     = require('./database');

const BOT_SECRET     = process.env.BOT_SECRET     || crypto.randomBytes(32).toString('hex');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const AUTH_SALT      = process.env.AUTH_SALT      || 'alphaxitsalt2024';

// Rate limiting em memória: ip → { count, resetAt }
const _rl     = new Map();
const RL_MAX  = 10;
const RL_WIN  = 60_000;

function hashPassword(password) {
  return crypto.createHmac('sha256', AUTH_SALT).update(String(password)).digest('hex');
}

function generateSession(username, authKey) {
  const nonce   = crypto.randomBytes(16).toString('hex');
  const payload = `${username}:${authKey}:${Date.now()}:${nonce}`;
  const sig     = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c.slice(0, 4096); });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch (_) { resolve({}); } });
  });
}

function jsonResponse(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

function getIP(req) {
  return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function isRateLimited(ip) {
  const now  = Date.now();
  const d    = _rl.get(ip) || { count: 0, resetAt: now + RL_WIN };
  if (now > d.resetAt) { d.count = 1; d.resetAt = now + RL_WIN; _rl.set(ip, d); return false; }
  d.count++;
  _rl.set(ip, d);
  return d.count > RL_MAX;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, d] of _rl.entries()) if (now > d.resetAt) _rl.delete(ip);
}, 120_000);

async function handleAuthRequest(req, res) {
  const url    = req.url.split('?')[0];
  const method = req.method;
  const ip     = getIP(req);

  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  let body = {};
  if (method === 'POST') body = await readBody(req);

  // Health — sem dados sensíveis
  if (url === '/auth/health' && method === 'GET') {
    return jsonResponse(res, 200, { success: true, status: 'online' });
  }

  // Init — retorna session temporário sem valor real
  if (url === '/auth/init' && method === 'POST') {
    return jsonResponse(res, 200, {
      success: true, sessionid: crypto.randomBytes(16).toString('hex'),
      newSession: true, message: 'Conectado ao servidor.',
    });
  }

  // Activate — validação completa anti-bypass
  if (url === '/auth/activate' && method === 'POST') {
    if (isRateLimited(ip)) {
      await new Promise(r => setTimeout(r, 3000));
      return jsonResponse(res, 429, { success: false, message: 'Muitas tentativas. Aguarde.' });
    }

    const { username, password, auth_key, hwid } = body;
    if (!username || !password || !auth_key)
      return jsonResponse(res, 400, { success: false, message: 'Dados incompletos.' });

    const authKeyClean  = String(auth_key).trim().toUpperCase().slice(0, 30);
    const usernameClean = String(username).trim().toLowerCase().slice(0, 64);
    const passHash      = hashPassword(String(password).slice(0, 128));
    const dummyHash     = hashPassword('__dummy_timing_prevention__');

    const user       = await db.getAuthUserByKey(authKeyClean);
    const storedHash = user ? user.password_hash : dummyHash;

    // Comparação em tempo constante (anti-timing attack)
    // Usamos um buffer de tamanho fixo para evitar vazamento de informação pelo tamanho da string
    const hashesMatch = crypto.timingSafeEqual(
      crypto.createHash('sha256').update(passHash).digest(),
      crypto.createHash('sha256').update(storedHash).digest()
    );

    // Erro genérico para não vazar informação
    const genericErr = { success: false, message: 'Credenciais inválidas ou Auth ID não encontrado.' };

    // Verificamos todas as condições mas só retornamos o erro genérico ao final
    // Isso evita que um hacker saiba se o usuário existe ou se apenas a senha está errada
    let isValid = true;
    if (!user) isValid = false;
    if (!hashesMatch) isValid = false;
    if (user && user.username.toLowerCase() !== usernameClean) isValid = false;

    if (!isValid) return jsonResponse(res, 401, genericErr);
    if (!user.ativo)                                         return jsonResponse(res, 403, { success: false, message: 'Auth ID desativado. Fale com o staff.' });
    if (user.expiry_adm && new Date(user.expiry_adm) < new Date())
      return jsonResponse(res, 403, { success: false, message: 'Licença expirada. Fale com o staff.' });

    // HWID
    if (hwid) {
      const hwidClean = String(hwid).trim().slice(0, 256);
      // Se o HWID no banco estiver vazio ou for a string "NULL", vincula o novo HWID automaticamente
      if (!user.hwid || user.hwid === 'NULL' || user.hwid === '') {
        await db.vincularHwid(authKeyClean, hwidClean);
      } else if (user.hwid !== hwidClean) {
        _dmHwidAlerta(user, hwidClean);
        return jsonResponse(res, 403, { success: false, message: 'Auth ID vinculado a outro computador. Fale com o staff.' });
      }
    }

    // Tempo restante
    let tempoRestante = '♾️ Permanente';
    let expiryLabel   = 'permanente';
    if (user.expiry_adm) {
      const restMs = new Date(user.expiry_adm) - new Date();
      tempoRestante = `${Math.floor(restMs / 3600000)}h ${Math.floor((restMs % 3600000) / 60000)}m`;
      expiryLabel   = user.expiry_adm;
    }

    const dbConn = await db.getDB();
    await dbConn.execute({ sql: `UPDATE auth_users SET ultimo_heartbeat=datetime('now') WHERE auth_key=?`, args: [authKeyClean] });
    await dbConn.execute({ sql: `INSERT INTO auth_logs (username, acao) VALUES (?,?)`, args: [user.username, 'activate'] });

    return jsonResponse(res, 200, {
      success: true,
      sessionid: generateSession(user.username, authKeyClean),
      message: 'Auth ID ativado com sucesso!',
      info: {
        username: user.username,
        nome_completo: user.nome_completo,
        hwid_vinculado: !!(user.hwid || hwid),
        createdate: user.criado_em,
        tempo_restante: tempoRestante,
        subscriptions: [{ subscription: 'alpha_xit', expiry: expiryLabel, timeleft: tempoRestante }],
      },
    });
  }

  // Heartbeat
  if (url === '/auth/heartbeat' && method === 'POST') {
    if (isRateLimited(ip)) return jsonResponse(res, 429, { success: false, message: 'Muitas requisições.' });
    const { auth_key } = body;
    if (!auth_key) return jsonResponse(res, 400, { success: false, message: 'Auth ID obrigatório.' });
    const result = await db.processarHeartbeat(String(auth_key).trim().toUpperCase());
    return jsonResponse(res, result.ok ? 200 : 403, result);
  }

  // Log
  if (url === '/auth/log' && method === 'POST') {
    const { username, message: msg } = body;
    if (username) {
      const dbConn = await db.getDB();
      await dbConn.execute({ sql: `INSERT INTO auth_logs (username, acao) VALUES (?,?)`, args: [String(username).slice(0, 64), String(msg || 'log').slice(0, 256)] });
    }
    return jsonResponse(res, 200, { success: true });
  }

  // Rota /auth/users REMOVIDA — não exposta publicamente
  return jsonResponse(res, 404, { success: false, message: 'Endpoint não encontrado.' });
}

async function _dmHwidAlerta(user, hwidTentativa) {
  try {
    const client = global._discordClient;
    if (!client) return;
    const { EmbedBuilder } = require('discord.js');
    const u = await client.users.fetch(user.discord_id);
    await u.send({
      embeds: [new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('🚨 Tentativa de uso em outro computador!')
        .setDescription(
          `Alguém tentou usar seu **Auth ID** em um computador diferente!\n\n` +
          `> 🕐 **Horário:** ${new Date().toLocaleString('pt-BR')}\n\n` +
          `Acesso bloqueado automaticamente.\n` +
          `Se quer trocar de PC, fale com o **staff**.`
        )
        .setFooter({ text: 'Alpha Xit Auth • Segurança' })
        .setTimestamp()],
    });
  } catch (_) {}
}

module.exports = { handleAuthRequest, hashPassword };
