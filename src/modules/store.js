/**
 * store.js — Loja com 4 Planos
 */
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

async function embedLoja(produto) {
    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`📦 ${produto.nome}`)
        .setDescription(produto.descricao)
        .addFields(
            { name: '🚀 Recursos', value: produto.recursos.split(',').map(r => `• ${r.trim()}`).join('\n'), inline: false },
            { name: '💳 Planos e Preços', value: 
                `📅 **Diário:** R$ ${produto.preco_diario.toFixed(2).replace('.', ',')}\n` +
                `📅 **Semanal:** R$ ${produto.preco_semanal.toFixed(2).replace('.', ',')}\n` +
                `📅 **Mensal:** R$ ${produto.preco_mensal.toFixed(2).replace('.', ',')}\n` +
                `📅 **Bimestral:** R$ ${produto.preco_bimestral.toFixed(2).replace('.', ',')}`, 
              inline: false 
            },
            { name: '📦 Estoque', value: `\`${produto.estoque}\` unidades disponíveis`, inline: true }
        )
        .setImage(produto.imagem_url)
        .setFooter({ text: 'Alpha Xit • Selecione um plano abaixo para comprar' });

    return embed;
}

async function rowLoja(produto) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`menu_compra_${produto.id}`)
        .setPlaceholder('Selecione o plano desejado...')
        .addOptions([
            { label: 'Plano Diário', value: `compra_${produto.id}_diario`, description: `R$ ${produto.preco_diario.toFixed(2)}`, emoji: '⚡' },
            { label: 'Plano Semanal', value: `compra_${produto.id}_semanal`, description: `R$ ${produto.preco_semanal.toFixed(2)}`, emoji: '📅' },
            { label: 'Plano Mensal', value: `compra_${produto.id}_mensal`, description: `R$ ${produto.preco_mensal.toFixed(2)}`, emoji: '🗓️' },
            { label: 'Plano Bimestral', value: `compra_${produto.id}_bimestral`, description: `R$ ${produto.preco_bimestral.toFixed(2)}`, emoji: '💎' }
        ]);

    if (produto.estoque <= 0) menu.setDisabled(true).setPlaceholder('Produto sem estoque');

    return new ActionRowBuilder().addComponents(menu);
}

module.exports = { embedLoja, rowLoja };
