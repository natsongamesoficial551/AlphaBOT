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
const axios = require('axios');
const crypto = require('crypto');

// ─── Config KeyAuth ──────────────────────────────────────────────────────────
const KA_OWNER_ID    = process.env.KEYAUTH_OWNER_ID;
const KA_APP_SECRET  = process.env.KEYAUTH_APP_SECRET;
const KA_APP_NAME    = process.env.KEYAUTH_APP_NAME    || "Borgesnatan09's Application";
const KA_APP_VERSION = process.env.KEYAUTH_APP_VERSION || '1.0';
const KA_CHANNEL_ID  = '1488295073274790015';

// Planos disponíveis
const PLANOS = {
  gratis:     { label: '🆓 Grátis (24h)',    expiry: 1,           dias: 1,    preco: 0,  emoji: '🆓' },
  mensal:     { label: '📅 1 Mês — R$25',    expiry: 30,          dias: 30,   preco: 25, emoji: '📅' },
  anual:      { label: '📆 1 Ano — R$40',    expiry: 365,         dias: 365,  preco: 40, emoji: '📆' },
  permanente: { label: '♾️ Permanente — R$85', expiry: -1,         dias: -1,   preco: 85, emoji: '♾️' },
};

// ─── KeyAuth API ─────────────────────────────────────────────────────────────
async function keyauthRequest(params) {
  const base = 'https://keyauth.win/api/seller/';
  const query = new URLSearchParams({ sellerkey: KA_APP_SECRET, ...params });
  const res = await axios.get(`${base}?${query.toString()}`, { timeout: 10000 });
  return res.data;
}

async function criarLicenca(plano) {
  const cfg = PLANOS[plano];
  if (!cfg) throw new Error('Plano inválido.');

  const params = {
    type:    'add',
    format:  'JSON',
    expiry:  cfg.expiry === -1 ? 99999 : cfg.expiry, // 99999 dias = "permanente"
    mask:    'XXXXXX-XXXXXX-XXXXXX',
    level:   1,
    amount:  1,
    owner:   KA_OWNER_ID,
    app:     KA_APP_NAME,
    note:    `Discord-${plano}-${Date.now()}`,
  };

  const data = await keyauthRequest(params);

  if (!data.success) {
    throw new Error(data.message || 'Erro ao criar licença no KeyAuth.');
  }

  // A API retorna a key gerada
  return data.key || (data.keys && data.keys[0]);
}

async function criarContaKeyAuth(username, password, key) {
  const params = {
    type:     'register',
    format:   'JSON',
    user:     username,
    pass:     password,
    key:      key,
    owner:    KA_OWNER_ID,
    app:      KA_APP_NAME,
    version:  KA_APP_VERSION,
  };

  const data = await keyauthRequest(params);
  return data;
}

// ─── Embed principal ─────────────────────────────────────────────────────────
function embedKeyAuth() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🔑 KeyAuth — Criar Conta')
    .setDescription(
      '> Crie sua conta no **KeyAuth** e acesse nosso software instantaneamente!\n\n' +
      '**Planos disponíveis:**\n\n' +
      `🆓 **Grátis** — 24 horas de acesso\n` +
      `📅 **Mensal** — 1 mês · R$ 25,00\n` +
      `📆 **Anual** — 1 ano · R$ 40,00\n` +
      `♾️ **Permanente** — Acesso vitalício · R$ 85,00\n\n` +
      '> Clique em **KeyAuth** abaixo para criar sua conta!'
    )
    .setFooter({ text: `${KA_APP_NAME} • Powered by KeyAuth` })
    .setTimestamp();
}

// ─── Row com botão KeyAuth ────────────────────────────────────────────────────
function rowKeyAuth() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_keyauth_abrir')
      .setLabel('KeyAuth')
      .setEmoji('🔑')
      .setStyle(ButtonStyle.Primary)
  );
}

// ─── Embed de seleção de plano ────────────────────────────────────────────────
function rowSelecionarPlano() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_ka_plano_gratis').setLabel('🆓 Grátis (24h)').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('btn_ka_plano_mensal').setLabel('📅 Mensal — R$25').setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_ka_plano_anual').setLabel('📆 Anual — R$40').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('btn_ka_plano_permanente').setLabel('♾️ Permanente — R$85').setStyle(ButtonStyle.Danger),
  );
  return [row1, row2];
}

function embedSelecionarPlano() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🔑 Selecione seu Plano')
    .setDescription(
      'Escolha o plano desejado para criar sua conta no KeyAuth.\n\n' +
      '> **Grátis** é liberado automaticamente!\n' +
      '> Planos **pagos** requerem confirmação do staff após o pagamento.'
    )
    .setFooter({ text: `${KA_APP_NAME}` });
}

// ─── Modal de criação de conta ────────────────────────────────────────────────
function modalCriarConta(plano) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_ka_criar_${plano}`)
    .setTitle('🔑 Criar Conta KeyAuth');

  const inputUser = new TextInputBuilder()
    .setCustomId('ka_username')
    .setLabel('Nome de usuário')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ex: NatanXit')
    .setMinLength(3)
    .setMaxLength(32)
    .setRequired(true);

  const inputPass = new TextInputBuilder()
    .setCustomId('ka_password')
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

// Botão principal "KeyAuth"
async function handleBtnKeyAuthAbrir(interaction) {
  await interaction.reply({
    embeds: [embedSelecionarPlano()],
    components: rowSelecionarPlano(),
    flags: MessageFlags.Ephemeral,
  });
}

// Botão de seleção de plano
async function handleBtnKaPlano(interaction, plano) {
  const cfg = PLANOS[plano];
  if (!cfg) return interaction.reply({ content: '❌ Plano inválido.', flags: MessageFlags.Ephemeral });

  // Mostra modal para inserir user/pass
  await interaction.showModal(modalCriarConta(plano));
}

// Submit do modal
async function handleModalKaCriar(interaction, plano) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const cfg = PLANOS[plano];
  if (!cfg) return interaction.editReply({ content: '❌ Plano inválido.' });

  const username = interaction.fields.getTextInputValue('ka_username').trim();
  const password = interaction.fields.getTextInputValue('ka_password').trim();

  // Validações básicas
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(
        '❌ Nome de usuário inválido! Use apenas letras, números, `_`, `-` ou `.` (3–32 caracteres).'
      )],
    });
  }

  try {
    if (cfg.preco === 0) {
      // ── PLANO GRÁTIS: cria automaticamente ──
      const key = await criarLicenca(plano);
      if (!key) throw new Error('Não foi possível gerar a licença.');

      const result = await criarContaKeyAuth(username, password, key);

      if (!result.success) {
        // Erros comuns da API
        const msg = result.message?.toLowerCase() || '';
        if (msg.includes('user already exists') || msg.includes('username already taken')) {
          return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(
              '❌ Esse nome de usuário **já está em uso**. Escolha outro!'
            )],
          });
        }
        throw new Error(result.message || 'Erro ao criar conta.');
      }

      // Sucesso plano grátis
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x2ECC71)
          .setTitle('✅ Conta criada com sucesso!')
          .setDescription(
            `🎉 Sua conta no **KeyAuth** foi criada!\n\n` +
            `> 👤 **Usuário:** \`${username}\`\n` +
            `> ⏳ **Plano:** ${cfg.label}\n` +
            `> 🔑 **Licença:** \`${key}\`\n\n` +
            `Acesse o software com as credenciais acima!\n` +
            `> ⚠️ Guarde sua senha em segredo.`
          )
          .setFooter({ text: `${KA_APP_NAME} • Expira em 24h` })
          .setTimestamp()
        ],
      });

    } else {
      // ── PLANOS PAGOS: registra pedido e informa pagamento ──
      const pixKey = process.env.PIX_KEY || 'Contate o suporte';
      const pixName = process.env.PIX_NAME || KA_APP_NAME;

      // Salva dados pendentes em log de canal (staff confirma manualmente)
      const guild = interaction.guild;
      const chLog = guild?.channels.cache.get(KA_CHANNEL_ID)
                 || guild?.channels.cache.find(c => c.name === '📋・bot-logs');

      if (chLog) {
        const rowAdmin = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`btn_ka_aprovar_${interaction.user.id}_${plano}_${username}_${Buffer.from(password).toString('base64')}`)
            .setLabel('✅ Aprovar & Criar Conta')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`btn_ka_rejeitar_${interaction.user.id}`)
            .setLabel('❌ Rejeitar')
            .setStyle(ButtonStyle.Danger),
        );

        await chLog.send({
          embeds: [new EmbedBuilder()
            .setColor(0xF39C12)
            .setTitle('💰 Novo Pedido KeyAuth — Aguardando Pagamento')
            .setDescription(
              `> 👤 **Discord:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
              `> 🔑 **Usuário KA:** \`${username}\`\n` +
              `> 📦 **Plano:** ${cfg.label}\n` +
              `> 💵 **Valor:** R$ ${cfg.preco},00\n` +
              `> ⏳ **Duração:** ${cfg.dias === -1 ? 'Permanente' : `${cfg.dias} dias`}\n\n` +
              `Após confirmar o pagamento, clique em **✅ Aprovar**.`
            )
            .setTimestamp()
          ],
          components: [rowAdmin],
        });
      }

      // Resposta ao usuário com instruções de pagamento
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xF39C12)
          .setTitle('💰 Instruções de Pagamento')
          .setDescription(
            `✅ Pedido registrado para o plano **${cfg.label}**!\n\n` +
            `**Pague via PIX:**\n` +
            `> 🔑 **Chave PIX:** \`${pixKey}\`\n` +
            `> 👤 **Nome:** ${pixName}\n` +
            `> 💵 **Valor:** R$ ${cfg.preco},00\n\n` +
            `Após o pagamento, **aguarde a confirmação do staff**.\n` +
            `Sua conta será criada automaticamente!\n\n` +
            `> ⚠️ Envie o comprovante no chat de suporte.`
          )
          .setFooter({ text: `${cfg.label} • ${KA_APP_NAME}` })
          .setTimestamp()
        ],
      });
    }

  } catch (err) {
    console.error('[KEYAUTH]', err.message);
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(
        `❌ Erro ao criar conta: \`${err.message}\`\n\nTente novamente ou contate o suporte.`
      )],
    });
  }
}

// Botão admin: aprovar pedido pago
async function handleBtnKaAprovar(interaction, partes) {
  // partes: [userId, plano, username, passwordB64]
  const [userId, plano, username, passwordB64] = partes;
  const password = Buffer.from(passwordB64, 'base64').toString('utf8');
  const cfg = PLANOS[plano];

  if (!cfg) return interaction.reply({ content: '❌ Plano inválido.', flags: MessageFlags.Ephemeral });

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const key = await criarLicenca(plano);
    if (!key) throw new Error('Falha ao gerar licença.');

    const result = await criarContaKeyAuth(username, password, key);
    if (!result.success) throw new Error(result.message || 'Erro ao criar conta.');

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
            `> 🔑 **Licença:** \`${key}\`\n\n` +
            `Acesse o software com as credenciais acima!\n` +
            `> ⚠️ Guarde sua senha em segredo.`
          )
          .setFooter({ text: `${KA_APP_NAME}` })
          .setTimestamp()
        ],
      });
    } catch (_) {}

    // Edita a mensagem original (desabilita botões)
    try {
      await interaction.message.edit({ components: [] });
    } catch (_) {}

    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x2ECC71).setDescription(
        `✅ Conta \`${username}\` criada com plano **${cfg.label}**!\nUsuário notificado na DM.`
      )],
    });

  } catch (err) {
    console.error('[KEYAUTH APROVAR]', err.message);
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(
        `❌ Erro ao criar conta: \`${err.message}\``
      )],
    });
  }
}

// Botão admin: rejeitar pedido
async function handleBtnKaRejeitar(interaction, userId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const user = await interaction.client.users.fetch(userId);
    await user.send({
      embeds: [new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('❌ Pedido KeyAuth Recusado')
        .setDescription(
          'Seu pedido foi **recusado** pelo staff.\n\n' +
          'Se acredita que foi um erro, abra um ticket de suporte.'
        )
        .setFooter({ text: KA_APP_NAME })
      ],
    });
  } catch (_) {}

  try { await interaction.message.edit({ components: [] }); } catch (_) {}

  await interaction.editReply({ content: '❌ Pedido rejeitado e usuário notificado.' });
}

// ─── Roteador principal ───────────────────────────────────────────────────────
async function handleKeyAuthButton(interaction) {
  const { customId } = interaction;

  if (customId === 'btn_keyauth_abrir') {
    return handleBtnKeyAuthAbrir(interaction);
  }

  if (customId.startsWith('btn_ka_plano_')) {
    const plano = customId.replace('btn_ka_plano_', '');
    return handleBtnKaPlano(interaction, plano);
  }

  if (customId.startsWith('btn_ka_aprovar_')) {
    const partes = customId.replace('btn_ka_aprovar_', '').split('_');
    return handleBtnKaAprovar(interaction, partes);
  }

  if (customId.startsWith('btn_ka_rejeitar_')) {
    const userId = customId.replace('btn_ka_rejeitar_', '');
    return handleBtnKaRejeitar(interaction, userId);
  }

  return false; // não era um botão do keyauth
}

async function handleKeyAuthModal(interaction) {
  const { customId } = interaction;

  if (customId.startsWith('modal_ka_criar_')) {
    const plano = customId.replace('modal_ka_criar_', '');
    return handleModalKaCriar(interaction, plano);
  }

  return false;
}

// ─── Comando /keyauth-setup ───────────────────────────────────────────────────
async function enviarEmbedKeyAuth(channel) {
  await channel.send({
    embeds: [embedKeyAuth()],
    components: [rowKeyAuth()],
  });
}

module.exports = {
  handleKeyAuthButton,
  handleKeyAuthModal,
  enviarEmbedKeyAuth,
  KA_CHANNEL_ID,
};
