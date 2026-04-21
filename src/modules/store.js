/**
 * store.js — Loja com 4 Planos
 */
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

async function embedLoja(produto) {
    // Se não houver produto (chamada do seeder sem dados), retorna uma embed genérica
    if (!produto) {
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🛒 Loja Alpha Xit')
            .setDescription('Navegue pelos nossos canais de produtos para ver as ofertas disponíveis!')
            .setFooter({ text: 'Alpha Xit • Qualidade e Segurança' });
        return { embed, row: null };
    }

    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`📦 ${produto.nome}`)
        .setDescription(produto.descricao || 'Sem descrição')
        .addFields(
            { name: '🚀 Recursos', value: produto.recursos ? produto.recursos.split(',').map(r => `• ${r.trim()}`).join('\n') : 'Padrão', inline: false },
            { name: '💳 Planos e Preços', value: 
                `📅 **Diário:** R$ ${(produto.preco_diario || 0).toFixed(2).replace('.', ',')}\n` +
                `📅 **Semanal:** R$ ${(produto.preco_semanal || 0).toFixed(2).replace('.', ',')}\n` +
                `📅 **Mensal:** R$ ${(produto.preco_mensal || 0).toFixed(2).replace('.', ',')}\n` +
                `📅 **Bimestral:** R$ ${(produto.preco_bimestral || 0).toFixed(2).replace('.', ',')}`, 
              inline: false 
            },
            { name: '📦 Estoque', value: `\`${produto.estoque || 0}\` unidades disponíveis`, inline: true }
        )
        .setImage(produto.imagem_url || null)
        .setFooter({ text: 'Alpha Xit • Selecione um plano abaixo para comprar' });

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`menu_compra_${produto.id}`)
        .setPlaceholder('Selecione o plano desejado...')
        .addOptions([
            { label: 'Plano Diário', value: `compra_${produto.id}_diario`, description: `R$ ${(produto.preco_diario || 0).toFixed(2)}`, emoji: '⚡' },
            { label: 'Plano Semanal', value: `compra_${produto.id}_semanal`, description: `R$ ${(produto.preco_semanal || 0).toFixed(2)}`, emoji: '📅' },
            { label: 'Plano Mensal', value: `compra_${produto.id}_mensal`, description: `R$ ${(produto.preco_mensal || 0).toFixed(2)}`, emoji: '🗓️' },
            { label: 'Plano Bimestral', value: `compra_${produto.id}_bimestral`, description: `R$ ${(produto.preco_bimestral || 0).toFixed(2)}`, emoji: '💎' }
        ]);

    if ((produto.estoque || 0) <= 0) menu.setDisabled(true).setPlaceholder('Produto sem estoque');

    const row = new ActionRowBuilder().addComponents(menu);

    return { embed, row };
}

module.exports = { embedLoja };
