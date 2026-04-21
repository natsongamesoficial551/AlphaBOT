/**
 * commands.js — Versão Final Refatorada (Planos e Registro)
 */

const {
  SlashCommandBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, MessageFlags, StringSelectMenuBuilder,
} = require('discord.js');
const db = require('../database');

const commands = [
  // Planos e Configurações
  new SlashCommandBuilder()
    .setName('planos-set')
    .setDescription('Configura preço e estoque de um plano')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('plano').setDescription('Tipo do plano').setRequired(true)
      .addChoices(
        { name: 'Semanal', value: 'semanal' },
        { name: 'Mensal', value: 'mensal' },
        { name: 'Bimestral', value: 'bimestral' }
      ))
    .addNumberOption(o => o.setName('preco').setDescription('Preço do plano (ex: 29.90)').setRequired(true))
    .addIntegerOption(o => o.setName('estoque').setDescription('Quantidade em estoque').setRequired(true)),

  new SlashCommandBuilder()
    .setName('loja-setup')
    .setDescription('Envia o embed da loja no canal atual')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('registro-setup')
    .setDescription('Envia o embed de registro no canal atual')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // Utilitários
  new SlashCommandBuilder()
    .setName('anuncio')
    .setDescription('Envia um anúncio em um canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(o => o.setName('titulo').setDescription('Título do anúncio').setRequired(true))
    .addStringOption(o => o.setName('mensagem').setDescription('Mensagem').setRequired(true))
    .addChannelOption(o => o.setName('canal').setDescription('Canal destino').setRequired(false)),

  new SlashCommandBuilder()
    .setName('cargo')
    .setDescription('Adiciona ou remove cargo de um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(s => s.setName('add').setDescription('Adiciona cargo')
      .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true))
      .addRoleOption(o => o.setName('cargo').setDescription('Cargo').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove cargo')
      .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true))
      .addRoleOption(o => o.setName('cargo').setDescription('Cargo').setRequired(true))),

  new SlashCommandBuilder()
    .setName('moderar')
    .setDescription('Ações de moderação')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(s => s.setName('ban').setDescription('Bane um usuário')
      .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true))
      .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false)))
    .addSubcommand(s => s.setName('kick').setDescription('Expulsa um usuário')
      .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true))
      .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false))),
];

async function handleCommand(interaction) {
  const { commandName, guild, user } = interaction;
  const { checkSecurity, logAction } = require('./security');

  // Verifica segurança antes de qualquer comando
  if (!(await checkSecurity(interaction))) return;

  try {
    // ── /planos-set ──────────────────────────────────────
    if (commandName === 'planos-set') {
      const tipo = interaction.options.getString('plano');
      const preco = interaction.options.getNumber('preco');
      const estoque = interaction.options.getInteger('estoque');

      await db.setPlano(tipo, preco, estoque);
      await logAction(guild, 'ADMIN', `Plano **${tipo}** atualizado: R$ ${preco} | Estoque: ${estoque}`, user);
      
      const { embedSucesso } = require('../embeds');
      return interaction.reply({ embeds: [embedSucesso(`Plano **${tipo}** configurado com sucesso!`) ], flags: MessageFlags.Ephemeral });
    }

    // ── /loja-setup ──────────────────────────────────────
    if (commandName === 'loja-setup') {
      const { embedLoja, rowLoja } = require('./store');
      const embed = await embedLoja();
      const row = await rowLoja();
      
      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: '✅ Loja enviada!', flags: MessageFlags.Ephemeral });
    }

    // ── /registro-setup ──────────────────────────────────────
    if (commandName === 'registro-setup') {
      const { embedRegistro, rowRegistro } = require('./registration');
      await interaction.channel.send({ embeds: [embedRegistro()], components: [rowRegistro()] });
      return interaction.reply({ content: '✅ Sistema de Registro enviado!', flags: MessageFlags.Ephemeral });
    }

    // ── /anuncio ──────────────────────────────────────
    if (commandName === 'anuncio') {
      const titulo = interaction.options.getString('titulo');
      const msg = interaction.options.getString('mensagem');
      const canal = interaction.options.getChannel('canal') || interaction.channel;

      const embed = new EmbedBuilder().setColor(0x9B59B6).setTitle(titulo).setDescription(msg).setTimestamp();
      await canal.send({ embeds: [embed] });
      return interaction.reply({ content: 'Anúncio enviado!', flags: MessageFlags.Ephemeral });
    }

    // ── /cargo ──────────────────────────────────────
    if (commandName === 'cargo') {
      const sub = interaction.options.getSubcommand();
      const target = interaction.options.getMember('usuario');
      const role = interaction.options.getRole('cargo');

      if (sub === 'add') {
        await target.roles.add(role);
        return interaction.reply({ content: `Cargo ${role.name} adicionado a ${target.user.tag}`, flags: MessageFlags.Ephemeral });
      } else {
        await target.roles.remove(role);
        return interaction.reply({ content: `Cargo ${role.name} removido de ${target.user.tag}`, flags: MessageFlags.Ephemeral });
      }
    }

    // ── /moderar ──────────────────────────────────────
    if (commandName === 'moderar') {
      const sub = interaction.options.getSubcommand();
      const target = interaction.options.getMember('usuario');
      const motivo = interaction.options.getString('motivo') || 'Sem motivo especificado';

      if (sub === 'ban') {
        await target.ban({ reason: motivo });
        return interaction.reply({ content: `Usuário ${target.user.tag} banido.`, flags: MessageFlags.Ephemeral });
      } else if (sub === 'kick') {
        await target.kick(motivo);
        return interaction.reply({ content: `Usuário ${target.user.tag} expulso.`, flags: MessageFlags.Ephemeral });
      }
    }

  } catch (err) {
    console.error('[COMMAND ERROR]', err.message);
    const { embedErro } = require('../embeds');
    if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [embedErro(`Erro: ${err.message}`)], flags: MessageFlags.Ephemeral });
    }
  }
}

module.exports = { commands, handleCommand };
