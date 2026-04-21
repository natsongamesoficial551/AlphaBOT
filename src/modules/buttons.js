/**
 * buttons.js — Versão Final Refatorada (Alpha Xit)
 */
const {
  PermissionFlagsBits, MessageFlags,
  EmbedBuilder, AttachmentBuilder,
} = require('discord.js');

const db = require('../database');
const { embedLog, embedErro } = require('../embeds');

async function handleButton(interaction) {
  const { customId, guild, member, user } = interaction;
  const { checkSecurity, logAction } = require('./security');

  // Verifica segurança
  if (!(await checkSecurity(interaction))) return;

  try {
    // Registro
    if (customId === 'btn_registro_verificar') {
      const { handleRegistro } = require('./registration');
      return handleRegistro(interaction);
    }

    // Compras automáticas (PIX) - Caso existam botões legados de produtos
    if (customId.startsWith('btn_comprar_')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const produtoId = parseInt(customId.replace('btn_comprar_', ''));
      const produto   = await db.getProduto(produtoId);
      if (!produto) return interaction.editReply({ embeds: [embedErro('Produto não encontrado.')] });

      const pedidoId = await db.criarPedido(produto.id, produto.nome, user.id, user.username);
      const { iniciarCompraProdutoPIX } = require('./pixCompra');
      await iniciarCompraProdutoPIX(interaction.client, guild, user, produto, pedidoId);
      
      await interaction.editReply({ content: '✅ Instruções de pagamento enviadas na sua DM!' });
      await logAction(guild, 'COMPRA', `<@${user.id}> iniciou compra de **${produto.nome}** (#${pedidoId})`, user);
    }

  } catch (err) {
    console.error(`[BUTTON ERROR]`, err.message);
  }
}

async function handleSelectMenu(interaction) {
  const { customId, values, guild, user } = interaction;
  const { checkSecurity, logAction } = require('./security');

  if (!(await checkSecurity(interaction))) return;

  try {
    if (customId.startsWith('menu_compra_')) {
        const value = values[0]; // compra_ID_PLANO
        const parts = value.split('_');
        const produtoId = parseInt(parts[1]);
        const planoTipo = parts[2];

        const produto = await db.getProduto(produtoId);
        if (!produto || produto.estoque <= 0) {
            return interaction.reply({ content: '❌ Produto sem estoque.', flags: 64 });
        }

        const preco = produto[`preco_${planoTipo}`];
        const { iniciarCompraPlanoPIX } = require('./pixCompra');
        await interaction.deferReply({ flags: 64 });
        
        const pedidoId = await db.criarPedido(produto.id, `${produto.nome} (${planoTipo})`, user.id, user.username);
        
        // Simula o objeto plano esperado pelo pixCompra
        const planoFake = { tipo: `${produto.nome} - ${planoTipo}`, preco: preco, estoque: produto.estoque };
        
        await iniciarCompraPlanoPIX(interaction.client, guild, user, planoFake, pedidoId);
        
        await interaction.editReply({ content: '✅ Instruções de pagamento enviadas na sua DM!' });
        await logAction(guild, 'COMPRA', `<@${user.id}> iniciou compra de **${produto.nome}** (${planoTipo})`, user);
    }
  } catch (err) {
    console.error('[SELECT MENU ERROR]', err.message);
  }
}

async function handleModal(interaction) {
  // Mantido para compatibilidade se necessário futuramente
}

module.exports = { handleButton, handleModal, handleSelectMenu };
