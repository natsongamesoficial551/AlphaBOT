/**
 * pixCompra.js — Sistema seguro de compra de XIT Coins via Pix
 *
 * Fluxo:
 *  1. Usuário clica em um pacote (btn_coin_*)
 *  2. Bot abre modal com formulário: nome completo, CPF, telefone
 *  3. Após submit, bot valida os dados e gera QR Code Pix
 *  4. Bot envia QR Code + instruções na DM do comprador
 *  5. Bot envia pedido completo na DM do dono (OWNER_ID) com botões Aprovar/Reprovar
 *  6. Dono aprova → coins creditados + DM ao comprador
 *  7. Dono reprova → DM ao comprador informando reprovação
 */

const {
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, AttachmentBuilder, MessageFlags,
} = require('discord.js');

const db = require('../database');
const { gerarQrCodePix } = require('./pixQrCode');

// ── Tabela de preços dos pacotes ──────────────────────────────────────────────
const PACOTES = {
  100:  { coins: 100,  valor: '13.00',  label: 'R$ 13,00'  },
  250:  { coins: 250,  valor: '30.00',  label: 'R$ 30,00'  },
  500:  { coins: 500,  valor: '58.00',  label: 'R$ 58,00'  },
  1000: { coins: 1000, valor: '112.00', label: 'R$ 112,00' },
};

// ── Helpers de validação ──────────────────────────────────────────────────────

function validarCPF(cpf) {
  const s = cpf.replace(/\D/g, '');
  if (s.length !== 11 || /^(\d)\1+$/.test(s)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(s[i]) * (10 - i);
  let r = (soma * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(s[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(s[i]) * (11 - i);
  r = (soma * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(s[10]);
}

function validarTelefone(tel) {
  const s = tel.replace(/\D/g, '');
  return s.length >= 10 && s.length <= 11;
}

function formatarCPF(cpf) {
  const s = cpf.replace(/\D/g, '');
  return `${s.slice(0,3)}.${s.slice(3,6)}.${s.slice(6,9)}-${s.slice(9,11)}`;
}

function formatarTelefone(tel) {
  const s = tel.replace(/\D/g, '');
  if (s.length === 11) return `(${s.slice(0,2)}) ${s.slice(2,7)}-${s.slice(7)}`;
  return `(${s.slice(0,2)}) ${s.slice(2,6)}-${s.slice(6)}`;
}

// Mascara CPF para exibição segura (ex: 123.***.***-45)
function mascaraCPF(cpf) {
  const s = cpf.replace(/\D/g, '');
  return `${s.slice(0,3)}.***.***-${s.slice(9,11)}`;
}

// ── Abre o modal de formulário quando o usuário clica num pacote ──────────────
async function abrirFormularioCompra(interaction, pacote) {
  if (!PACOTES[pacote]) {
    return interaction.reply({
      embeds: [_embedErro('Pacote inválido.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`modal_pix_compra_${pacote}`)
    .setTitle(`🪙 Comprar ${pacote} XIT Coins — ${PACOTES[pacote].label}`);

  const inputNome = new TextInputBuilder()
    .setCustomId('pix_nome')
    .setLabel('Nome Completo')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ex: João da Silva')
    .setMinLength(5)
    .setMaxLength(80)
    .setRequired(true);

  const inputCPF = new TextInputBuilder()
    .setCustomId('pix_cpf')
    .setLabel('CPF (somente números ou com pontuação)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ex: 123.456.789-00 ou 12345678900')
    .setMinLength(11)
    .setMaxLength(14)
    .setRequired(true);

  const inputTelefone = new TextInputBuilder()
    .setCustomId('pix_telefone')
    .setLabel('Número de Telefone (com DDD)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ex: (11) 99999-9999 ou 11999999999')
    .setMinLength(10)
    .setMaxLength(15)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(inputNome),
    new ActionRowBuilder().addComponents(inputCPF),
    new ActionRowBuilder().addComponents(inputTelefone),
  );

  return interaction.showModal(modal);
}

// ── Processa o submit do formulário e inicia o fluxo de pagamento ─────────────
async function processarFormularioCompra(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { user, guild } = interaction;

  // Extrai o pacote do customId: modal_pix_compra_<pacote>
  const pacote = parseInt(interaction.customId.replace('modal_pix_compra_', ''));
  const info   = PACOTES[pacote];
  if (!info) {
    return interaction.editReply({ embeds: [_embedErro('Pacote inválido.')] });
  }

  // Coleta e valida os dados do formulário
  const nomeCompleto = interaction.fields.getTextInputValue('pix_nome').trim();
  const cpfRaw       = interaction.fields.getTextInputValue('pix_cpf').trim();
  const telefoneRaw  = interaction.fields.getTextInputValue('pix_telefone').trim();

  if (nomeCompleto.length < 5) {
    return interaction.editReply({ embeds: [_embedErro('Nome completo inválido. Informe pelo menos 5 caracteres.')] });
  }

  if (!validarCPF(cpfRaw)) {
    return interaction.editReply({ embeds: [_embedErro('CPF inválido. Verifique os dígitos e tente novamente.')] });
  }

  if (!validarTelefone(telefoneRaw)) {
    return interaction.editReply({ embeds: [_embedErro('Telefone inválido. Informe DDD + número (10 ou 11 dígitos).')] });
  }

  const cpfFormatado      = formatarCPF(cpfRaw);
  const telefoneFormatado = formatarTelefone(telefoneRaw);

  // Salva o pedido no banco
  const pedidoId = await db.criarPixPedido(
    user.id,
    user.tag || `${user.username}#0`,
    pacote,
    info.valor,
    nomeCompleto,
    cpfFormatado,
    telefoneFormatado,
    guild?.id || '',
  );

  // Gera o QR Code Pix
  const pixKey      = process.env.PIX_KEY   || '';
  const pixName     = process.env.PIX_NAME  || 'Alpha Xit';
  const pixCity     = process.env.PIX_CITY  || 'Sao Paulo';
  const txid        = `XIT${pedidoId}C${pacote}`.slice(0, 25);

  let qrBuffer = null;
  let pixPayload = null;

  if (pixKey) {
    try {
      const resultado = await gerarQrCodePix({
        pixKey,
        merchantName: pixName,
        merchantCity: pixCity,
        amount: info.valor,
        txid,
      });
      qrBuffer   = resultado.buffer;
      pixPayload = resultado.payload;
    } catch (e) {
      console.error('[PIX QR]', e.message);
    }
  }

  // ── Envia QR Code + instruções na DM do comprador ────────────────────────
  const embedComprador = new EmbedBuilder()
    .setColor(0x27AE60)
    .setTitle('💳 Pagamento via Pix — XIT Coins')
    .setDescription(
      `Olá **${nomeCompleto.split(' ')[0]}**! Seu pedido foi registrado.\n\n` +
      `Realize o pagamento Pix abaixo. Após o pagamento, nossa equipe irá verificar e liberar suas moedas automaticamente.`
    )
    .addFields(
      { name: '🪙 Pacote',       value: `**${pacote} XIT Coins**`,  inline: true  },
      { name: '💰 Valor',        value: `**R$ ${info.valor.replace('.', ',')}**`, inline: true },
      { name: '🆔 Pedido',       value: `**#PIX-${pedidoId}**`,     inline: true  },
      { name: '👤 Favorecido',   value: pixName,                    inline: true  },
      { name: '🔑 Chave Pix',    value: pixKey ? `\`${pixKey}\`` : '⚠️ Configure PIX_KEY no .env', inline: false },
    )
    .setTimestamp()
    .setFooter({ text: `⚡ Alpha Xit • Pedido #PIX-${pedidoId}` });

  if (qrBuffer) {
    embedComprador.setImage('attachment://qrcode_pix.png');
    embedComprador.addFields({
      name: '📱 QR Code',
      value: 'Escaneie o QR Code acima com o app do seu banco para pagar instantaneamente.',
      inline: false,
    });
  }

  embedComprador.addFields({
    name: '⏳ Próximos passos',
    value:
      '1. Pague o valor exato via Pix\n' +
      '2. Aguarde a verificação da equipe (geralmente rápida)\n' +
      '3. Você receberá uma DM confirmando ou informando qualquer problema\n' +
      '4. Após aprovação, seus coins serão creditados automaticamente!',
    inline: false,
  });

  embedComprador.addFields({
    name: '⚠️ Importante',
    value:
      '• Pague o **valor exato** indicado\n' +
      '• **Não compartilhe** esta mensagem com ninguém\n' +
      '• Em caso de dúvidas, contate um **@🛡️ ꜱᴛᴀꜰꜰ** no servidor',
    inline: false,
  });

  try {
    const dmPayload = { embeds: [embedComprador] };
    if (qrBuffer) {
      dmPayload.files = [new AttachmentBuilder(qrBuffer, { name: 'qrcode_pix.png' })];
    }
    await user.send(dmPayload);
  } catch {
    return interaction.editReply({
      embeds: [_embedErro('Não consegui enviar DM. Habilite mensagens diretas nas configurações do Discord.')],
    });
  }

  // ── Envia pedido completo na DM do dono para aprovação ────────────────────
  const ownerId = process.env.OWNER_ID || '';
  if (ownerId) {
    try {
      const ownerUser = await interaction.client.users.fetch(ownerId);

      const embedDono = new EmbedBuilder()
        .setColor(0xE67E22)
        .setTitle(`🔔 Novo Pedido Pix — #PIX-${pedidoId}`)
        .setDescription(
          `Um membro solicitou a compra de **${pacote} 🪙 XIT Coins** via Pix.\n` +
          `Verifique os dados abaixo e **aprove ou reprove** o pedido.`
        )
        .addFields(
          { name: '👤 Discord',       value: `<@${user.id}> (\`${user.tag || user.username}\`)`, inline: false },
          { name: '📛 Nome Completo', value: nomeCompleto,                                        inline: true  },
          { name: '🪪 CPF',           value: mascaraCPF(cpfRaw),                                  inline: true  },
          { name: '📞 Telefone',      value: telefoneFormatado,                                   inline: true  },
          { name: '🪙 Pacote',        value: `${pacote} XIT Coins`,                               inline: true  },
          { name: '💰 Valor',         value: `R$ ${info.valor.replace('.', ',')}`,                inline: true  },
          { name: '🆔 Pedido',        value: `#PIX-${pedidoId}`,                                  inline: true  },
          { name: '📅 Solicitado em', value: new Date().toLocaleString('pt-BR'),                  inline: false },
        )
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: '⚡ Alpha Xit — Sistema Antifraude' });

      const rowAcao = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`btn_pix_aprovar_${pedidoId}`)
          .setLabel('✅ Aprovar e Creditar Coins')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`btn_pix_reprovar_${pedidoId}`)
          .setLabel('❌ Reprovar Pedido')
          .setStyle(ButtonStyle.Danger),
      );

      const dmDonoPayload = { embeds: [embedDono], components: [rowAcao] };
      if (qrBuffer) {
        dmDonoPayload.files = [new AttachmentBuilder(qrBuffer, { name: 'qrcode_pix.png' })];
        embedDono.setImage('attachment://qrcode_pix.png');
      }

      const msgDono = await ownerUser.send(dmDonoPayload);

      // Salva o ID da mensagem na DM do dono para poder editar depois
      await db.salvarStaffDmMsgId(pedidoId, msgDono.id);
    } catch (e) {
      console.error('[PIX DONO DM]', e.message);
    }
  } else {
    console.warn('[PIX] OWNER_ID não configurado no .env — pedido não enviado ao dono!');
  }

  // Resposta efêmera de sucesso no canal
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x27AE60)
        .setDescription(
          `✅ **Pedido registrado com sucesso!**\n\n` +
          `📩 As instruções de pagamento foram enviadas na sua **DM**.\n` +
          `🆔 Pedido: **#PIX-${pedidoId}**\n\n` +
          `Após o pagamento, aguarde a verificação da equipe. Você será notificado por DM.`
        ),
    ],
  });

  // Log no canal de logs do servidor
  if (guild) {
    const logCh = guild.channels.cache.find(c => c.name === '📋・bot-logs');
    if (logCh) {
      try {
        await logCh.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xE67E22)
              .setTitle('📝 Log: COMPRA')
              .setDescription(
                `<@${user.id}> solicitou **${pacote} 🪙** via Pix (Pedido #PIX-${pedidoId})\n` +
                `Valor: R$ ${info.valor.replace('.', ',')} | Status: aguardando aprovação`
              )
              .addFields({ name: 'Responsável', value: `<@${user.id}>`, inline: true })
              .setTimestamp()
              .setFooter({ text: '⚡ Alpha Xit' }),
          ],
        });
      } catch (_) {}
    }
  }
}

// ── Processa aprovação do dono ────────────────────────────────────────────────
async function processarAprovacao(interaction) {
  const pedidoId = parseInt(interaction.customId.replace('btn_pix_aprovar_', ''));

  // Verifica se a interação vem do dono
  const ownerId = process.env.OWNER_ID || '';
  if (ownerId && interaction.user.id !== ownerId) {
    return interaction.reply({
      embeds: [_embedErro('Apenas o dono do servidor pode aprovar pedidos Pix.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferUpdate();

  const pedido = await db.getPixPedido(pedidoId);
  if (!pedido) {
    return interaction.editReply({ embeds: [_embedErro(`Pedido #PIX-${pedidoId} não encontrado.`)], components: [] });
  }
  if (pedido.status !== 'aguardando') {
    return interaction.editReply({
      embeds: [_embedErro(`Pedido #PIX-${pedidoId} já foi **${pedido.status}**.`)],
      components: [],
    });
  }

  // Credita os coins
  await db.aprovarPixPedido(pedidoId);
  await db.adicionarSaldo(pedido.comprador_id, pedido.pacote, `Compra via Pix — Pedido #PIX-${pedidoId}`);
  const novoSaldo = await db.getSaldo(pedido.comprador_id);

  // Notifica o comprador por DM
  try {
    const comprador = await interaction.client.users.fetch(pedido.comprador_id);
    await comprador.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ECC71)
          .setTitle('✅ Pagamento Aprovado — XIT Coins Creditados!')
          .setDescription(
            `Olá **${pedido.nome_completo.split(' ')[0]}**! Seu pagamento foi verificado e aprovado.\n\n` +
            `Suas moedas foram creditadas com sucesso! 🎉`
          )
          .addFields(
            { name: '🪙 Coins Recebidos', value: `**+${pedido.pacote} XIT Coins**`, inline: true  },
            { name: '💰 Saldo Atual',     value: `**${novoSaldo} 🪙**`,             inline: true  },
            { name: '🆔 Pedido',          value: `#PIX-${pedidoId}`,                inline: true  },
          )
          .setTimestamp()
          .setFooter({ text: '⚡ Alpha Xit — Obrigado pela compra!' }),
      ],
    });
  } catch (e) {
    console.error('[PIX APROVAR DM]', e.message);
  }

  // Atualiza a mensagem na DM do dono removendo os botões e marcando como aprovado
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle(`✅ Pedido #PIX-${pedidoId} — APROVADO`)
        .setDescription(
          `**${pedido.pacote} 🪙 XIT Coins** creditados para <@${pedido.comprador_id}>.\n` +
          `Saldo atual do comprador: **${novoSaldo} 🪙**\n\n` +
          `Aprovado por você em ${new Date().toLocaleString('pt-BR')}.`
        )
        .setTimestamp()
        .setFooter({ text: '⚡ Alpha Xit — Sistema Antifraude' }),
    ],
    components: [],
  });
}

// ── Processa reprovação do dono ───────────────────────────────────────────────
async function processarReprovacao(interaction) {
  const pedidoId = parseInt(interaction.customId.replace('btn_pix_reprovar_', ''));

  // Verifica se a interação vem do dono
  const ownerId = process.env.OWNER_ID || '';
  if (ownerId && interaction.user.id !== ownerId) {
    return interaction.reply({
      embeds: [_embedErro('Apenas o dono do servidor pode reprovar pedidos Pix.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferUpdate();

  const pedido = await db.getPixPedido(pedidoId);
  if (!pedido) {
    return interaction.editReply({ embeds: [_embedErro(`Pedido #PIX-${pedidoId} não encontrado.`)], components: [] });
  }
  if (pedido.status !== 'aguardando') {
    return interaction.editReply({
      embeds: [_embedErro(`Pedido #PIX-${pedidoId} já foi **${pedido.status}**.`)],
      components: [],
    });
  }

  await db.reprovarPixPedido(pedidoId);

  // Notifica o comprador por DM
  try {
    const comprador = await interaction.client.users.fetch(pedido.comprador_id);
    await comprador.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('❌ Pedido Reprovado — XIT Coins')
          .setDescription(
            `Olá **${pedido.nome_completo.split(' ')[0]}**! Infelizmente seu pedido **#PIX-${pedidoId}** foi reprovado.\n\n` +
            `Isso pode ocorrer por:\n` +
            `• Pagamento não identificado ou valor incorreto\n` +
            `• Dados de verificação inconsistentes\n` +
            `• Suspeita de fraude\n\n` +
            `Se acredita que houve um engano, entre em contato com um **@🛡️ ꜱᴛᴀꜰꜰ** no servidor.`
          )
          .addFields(
            { name: '🆔 Pedido',  value: `#PIX-${pedidoId}`,                                inline: true },
            { name: '🪙 Pacote',  value: `${pedido.pacote} XIT Coins`,                      inline: true },
            { name: '💰 Valor',   value: `R$ ${pedido.valor_reais.replace('.', ',')}`,       inline: true },
          )
          .setTimestamp()
          .setFooter({ text: '⚡ Alpha Xit' }),
      ],
    });
  } catch (e) {
    console.error('[PIX REPROVAR DM]', e.message);
  }

  // Atualiza a mensagem na DM do dono
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle(`❌ Pedido #PIX-${pedidoId} — REPROVADO`)
        .setDescription(
          `Pedido de **${pedido.pacote} 🪙** de <@${pedido.comprador_id}> foi reprovado.\n` +
          `O comprador foi notificado por DM.\n\n` +
          `Reprovado por você em ${new Date().toLocaleString('pt-BR')}.`
        )
        .setTimestamp()
        .setFooter({ text: '⚡ Alpha Xit — Sistema Antifraude' }),
    ],
    components: [],
  });
}

// ── Helper interno ────────────────────────────────────────────────────────────
function _embedErro(msg) {
  return new EmbedBuilder().setColor(0xE74C3C).setDescription(`❌ ${msg}`);
}

module.exports = {
  PACOTES,
  abrirFormularioCompra,
  processarFormularioCompra,
  processarAprovacao,
  processarReprovacao,
};
