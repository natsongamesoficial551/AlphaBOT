/**
 * myauth.js — Sistema Auth Key
 *
 * Fluxo:
 * 1. Pessoa clica "Solicitar Auth ID" no canal
 * 2. Modal: Nome Completo, Usuário, Senha
 * 3. Bot manda pedido pro canal staff com ✅ Aprovar / ❌ Reprovar
 * 4. ADM clica em Aprovar → modal de expiração (ANO/MÊS/SEMANA/DIA/HORA)
 *    → bot gera Auth Key única e manda DM
 * 5. Pessoa digita o Auth Key no C# pra ativar
 * 6. Auth Key é permanente por padrão; expiração só se o admin definir
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');
const crypto = require('crypto');
const db = require('../database');

const AUTH_CHANNEL_ID  = process.env.AUTH_CHANNEL_ID  || '';
const STAFF_CHANNEL_ID = process.env.STAFF_CHANNEL_ID || '';

// ── Gera Auth Key no formato XXXXXX-XXXXXX-XXXXXX ─────────────────────────
function gerarAuthKey() {
  const seg = () => crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${seg()}-${seg()}-${seg()}`;
}

// ── Hash de senha ─────────────────────────────────────────────────────────
function hashPassword(password) {
  const salt = process.env.AUTH_SALT || 'alphaxitsalt2024';
  return crypto.createHash('sha256').update(password + salt).digest('hex');
}

// ── Calcula data de expiração a partir dos campos do modal ────────────────
// Retorna null se todos forem 0 (permanente), ou um ISO string
function calcularExpiry(anos, meses, semanas, dias, horas) {
  const total = anos + meses + semanas + dias + horas;
  if (total === 0) return null; // permanente

  const agora = new Date();
  agora.setFullYear(agora.getFullYear() + anos);
  agora.setMonth(agora.getMonth() + meses);
  agora.setDate(agora.getDate() + semanas * 7 + dias);
  agora.setHours(agora.getHours() + horas);
  return agora.toISOString();
}

// ── Formata label de expiração para exibição ──────────────────────────────
function formatarExpiryLabel(anos, meses, semanas, dias, horas, expiryIso) {
  if (!expiryIso) return '♾️ Permanente';
  const partes = [];
  if (anos)    partes.push(`${anos} ano${anos > 1 ? 's' : ''}`);
  if (meses)   partes.push(`${meses} ${meses > 1 ? 'meses' : 'mês'}`);
  if (semanas) partes.push(`${semanas} semana${semanas > 1 ? 's' : ''}`);
  if (dias)    partes.push(`${dias} dia${dias > 1 ? 's' : ''}`);
  if (horas)   partes.push(`${horas} hora${horas > 1 ? 's' : ''}`);
  const data = new Date(expiryIso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `📅 ${partes.join(', ')} — expira em ${data}`;
}

// ── Embed principal do canal (botão de solicitação) ───────────────────────
function embedAuthPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🔑 Alpha Xit — Solicitar Auth ID')
    .setDescription(
      '> Solicite seu **Auth ID** para acessar o software!\n\n' +
      '**Como funciona:**\n' +
      '> 1️⃣ Clique em **Solicitar Auth ID** e preencha seus dados\n' +
      '> 2️⃣ Aguarde a aprovação do **staff**\n' +
      '> 3️⃣ Receba seu **Auth ID** na DM\n' +
      '> 4️⃣ Digite o Auth ID no software para ativar\n\n' +
      '> ⚠️ Apenas **1 Auth ID por pessoa**. Seja honesto!'
    )
    .setFooter({ text: "Borgesnatan09's Application • Alpha Xit Auth" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_auth_solicitar')
      .setLabel('Solicitar Auth ID')
      .setEmoji('🔑')
      .setStyle(ButtonStyle.Primary)
  );

  return { embed, row };
}

// ── Modal de solicitação ──────────────────────────────────────────────────
function modalSolicitarKey() {
  const modal = new ModalBuilder()
    .setCustomId('modal_auth_solicitar')
    .setTitle('🔑 Solicitar Auth ID');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('auth_nome')
        .setLabel('Nome e Sobrenome')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: João Silva')
        .setMinLength(4).setMaxLength(60).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('auth_username')
        .setLabel('Usuário (para login no software)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: joaosilva (sem espaços)')
        .setMinLength(3).setMaxLength(32).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('auth_password')
        .setLabel('Senha')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Mínimo 6 caracteres')
        .setMinLength(6).setMaxLength(64).setRequired(true)
    ),
  );

  return modal;
}

// ── Modal de expiração (admin ao aprovar) ─────────────────────────────────
function modalExpiracaoAprovar(reqId) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_auth_expiry_${reqId}`)
    .setTitle('⏳ Definir Expiração do Auth ID');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('expiry_ano')
        .setLabel('Anos (0 = ignorar)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 1')
        .setMinLength(1).setMaxLength(3).setRequired(true)
        .setValue('0')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('expiry_mes')
        .setLabel('Meses (0 = ignorar)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 6')
        .setMinLength(1).setMaxLength(2).setRequired(true)
        .setValue('0')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('expiry_semana')
        .setLabel('Semanas (0 = ignorar)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 2')
        .setMinLength(1).setMaxLength(2).setRequired(true)
        .setValue('0')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('expiry_dia')
        .setLabel('Dias (0 = ignorar)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 7')
        .setMinLength(1).setMaxLength(3).setRequired(true)
        .setValue('0')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('expiry_hora')
        .setLabel('Horas (0 = ignorar)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 12')
        .setMinLength(1).setMaxLength(4).setRequired(true)
        .setValue('0')
    ),
  );

  return modal;
}

// ── Handler: botão "Solicitar Auth ID" ────────────────────────────────────
async function handleBtnAuthSolicitar(interaction) {
  const solicitacao = await db.getSolicitacao(interaction.user.id);
  const conta       = await db.getAuthUserByDiscord(interaction.user.id);

  if (conta) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xF39C12).setDescription(
        '⚠️ Você já possui um **Auth ID** ativo!\n\nSuas credenciais foram enviadas na sua DM quando foi aprovado.\nSe perdeu, fale com o **staff**.'
      )],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (solicitacao) {
    const statusMsg = {
      pendente:  '⏳ Sua solicitação está **aguardando aprovação** do staff.',
      reprovado: '❌ Sua solicitação foi **reprovada**. Fale com o staff para mais informações.',
      aprovado:  '✅ Sua solicitação já foi **aprovada**! Verifique sua DM.',
    };
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xF39C12).setDescription(
        statusMsg[solicitacao.status] || '⚠️ Você já tem uma solicitação.'
      )],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.showModal(modalSolicitarKey());
}

// ── Handler: submit do modal de solicitação ───────────────────────────────
async function handleModalAuthSolicitar(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const nomeCompleto = interaction.fields.getTextInputValue('auth_nome').trim();
  const username     = interaction.fields.getTextInputValue('auth_username').trim();
  const password     = interaction.fields.getTextInputValue('auth_password').trim();

  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(
        '❌ Usuário inválido! Use apenas letras, números, `_` ou `.` (3–32 caracteres, sem espaços).'
      )],
    });
  }

  const usernameEmUso = await db.getAuthUserByUsername(username);
  if (usernameEmUso) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(
        '❌ Este nome de usuário já está em uso. Escolha outro.'
      )],
    });
  }

  const resultado = await db.criarSolicitacao(
    interaction.user.id,
    interaction.user.tag,
    nomeCompleto,
    username,
    hashPassword(password)
  );

  if (!resultado.ok) {
    const msgs = {
      pendente:  '⏳ Você já tem uma solicitação aguardando aprovação.',
      aprovado:  '✅ Você já foi aprovado! Verifique sua DM.',
      reprovado: '❌ Sua solicitação anterior foi reprovada. Fale com o staff.',
    };
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xF39C12).setDescription(
        msgs[resultado.status] || '⚠️ Você já tem uma solicitação registrada.'
      )],
    });
  }

  const req = await db.getSolicitacao(interaction.user.id);

  const guild   = interaction.guild;
  const chStaff = guild?.channels.cache.get(STAFF_CHANNEL_ID)
               || guild?.channels.cache.find(c =>
                    c.name.includes('staff') || c.name.includes('bot-logs')
                  );

  if (chStaff) {
    const rowAdmin = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_auth_aprovar_${req.id}`)
        .setLabel('✅ Aprovar')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`btn_auth_reprovar_${req.id}`)
        .setLabel('❌ Reprovar')
        .setStyle(ButtonStyle.Danger),
    );

    const msgStaff = await chStaff.send({
      embeds: [new EmbedBuilder()
        .setColor(0xF39C12)
        .setTitle('🔑 Nova Solicitação de Auth ID')
        .setDescription(
          `> 👤 **Discord:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
          `> 📛 **Nome:** ${nomeCompleto}\n` +
          `> 🔑 **Usuário:** \`${username}\`\n` +
          `> 🆔 **Solicitação ID:** #${req.id}\n\n` +
          `Converse com o usuário para verificar a identidade antes de aprovar.\n` +
          `Após confirmar, clique em **✅ Aprovar** para definir a expiração e gerar o Auth ID.`
        )
        .setFooter({ text: 'Alpha Xit Auth • Aguardando aprovação do staff' })
        .setTimestamp()
      ],
      components: [rowAdmin],
    });

    await db.salvarStaffMsgId(req.id, msgStaff.id);
  }

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle('✅ Solicitação enviada!')
      .setDescription(
        `Sua solicitação foi enviada para aprovação do **staff**!\n\n` +
        `> 📛 **Nome:** ${nomeCompleto}\n` +
        `> 🔑 **Usuário:** \`${username}\`\n\n` +
        `Aguarde — o staff irá verificar suas informações e pode entrar em contato.\n` +
        `Quando aprovado, você receberá seu **Auth ID** na **DM**.`
      )
      .setFooter({ text: 'Alpha Xit Auth' })
      .setTimestamp()
    ],
  });
}

// ── Handler: staff clica em Aprovar → abre modal de expiração ────────────
async function handleBtnAuthAprovar(interaction, reqId) {
  const req = await db.getSolicitacaoPorId(parseInt(reqId));
  if (!req) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('❌ Solicitação não encontrada.')],
      flags: MessageFlags.Ephemeral,
    });
  }
  if (req.status === 'aprovado') {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xF39C12).setDescription('⚠️ Esta solicitação já foi aprovada.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Abre modal de expiração
  await interaction.showModal(modalExpiracaoAprovar(reqId));
}

// ── Handler: submit do modal de expiração (aprovação final) ──────────────
async function handleModalAuthExpiry(interaction, reqId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const req = await db.getSolicitacaoPorId(parseInt(reqId));
  if (!req) {
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('❌ Solicitação não encontrada.')] });
  }
  if (req.status === 'aprovado') {
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xF39C12).setDescription('⚠️ Esta solicitação já foi aprovada.')] });
  }

  // Lê os campos do modal
  const parseField = (field) => {
    const v = parseInt(interaction.fields.getTextInputValue(field).trim(), 10);
    return isNaN(v) || v < 0 ? 0 : v;
  };
  const anos    = parseField('expiry_ano');
  const meses   = parseField('expiry_mes');
  const semanas = parseField('expiry_semana');
  const dias    = parseField('expiry_dia');
  const horas   = parseField('expiry_hora');

  const expiryIso   = calcularExpiry(anos, meses, semanas, dias, horas);
  const expiryLabel = formatarExpiryLabel(anos, meses, semanas, dias, horas, expiryIso);

  const authKey = gerarAuthKey();
  const ok = await db.aprovarSolicitacao(req.id, authKey);

  if (!ok) {
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('❌ Erro ao aprovar. Discord já pode ter uma conta vinculada.')] });
  }

  // Aplica expiração se definida
  if (expiryIso) {
    await db.setExpiryAdm(req.discord_id, expiryIso);
  }

  // Envia Auth ID via DM
  try {
    const user = await interaction.client.users.fetch(req.discord_id);
    await user.send({
      embeds: [new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('🎉 Seu Auth ID foi aprovado!')
        .setDescription(
          `Olá, **${req.nome_completo}**!\n\n` +
          `Sua solicitação foi **aprovada** pelo staff.\n\n` +
          `**🔑 Seu Auth ID:**\n` +
          `\`\`\`\n${authKey}\n\`\`\`\n` +
          `**👤 Usuário:** \`${req.username}\`\n\n` +
          `**⏳ Expiração:** ${expiryLabel}\n\n` +
          `**Como usar:**\n` +
          `> 1. Abra o software Alpha Xit\n` +
          `> 2. Digite o **Usuário** e a **Senha** que você criou\n` +
          `> 3. Insira o **Auth ID** acima\n\n` +
          `> ⚠️ Guarde este Auth ID com segurança — ele é único e pessoal!`
        )
        .setFooter({ text: 'Alpha Xit Auth • Não compartilhe seu Auth ID!' })
        .setTimestamp()
      ],
    });
  } catch (_) {}

  // Atualiza mensagem do staff (remove botões)
  try { await interaction.message.edit({ components: [] }); } catch (_) {}

  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(0x2ECC71).setDescription(
      `✅ **${req.nome_completo}** (${req.discord_tag}) aprovado!\n` +
      `Auth ID gerado e enviado na DM.\n` +
      `\`${authKey}\`\n` +
      `**Expiração:** ${expiryLabel}`
    )],
  });
}

// ── Handler: staff reprova ────────────────────────────────────────────────
async function handleBtnAuthReprovar(interaction, reqId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const req = await db.getSolicitacaoPorId(parseInt(reqId));
  if (!req) {
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('❌ Solicitação não encontrada.')] });
  }

  await db.atualizarStatusSolicitacao(req.id, 'reprovado');

  try {
    const user = await interaction.client.users.fetch(req.discord_id);
    await user.send({
      embeds: [new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('❌ Solicitação Reprovada')
        .setDescription(
          `Olá, **${req.nome_completo}**!\n\n` +
          `Sua solicitação de Auth ID foi **reprovada** pelo staff.\n\n` +
          `Se acredita que foi um engano, entre em contato com o **staff** no servidor.`
        )
        .setFooter({ text: 'Alpha Xit Auth' })
        .setTimestamp()
      ],
    });
  } catch (_) {}

  try { await interaction.message.edit({ components: [] }); } catch (_) {}

  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(
      `❌ Solicitação de **${req.nome_completo}** reprovada. Usuário notificado na DM.`
    )],
  });
}

// ── Roteadores ────────────────────────────────────────────────────────────
async function handleAuthButton(interaction) {
  const { customId } = interaction;
  if (customId === 'btn_auth_solicitar')          return handleBtnAuthSolicitar(interaction);
  if (customId.startsWith('btn_auth_aprovar_'))   return handleBtnAuthAprovar(interaction, customId.replace('btn_auth_aprovar_', ''));
  if (customId.startsWith('btn_auth_reprovar_'))  return handleBtnAuthReprovar(interaction, customId.replace('btn_auth_reprovar_', ''));
  return false;
}

async function handleAuthModal(interaction) {
  if (interaction.customId === 'modal_auth_solicitar')       return handleModalAuthSolicitar(interaction);
  if (interaction.customId.startsWith('modal_auth_expiry_')) return handleModalAuthExpiry(interaction, interaction.customId.replace('modal_auth_expiry_', ''));
  return false;
}

module.exports = { handleAuthButton, handleAuthModal, embedAuthPayload, AUTH_CHANNEL_ID };
