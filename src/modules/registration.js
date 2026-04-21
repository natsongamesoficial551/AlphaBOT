/**
 * registration.js — Sistema de Registro
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const ROLE_MEMBRO_NAME = 'Membros';
const ROLE_VISITANTE_NAME = 'Visitante';

function embedRegistro() {
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🪪 Sistema de Registro — Alpha Xit')
        .setDescription(
            'Bem-vindo ao nosso servidor! Para acessar os canais, você precisa se registrar.\n\n' +
            '**Como funciona:**\n' +
            '1. Clique no botão **"Registrar"** abaixo.\n' +
            '2. Você sairá do cargo de **Visitante** e se tornará um **Membro**.\n' +
            '3. Após o registro, você poderá ver a loja e outros canais.'
        )
        .setFooter({ text: 'Alpha Xit • Registro' });
}

function rowRegistro() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_registro_verificar')
            .setLabel('Registrar')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
    );
}

async function handleRegistro(interaction) {
    const { member, guild, user } = interaction;
    const { logAction } = require('./security');
    
    const roleMembro = guild.roles.cache.find(r => r.name === ROLE_MEMBRO_NAME);
    const roleVisitante = guild.roles.cache.find(r => r.name === ROLE_VISITANTE_NAME);

    try {
        if (roleMembro) {
            await member.roles.add(roleMembro);
        } else {
            console.error(`[REGISTRO] Cargo '${ROLE_MEMBRO_NAME}' não encontrado.`);
        }

        if (roleVisitante) {
            await member.roles.remove(roleVisitante).catch(() => {});
        }

        await interaction.reply({ content: '✅ Registro concluído com sucesso! Agora você é um **Membro**.', ephemeral: true });
        await logAction(guild, 'REGISTRO', `Usuário <@${user.id}> se registrou com sucesso.`, user);
    } catch (e) {
        console.error('[REGISTRO ERROR]', e.message);
        await interaction.reply({ content: '❌ Erro ao processar seu registro. Contate um administrador.', ephemeral: true });
    }
}

module.exports = { embedRegistro, rowRegistro, handleRegistro };
