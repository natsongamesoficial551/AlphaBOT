/**
 * pixCompra.js — Compra via PIX com validação AUTOMÁTICA (API Promisse)
 *
 * Fluxo:
 *  1. Usuário clica em Comprar
 *  2. Bot cria cobrança na Promisse e envia o Pix Copia e Cola na DM
 *  3. Bot inicia polling e valida o pagamento sozinho
 *  4. Após confirmação automática → entrega o produto na DM
 *  5. Se o tempo esgotar → avisa o usuário e cancela o pedido
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags
} = require('discord.js');

const db = require('../database');
const { criarCobrancaPix, aguardarPagamento } = require('./promissePix');
const { embedPedidoConfirmado, embedEntregaProduto, embedErro } = require('../embeds');

// Guarda os canceladores de polling por pedidoId (evita polling duplicado)
const _pollingAtivo = new Map();

// ── Fluxo principal ───────────────────────────────────────────────────────────

/**
 * Inicia compra de PRODUTO via PIX com validação automática (Promisse)
 */
async function iniciarCompraProdutoPIX(client, guild, user, produto, pedidoId) {
    const valorStr = _extrairValorNumerico(produto.preco);

    try {
        // 1. Criar cobrança na API Promisse
        const cobranca = await criarCobrancaPix(valorStr);

        // 2. Salvar o ID da transação no banco para referência
        await db.salvarTransacaoId(pedidoId, cobranca.id).catch(() => {
            console.warn(`[PIX] Não salvou transacao_id no banco (pedido #${pedidoId})`);
        });

        // 3. Enviar instruções na DM do usuário
        const embed = new EmbedBuilder()
            .setColor(0x27AE60)
            .setTitle('💳 Pagamento via PIX — Automático')
            .setDescription(
                `Olá **${user.username}**! Seu pedido foi gerado.\n\n` +
                `Pague o valor exato abaixo via **Pix Copia e Cola**.\n` +
                `O produto será entregue **automaticamente** após a confirmação!`
            )
            .addFields(
                { name: '📦 Produto',  value: `**${produto.nome}**`,                   inline: true  },
                { name: '💰 Valor',    value: `**R$ ${valorStr.replace('.', ',')}**`,   inline: true  },
                { name: '🆔 Pedido',   value: `**#${pedidoId}**`,                      inline: true  },
                { name: '⏳ Validade', value: 'O código expira em **30 minutos**',      inline: false },
            );

        if (cobranca.pixCode) {
            embed.addFields({
                name:  '📋 Pix Copia e Cola',
                value: `\`\`\`${cobranca.pixCode}\`\`\``,
                inline: false,
            });
        }

        if (cobranca.pixQrCodeUrl) {
            embed.setImage(cobranca.pixQrCodeUrl);
        }

        embed.addFields({
            name: '⚠️ Importante',
            value: '• Pague o valor **exato**\n• O bot confirma sozinho após o pagamento\n• Não envie comprovante — é automático!',
            inline: false,
        });

        embed.setFooter({ text: `⚡ Alpha Xit • Pedido #${pedidoId}` }).setTimestamp();

        await user.send({ embeds: [embed] });

        // 4. Notificar o dono (informativo)
        await _notificarDono(client, user, { pedidoId, produtoNome: produto.nome, valor: valorStr });

        _log(guild, 'compra', `PIX gerado para <@${user.id}> (Pedido #${pedidoId}) | Transação: ${cobranca.id}`, user.id);

        // 5. Iniciar polling automático
        const cancelarPolling = aguardarPagamento(cobranca.id, {
            onPago: async () => {
                _pollingAtivo.delete(pedidoId);
                await _entregarProdutoAutomatico(client, guild, user, produto, pedidoId);
            },
            onExpirado: async () => {
                _pollingAtivo.delete(pedidoId);
                await db.cancelarPedido(pedidoId).catch(() => {});
                await _avisarExpirado(user, pedidoId);
                _log(guild, 'pix', `Pedido #${pedidoId} expirou sem pagamento`, user.id);
            },
        });

        _pollingAtivo.set(pedidoId, cancelarPolling);

    } catch (error) {
        console.error('[PIX PROMISSE ERROR]', error);
        await user.send({
            content: '❌ Erro ao gerar seu pagamento Pix. Verifique se sua DM está aberta ou contate um administrador.',
        }).catch(() => {});
    }
}

// ── Entrega automática ────────────────────────────────────────────────────────

async function _entregarProdutoAutomatico(client, guild, user, produto, pedidoId) {
    try {
        await db.confirmarPedido(pedidoId);

        // Atribui cargo @membro
        try {
            const guildObj = client.guilds.cache.get(process.env.GUILD_ID);
            if (guildObj) {
                const member = await guildObj.members.fetch(user.id).catch(() => null);
                if (member) {
                    const role = guildObj.roles.cache.get('1484718784668373073');
                    if (role) await member.roles.add(role).catch(e => console.error('[ROLE-ADD-PIX]', e.message));
                }
            }
        } catch (e) { console.error('[ROLE-GUILD-PIX]', e.message); }

        await user.send({ embeds: [embedPedidoConfirmado({ nome: produto.nome }, user.id)] });

        if (produto.link) {
            const { _isDiscordCDN, _enviarArquivoDM } = require('./buttons');
            if (_isDiscordCDN(produto.link)) {
                await _enviarArquivoDM(user, produto.nome, produto.link, produto?.imagem_url);
            } else {
                await user.send({ embeds: [embedEntregaProduto({ nome: produto.nome, link: produto.link })] });
            }
        }

        // Notifica o dono da entrega automática
        const ownerId = process.env.OWNER_ID;
        if (ownerId) {
            const owner = await client.users.fetch(ownerId).catch(() => null);
            if (owner) {
                await owner.send({
                    embeds: [new EmbedBuilder()
                        .setColor(0x2ECC71)
                        .setTitle(`✅ Pagamento Confirmado — Pedido #${pedidoId}`)
                        .setDescription(`<@${user.id}> pagou e o produto **${produto.nome}** foi entregue automaticamente.`)
                        .setTimestamp()],
                }).catch(() => {});
            }
        }

        _log(guild, 'pix', `✅ Pagamento confirmado automaticamente — <@${user.id}> (Pedido #${pedidoId})`, user.id);

    } catch (err) {
        console.error('[PIX ENTREGA AUTO]', err.message);
    }
}

// ── Expiração ─────────────────────────────────────────────────────────────────

async function _avisarExpirado(user, pedidoId) {
    await user.send({
        embeds: [new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle('⏰ Pagamento Expirado')
            .setDescription(
                `Seu pedido **#${pedidoId}** expirou pois o pagamento não foi identificado em 30 minutos.\n\n` +
                `Se você pagou e está vendo esta mensagem, contate um **@🛡️ ꜱᴛᴀꜰꜰ**.`
            )
            .setTimestamp()],
    }).catch(() => {});
}

// ── Notificação ao dono ───────────────────────────────────────────────────────

async function _notificarDono(client, user, { pedidoId, produtoNome, valor }) {
    const ownerId = process.env.OWNER_ID;
    if (!ownerId) return;

    try {
        const owner = await client.users.fetch(ownerId);
        await owner.send({
            embeds: [new EmbedBuilder()
                .setColor(0xE67E22)
                .setTitle(`🔔 Novo Pedido PIX — #${pedidoId}`)
                .setDescription(
                    `<@${user.id}> (\`${user.tag}\`) iniciou a compra de **${produtoNome}**.\n\n` +
                    `✅ A entrega será **automática** após confirmação do pagamento.`
                )
                .addFields(
                    { name: '💰 Valor',  value: `R$ ${valor.replace('.', ',')}`, inline: true },
                    { name: '🆔 Pedido', value: `#${pedidoId}`,                  inline: true },
                )
                .setTimestamp()],
        });
    } catch (e) { console.error('[NOTIFICA DONO]', e.message); }
}

// ── Aprovação/Reprovação manual (suporte) ─────────────────────────────────────

async function processarAprovacao(interaction) {
    const pedidoId = parseInt(interaction.customId.replace('btn_pix_aprovar_', ''));
    const pedido   = await db.getPedido(pedidoId);

    if (!pedido)                        return interaction.reply({ embeds: [embedErro('Pedido não encontrado.')], flags: MessageFlags.Ephemeral });
    if (pedido.status !== 'aguardando') return interaction.reply({ embeds: [embedErro(`Este pedido já foi ${pedido.status}.`)], flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Para o polling se ainda estiver rodando
    const cancelar = _pollingAtivo.get(pedidoId);
    if (cancelar) { cancelar(); _pollingAtivo.delete(pedidoId); }

    const produto     = await db.getProduto(pedido.produto_id);
    await db.confirmarPedido(pedidoId);

    const nomeProduto = produto?.nome || pedido.produto_nome || 'Produto';
    const linkProduto = produto?.link || null;

    try {
        const guild  = interaction.client.guilds.cache.get(process.env.GUILD_ID);
        if (guild) {
            const member = await guild.members.fetch(pedido.comprador_id).catch(() => null);
            if (member) {
                const role = guild.roles.cache.get('1484718784668373073');
                if (role) await member.roles.add(role).catch(e => console.error('[ROLE-ADD-PIX]', e.message));
            }
        }
    } catch (e) { console.error('[ROLE-GUILD-PIX]', e.message); }

    try {
        const comprador = await interaction.client.users.fetch(pedido.comprador_id);
        await comprador.send({ embeds: [embedPedidoConfirmado({ nome: nomeProduto }, pedido.comprador_id)] });

        if (linkProduto) {
            const { _isDiscordCDN, _enviarArquivoDM } = require('./buttons');
            if (_isDiscordCDN(linkProduto)) {
                await _enviarArquivoDM(comprador, nomeProduto, linkProduto, produto?.imagem_url);
            } else {
                await comprador.send({ embeds: [embedEntregaProduto({ nome: nomeProduto, link: linkProduto })] });
            }
        }
    } catch (err) { console.error('[APROVACAO DM]', err.message); }

    await interaction.editReply({ content: `✅ Pedido #${pedidoId} aprovado e entregue manualmente!` });
    try { await interaction.message.edit({ components: [] }); } catch (_) {}
}

async function processarReprovacao(interaction) {
    const pedidoId = parseInt(interaction.customId.replace('btn_pix_reprovar_', ''));
    const pedido   = await db.getPedido(pedidoId);

    if (!pedido)                        return interaction.reply({ embeds: [embedErro('Pedido não encontrado.')], flags: MessageFlags.Ephemeral });
    if (pedido.status !== 'aguardando') return interaction.reply({ embeds: [embedErro(`Este pedido já foi ${pedido.status}.`)], flags: MessageFlags.Ephemeral });

    const cancelar = _pollingAtivo.get(pedidoId);
    if (cancelar) { cancelar(); _pollingAtivo.delete(pedidoId); }

    await db.cancelarPedido(pedidoId);

    try {
        const comprador = await interaction.client.users.fetch(pedido.comprador_id);
        await comprador.send({
            embeds: [new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle('❌ Pedido Recusado')
                .setDescription(`Seu pedido **#${pedidoId}** foi recusado pelo administrador. Se você já pagou, entre em contato com o suporte.`)
                .setTimestamp()],
        });
    } catch (_) {}

    await interaction.reply({ content: `❌ Pedido #${pedidoId} reprovado.`, flags: MessageFlags.Ephemeral });
    try { await interaction.message.edit({ components: [] }); } catch (_) {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _extrairValorNumerico(precoStr) {
    if (!precoStr) return '0.00';
    const limpo = precoStr.replace(/[^\d,.]/g, '').replace(',', '.');
    return parseFloat(limpo).toFixed(2);
}

async function _log(guild, tipo, descricao, autorId) {
    if (!guild) return;
    const logCh = guild.channels.cache.find(c => c.name === '📋・bot-logs');
    if (logCh) try {
        await logCh.send({
            embeds: [new EmbedBuilder().setColor(0x3498DB).setTitle(`LOG: ${tipo.toUpperCase()}`).setDescription(descricao).setTimestamp()],
        });
    } catch (_) {}
}

module.exports = {
    iniciarCompraProdutoPIX,
    processarAprovacao,
    processarReprovacao,
    // Stubs de compatibilidade (formulário removido — pagamento é automático agora)
    abrirFormularioCompra:     async () => {},
    processarFormularioCompra: async () => {},
};
