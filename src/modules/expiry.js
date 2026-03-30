/**
 * expiry.js — Sistema de notificação de expiração de licença via DM
 *
 * Roda um poller a cada hora e envia DM para usuários com licença prestes a expirar:
 *   - 7 dias antes
 *   - 3 dias antes
 *   - 1 dia antes
 *   - No momento da expiração (licença expirou)
 */

const { EmbedBuilder } = require('discord.js');
const { query, run } = require('../database');

// Intervalo de verificação: a cada 1 hora
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

// Avisos que serão enviados (em dias antes de expirar)
const AVISOS_DIAS = [7, 3, 1];

function startExpiryPoller(client) {
  console.log('[EXPIRY] 🔔 Poller de expiração iniciado');
  _checkExpiries(client);
  setInterval(() => _checkExpiries(client), CHECK_INTERVAL_MS);
}

async function _checkExpiries(client) {
  try {
    const agora   = new Date();
    const usuarios = query(
      `SELECT * FROM auth_users WHERE expiry IS NOT NULL AND expiry != 'permanent'`
    );

    for (const user of usuarios) {
      if (!user.discord_id) continue;

      const expDate  = new Date(user.expiry);
      const diffMs   = expDate - agora;
      const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // ── Licença EXPIRADA ────────────────────────────────────────────────────
      if (diffDias <= 0) {
        const jaNotificado = _jaNotificou(user.username, 'expirado');
        if (!jaNotificado) {
          await _enviarDM(client, user.discord_id, _embedExpirado(user));
          _salvarNotificacao(user.username, 'expirado');
          console.log(`[EXPIRY] ⚠️ Licença expirada notificada: ${user.username}`);
        }
        continue;
      }

      // ── Avisos antes de expirar ─────────────────────────────────────────────
      for (const dias of AVISOS_DIAS) {
        if (diffDias <= dias) {
          const chave = `aviso_${dias}d`;
          const jaNotificado = _jaNotificou(user.username, chave);
          if (!jaNotificado) {
            await _enviarDM(client, user.discord_id, _embedAviso(user, diffDias, expDate));
            _salvarNotificacao(user.username, chave);
            console.log(`[EXPIRY] 📬 Aviso de ${dias}d enviado para ${user.username} (expira em ${diffDias}d)`);
          }
          break; // só o aviso mais urgente por ciclo
        }
      }
    }
  } catch (err) {
    console.error('[EXPIRY] Erro no poller:', err.message);
  }
}

// ── Verifica se já enviou a notificação nesse ciclo ─────────────────────────
function _jaNotificou(username, tipo) {
  const { get } = require('../database');
  const row = get(
    `SELECT id FROM auth_logs WHERE username=? AND acao=? AND criado_em >= datetime('now','-8 hours')`,
    [username, `notif_${tipo}`]
  );
  return !!row;
}

function _salvarNotificacao(username, tipo) {
  run(`INSERT INTO auth_logs (username, acao) VALUES (?,?)`, [username, `notif_${tipo}`]);
}

// ── Envia DM ─────────────────────────────────────────────────────────────────
async function _enviarDM(client, discordId, embed) {
  try {
    const user = await client.users.fetch(discordId);
    await user.send({ embeds: [embed] });
  } catch (err) {
    console.warn(`[EXPIRY] Não foi possível enviar DM para ${discordId}:`, err.message);
  }
}

// ── Embed: aviso de expiração próxima ────────────────────────────────────────
function _embedAviso(user, diasRestantes, expDate) {
  const dataFormatada = expDate.toLocaleDateString('pt-BR', {
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });

  // Contagem regressiva formatada
  const totalHoras    = Math.ceil((expDate - new Date()) / (1000 * 60 * 60));
  const dias          = Math.floor(totalHoras / 24);
  const horas         = totalHoras % 24;
  const contagemStr   = dias > 0
    ? `**${dias} dia${dias > 1 ? 's' : ''}** e **${horas}h**`
    : `**${horas} hora${horas > 1 ? 's' : ''}**`;

  const cor = diasRestantes <= 1 ? 0xE74C3C : diasRestantes <= 3 ? 0xF39C12 : 0xF1C40F;
  const emoji = diasRestantes <= 1 ? '🚨' : diasRestantes <= 3 ? '⚠️' : '⏳';

  return new EmbedBuilder()
    .setColor(cor)
    .setTitle(`${emoji} Sua licença está prestes a expirar!`)
    .setDescription(
      `Olá, **${user.username}**!\n\n` +
      `Sua licença do **Alpha Xit** expira em ${contagemStr}.\n\n` +
      `> 📅 **Data de expiração:** ${dataFormatada}\n` +
      `> 📦 **Plano atual:** ${_nomePlano(user.plan)}\n\n` +
      `**Renove agora** para não perder o acesso ao software!\n` +
      `> Acesse o servidor e escolha um novo plano no canal de autenticação.`
    )
    .setFooter({ text: "Alpha Xit Auth • Renovação de licença" })
    .setTimestamp();
}

// ── Embed: licença expirada ──────────────────────────────────────────────────
function _embedExpirado(user) {
  return new EmbedBuilder()
    .setColor(0xE74C3C)
    .setTitle('❌ Sua licença expirou!')
    .setDescription(
      `Olá, **${user.username}**!\n\n` +
      `Sua licença do **Alpha Xit** expirou.\n\n` +
      `> 📦 **Plano anterior:** ${_nomePlano(user.plan)}\n\n` +
      `Você **não conseguirá mais fazer login** no software até renovar.\n\n` +
      `**Para renovar:** acesse o servidor Discord e crie uma nova conta\n` +
      `ou entre em contato com o **staff** para renovar sua licença atual.`
    )
    .setFooter({ text: "Alpha Xit Auth • Licença expirada" })
    .setTimestamp();
}

function _nomePlano(plan) {
  const nomes = {
    gratis:     '🆓 Grátis (24h)',
    mensal:     '📅 Mensal',
    anual:      '📆 Anual',
    permanente: '♾️ Permanente',
  };
  return nomes[plan] || plan;
}

module.exports = { startExpiryPoller };
