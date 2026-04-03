/**
 * authApi.js — API REST do sistema Auth Key
 *
 * Endpoints:
 *   POST /auth/init       → C# inicializa, envia HWID, recebe status
 *   POST /auth/activate   → C# ativa com username + senha + auth_key
 *   POST /auth/heartbeat  → C# envia a cada 60s (conta tempo de uso ativo)
 *   POST /auth/log        → C# registra log de acesso
 *   GET  /auth/health     → status da API
 *   GET  /auth/users      → lista usuários (admin)
 */

const crypto = require('crypto');

// Usa SEMPRE a instância compartilhada do database.js — nunca abre uma 2ª instância
const db = require('./database');

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

  // ── GET /auth/health ───────────────────────────────────────────────────────
  if (url === '/auth/health' && method === 'GET') {
    const total = db.get(`SELECT COUNT(*) as c FROM auth_users`)?.c || 0;
    return jsonResponse(res, 200, { success: true, message: 'Alpha Xit Auth API online', users: total });
  }

  // ── POST /auth/init ────────────────────────────────────────────────────────
  // C# chama ao abrir o software — envia HWID
  if (url === '/auth/init' && method === 'POST') {
    const { hwid } = body;
    const sessionid = generateSession();
    return jsonResponse(res, 200, {
      success:    true,
      sessionid,
      newSession: true,
      message:    'Conectado ao servidor. Insira suas credenciais e Auth Key.',
    });
  }

  // ── POST /auth/activate ────────────────────────────────────────────────────
  // C# envia username + password + auth_key para ativar/logar
  if (url === '/auth/activate' && method === 'POST') {
    const { username, password, auth_key, hwid } = body;

    if (!username || !password || !auth_key) {
      return jsonResponse(res, 400, { success: false, message: 'Preencha usuário, senha e Auth Key!' });
    }

    // Busca por Auth Key
    const user = db.get(`SELECT * FROM auth_users WHERE auth_key=?`, [auth_key.trim().toUpperCase()]);

    if (!user) {
      return jsonResponse(res, 401, { success: false, message: 'Auth Key inválida ou não encontrada.' });
    }

    // Valida username e senha
    const hash = hashPassword(password);
    if (user.username.toLowerCase() !== username.trim().toLowerCase() || user.password_hash !== hash) {
      return jsonResponse(res, 401, { success: false, message: 'Usuário ou senha incorretos para esta Auth Key.' });
    }

    if (!user.ativo) {
      return jsonResponse(res, 403, { success: false, message: 'Esta Auth Key está desativada. Fale com o staff.' });
    }

    // Verifica expiração definida pelo ADM
    if (user.expiry_adm && new Date(user.expiry_adm) < new Date()) {
      return jsonResponse(res, 403, { success: false, message: 'Sua licença expirou. Fale com o staff.' });
    }

    // Verifica cooldown de 30 dias
    if (user.cooldown_inicio) {
      const fimCooldown = new Date(user.cooldown_inicio);
      fimCooldown.setDate(fimCooldown.getDate() + 30);
      if (new Date() < fimCooldown) {
        const dias = Math.ceil((fimCooldown - new Date()) / (1000 * 60 * 60 * 24));
        return jsonResponse(res, 403, {
          success: false,
          message: `Suas 24h foram utilizadas. Cooldown ativo — disponível em ${dias} dia(s).`,
        });
      }
      // Cooldown encerrado — reseta
      db.run(`UPDATE auth_users SET uso_segundos=0, cooldown_inicio=NULL, ultimo_heartbeat=NULL WHERE auth_key=?`, [auth_key.trim().toUpperCase()]);
    }

    // HWID: vincula na 1ª vez, bloqueia se PC diferente
    if (hwid) {
      if (!user.hwid) {
        db.run(`UPDATE auth_users SET hwid=? WHERE auth_key=?`, [hwid, auth_key.trim().toUpperCase()]);
      } else if (user.hwid !== hwid) {
        // PC diferente — manda DM de alerta
        if (user.discord_id) _dmHwidAlerta(user, hwid);
        return jsonResponse(res, 403, {
          success: false,
          message: 'Esta Auth Key já está vinculada a outro computador. Fale com o staff.',
        });
      }
    }

    // Calcula tempo restante
    const limSeg  = user.limite_segundos || 86400;
    const usoSeg  = user.uso_segundos    || 0;
    const restSeg = Math.max(0, limSeg - usoSeg);
    const horas   = Math.floor(restSeg / 3600);
    const minutos = Math.floor((restSeg % 3600) / 60);

    db.run(`UPDATE auth_users SET ultimo_heartbeat=datetime('now') WHERE auth_key=?`, [auth_key.trim().toUpperCase()]);
    db.run(`INSERT INTO auth_logs (username, acao) VALUES (?,?)`, [user.username, 'activate']);

    return jsonResponse(res, 200, {
      success:   true,
      sessionid: generateSession(),
      message:   'Auth Key ativada com sucesso!',
      info: {
        username:       user.username,
        nome_completo:  user.nome_completo,
        auth_key:       user.auth_key,
        hwid:           user.hwid || hwid || '',
        createdate:     user.criado_em,
        tempo_restante: `${horas}h ${minutos}m`,
        uso_segundos:   usoSeg,
        subscriptions:  [{ subscription: 'alpha_xit', expiry: user.expiry_adm || 'uso_ativo', timeleft: `${horas}h ${minutos}m` }],
      },
    });
  }

  // ── POST /auth/heartbeat ───────────────────────────────────────────────────
  // C# envia a cada 60s enquanto o painel está aberto — conta tempo de uso
  if (url === '/auth/heartbeat' && method === 'POST') {
    const { auth_key } = body;
    if (!auth_key) return jsonResponse(res, 400, { success: false, message: 'Auth Key obrigatória.' });

    const user = db.get(`SELECT * FROM auth_users WHERE auth_key=?`, [auth_key.trim().toUpperCase()]);
    if (!user) return jsonResponse(res, 401, { success: false, message: 'Auth Key inválida.' });

    // Verifica expiração ADM
    if (user.expiry_adm && new Date(user.expiry_adm) < new Date()) {
      return jsonResponse(res, 403, { success: false, message: 'Sua licença expirou. Fale com o staff.' });
    }

    // Verifica cooldown
    if (user.cooldown_inicio) {
      const fimCooldown = new Date(user.cooldown_inicio);
      fimCooldown.setDate(fimCooldown.getDate() + 30);
      if (new Date() < fimCooldown) {
        const dias = Math.ceil((fimCooldown - new Date()) / (1000 * 60 * 60 * 24));
        return jsonResponse(res, 403, { success: false, message: `Cooldown ativo — disponível em ${dias} dia(s).` });
      }
      db.run(`UPDATE auth_users SET uso_segundos=0, cooldown_inicio=NULL, ultimo_heartbeat=NULL WHERE auth_key=?`, [auth_key.trim().toUpperCase()]);
    }

    // Conta segundos desde o último heartbeat
    const agora = new Date();
    let segundosAdicionados = 0;
    if (user.ultimo_heartbeat) {
      const diff = Math.floor((agora - new Date(user.ultimo_heartbeat)) / 1000);
      segundosAdicionados = Math.min(diff, 70); // tolerância 10s
    }

    const limSeg  = user.limite_segundos || 86400;
    const novoUso = (user.uso_segundos || 0) + segundosAdicionados;

    if (novoUso >= limSeg) {
      // Esgotou — inicia cooldown
      db.run(
        `UPDATE auth_users SET uso_segundos=?, cooldown_inicio=?, ultimo_heartbeat=? WHERE auth_key=?`,
        [limSeg, agora.toISOString(), agora.toISOString(), auth_key.trim().toUpperCase()]
      );
      // DM avisando
      if (user.discord_id) _dmUsoEsgotado(user);
      return jsonResponse(res, 200, {
        success: false,
        esgotado: true,
        message: 'Suas 24h foram utilizadas! Cooldown de 30 dias iniciado. O painel será encerrado.',
      });
    }

    db.run(
      `UPDATE auth_users SET uso_segundos=?, ultimo_heartbeat=? WHERE auth_key=?`,
      [novoUso, agora.toISOString(), auth_key.trim().toUpperCase()]
    );

    const restSeg = limSeg - novoUso;
    return jsonResponse(res, 200, {
      success: true,
      uso_segundos:      novoUso,
      segundos_restantes: restSeg,
      tempo_restante:    `${Math.floor(restSeg/3600)}h ${Math.floor((restSeg%3600)/60)}m`,
    });
  }

  // ── POST /auth/log ─────────────────────────────────────────────────────────
  if (url === '/auth/log' && method === 'POST') {
    const { username, message: msg } = body;
    if (username) db.run(`INSERT INTO auth_logs (username, acao) VALUES (?,?)`, [username, msg || 'log']);
    return jsonResponse(res, 200, { success: true });
  }

  // ── GET /auth/users ────────────────────────────────────────────────────────
  if (url === '/auth/users' && method === 'GET') {
    const users = db.query(
      `SELECT username, discord_tag, nome_completo, auth_key, uso_segundos,
              limite_segundos, cooldown_inicio, expiry_adm, hwid, criado_em
       FROM auth_users ORDER BY id DESC LIMIT 100`
    );
    return jsonResponse(res, 200, { success: true, count: users.length, users });
  }

  return jsonResponse(res, 404, { success: false, message: 'Endpoint não encontrado.' });
}

// ── DM: aviso de HWID diferente ───────────────────────────────────────────
async function _dmHwidAlerta(user, hwidTentativa) {
  try {
    const client = global._discordClient;
    if (!client) return;
    const { EmbedBuilder } = require('discord.js');
    const discordUser = await client.users.fetch(user.discord_id);
    await discordUser.send({
      embeds: [new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('🚨 Tentativa de uso em outro PC!')
        .setDescription(
          `Alguém tentou usar sua **Auth Key** em outro computador!\n\n` +
          `> 🔑 **Sua key:** \`${user.auth_key}\`\n` +
          `> 🕐 **Horário:** ${new Date().toLocaleString('pt-BR')}\n\n` +
          `Se não foi você, sua key está segura (o acesso foi bloqueado).\n` +
          `Se quer trocar de PC, fale com o **staff**.`
        )
        .setFooter({ text: 'Alpha Xit Auth • Segurança' })
        .setTimestamp()
      ],
    });
  } catch (_) {}
}

// ── DM: aviso de 24h esgotadas ────────────────────────────────────────────
async function _dmUsoEsgotado(user) {
  try {
    const client = global._discordClient;
    if (!client) return;
    const { EmbedBuilder } = require('discord.js');
    const discordUser = await client.users.fetch(user.discord_id);
    await discordUser.send({
      embeds: [new EmbedBuilder()
        .setColor(0xF39C12)
        .setTitle('⏱️ Suas 24h foram utilizadas!')
        .setDescription(
          `Olá, **${user.nome_completo}**!\n\n` +
          `Você utilizou todas as suas **24 horas** de acesso ativo.\n\n` +
          `> 🔄 **Cooldown:** 30 dias\n` +
          `> 📅 **Disponível em:** ${(() => { const d = new Date(); d.setDate(d.getDate()+30); return d.toLocaleDateString('pt-BR'); })()}\n\n` +
          `Após o cooldown, suas 24h serão renovadas automaticamente.\n` +
          `O software foi encerrado.`
        )
        .setFooter({ text: 'Alpha Xit Auth' })
        .setTimestamp()
      ],
    });
  } catch (_) {}
}

module.exports = { handleAuthRequest, hashPassword };
