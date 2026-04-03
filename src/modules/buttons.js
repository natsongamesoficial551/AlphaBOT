const { PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const db = require('../database');
const { embedRegistroSucesso, embedJaRegistrado, embedBoasVindasDM,
        embedPIX, embedPedidoConfirmado, embedEntregaProduto,
        embedListaProdutos, embedProduto, embedErro, embedLog,
        embedPIXCoin, embedCoinRecebido, embedSaldoInsuficiente, embedSaldo } = require('../embeds');
const { handleAuthButton, handleAuthModal } = require('./myauth');
const { abrirFormularioCompra, processarFormularioCompra, processarAprovacao, processarReprovacao } = require('./pixCompra');

async function handleButton(interaction) {
  const { customId, guild, member, user } = interaction;

  // ── AUTH PRÓPRIO ────────────────────────────────────────
  if (customId.startsWith('btn_auth') || customId.startsWith('btn_auth_')) {
    return handleAuthButton(interaction);
  }

  try {
  // ── COMPRAR PACOTE COIN (novo fluxo: formulário + QR Code Pix + aprovação por DM) ───
  if (customId.startsWith('btn_coin_')) {
    const pacote = parseInt(customId.replace('btn_coin_', ''));
    // Abre o modal de formulário antifraude (não precisa de deferReply)
    return abrirFormularioCompra(interaction, pacote);
  }

  // ── APROVAR PEDIDO PIX (apenas dono via DM) ──────────────────────────────
  if (customId.startsWith('btn_pix_aprovar_')) {
    return processarAprovacao(interaction);
  }

  // ── REPROVAR PEDIDO PIX (apenas dono via DM) ────────────────────────────
  if (customId.startsWith('btn_pix_reprovar_')) {
    return processarReprovacao(interaction);
  }

  // ── COMPRAR PRODUTO COM COINS ──────────────────────────────────────────────
  if (customId.startsWith('btn_comprar_coin_')) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const produtoId = parseInt(customId.replace('btn_comprar_coin_', ''));
    const produto = await db.getProduto(produtoId);
    if (!produto) return interaction.editReply({ embeds: [embedErro('Produto não encontrado.')] });

    const saldoAtual = await db.getSaldo(user.id);
    if (saldoAtual < produto.preco_coins) {
      return interaction.editReply({ embeds: [embedSaldoInsuficiente(saldoAtual, produto.preco_coins)] });
    }

    const debitou = await db.removerSaldo(user.id, produto.preco_coins, `Compra: ${produto.nome}`);
    if (!debitou) return interaction.editReply({ embeds: [embedErro('Saldo insuficiente.')] });

    // Entrega o produto na DM (arquivo ou link)
    try {
      if (produto.link && _isDiscordCDN(produto.link)) {
        await _enviarArquivoDM(user, produto.nome, produto.link, produto.imagem_url);
      } else {
        await user.send({ embeds: [embedEntregaProduto(produto)] });
      }
    } catch (_) {}

    const novoSaldo = await db.getSaldo(user.id);
    await interaction.editReply({ embeds: [{ color: 0x2ECC71, description: `✅ Compra realizada! **${produto.preco_coins} 🪙** debitados.\nSaldo restante: **${novoSaldo} 🪙**\nProduto entregue na sua DM!` }] });
    _log(guild, 'compra', `<@${user.id}> comprou **${produto.nome}** por ${produto.preco_coins} 🪙`, user.id);
    return;
  }

  // ── REGISTRAR ──────────────────────────────────────────
  if (customId === 'btn_registrar') {
    if (await db.membroExiste(user.id)) {
      const membro = await db.getMembro(user.id);
      return interaction.reply({ embeds: [embedJaRegistrado(membro?.xit_id)], flags: MessageFlags.Ephemeral });
    }

    const modal = new ModalBuilder()
      .setCustomId('modal_registro')
      .setTitle('✅ Criar seu XIT ID');

    const input = new TextInputBuilder()
      .setCustomId('xit_id_input')
      .setLabel('Digite seu XIT ID (exatamente 4 dígitos)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ex: 1234')
      .setMinLength(4)
      .setMaxLength(4)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // ── VER PRODUTOS ────────────────────────────────────────
  if (customId === 'btn_ver_produtos') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const produtos = await db.listarProdutos('pago');
    const { embed } = embedListaProdutos(produtos);
    return interaction.editReply({ embeds: [embed] });
  }

  // ── COMPRAR PRODUTO ─────────────────────────────────────
  if (customId.startsWith('btn_comprar_')) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const produtoId = parseInt(customId.replace('btn_comprar_', ''));
    const produto = await db.getProduto(produtoId);

    if (!produto) {
      return interaction.editReply({ embeds: [embedErro('Produto não encontrado ou indisponível.')] });
    }

    const pedidoId = await db.criarPedido(produto.id, produto.nome, user.id, user.username);

    try {
      await user.send({ embeds: [embedPIX(produto, pedidoId)] });
      await interaction.editReply({ embeds: [{ color: 0x27AE60, description: '✅ As instruções de pagamento foram enviadas na sua **DM**!' }] });
    } catch {
      await interaction.editReply({ embeds: [embedErro('Não consegui enviar DM. Habilite mensagens diretas nas configurações do Discord.')] });
    }

    _log(guild, 'compra', `<@${user.id}> iniciou compra do produto **${produto.nome}** (Pedido #${pedidoId})`, user.id);
    return;
  }

  // ── DOWNLOAD PRODUTO FREE ───────────────────────────────
  if (customId.startsWith('btn_download_')) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const produtoId = parseInt(customId.replace('btn_download_', ''));
    const produto = await db.getProduto(produtoId);

    if (!produto) {
      return interaction.editReply({ embeds: [embedErro('Produto não encontrado.')] });
    }

    try {
      if (produto.link && _isDiscordCDN(produto.link)) {
        // Envia o arquivo diretamente na DM
        await _enviarArquivoDM(user, produto.nome, produto.link, produto.imagem_url);
      } else {
        // Link externo ou sem link
        const embed = new EmbedBuilder()
          .setColor(0x2ECC71)
          .setTitle(`🆓 ${produto.nome} — Acesso Gratuito`)
          .setDescription(produto.descricao || '')
          .setTimestamp()
          .setFooter({ text: '⚡ Alpha Xit' });

        if (produto.link) embed.addFields({ name: '🔗 Acesse aqui', value: produto.link, inline: false });
        else embed.setDescription('Produto sem arquivo configurado. Contate um @🛡️ ꜱᴛᴀꜰꜰ.');

        await user.send({ embeds: [embed] });
      }

      await interaction.editReply({ embeds: [{ color: 0x2ECC71, description: '✅ O conteúdo foi enviado na sua **DM**!' }] });
    } catch {
      await interaction.editReply({ embeds: [embedErro('Não consegui enviar DM. Habilite mensagens diretas nas configurações do Discord.')] });
    }

    _log(guild, 'compra', `<@${user.id}> obteve produto gratuito **${produto.nome}**`, user.id);
    return;
  }

  // ── INFO PRODUTO ────────────────────────────────────────
  if (customId.startsWith('btn_info_')) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const produtoId = parseInt(customId.replace('btn_info_', ''));
    const produto = await db.getProduto(produtoId);
    if (!produto) return interaction.editReply({ embeds: [embedErro('Produto não encontrado.')] });
    const { embed } = embedProduto(produto);
    return interaction.editReply({ embeds: [embed] });
  }

  // ── CONFIRMAR PAGAMENTO (admin) ─────────────────────────
  if (customId.startsWith('btn_confirmar_')) {
    if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ embeds: [embedErro('Sem permissão.')], ephemeral: true });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const pedidoId = parseInt(customId.replace('btn_confirmar_', ''));
    const pedido = await db.getPedido(pedidoId);
    if (!pedido) return interaction.editReply({ embeds: [embedErro(`Pedido #${pedidoId} não encontrado.`)] });
    if (pedido.status !== 'aguardando') return interaction.editReply({ embeds: [embedErro(`Pedido #${pedidoId} já foi ${pedido.status}.`)] });

    const produto = await db.getProduto(pedido.produto_id);
    await db.confirmarPedido(pedidoId);

    // Usa nome do pedido como fallback se produto foi deletado
    const nomeProduto = produto?.nome || pedido.produto_nome || 'Produto';
    const linkProduto = produto?.link || null;
    const nomeArquivo = produto?.imagem_url || null;

    try {
      const comprador = await interaction.client.users.fetch(pedido.comprador_id);
      await comprador.send({ embeds: [embedPedidoConfirmado({ nome: nomeProduto }, pedido.comprador_id)] });

      if (linkProduto) {
        if (_isDiscordCDN(linkProduto)) {
          await _enviarArquivoDM(comprador, nomeProduto, linkProduto, nomeArquivo);
        } else {
          await comprador.send({ embeds: [embedEntregaProduto({ nome: nomeProduto, link: linkProduto })] });
        }
      }
    } catch (_) {}

    await interaction.editReply({ embeds: [{ color: 0x2ECC71, description: `✅ Pedido #${pedidoId} de **${nomeProduto}** confirmado e entregue na DM!` }] });
    _log(guild, 'admin', `Pedido #${pedidoId} confirmado por <@${user.id}>`, user.id);
    return;
  }

  // ── CANCELAR PEDIDO (admin) ─────────────────────────────
  if (customId.startsWith('btn_cancelar_')) {
    if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ embeds: [embedErro('Sem permissão.')], ephemeral: true });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const pedidoId = parseInt(customId.replace('btn_cancelar_', ''));
    await db.cancelarPedido(pedidoId);

    await interaction.editReply({ embeds: [{ color: 0xE74C3C, description: `❌ Pedido #${pedidoId} cancelado.` }] });
    _log(guild, 'admin', `Pedido #${pedidoId} cancelado por <@${user.id}>`, user.id);
    return;
  }

  } catch (err) {
    console.error(`[BTN:${customId}]`, err);
    const payload = { embeds: [embedErro(`Erro interno: \`${err.message}\``)], ephemeral: true };
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.reply(payload);
    } catch (_) {}
  }
}

// ── MODAL SUBMIT — XIT ID ───────────────────────────────
async function handleModal(interaction) {
  // ── AUTH PRÓPRIO MODALS ────────────────────────────────
  if (interaction.customId.startsWith('modal_auth_')) {
    return handleAuthModal(interaction);
  }

  // ── MODAL DE COMPRA PIX (formulário antifraude) ──────────────────────
  if (interaction.customId.startsWith('modal_pix_compra_')) {
    return processarFormularioCompra(interaction);
  }

  if (interaction.customId !== 'modal_registro') return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { guild, member, user } = interaction;
  const xitId = interaction.fields.getTextInputValue('xit_id_input').trim();

  // Valida: só 4 dígitos numéricos
  if (!/^\d{4}$/.test(xitId)) {
    return interaction.editReply({ embeds: [embedErro('XIT ID inválido! Use exatamente **4 dígitos numéricos** (ex: `1234`).')]});
  }

  // Checa se já está em uso
  if (await db.xitIdEmUso(xitId)) {
    return interaction.editReply({ embeds: [embedErro(`O XIT ID \`${xitId}\` já está em uso. Escolha outro.`)] });
  }

  // Checa se já é membro
  if (await db.membroExiste(user.id)) {
    const membro = await db.getMembro(user.id);
    return interaction.editReply({ embeds: [embedJaRegistrado(membro?.xit_id)] });
  }

  // Dá cargo @Membro
  const cargoMembro = guild.roles.cache.find(r => r.name === '✅ ᴍᴇᴍʙʀᴏ');
  if (!cargoMembro) {
    return interaction.editReply({ embeds: [embedErro('Cargo de membro não encontrado. Contate um admin.')] });
  }

  try {
    await member.roles.add(cargoMembro);

    // Cria cargo exclusivo com o XIT ID
    const cargoXit = await guild.roles.create({
      name: `XIT-${xitId}`,
      color: '#9B59B6',
      hoist: false,
      mentionable: false,
      reason: `XIT ID do membro ${user.username}`,
    });
    await member.roles.add(cargoXit);

    // Salva no DB
    await db.registrarMembro(user.id, user.username, xitId);

    await interaction.editReply({ embeds: [embedRegistroSucesso(member, xitId)] });

    // DM de boas-vindas
    try { await user.send({ embeds: [embedBoasVindasDM(member, xitId)] }); } catch (_) {}

    _log(guild, 'registro', `<@${user.id}> se registrou com XIT ID \`${xitId}\``, user.id);

  } catch (err) {
    console.error(err);
    return interaction.editReply({ embeds: [embedErro('Erro ao registrar. Tente novamente.')] });
  }
}

// ── Helpers ───────────────────────────────────────────────

/**
 * Verifica se a URL é do CDN do Discord (arquivo enviado diretamente pelo Discord).
 */
function _isDiscordCDN(url) {
  if (!url) return false;
  return url.startsWith('https://cdn.discordapp.com/') ||
         url.startsWith('https://media.discordapp.net/');
}

/**
 * Baixa o arquivo da URL CDN do Discord e envia como attachment na DM do usuário.
 * Se o download falhar, cai de volta para enviar o link no embed.
 * @param {import('discord.js').User} destinatario
 * @param {string} nomeProduto
 * @param {string} urlArquivo  URL CDN do Discord
 * @param {string|null} nomeArquivo  Nome original do arquivo (ex: produto.zip)
 */
async function _enviarArquivoDM(destinatario, nomeProduto, urlArquivo, nomeArquivo) {
  const embedEntrega = new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle('📦 Entrega — Alpha Xit')
    .setDescription(`Seu produto **${nomeProduto}** foi entregue! Aproveite! 🎉\n\nO arquivo está em anexo abaixo. ⬇️`)
    .setTimestamp()
    .setFooter({ text: '⚡ Alpha Xit' });

  try {
    const buffer = await _downloadBuffer(urlArquivo);
    const fileName = nomeArquivo || _nomeDoUrl(urlArquivo);
    const attachment = new AttachmentBuilder(buffer, { name: fileName });
    await destinatario.send({ embeds: [embedEntrega], files: [attachment] });
  } catch (err) {
    console.error('[ENTREGA] Falha ao baixar/enviar arquivo, enviando link:', err.message);
    // Fallback: envia o link direto
    embedEntrega.setDescription(
      `Seu produto **${nomeProduto}** foi entregue! Aproveite! 🎉`
    ).addFields({ name: '🔗 Download', value: urlArquivo, inline: false });
    await destinatario.send({ embeds: [embedEntrega] });
  }
}

/**
 * Baixa uma URL e retorna um Buffer com o conteúdo.
 */
function _downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http');
    lib.get(url, (res) => {
      // Segue redirecionamentos
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return _downloadBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Extrai o nome do arquivo de uma URL.
 */
function _nomeDoUrl(url) {
  try {
    const partes = new URL(url).pathname.split('/');
    return partes[partes.length - 1] || 'arquivo';
  } catch {
    return 'arquivo';
  }
}

async function _log(guild, tipo, descricao, autorId) {
  db.addLog(guild.id, tipo, descricao, autorId);
  const logCh = guild.channels.cache.find(c => c.name === '📋・bot-logs');
  if (logCh) {
    try { await logCh.send({ embeds: [embedLog(tipo, descricao, autorId)] }); } catch (_) {}
  }
}

module.exports = { handleButton, handleModal };
