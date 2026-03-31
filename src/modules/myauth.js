/**
 * myauth.js — Módulo de autenticação própria no bot Discord
 * Substitui completamente o KeyAuth.
 * 
 * O bot salva usuários no banco local (SQLite via sql.js)
 * e expõe uma API REST própria hospedada no Render.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const { run, query, get } = require('../database');

// ─── Config ──────────────────────────────────────────────────────────────────
const AUTH_CHANNEL_ID  = process.env.AUTH_CHANNEL_ID || '1488295073274790015';
const BOT_SECRET       = process.env.AUTH_BOT_SECRET  || 'alpha_xit_bot_2024';

// Planos disponíveis (igual ao KeyAuth anterior)
const PLANOS = {
  gratis:     { label: '🆓 Grátis (24h)',     dias: 1,    preco: 0,  emoji: '🆓' },
  mensal:     { label: '📅 1 Mês — R$25',     dias: 30,   preco: 25, emoji: '📅' },
  anual:      { label: '📆 1 Ano — R$40',     dias: 365,  preco: 40, emoji: '📆' },
  permanente: { label: '♾️ Permanente — R$85', dias: -1,   preco: 85, emoji: '♾️' },
};

// ─── Funções diretas no banco (sem HTTP, mesmo processo) ─────────────────────
const crypto = require('crypto');

function _nomePlano(plan) {
  const nomes = { gratis: '🆓 Grátis (24h)', mensal: '📅 Mensal', anual: '📆 Anual', permanente: '♾️ Permanente' };
  return nomes[plan] || plan;
}

function hashPassword(password) {
  return crypto.createHash('sha256')
    .update(password + (process.env.AUTH_SALT || 'alphaxitsalt2024'))
    .digest('hex');
}

function criarContaLocal(username, password, plan, discordId) {
  // Verifica se já existe
  const existing = get(`SELECT id FROM auth_users WHERE username=?`, [username]);
  if (existing) {
    return { success: false, message: 'Esse nome de usuário já está em uso.' };
  }

  // Calcula expiração
  const dias = PLANOS[plan]?.dias ?? 1;
  let expiry;
  if (dias === -1) {
    expiry = 'permanent';
  } else {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    expiry = d.toISOString();
  }

  const hash = hashPassword(password);

  try {
    run(
      `INSERT INTO auth_users (username, password_hash, plan, expiry, discord_id) VALUES (?,?,?,?,?)`,
      [username, hash, plan, expiry, discordId || null]
    );
    run(`INSERT INTO auth_logs (username, acao) VALUES (?, ?)`, [username, 'register']);
    return { success: true, expiry, plan };
  } catch (err) {
    return { success: false, message: 'Erro ao criar conta: ' + err.message };
  }
}

// ─── Embed principal do canal de autenticação ─────────────────────────────────
function embedAuthPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🔑 Alpha Xit — Criar Conta')
    .setDescription(
      '> Crie sua conta e acesse nosso software instantaneamente!\n\n' +
      '**Planos disponíveis:**\n\n' +
      '🆓 **Grátis** — 24 horas de acesso\n' +
      '📅 **Mensal** — 1 mês · R$ 25,00\n' +
      '📆 **Anual** — 1 ano · R$ 40,00\n' +
      '♾️ **Permanente** — Acesso vitalício · R$ 85,00\n\n' +
      '> Clique em **Criar Conta** abaixo para começar!'
    )
    .setFooter({ text: "Borgesnatan09's Application • Powered by Alpha Xit Auth" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_auth_abrir')
      .setLabel('Criar Conta')
      .setEmoji('🔑')
      .setStyle(ButtonStyle.Primary)
  );

  return { embed, row };
}

// ─── Embed seleção de plano ───────────────────────────────────────────────────
function embedSelecionarPlano() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🔑 Selecione seu Plano')
    .setDescription(
      'Escolha o plano desejado para criar sua conta.\n\n' +
      '> **Grátis** é liberado automaticamente!\n' +
      '> Planos **pagos** requerem confirmação do staff após o pagamento.'
    )
    .setFooter({ text: "Alpha Xit Auth" });
}

function rowSelecionarPlano() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_auth_plano_gratis').setLabel('🆓 Grátis (24h)').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('btn_auth_plano_mensal').setLabel('📅 Mensal — R$25').setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_auth_plano_anual').setLabel('📆 Anual — R$40').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('btn_auth_plano_permanente').setLabel('♾️ Permanente — R$85').setStyle(ButtonStyle.Danger),
  );
  return [row1, row2];
}

// ─── Modal de criação de conta ────────────────────────────────────────────────
function modalCriarConta(plano) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_auth_criar_${plano}`)
    .setTitle('🔑 Criar Conta');

  const inputUser = new TextInputBuilder()
    .setCustomId('auth_username')
    .setLabel('Nome de usuário')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ex: NatanXit')
    .setMinLength(3)
    .setMaxLength(32)
    .setRequired(true);

  const inputPass = new TextInputBuilder()
    .setCustomId('auth_password')
    .setLabel('Senha')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Mínimo 6 caracteres')
    .setMinLength(6)
    .setMaxLength(64)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(inputUser),
    new ActionRowBuilder().addComponents(inputPass),
  );

  return modal;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleBtnAuthAbrir(interaction) {
  await interaction.reply({
    embeds: [embedSelecionarPlano()],
    components: rowSelecionarPlano(),
    flags: MessageFlags.Ephemeral,
  });
}

async function handleBtnAuthPlano(interaction, plano) {
  const cfg = PLANOS[plano];
  if (!cfg) return interaction.reply({ content: '❌ Plano inválido.', flags: MessageFlags.Ephemeral });
  await interaction.showModal(modalCriarConta(plano));
}

async function handleModalAuthCriar(interaction, plano) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const cfg = PLANOS[plano];
  if (!cfg) return interaction.editReply({ content: '❌ Plano inválido.' });

  const username = interaction.fields.getTextInputValue('auth_username').trim();
  const password = interaction.fields.getTextInputValue('auth_password').trim();

  // Validação do username
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(
        '❌ Nome de usuário inválido! Use apenas letras, números, `_`, `-` ou `.` (3–32 caracteres).'
      )],
    });
  }

  // ── BLOQUEIO: 1 conta por Discord ──────────────────────────────────────────
  // Verifica se esse discord_id já tem conta cadastrada
  const { getAuthUserByDiscord } = require('../database');
  const contaExistente = getAuthUserByDiscord(interaction.user.id);
  if (contaExistente) {
    // Envia as credenciais via DM (privado, seguro)
    try {
      await interaction.user.send({
        embeds: [new EmbedBuilder()
          .setColor(0xF39C12)
          .setTitle('⚠️ Você já possui uma conta cadastrada!')
          .setDescription(
            `Sua conta no **Alpha Xit** já foi criada anteriormente.\n\n` +
            `> 👤 **Usuário:** \`${contaExistente.username}\`\n` +
            `> 📦 **Plano:** ${_nomePlano(contaExistente.plan)}\n\n` +
            `Use essas credenciais para acessar o software.\n` +
            `Se esqueceu sua senha, fale com o **staff** no canal de suporte.`
          )
          .setFooter({ text: 'Alpha Xit Auth • Esta mensagem é privada' })
          .setTimestamp()
        ],
      });
    } catch (_) {}

    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xF39C12).setDescription(
        `⚠️ Você já possui uma conta cadastrada!\n\nAs suas credenciais foram enviadas na sua **DM** 📩`
      )],
    });
  }

  try {
    // ── PLANO GRÁTIS: cria automaticamente ──────────────────────────────────
    if (cfg.preco === 0) {
      const result = criarContaLocal(username, password, plano, interaction.user.id);

      if (!result.success) {
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(
            `❌ ${result.message}`
          )],
        });
      }

      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x2ECC71)
          .setTitle('✅ Conta criada com sucesso!')
          .setDescription(
            `🎉 Sua conta foi criada!\n\n` +
            `> 👤 **Usuário:** \`${username}\`\n` +
            `> ⏳ **Plano:** ${cfg.label}\n` +
            `> 🔑 **Senha:** configurada (guarde em segredo!)\n\n` +
            `Use as credenciais acima para acessar o software!\n` +
            `> ⚠️ Guarde sua senha em segredo.`
          )
          .setFooter({ text: `Alpha Xit Auth • Expira em 24h` })
          .setTimestamp()
        ],
      });

    // ── PLANOS PAGOS: redireciona para canal de suporte ──────────────────────
    } else {
      const canalSuporte = process.env.AUTH_SUPORTE_CANAL || '❓・auth-id-duvidas';
      const guild = interaction.guild;

      // Tenta achar pelo nome configurado
      const chSuporte = guild?.channels.cache.find(c =>
        c.name === canalSuporte || c.name.includes('auth-id-duvidas') || c.name.includes('suporte')
      );

      const mencionCanal = chSuporte ? `<#${chSuporte.id}>` : `**#${canalSuporte}**`;

      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`${cfg.emoji} Plano ${cfg.label}`)
          .setDescription(
            `Para adquirir o plano **${cfg.label}**, você precisa falar com o **staff**!\n\n` +
            `> 📩 Vá até o canal ${mencionCanal}\n` +
            `> 💬 Informe o plano desejado e aguarde um staff te atender\n` +
            `> ✅ Após confirmação do pagamento, sua conta será criada pelo staff\n\n` +
            `**O que você já escolheu:**\n` +
            `> 👤 **Usuário desejado:** \`${username}\`\n` +
            `> 📦 **Plano:** ${cfg.label}\n` +
            `> 💵 **Valor:** R$ ${cfg.preco},00\n\n` +
            `> ⚠️ Leve essas informações ao canal de suporte!`
          )
          .setFooter({ text: 'Alpha Xit Auth • Atendimento via staff' })
          .setTimestamp()
        ],
      });
    }

  } catch (err) {
    console.error('[AUTH]', err.message);
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(
        `❌ Erro ao criar conta: \`${err.message}\`\n\nTente novamente ou contate o suporte.`
      )],
    });
  }
}

// ─── Admin: Aprovar pedido pago ───────────────────────────────────────────────
async function handleBtnAuthAprovar(interaction, partes) {
  const [userId, plano, username, passwordB64] = partes;
  const password = Buffer.from(passwordB64, 'base64').toString('utf8');
  const cfg = PLANOS[plano];

  if (!cfg) return interaction.reply({ content: '❌ Plano inválido.', flags: MessageFlags.Ephemeral });

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const result = criarContaLocal(username, password, plano, userId);
    if (!result.success) throw new Error(result.message);

    // Notifica o usuário via DM
    try {
      const user = await interaction.client.users.fetch(userId);
      await user.send({
        embeds: [new EmbedBuilder()
          .setColor(0x2ECC71)
          .setTitle('✅ Pagamento Confirmado — Conta Criada!')
          .setDescription(
            `🎉 Seu pagamento foi confirmado e sua conta foi criada!\n\n` +
            `> 👤 **Usuário:** \`${username}\`\n` +
            `> 📦 **Plano:** ${cfg.label}\n` +
            `> ⏳ **Duração:** ${cfg.dias === -1 ? 'Permanente' : `${cfg.dias} dias`}\n` +
            `> 🔑 **Senha:** a que você definiu\n\n` +
            `Acesse o software com as credenciais acima!\n` +
            `> ⚠️ Guarde sua senha em segredo.`
          )
          .setFooter({ text: "Alpha Xit Auth" })
          .setTimestamp()
        ],
      });
    } catch (_) {}

    // Desabilita botões da mensagem de aprovação
    try { await interaction.message.edit({ components: [] }); } catch (_) {}

    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x2ECC71).setDescription(
        `✅ Conta \`${username}\` criada com plano **${cfg.label}**!\nUsuário notificado na DM.`
      )],
    });

  } catch (err) {
    console.error('[AUTH APROVAR]', err.message);
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(
        `❌ Erro ao criar conta: \`${err.message}\``
      )],
    });
  }
}

// ─── Admin: Rejeitar pedido ───────────────────────────────────────────────────
async function handleBtnAuthRejeitar(interaction, userId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const user = await interaction.client.users.fetch(userId);
    await user.send({
      embeds: [new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('❌ Pedido Recusado')
        .setDescription(
          'Seu pedido foi **recusado** pelo staff.\n\n' +
          'Se acredita que foi um erro, abra um ticket de suporte.'
        )
        .setFooter({ text: 'Alpha Xit Auth' })
      ],
    });
  } catch (_) {}

  try { await interaction.message.edit({ components: [] }); } catch (_) {}
  await interaction.editReply({ content: '❌ Pedido rejeitado e usuário notificado.' });
}

// ─── Roteador principal ───────────────────────────────────────────────────────
async function handleAuthButton(interaction) {
  const { customId } = interaction;

  if (customId === 'btn_auth_abrir') return handleBtnAuthAbrir(interaction);
  if (customId.startsWith('btn_auth_plano_')) {
    const plano = customId.replace('btn_auth_plano_', '');
    return handleBtnAuthPlano(interaction, plano);
  }
  if (customId.startsWith('btn_auth_aprovar_')) {
    const partes = customId.replace('btn_auth_aprovar_', '').split('_');
    return handleBtnAuthAprovar(interaction, partes);
  }
  if (customId.startsWith('btn_auth_rejeitar_')) {
    const userId = customId.replace('btn_auth_rejeitar_', '');
    return handleBtnAuthRejeitar(interaction, userId);
  }

  return false;
}

async function handleAuthModal(interaction) {
  const { customId } = interaction;

  if (customId.startsWith('modal_auth_criar_')) {
    const plano = customId.replace('modal_auth_criar_', '');
    return handleModalAuthCriar(interaction, plano);
  }

  return false;
}

module.exports = {
  handleAuthButton,
  handleAuthModal,
  embedAuthPayload,
  AUTH_CHANNEL_ID,
};
