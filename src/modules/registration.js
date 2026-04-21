/**
 * registration.js — Sistema de Registro (IDs de Cargo Atualizados)
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// IDs fornecidos pelo usuário
const ROLE_MEMBRO_ID = '1484718784668373073';
const ROLE_VISITANTE_ID = '1484718789223514253';

function embedRegistro() {
    const embed = new EmbedBuilder()
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

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_registro_verificar')
            .setLabel('Registrar')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
    );

    return { embed, row };
}

async function handleRegistro(interaction) {
    const { member, guild, user } = interaction;
    const { logAction } = require('./security');
    
    // Verifica se o usuário já tem o cargo de Membro
    if (member.roles.cache.has(ROLE_MEMBRO_ID)) {
        return interaction.reply({ 
            content: '⚠️ Você já está registrado como **Membro**! Não é necessário registrar novamente.', 
            ephemeral: true 
        });
    }

    try {
        const roleMembro = guild.roles.cache.get(ROLE_MEMBRO_ID);
        const roleVisitante = guild.roles.cache.get(ROLE_VISITANTE_ID);

        if (!roleMembro) {
            console.error(`[REGISTRO] Cargo Membro (${ROLE_MEMBRO_ID}) não encontrado no servidor.`);
            return interaction.reply({ content: '❌ Erro: Cargo de Membro não configurado corretamente no servidor. Fale com um ADM.', ephemeral: true });
        }

        // Adiciona cargo de Membro
        await member.roles.add(roleMembro);

        // Remove cargo de Visitante (se tiver)
        if (roleVisitante && member.roles.cache.has(ROLE_VISITANTE_ID)) {
            await member.roles.remove(roleVisitante).catch(() => {});
        }

        await interaction.reply({ content: '✅ Registro concluído com sucesso! Agora você é um **Membro**.', ephemeral: true });
        await logAction(guild, 'REGISTRO', `Usuário <@${user.id}> se registrou com sucesso.`, user);
        
    } catch (e) {
        console.error('[REGISTRO ERROR]', e.message);
        await interaction.reply({ content: '❌ Erro técnico ao processar seu registro. Verifique se o cargo do Bot está acima do cargo de Membro.', ephemeral: true });
    }
}

module.exports = { embedRegistro, handleRegistro, ROLE_MEMBRO_ID, ROLE_VISITANTE_ID };
