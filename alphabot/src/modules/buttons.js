/**
 * buttons.js — Handler de botões e modais (versão refatorada)
 *
 * REMOVIDO: XIT ID de registro, Xit Coins, btn_comprar_coin_*, modal_registro
 * MANTIDO: Auth, compra via PIX, download free, confirmar/cancelar pedido (admin)
 */

const {
  PermissionFlagsBits, MessageFlags,
  EmbedBuilder, AttachmentBuilder,
} = require('discord.js');

const db = require('../database');
const {
  embedPIX, embedPedidoConfirmado, embedEntregaProduto,
  embedErro, embedLog,
} = require('../embeds');
const { handleAuthButton, handleAuthModal } = require('./myauth');
const { abrirFormularioCompra, processarFormularioCompra, processarAprovacao, processarReprovacao } = require('./pixCompra');

// ── Botões ────────────────────────────────────────────────────────────────────

async function handleButton(interaction) {
  const { customId, guild, member, user } = interaction;

  // Auth
  if (customId.startsWith('btn_auth')) {
    return handleAuthButton(interaction);
  }

  try {

    // ── Comprar pacote coins via PIX (sistema antifraude) ─
    if (customId.startsWith('btn_coin_')) {
      const pacote = parseInt(customId.replace('btn_coin_', ''));
      return abrirFormularioCompra(interaction, pacote);
    }

    // ── Aprovar/Reprovar pedido PIX (dono via DM) ─────────
    if (customId.startsWith('btn_pix_aprovar_')) return processarAprovacao(interaction);
    if (customId.startsWith('btn_pix_reprovar_')) return processarReprovacao(interaction);

    // ── Comprar produto (PIX direto) ──────────────────────
    if (customId.startsWith('btn_comprar_')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const produtoId = parseInt(customId.replace('btn_comprar_', ''));
      const produto   = await db.getProduto(produtoId);

      if (!produto) {
        return interaction.editReply({ embeds: [embedErro('Produto não encontrado ou indisponível.')] });
      }

      const pedidoId = await db.criarPedido(produto.id, produto.nome, user.id, user.username);

      try {
        const { iniciarCompraProdutoPIX } = require('./pixCompra');
        await iniciarCompraProdutoPIX(interaction.client, guild, user, produto, pedidoId);
        
        await interaction.editReply({
          embeds: [{ color: 0x27AE60, description: '✅ As instruções de pagamento foram enviadas na sua **DM**!\n\nApós o pagamento, envie o comprovante lá mesmo.' }],
        });
      } catch (err) {
        console.error('[BTN_COMPRAR]', err.message);
        await interaction.editReply({ embeds: [embedErro('Não consegui enviar DM. Habilite mensagens diretas nas configurações do Discord.')] });
      }

      _log(guild, 'compra', `<@${user.id}> iniciou compra de **${produto.nome}** (Pedido #${pedidoId})`, user.id);
      return;
    }

    // ── Download produto gratuito ─────────────────────────
    if (customId.startsWith('btn_download_')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const produtoId = parseInt(customId.replace('btn_download_', ''));
      const produto   = await db.getProduto(produtoId);

      if (!produto) {
        return interaction.editReply({ embeds: [embedErro('Produto não encontrado.')] });
      }

      try {
        if (produto.link && _isDiscordCDN(produto.link)) {
          await _enviarArquivoDM(user, produto.nome, produto.link, produto.imagem_url);
        } else {
          const embed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle(`🆓 ${produto.nome} — Acesso Gratuito`)
            .setDescription(produto.descricao || 'Produto gratuito.')
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

      _log(guild, 'download', `<@${user.id}> obteve produto gratuito **${produto.nome}**`, user.id);
      return;
    }

    // ── Info do produto ───────────────────────────────────
    if (customId.startsWith('btn_info_')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const produtoId = parseInt(customId.replace('btn_info_', ''));
      const produto   = await db.getProduto(produtoId);
      if (!produto) return interaction.editReply({ embeds: [embedErro('Produto não encontrado.')] });

      const recursosFormatados = produto.recursos
        ? produto.recursos.split(',').map(r => `> ✅ ${r.trim()}`).join('\n')
        : null;

      const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle(`📦 ${produto.nome}`)
        .setDescription(
          `${produto.descricao || 'Sem descrição.'}\n\n` +
          (recursosFormatados ? `**⚡ Funcionalidades:**\n${recursosFormatados}\n\n` : '') +
          `💰 **Preço:** \`${produto.preco || 'Grátis'}\`\n` +
          `📦 **Entrega:** Arquivo via DM após confirmação`
        )
        .setFooter({ text: `⚡ Alpha Xit • ID #${produto.id}` })
        .setTimestamp();

      if (produto.imagem_url_banner) embed.setImage(produto.imagem_url_banner);

      return interaction.editReply({ embeds: [embed] });
    }

    // ── Confirmar pagamento (admin) ───────────────────────
    if (customId.startsWith('btn_confirmar_')) {
      if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply({ embeds: [embedErro('Sem permissão.')], flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const pedidoId = parseInt(customId.replace('btn_confirmar_', ''));
      const pedido   = await db.getPedido(pedidoId);
      if (!pedido)                        return interaction.editReply({ embeds: [embedErro(`Pedido #${pedidoId} não encontrado.`)] });
      if (pedido.status !== 'aguardando') return interaction.editReply({ embeds: [embedErro(`Pedido #${pedidoId} já foi ${pedido.status}.`)] });

      const produto     = await db.getProduto(pedido.produto_id);
      await db.confirmarPedido(pedidoId);

      const nomeProduto = produto?.nome || pedido.produto_nome || 'Produto';
      const linkProduto = produto?.link || null;
      const nomeArquivo = produto?.imagem_url || null;

      try {
        const comprador = await interaction.client.users.fetch(pedido.comprador_id);
        await comprador.send({ embeds: [embedPedidoConfirmado({ nome: nomeProduto }, pedido.comprador_id)] });
        if (linkProduto) {
          if (_isDiscordCDN(linkProduto)) await _enviarArquivoDM(comprador, nomeProduto, linkProduto, nomeArquivo);
          else await comprador.send({ embeds: [embedEntregaProduto({ nome: nomeProduto, link: linkProduto })] });
        }
      } catch (_) {}

      await interaction.editReply({ embeds: [{ color: 0x2ECC71, description: `✅ Pedido #${pedidoId} de **${nomeProduto}** confirmado e entregue na DM!` }] });
      _log(guild, 'admin', `Pedido #${pedidoId} confirmado por <@${user.id}>`, user.id);
      return;
    }

    // ── Cancelar pedido (admin) ───────────────────────────
    if (customId.startsWith('btn_cancelar_')) {
      if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply({ embeds: [embedErro('Sem permissão.')], flags: MessageFlags.Ephemeral });
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
    try {
      const payload = { embeds: [embedErro('Erro interno.')], flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.reply(payload);
    } catch (_) {}
  }
}

// ── Modals ────────────────────────────────────────────────────────────────────

async function handleModal(interaction) {
  // Auth modals
  if (interaction.customId.startsWith('modal_auth_')) {
    return handleAuthModal(interaction);
  }

  // Compra PIX modal (antifraude)
  if (interaction.customId.startsWith('modal_pix_compra_')) {
    return processarFormularioCompra(interaction);
  }

  // modal_registro foi REMOVIDO (XIT ID não existe mais)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _isDiscordCDN(url) {
  if (!url) return false;
  return url.startsWith('https://cdn.discordapp.com/') ||
         url.startsWith('https://media.discordapp.net/');
}

async function _enviarArquivoDM(destinatario, nomeProduto, urlArquivo, nomeArquivo) {
  const embed = new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle('📦 Entrega — Alpha Xit')
    .setDescription(`Seu produto **${nomeProduto}** foi entregue! Aproveite! 🎉\n\nO arquivo está em anexo abaixo. ⬇️`)
    .setTimestamp()
    .setFooter({ text: '⚡ Alpha Xit' });

  try {
    const buffer   = await _downloadBuffer(urlArquivo);
    const fileName = nomeArquivo || _nomeDoUrl(urlArquivo);
    await destinatario.send({ embeds: [embed], files: [new AttachmentBuilder(buffer, { name: fileName })] });
  } catch (err) {
    console.error('[ENTREGA]', err.message);
    embed.setDescription(`Seu produto **${nomeProduto}** foi entregue! 🎉`)
      .addFields({ name: '🔗 Download', value: urlArquivo, inline: false });
    await destinatario.send({ embeds: [embed] });
  }
}

function _downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http');
    lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return _downloadBuffer(res.headers.location).then(resolve).catch(reject);
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function _nomeDoUrl(url) {
  try { return new URL(url).pathname.split('/').pop() || 'arquivo'; }
  catch { return 'arquivo'; }
}

async function _log(guild, tipo, descricao, autorId) {
  db.addLog(guild.id, tipo, descricao, autorId);
  const logCh = guild.channels.cache.find(c => c.name === '📋・bot-logs');
  if (logCh) try { await logCh.send({ embeds: [embedLog(tipo, descricao, autorId)] }); } catch (_) {}
}

module.exports = { handleButton, handleModal, _isDiscordCDN, _enviarArquivoDM };
