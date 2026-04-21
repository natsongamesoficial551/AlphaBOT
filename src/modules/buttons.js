/**
 * buttons.js — Handlers de Interação
 */
const db = require('../database');

async function handleButton(interaction) {
  const { customId, guild, user, member } = interaction;
  const { checkSecurity, logAction } = require('./security');

  // Roteamento de Auth (pode ser na DM, então verificamos antes da segurança de canais staff)
  const { handleAuthButton } = require('./myauth');
  const authHandled = await handleAuthButton(interaction);
  if (authHandled !== false) return;

  if (!(await checkSecurity(interaction))) return;

  try {
    // Registro
    if (customId === 'btn_registro_verificar') {
        const { handleRegistro } = require('./registration');
        return await handleRegistro(interaction);
    }

    // Aprovação de Pagamento (Dono do Bot)
    if (customId.startsWith('btn_pix_aprovar_')) {
        const pedidoId = parseInt(customId.replace('btn_pix_aprovar_', ''));
        const pedido = await db.getPedido(pedidoId);
        if (!pedido) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });

        await db.confirmarPedido(pedidoId);
        
        // Busca o produto para pegar o link e decrementar estoque
        const produto = await db.getProduto(pedido.produto_id);
        if (produto) {
            await db.decrementarEstoque(produto.id);
            
            // Tenta enviar o produto na DM do comprador
            try {
                const comprador = await interaction.client.users.fetch(pedido.comprador_id);
                await comprador.send(`✅ Seu pagamento de **${pedido.produto_nome}** foi aprovado!\n📦 **Produto/Link:** ${produto.link}`);
            } catch (e) {
                console.error('[ENTREGA ERROR]', e.message);
            }
        }

        await interaction.update({ content: `✅ Pedido #${pedidoId} aprovado e entregue!`, components: [] });
        await logAction(guild, 'COMPRA', `Pedido #${pedidoId} aprovado por <@${user.id}>`, user);
    }

    if (customId.startsWith('btn_pix_reprovar_')) {
        const pedidoId = parseInt(customId.replace('btn_pix_reprovar_', ''));
        await interaction.update({ content: `❌ Pedido #${pedidoId} reprovado.`, components: [] });
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
            return interaction.reply({ content: '❌ Produto sem estoque.', ephemeral: true });
        }

        const preco = produto[`preco_${planoTipo}`];
        const { iniciarCompraPlanoPIX } = require('./pixCompra');
        
        // Criar pedido no banco
        const pedidoId = await db.criarPedido(produto.id, `${produto.nome} (${planoTipo})`, user.id, user.username);
        
        // Objeto para o pixCompra
        const planoFake = { 
            tipo: `${produto.nome} - ${planoTipo}`, 
            preco: preco,
            link: produto.link // Passa o link do arquivo para a entrega real
        };
        
        await interaction.deferReply({ ephemeral: true });
        await iniciarCompraPlanoPIX(interaction.client, guild, user, planoFake, pedidoId);
        
        await interaction.editReply({ content: '✅ Instruções de pagamento enviadas na sua DM!' });
        await logAction(guild, 'COMPRA', `<@${user.id}> iniciou compra de **${produto.nome}** (${planoTipo})`, user);
    }
  } catch (err) {
    console.error('[SELECT MENU ERROR]', err.message);
  }
}

async function handleModal(interaction) {
    const { handleAuthModal } = require('./myauth');
    const authHandled = await handleAuthModal(interaction);
    if (authHandled !== false) return;
}

module.exports = { handleButton, handleSelectMenu, handleModal };
