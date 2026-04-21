const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const db = require('../database');

async function embedLoja() {
    const planos = await db.getPlanos();
    
    const embed = new EmbedBuilder()
        .setColor(0xF1C40F)
        .setTitle('🗂️ Loja Alpha Xit — Planos')
        .setDescription(
            'Escolha um de nossos planos para acessar o software!\n\n' +
            '**Planos Disponíveis:**'
        )
        .setFooter({ text: 'Alpha Xit • Loja' });

    const tipos = ['semanal', 'mensal', 'bimestral'];
    
    for (const tipo of tipos) {
        const plano = planos.find(p => p.tipo === tipo);
        const preco = plano ? `R$ ${plano.preco.toFixed(2).replace('.', ',')}` : 'Não definido';
        const estoque = plano ? plano.estoque : 0;
        
        embed.addFields({
            name: `📍 Plano ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`,
            value: `💰 Preço: \`${preco}\`\n📦 Estoque: \`${estoque}\``,
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
                .setLabel('Sem estoque no momento')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );
    }

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('menu_loja_planos')
            .setPlaceholder('Selecione um plano para comprar')
            .addOptions(options)
    );
}

module.exports = { embedLoja, rowLoja };
