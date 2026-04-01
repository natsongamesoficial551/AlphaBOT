/**
 * authApi.js — API REST de autenticação própria (substitui KeyAuth)
 * Roda embutida no bot, exposta via HTTP no mesmo processo do Render.
 *
 * Endpoints:
 *   POST /auth/init            → inicializa sessão (equivalente ao KeyAuth init)
 *   POST /auth/login           → autentica usuário  (equivalente ao KeyAuth login)
 *   POST /auth/register        → cria usuário       (chamado pelo bot Discord)
 *   POST /auth/log             → registra log de acesso
 *   GET  /auth/check/:user     → verifica se usuário existe
 *   GET  /auth/users           → lista usuários (admin)
 *   GET  /auth/health          → health check da API
 *
 * Integração C# — uso idêntico ao KeyAuth, basta trocar a URL base:
 *   baseUrl: "https://SEU-BOT.onrender.com"
 *   secret:  valor de AUTH_BOT_SECRET no .env
 */

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '..', 'data', 'alphabot.db');

// ── Helpers ──────────────────────────────────────────────────────────────────
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
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (_) { resolve({}); }
    });
  });
}

function jsonResponse(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

// ── Handler principal ────────────────────────────────────────────────────────
async function handleAuthRequest(req, res, dbInstance) {
  const url    = req.url.split('?')[0];
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET,POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  let body = {};
  if (method === 'POST') body = await readBody(req);

  // ── Wrappers locais para o sql.js já inicializado ────────────────────────
  function dbSave() {
    fs.writeFileSync(DB_PATH, Buffer.from(dbInstance.export()));
  }

  function dbRun(sql, params = []) {
    dbInstance.run(sql, params);
    dbSave();
  }

  function dbGet(sql, params = []) {
    const stmt = dbInstance.prepare(sql);
    stmt.bind(params);
    let row = null;
    if (stmt.step()) row = stmt.getAsObject();
    stmt.free();
    return row;
  }

  function dbQuery(sql, params = []) {
    const stmt = dbInstance.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  // ── GET /auth/health ───────────────────────────────────────────────────────
  if (url === '/auth/health' && method === 'GET') {
    const total = dbGet(`SELECT COUNT(*) as c FROM auth_users`)?.c || 0;
    return jsonResponse(res, 200, {
      success: true,
      message: 'Alpha Xit Auth API online',
      users: total,
    });
  }

  // ── POST /auth/init ────────────────────────────────────────────────────────
  // C# chama isso ao abrir o software — já verifica HWID aqui
  if (url === '/auth/init' && method === 'POST') {
    const { hwid } = body;

    // ── Se HWID fornecido, verifica se esse PC já tem conta ─────────────────
    if (hwid) {
      const contaVinculada = dbGet(
        `SELECT username, plan, expiry, discord_id FROM auth_users WHERE hwid=?`,
        [hwid]
      );

      if (contaVinculada) {
        // PC já tem conta — retorna sucesso mas avisa que já existe conta
        // O C# deve mostrar apenas a tela de LOGIN, nunca de criação
        const sessionid = generateSession();
        return jsonResponse(res, 200, {
          success:       true,
          sessionid,
          newSession:    true,
          hwid_has_account: true,   // flag para o C# esconder botão "Criar Conta"
          message:       'Conectado ao servidor. Faça login para continuar.',
        });
      }
    }

    const sessionid = generateSession();
    const expira    = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    try {
      dbRun(
        `INSERT INTO auth_sessions (sessionid, username, expira_em) VALUES (?,?,?)`,
        [sessionid, '__init__', expira]
      );
    } catch (_) {}

    return jsonResponse(res, 200, {
      success:          true,
      sessionid,
      newSession:       true,
      hwid_has_account: false,  // PC livre — pode criar conta
      message:          'Conectado ao servidor. Faça login para continuar.',
    });
  }

  // ── POST /auth/login ───────────────────────────────────────────────────────
  // Equivalente ao KeyAuthApp.login(username, password) no C#
  if (url === '/auth/login' && method === 'POST') {
    const { username, password, hwid } = body;

    if (!username || !password) {
      return jsonResponse(res, 400, { success: false, message: 'Preencha usuário e senha!' });
    }

    const hash = hashPassword(password);
    const user = dbGet(
      `SELECT * FROM auth_users WHERE username=? AND password_hash=?`,
      [username.trim(), hash]
    );

    if (!user) {
      return jsonResponse(res, 401, { success: false, message: 'Usuário ou senha incorretos.' });
    }

    // Verifica expiração
    if (user.expiry && user.expiry !== 'permanent') {
      if (new Date(user.expiry) < new Date()) {
        return jsonResponse(res, 403, {
          success: false,
          message: 'Sua licença expirou. Renove seu plano no Discord.',
        });
      }
    }

    // ── HWID: vincula na 1ª vez, bloqueia se PC diferente ───────────────────
    if (hwid) {
      if (!user.hwid) {
        // Primeira vez logando — vincula o PC
        dbRun(`UPDATE auth_users SET hwid=? WHERE username=?`, [hwid, username.trim()]);
        console.log(`[AUTH] HWID vinculado para ${username}`);
      } else if (user.hwid !== hwid) {
        // PC diferente — bloqueia e alerta via DM no Discord
        dbRun(
          `UPDATE auth_users SET hwid_tentativas = hwid_tentativas + 1 WHERE username=?`,
          [username.trim()]
        );
        dbRun(`INSERT INTO auth_logs (username, acao) VALUES (?,?)`,
          [username.trim(), `hwid_bloqueado_${hwid.substring(0, 8)}`]
        );

        // Envia DM para o dono da conta avisando a tentativa
        if (user.discord_id) {
          _enviarDMHwidAlerta(user, hwid).catch(() => {});
        }

        return jsonResponse(res, 403, {
          success: false,
          message: 'Este software já está vinculado a outro computador. Contate o suporte no Discord.',
        });
      }
    }

    dbRun(
      `UPDATE auth_users SET ultimo_login=datetime('now','localtime') WHERE username=?`,
      [username.trim()]
    );
    dbRun(`INSERT INTO auth_logs (username, acao) VALUES (?,?)`, [username.trim(), 'login']);

    const sessionid = generateSession();

    // Resposta idêntica à estrutura do KeyAuth para máxima compatibilidade no C#
    return jsonResponse(res, 200, {
      success:   true,
      sessionid,
      message:   'Login efetuado com sucesso!',
      info: {
        username:      user.username,
        ip:            req.socket?.remoteAddress || '',
        hwid:          user.hwid || hwid || '',
        createdate:    user.criado_em,
        lastlogin:     user.ultimo_login || user.criado_em,
        subscriptions: [
          {
            subscription: user.plan,
            expiry:       user.expiry || 'permanent',
            timeleft:     '',
          },
        ],
      },
    });
  }

  // ── POST /auth/register ────────────────────────────────────────────────────
  // Chamado pelo bot Discord internamente ao aprovar plano
  if (url === '/auth/register' && method === 'POST') {
    const { username, password, plan, discord_id, bot_secret } = body;

    if (bot_secret !== (process.env.AUTH_BOT_SECRET || 'alpha_xit_bot_2024')) {
      return jsonResponse(res, 403, { success: false, message: 'Acesso não autorizado.' });
    }

    if (!username || !password) {
      return jsonResponse(res, 400, { success: false, message: 'Usuário e senha obrigatórios.' });
    }

    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
      return jsonResponse(res, 400, {
        success: false,
        message: 'Nome de usuário inválido. Use letras, números, _ ou . (3–32 caracteres).',
      });
    }

    const existing = dbGet(`SELECT id FROM auth_users WHERE username=?`, [username.trim()]);
    if (existing) {
      return jsonResponse(res, 409, { success: false, message: 'Esse nome de usuário já está em uso.' });
    }

    // Bloqueia se esse discord_id já tem conta (1 conta por Discord)
    if (discord_id) {
      const existeDiscord = dbGet(`SELECT username FROM auth_users WHERE discord_id=?`, [discord_id]);
      if (existeDiscord) {
        return jsonResponse(res, 409, {
          success: false,
          message: `Este Discord já possui a conta \`${existeDiscord.username}\` cadastrada.`,
        });
      }
    }

    const planMap = { gratis: 1, mensal: 30, anual: 365, permanente: -1 };
    const dias    = planMap[plan] ?? 1;
    let expiry;
    if (dias === -1) {
      expiry = 'permanent';
    } else {
      const d = new Date();
      d.setDate(d.getDate() + dias);
      expiry = d.toISOString();
    }

    try {
      dbRun(
        `INSERT INTO auth_users (username, password_hash, plan, expiry, discord_id) VALUES (?,?,?,?,?)`,
        [username.trim(), hashPassword(password), plan || 'gratis', expiry, discord_id || null]
      );
      dbRun(`INSERT INTO auth_logs (username, acao) VALUES (?,?)`, [username.trim(), 'register']);
    } catch (err) {
      return jsonResponse(res, 500, { success: false, message: 'Erro ao criar conta: ' + err.message });
    }

    return jsonResponse(res, 200, {
      success:  true,
      message:  'Conta criada com sucesso!',
      username: username.trim(),
      plan:     plan || 'gratis',
      expiry,
    });
  }

  // ── POST /auth/log ─────────────────────────────────────────────────────────
  // Equivalente ao KeyAuthApp.log(msg) no C#
  if (url === '/auth/log' && method === 'POST') {
    const { username, message: msg } = body;
    if (username) {
      dbRun(`INSERT INTO auth_logs (username, acao) VALUES (?,?)`, [username, msg || 'log']);
    }
    return jsonResponse(res, 200, { success: true });
  }

  // ── GET /auth/check/:username ──────────────────────────────────────────────
  if (url.startsWith('/auth/check/') && method === 'GET') {
    const username = decodeURIComponent(url.replace('/auth/check/', ''));
    const user = dbGet(
      `SELECT username, plan, expiry, criado_em FROM auth_users WHERE username=?`,
      [username]
    );
    if (!user) return jsonResponse(res, 404, { success: false, message: 'Usuário não encontrado.' });
    return jsonResponse(res, 200, { success: true, user });
  }

  // ── GET /auth/users ────────────────────────────────────────────────────────
  if (url === '/auth/users' && method === 'GET') {
    const users = dbQuery(
      `SELECT username, plan, expiry, discord_id, hwid, criado_em, ultimo_login
       FROM auth_users ORDER BY id DESC LIMIT 100`
    );
    return jsonResponse(res, 200, { success: true, count: users.length, users });
  }

  // ── POST /auth/hwid-check ──────────────────────────────────────────────────
  // C# chama isso antes do registro para ver se o PC já tem conta
  if (url === '/auth/hwid-check' && method === 'POST') {
    const { hwid, discord_id } = body;
    if (!hwid) return jsonResponse(res, 400, { success: false, message: 'HWID obrigatório.' });

    const user = dbGet(`SELECT username, plan, expiry, discord_id FROM auth_users WHERE hwid=?`, [hwid]);
    if (user) {
      // PC já tem conta — notifica via DM se discord_id fornecido
      if (discord_id && discord_id !== user.discord_id) {
        _enviarDMHwidTentativaCriar({ ...user, hwid }, discord_id).catch(() => {});
      }
      return jsonResponse(res, 409, {
        success: false,
        message: 'Este computador já possui uma conta registrada. Acesse com suas credenciais.',
        bloqueado: true,
      });
    }
    return jsonResponse(res, 200, { success: true, message: 'PC liberado para registro.' });
  }

  return jsonResponse(res, 404, { success: false, message: 'Endpoint não encontrado.' });
}

// ── DM: alerta de tentativa de login em PC diferente ────────────────────────
async function _enviarDMHwidAlerta(user, hwidTentativa) {
  try {
    const { Client } = require('discord.js');
    // Acessa o client global exposto no processo
    const client = global._discordClient;
    if (!client) return;

    const discordUser = await client.users.fetch(user.discord_id);
    const { EmbedBuilder } = require('discord.js');

    await discordUser.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('🚨 Tentativa de login em outro PC detectada!')
          .setDescription(
            `Alguém tentou fazer login na sua conta **Alpha Xit** em um computador diferente!\n\n` +
            `> 👤 **Sua conta:** \`${user.username}\`\n` +
            `> 🖥️ **PC bloqueado:** \`${hwidTentativa.substring(0, 16)}...\`\n` +
            `> 🕐 **Horário:** ${new Date().toLocaleString('pt-BR')}\n\n` +
            `**Se não foi você**, sua senha está segura mas fique atento.\n` +
            `**Se foi você** e quer trocar de PC, contate o **staff** no Discord.`
          )
          .setFooter({ text: 'Alpha Xit Auth • Segurança' })
          .setTimestamp(),
      ],
    });
  } catch (_) {}
}

// ── DM: avisa o dono quando outro Discord tenta criar conta no mesmo PC ──────
async function _enviarDMHwidTentativaCriar(user, discordIdTentativa) {
  try {
    const client = global._discordClient;
    if (!client || !user.discord_id) return;

    const discordUser = await client.users.fetch(user.discord_id);
    const { EmbedBuilder } = require('discord.js');

    await discordUser.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xF39C12)
          .setTitle('⚠️ Alguém tentou criar uma conta no seu PC!')
          .setDescription(
            `Um usuário diferente tentou criar uma nova conta no **mesmo computador** que a sua conta está vinculada.\n\n` +
            `> 👤 **Sua conta:** \`${user.username}\`\n` +
            `> 📦 **Seu plano:** ${_nomePlano(user.plan)}\n` +
            `> 🕐 **Horário:** ${new Date().toLocaleString('pt-BR')}\n\n` +
            `O registro foi **bloqueado automaticamente**.\n` +
            `Se você quer ceder seu acesso ou trocar de PC, contate o **staff**.`
          )
          .setFooter({ text: 'Alpha Xit Auth • Segurança' })
          .setTimestamp(),
      ],
    });
  } catch (_) {}
}

function _nomePlano(plan) {
  const nomes = { gratis: '🆓 Grátis', mensal: '📅 Mensal', anual: '📆 Anual', permanente: '♾️ Permanente' };
  return nomes[plan] || plan;
}

module.exports = { handleAuthRequest, hashPassword };
