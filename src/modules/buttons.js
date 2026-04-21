/**
 * buttons.js — Versão Refatorada para Alpha Xit
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

async function handleButton(interaction) {
  const { customId, guild, member, user } = interaction;
  const { checkSecurity } = require('./security');

  // Verifica segurança
  if (!(await checkSecurity(interaction))) return;

  // Registro
  if (customId === 'btn_registro_verificar') {
    const { handleRegistro } = require('./registration');
    return handleRegistro(interaction);
  }

  if (customId.startsWith('btn_auth')) return handleAuthButton(interaction);

  try {
    if (customId.startsWith('btn_coin_')) {
      const pacote = parseInt(customId.replace('btn_coin_', ''));
      return abrirFormularioCompra(interaction, pacote);
    }

    if (customId.startsWith('btn_pix_aprovar_')) return processarAprovacao(interaction);
    if (customId.startsWith('btn_pix_reprovar_')) return processarReprovacao(interaction);

    if (customId.startsWith('btn_comprar_')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

      const produtoId = parseInt(customId.replace('btn_comprar_', ''));
      const produto   = await db.getProduto(produtoId);

      if (!produto) {
        return interaction.editReply({ embeds: [embedErro('Produto não encontrado.')] }).catch(() => {});
      }

      const pedidoId = await db.criarPedido(produto.id, produto.nome, user.id, user.username);

      try {
        const { iniciarCompraProdutoPIX } = require('./pixCompra');
        await iniciarCompraProdutoPIX(interaction.client, guild, user, produto, pedidoId);
        
        await interaction.editReply({
          embeds: [{ color: 0x27AE60, description: '✅ As instruções de pagamento foram enviadas na sua **DM**!' }],
        }).catch(() => {});
      } catch (err) {
        console.error('[BTN_COMPRAR]', err.message);
        await interaction.editReply({ embeds: [embedErro('Habilite suas DMs para receber o pagamento.')] }).catch(() => {});
      }

      _log(guild, 'compra', `<@${user.id}> iniciou compra de **${produto.nome}** (#${pedidoId})`, user.id);
      return;
    }

    if (customId.startsWith('btn_download_')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const produtoId = parseInt(customId.replace('btn_download_', ''));
      const produto   = await db.getProduto(produtoId);
      if (!produto) return interaction.editReply({ embeds: [embedErro('Produto não encontrado.')] });

      try {
        if (produto.link && _isDiscordCDN(produto.link)) {
          await _enviarArquivoDM(user, produto.nome, produto.link, produto.imagem_url);
        } else {
          const embed = new EmbedBuilder().setColor(0x2ECC71).setTitle(`🆓 ${produto.nome}`).setDescription(produto.descricao || 'Grátis.').setTimestamp();
          if (produto.link) embed.addFields({ name: '🔗 Link', value: produto.link });
          await user.send({ embeds: [embed] });
        }
        await interaction.editReply({ embeds: [{ color: 0x2ECC71, description: '✅ Enviado na sua DM!' }] });
      } catch {
        await interaction.editReply({ embeds: [embedErro('Habilite suas DMs.')] });
      }
      return;
    }

    if (customId.startsWith('btn_info_')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const produtoId = parseInt(customId.replace('btn_info_', ''));
      const produto   = await db.getProduto(produtoId);
      if (!produto) return interaction.editReply({ embeds: [embedErro('Produto não encontrado.')] });

      const embed = new EmbedBuilder().setColor(0x9B59B6).setTitle(`📦 ${produto.nome}`).setDescription(`${produto.descricao || 'Sem descrição.'}\n\n💰 **Preço:** \`${produto.preco || 'Grátis'}\``).setTimestamp();
      if (produto.imagem_url_banner) embed.setImage(produto.imagem_url_banner);
      return interaction.editReply({ embeds: [embed] });
    }

    if (customId.startsWith('btn_confirmar_')) {
      if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) return interaction.reply({ content: 'Sem permissão.', flags: 64 });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const pedidoId = parseInt(customId.replace('btn_confirmar_', ''));
      const pedido   = await db.getPedido(pedidoId);
      if (!pedido || pedido.status !== 'aguardando') return interaction.editReply({ content: 'Pedido inválido.' });

      const produto = await db.getProduto(pedido.produto_id);
      await db.confirmarPedido(pedidoId);

      try {
        const comprador = await interaction.client.users.fetch(pedido.comprador_id);
        await comprador.send({ embeds: [embedPedidoConfirmado({ nome: produto?.nome || 'Produto' }, pedido.comprador_id)] });
        if (produto?.link) {
          if (_isDiscordCDN(produto.link)) await _enviarArquivoDM(comprador, produto.nome, produto.link, produto.imagem_url);
          else await comprador.send({ embeds: [embedEntregaProduto({ nome: produto.nome, link: produto.link })] });
        }
      } catch (_) {}
      await interaction.editReply({ content: `✅ Pedido #${pedidoId} confirmado!` });
      return;
    }

    if (customId.startsWith('btn_cancelar_')) {
      if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) return interaction.reply({ content: 'Sem permissão.', flags: 64 });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const pedidoId = parseInt(customId.replace('btn_cancelar_', ''));
      await db.cancelarPedido(pedidoId);
      await interaction.editReply({ content: `❌ Pedido #${pedidoId} cancelado.` });
      return;
    }

  } catch (err) {
    console.error(`[BTN:${customId}]`, err);
  }
}

async function handleModal(interaction) {
  if (interaction.customId.startsWith('modal_auth_')) return handleAuthModal(interaction);
  if (interaction.customId.startsWith('modal_pix_compra_')) return processarFormularioCompra(interaction);
}

async function handleSelectMenu(interaction) {
  const { customId, values, guild, user } = interaction;
  const { checkSecurity } = require('./security');

  if (!(await checkSecurity(interaction))) return;

  try {
    if (customId === 'menu_loja_planos') {
        const value = values[0];
        if (value.startsWith('compra_plano_')) {
            const tipo = value.replace('compra_plano_', '');
            const plano = await db.getPlano(tipo);
            
            if (!plano || plano.estoque <= 0) {
                return interaction.reply({ content: '❌ Este plano está sem estoque no momento.', flags: 64 });
            }

            const { iniciarCompraPlanoPIX } = require('./pixCompra');
            await interaction.deferReply({ flags: 64 });
            
            const pedidoId = await db.criarPedido(0, `Plano ${tipo}`, user.id, user.username);
            await iniciarCompraPlanoPIX(interaction.client, guild, user, plano, pedidoId);
            
            return interaction.editReply({ content: '✅ Instruções de pagamento enviadas na sua DM!' });
        }
    }
  } catch (err) {
    console.error('[SELECT MENU]', err.message);
  }
}

function _isDiscordCDN(url) {
  if (!url) return false;
  return url.startsWith('https://cdn.discordapp.com/') || url.startsWith('https://media.discordapp.net/');
}

async function _enviarArquivoDM(destinatario, nomeProduto, urlArquivo, nomeArquivo) {
  try {
    const buffer = await _downloadBuffer(urlArquivo);
    const fileName = nomeArquivo || 'arquivo';
    await destinatario.send({ 
      content: `📦 Seu produto **${nomeProduto}**!`, 
      files: [new AttachmentBuilder(buffer, { name: fileName })] 
    });
  } catch (err) {
    await destinatario.send(`📦 Seu produto **${nomeProduto}**: ${urlArquivo}`);
  }
}

function _downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http');
    lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return _downloadBuffer(res.headers.location).then(resolve).catch(reject);
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function _log(guild, tipo, descricao, autorId) {
  db.addLog(guild.id, tipo, descricao, autorId);
  const logCh = guild.channels.cache.find(c => c.name === '📋・bot-logs');
  if (logCh) try { await logCh.send({ embeds: [embedLog(tipo, descricao, autorId)] }); } catch (_) {}
}

module.exports = { handleButton, handleModal, handleSelectMenu, _isDiscordCDN, _enviarArquivoDM };
