const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const LOG_CHANNEL_NAME = '📋・bot-logs';

async function logAction(guild, tipo, descricao, user = null) {
    const { embedLog } = require('../embeds');
    const canal = guild.channels.cache.find(c => c.name === LOG_CHANNEL_NAME);
    
    const embed = embedLog(tipo, descricao, user?.id);

    if (canal) {
        await canal.send({ embeds: [embed] });
    }

    // Salva no banco também
    await db.addLog(guild.id, tipo, descricao, user?.id);
}

async function checkSecurity(interaction) {
    const { guild, user, channel } = interaction;
    
    // Canais sensíveis (exemplo: staff-chat)
    const sensitiveChannels = ['🔒・staff-chat', '📋・bot-logs'];
    
    if (sensitiveChannels.includes(channel.name)) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            await logAction(guild, 'ALERTA', `Tentativa de acesso não autorizado ao canal <#${channel.id}> por <@${user.id}>`, user);
            
            try {
                await interaction.member.kick('Tentativa de acesso não autorizado a canais de staff.');
                await logAction(guild, 'SEGURANÇA', `Usuário <@${user.id}> foi expulso por segurança.`, user);
            } catch (e) {
                await logAction(guild, 'ERRO', `Falha ao expulsar usuário suspeito <@${user.id}>: ${e.message}`);
            }
            
            return false;
        }
    }
    return true;
}

module.exports = { logAction, checkSecurity };
