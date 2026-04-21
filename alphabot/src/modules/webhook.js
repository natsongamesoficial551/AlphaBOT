const express = require('express');
const { getPaymentStatus, validateWebhookSignature } = require('./mercadopago');
const db = require('../database');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

const router = express.Router();

router.post('/mercadopago', async (req, res) => {
    const { action, data } = req.body;
    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];

    if (action === 'payment.created' || action === 'payment.updated') {
        const paymentId = data.id;

        // 1. Validação de segurança
        if (xSignature && xRequestId) {
            const isValid = validateWebhookSignature(xSignature, xRequestId, paymentId);
            if (!isValid) {
                console.warn(`[WEBHOOK] Assinatura inválida para pagamento ${paymentId}`);
                return res.status(401).send('Assinatura inválida');
            }
        }

        try {
            // 2. Buscar status real na API do Mercado Pago
            const payment = await getPaymentStatus(paymentId);

            if (payment.status === 'approved') {
                console.log(`[WEBHOOK] Pagamento ${paymentId} APROVADO!`);

                // 3. Buscar o pedido vinculado
                const pedido = await db.getPedidoPorPagamentoMP(String(paymentId));
                
                if (pedido && pedido.status === 'aguardando') {
                    // 4. Marcar como confirmado no banco
                    await db.confirmarPedido(pedido.id);

                    // 5. Buscar dados do produto para entrega
                    const produto = await db.getProduto(pedido.produto_id);
                    const client = global._discordClient;

                    // Atribui o cargo de @membro (ID: 1484718784668373073)
                    try {
                        const guildId = process.env.GUILD_ID;
                        if (client && guildId) {
                            const guild = client.guilds.cache.get(guildId);
                            if (guild) {
                                const member = await guild.members.fetch(pedido.comprador_id).catch(() => null);
                                if (member) {
                                    const roleId = '1484718784668373073';
                                    const role = guild.roles.cache.get(roleId);
                                    if (role) {
                                        await member.roles.add(role).catch(e => console.error('[ROLE-ADD-WEBHOOK]', e.message));
                                    }
                                }
                            }
                        }
                    } catch (e) { console.error('[ROLE-GUILD-WEBHOOK]', e.message); }

                    if (client && produto) {
                        try {
                            const user = await client.users.fetch(pedido.comprador_id);
                            
                            const embed = new EmbedBuilder()
                                .setColor(0x2ECC71)
                                .setTitle('✅ Pagamento Confirmado!')
                                .setDescription(`Seu pagamento do produto **${produto.nome}** foi aprovado com sucesso.`)
                                .addFields({ name: '🆔 Pedido', value: `#${pedido.id}`, inline: true })
                                .setTimestamp();

                            // Entrega do produto
                            if (produto.link) {
                                embed.addFields({ name: '📦 Seu Produto', value: 'O arquivo ou link está abaixo.' });
                                
                                if (produto.link.startsWith('http')) {
                                    await user.send({ embeds: [embed], content: `🔗 **Link de acesso:** ${produto.link}` });
                                } else {
                                    await user.send({ embeds: [embed], content: `📦 **Conteúdo:** ${produto.link}` });
                                }
                            } else {
                                await user.send({ embeds: [embed] });
                            }

                            console.log(`[WEBHOOK] Produto entregue para ${user.tag}`);

                        } catch (err) {
                            console.error(`[WEBHOOK] Erro ao enviar DM para o usuário:`, err.message);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`[WEBHOOK] Erro ao processar pagamento ${paymentId}:`, error);
            return res.status(500).send('Erro interno');
        }
    }

    res.status(200).send('OK');
});

module.exports = router;
