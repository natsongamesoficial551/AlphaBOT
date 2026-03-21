const { PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const db = require('../database');
const { embedRegistroSucesso, embedJaRegistrado, embedBoasVindasDM,
        embedPIX, embedPedidoConfirmado, embedEntregaProduto,
        embedListaProdutos, embedProduto, embedErro, embedLog,
        embedPIXCoin, embedCoinRecebido, embedSaldoInsuficiente, embedSaldo } = require('../embeds');

async function handleButton(interaction) {
  const { customId, guild, member, user } = interaction;

  try {

  // ── COMPRAR PACOTE COIN ────────────────────────────────
  if (customId.startsWith('btn_coin_')) {
    const pacote = parseInt(customId.replace('btn_coin_', ''));
    const precos = { 100: '13,00', 250: '30,00', 500: '58,00', 1000: '112,00' };
    if (!precos[pacote]) return interaction.reply({ embeds: [embedErro('Pacote inválido.')], flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const pedidoId = db.criarPedido(0, `COIN-${pacote}`, user.id, user.username);

    const embedPix = embedPIXCoin(pacote, pedidoId);
    if (!embedPix) return interaction.editReply({ embeds: [embedErro('Erro ao gerar embed de pagamento.')] });

    try {
      await user.send({ embeds: [embedPix] });
      await interaction.editReply({ embeds: [{ color: 0x27AE60, description: `✅ Instruções de pagamento enviadas na sua **DM**!\nPedido: \`#coin-${pedidoId}\`` }] });
    } catch {
      await interaction.editReply({ embeds: [embedErro('Não consegui enviar DM. Habilite mensagens diretas.')] });
    }
    _log(guild, 'compra', `<@${user.id}> solicitou ${pacote} 🪙 XIT Coins (Pedido #coin-${pedidoId})`, user.id);
    return;
  }

  // ── COMPRAR PRODUTO COM COINS ──────────────────────────
  if (customId.startsWith('btn_comprar_coin_')) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const produtoId = parseInt(customId.replace('btn_comprar_coin_', ''));
    const produto = db.getProduto(produtoId);
    if (!produto) return interaction.editReply({ embeds: [embedErro('Produto não encontrado.')] });

    const saldoAtual = db.getSaldo(user.id);
    if (saldoAtual < produto.preco_coins) {
      return interaction.editReply({ embeds: [embedSaldoInsuficiente(saldoAtual, produto.preco_coins)] });
    }

    const debitou = db.removerSaldo(user.id, produto.preco_coins, `Compra: ${produto.nome}`);
    if (!debitou) return interaction.editReply({ embeds: [embedErro('Saldo insuficiente.')] });

    // Entrega o produto na DM
    try {
      await user.send({ embeds: [embedEntregaProduto(produto)] });
    } catch (_) {}

    await interaction.editReply({ embeds: [{ color: 0x2ECC71, description: `✅ Compra realizada! **${produto.preco_coins} 🪙** debitados.\nSaldo restante: **${db.getSaldo(user.id)} 🪙**\nProduto entregue na sua DM!` }] });
    _log(guild, 'compra', `<@${user.id}> comprou **${produto.nome}** por ${produto.preco_coins} 🪙`, user.id);
    return;
  }

  // ── REGISTRAR ──────────────────────────────────────────
  if (customId === 'btn_registrar') {
    if (db.membroExiste(user.id)) {
      const membro = db.getMembro(user.id);
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
    const produtos = db.listarProdutos('pago');
    const { embed } = embedListaProdutos(produtos);
    return interaction.editReply({ embeds: [embed] });
  }

  // ── COMPRAR PRODUTO ─────────────────────────────────────
  if (customId.startsWith('btn_comprar_')) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const produtoId = parseInt(customId.replace('btn_comprar_', ''));
    const produto = db.getProduto(produtoId);

    if (!produto) {
      return interaction.editReply({ embeds: [embedErro('Produto não encontrado ou indisponível.')] });
    }

    const pedidoId = db.criarPedido(produto.id, produto.nome, user.id, user.username);

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
    const produto = db.getProduto(produtoId);

    if (!produto) {
      return interaction.editReply({ embeds: [embedErro('Produto não encontrado.')] });
    }

    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle(`🆓 ${produto.nome} — Acesso Gratuito`)
      .setDescription(produto.descricao || '')
      .setTimestamp()
      .setFooter({ text: '⚡ Alpha Xit' });

    if (produto.link) embed.addFields({ name: '🔗 Acesse aqui', value: produto.link, inline: false });
    else embed.setDescription('Produto sem link configurado. Contate um @🛡️ ꜱᴛᴀꜰꜰ.');

    try {
      await user.send({ embeds: [embed] });
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
    const produto = db.getProduto(produtoId);
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
    const pedido = db.getPedido(pedidoId);
    if (!pedido) return interaction.editReply({ embeds: [embedErro(`Pedido #${pedidoId} não encontrado.`)] });
    if (pedido.status !== 'aguardando') return interaction.editReply({ embeds: [embedErro(`Pedido #${pedidoId} já foi ${pedido.status}.`)] });

    const produto = db.getProduto(pedido.produto_id);
    db.confirmarPedido(pedidoId);

    // Usa nome do pedido como fallback se produto foi deletado
    const nomeProduto = produto?.nome || pedido.produto_nome || 'Produto';
    const linkProduto = produto?.link || null;

    try {
      const comprador = await interaction.client.users.fetch(pedido.comprador_id);
      await comprador.send({ embeds: [embedPedidoConfirmado({ nome: nomeProduto }, pedido.comprador_id)] });
      if (linkProduto) await comprador.send({ embeds: [embedEntregaProduto({ nome: nomeProduto, link: linkProduto })] });
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
    db.cancelarPedido(pedidoId);

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
  if (interaction.customId !== 'modal_registro') return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { guild, member, user } = interaction;
  const xitId = interaction.fields.getTextInputValue('xit_id_input').trim();

  // Valida: só 4 dígitos numéricos
  if (!/^\d{4}$/.test(xitId)) {
    return interaction.editReply({ embeds: [embedErro('XIT ID inválido! Use exatamente **4 dígitos numéricos** (ex: `1234`).')]});
  }

  // Checa se já está em uso
  if (db.xitIdEmUso(xitId)) {
    return interaction.editReply({ embeds: [embedErro(`O XIT ID \`${xitId}\` já está em uso. Escolha outro.`)] });
  }

  // Checa se já é membro
  if (db.membroExiste(user.id)) {
    const membro = db.getMembro(user.id);
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
    db.registrarMembro(user.id, user.username, xitId);

    await interaction.editReply({ embeds: [embedRegistroSucesso(member, xitId)] });

    // DM de boas-vindas
    try { await user.send({ embeds: [embedBoasVindasDM(member, xitId)] }); } catch (_) {}

    _log(guild, 'registro', `<@${user.id}> se registrou com XIT ID \`${xitId}\``, user.id);

  } catch (err) {
    console.error(err);
    return interaction.editReply({ embeds: [embedErro('Erro ao registrar. Tente novamente.')] });
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
