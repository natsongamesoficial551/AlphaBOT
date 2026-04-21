const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const ROLE_VISITANTE_ID = '1484718784668373073'; // Mantendo o ID que já estava no código como base
const ROLE_MEMBRO_ID = '1484718784668373073'; // O usuário disse que ganha o cargo membros

function embedRegistro() {
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🪪 Sistema de Registro — Alpha Xit')
        .setDescription(
            'Bem-vindo ao nosso servidor! Para acessar os canais, você precisa se registrar.\n\n' +
            '**Como funciona:**\n' +
            '1. Clique no botão abaixo para se registrar.\n' +
            '2. Você sairá do cargo de **Visitante** e se tornará um **Membro**.\n' +
            '3. Após o registro, você poderá ver a loja e outros canais.'
        )
        .setFooter({ text: 'Alpha Xit • Registro' });
}

function rowRegistro() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_registro_verificar')
            .setLabel('Verificar Registro')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
    );
}

async function handleRegistro(interaction) {
    const { member, guild } = interaction;
    
    // Tenta encontrar os cargos (idealmente os IDs deveriam estar no .env)
    const roleMembro = guild.roles.cache.find(r => r.name === 'Membros' || r.id === ROLE_MEMBRO_ID);
    const roleVisitante = guild.roles.cache.find(r => r.name === 'Visitante');

    try {
        if (roleMembro) await member.roles.add(roleMembro);
        if (roleVisitante) await member.roles.remove(roleVisitante);

        await interaction.reply({ content: '✅ Registro concluído com sucesso! Agora você é um **Membro**.', ephemeral: true });
    } catch (e) {
        console.error('[REGISTRO]', e.message);
        await interaction.reply({ content: '❌ Erro ao processar seu registro. Contate um administrador.', ephemeral: true });
    }
}

module.exports = { embedRegistro, rowRegistro, handleRegistro };
