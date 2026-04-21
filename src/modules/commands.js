/**
 * commands.js — Versão Corrigida (produto-add envia direto na loja)
 */
const {
  SlashCommandBuilder, PermissionFlagsBits,
  EmbedBuilder, MessageFlags,
} = require('discord.js');
const db = require('../database');

const commands = [
  new SlashCommandBuilder()
    .setName('produto-add')
    .setDescription('Adiciona um novo produto com os 4 planos diretamente na loja')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('nome').setDescription('Nome do produto').setRequired(true))
    .addStringOption(o => o.setName('descricao').setDescription('Descrição do produto').setRequired(true))
    .addStringOption(o => o.setName('recursos').setDescription('Recursos (separados por vírgula)').setRequired(true))
    .addNumberOption(o => o.setName('diario').setDescription('Preço Diário').setRequired(true))
    .addNumberOption(o => o.setName('semanal').setDescription('Preço Semanal').setRequired(true))
    .addNumberOption(o => o.setName('mensal').setDescription('Preço Mensal').setRequired(true))
    .addNumberOption(o => o.setName('bimestral').setDescription('Preço Bimestral').setRequired(true))
    .addStringOption(o => o.setName('link').setDescription('Link do arquivo/download').setRequired(true))
    .addStringOption(o => o.setName('imagem').setDescription('URL da Imagem').setRequired(true))
    .addIntegerOption(o => o.setName('estoque').setDescription('Quantidade em estoque').setRequired(true)),

  new SlashCommandBuilder()
    .setName('limpar')
    .setDescription('Limpa mensagens do canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName('quantidade').setDescription('Qtd de mensagens').setRequired(true)),
];

async function handleCommand(interaction) {
  const { commandName, guild, user, options } = interaction;
  const { checkSecurity, logAction } = require('./security');

  if (!(await checkSecurity(interaction))) return;

  try {
    if (commandName === 'produto-add') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const nome = options.getString('nome');
      const desc = options.getString('descricao');
      const recs = options.getString('recursos');
      const pD = options.getNumber('diario');
      const pS = options.getNumber('semanal');
      const pM = options.getNumber('mensal');
      const pB = options.getNumber('bimestral');
      const link = options.getString('link');
      const img = options.getString('imagem');
      const est = options.getInteger('estoque');

      // Adiciona no banco de dados
      const produto = await db.addProdutoFull(nome, desc, recs, pD, pS, pM, pB, link, img, est);
      
      // Envia automaticamente no canal de loja
      const canalLoja = guild.channels.cache.find(c => c.name === '🗂️・loja');
      if (canalLoja) {
          const { embedLoja, rowLoja } = require('./store');
          const embed = await embedLoja(produto);
          const row = await rowLoja(produto);
          const msg = await canalLoja.send({ embeds: [embed], components: [row] });
          // Salva o ID da mensagem para futuras edições/deletar
          await db.saveProdutoMsg(produto.id, msg.id, canalLoja.id);
      }

      await logAction(guild, 'ADMIN', `Novo produto **${nome}** adicionado e enviado para a loja.`, user);
      return interaction.editReply({ content: `✅ Produto **${nome}** adicionado e enviado para a loja!` });
    }

    if (commandName === 'limpar') {
      const qtd = options.getInteger('quantidade');
      await interaction.channel.bulkDelete(qtd);
      return interaction.reply({ content: `✅ ${qtd} mensagens limpas!`, flags: MessageFlags.Ephemeral });
    }

  } catch (err) {
    console.error('[COMMAND ERROR]', err.message);
    if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: `❌ Erro: ${err.message}`, flags: MessageFlags.Ephemeral });
    } else {
        await interaction.editReply({ content: `❌ Erro: ${err.message}` });
    }
  }
}

module.exports = { commands, handleCommand };
