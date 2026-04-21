/**
 * store.js — Sistema de Loja com Planos
 */
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database');

async function embedLoja() {
    const planos = await db.getPlanos();
    
    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🗂️ Loja Oficial — Alpha Xit')
        .setDescription(
            'Selecione um dos nossos planos abaixo para adquirir acesso imediato ao nosso software.\n\n' +
            '**Planos Disponíveis:**'
        )
        .setTimestamp()
        .setFooter({ text: 'Alpha Xit • Pagamento Automático via PIX' });

    const tipos = ['semanal', 'mensal', 'bimestral'];
    
    for (const tipo of tipos) {
        const plano = planos.find(p => p.tipo === tipo);
        const preco = plano ? `R$ ${plano.preco.toFixed(2).replace('.', ',')}` : 'Não definido';
        const estoque = plano ? plano.estoque : 0;
        
        embed.addFields({
            name: `🔹 Plano ${tipo.toUpperCase()}`,
            value: `💰 **Preço:** ${preco}\n📦 **Estoque:** ${estoque} unidades`,
            inline: false
        });
    }

    return embed;
}

async function rowLoja() {
    const planos = await db.getPlanos();
    const options = planos.filter(p => p.estoque > 0).map(p => ({
        label: `Plano ${p.tipo.charAt(0).toUpperCase() + p.tipo.slice(1)}`,
        description: `R$ ${p.preco.toFixed(2).replace('.', ',')}`,
        value: `compra_plano_${p.tipo}`,
        emoji: '💳'
    }));

    if (options.length === 0) {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_loja_sem_estoque')
                .setLabel('Sem estoque disponível')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );
    }

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('menu_loja_planos')
            .setPlaceholder('Escolha o seu plano aqui...')
            .addOptions(options)
    );
}

module.exports = { embedLoja, rowLoja };
