/**
 * commands.js — Versão Definitiva (Com /pix-test)
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
    .addAttachmentOption(o => o.setName('arquivo').setDescription('O arquivo do software').setRequired(true))
    .addAttachmentOption(o => o.setName('imagem').setDescription('A imagem do produto').setRequired(true))
    .addIntegerOption(o => o.setName('estoque').setDescription('Quantidade em estoque').setRequired(true)),

  new SlashCommandBuilder()
    .setName('limpar')
    .setDescription('Limpa mensagens do canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName('quantidade').setDescription('Qtd de mensagens').setRequired(true)),
    
  new SlashCommandBuilder()
    .setName('registro-setup')
    .setDescription('Força o envio da mensagem de registro')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('pix-test')
    .setDescription('Simula um pagamento aprovado (Apenas para Testes)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(o => o.setName('produto_id').setDescription('ID do Produto').setRequired(true))
    .addStringOption(o => o.setName('plano').setDescription('Tipo do Plano').setRequired(true)
        .addChoices(
            { name: 'Diário', value: 'diario' },
            { name: 'Semanal', value: 'semanal' },
            { name: 'Mensal', value: 'mensal' },
            { name: 'Bimestral', value: 'bimestral' }
        )
    ),
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
      const arquivo = options.getAttachment('arquivo');
      const imagem = options.getAttachment('imagem');
      const est = options.getInteger('estoque');

      // Salva no banco (usa a URL do anexo do Discord como link permanente)
      const produto = await db.addProdutoFull(nome, desc, recs, pD, pS, pM, pB, arquivo.url, imagem.url, est);
      
      const canalLoja = guild.channels.cache.find(c => c.name === '🗂️・loja');
      if (canalLoja) {
          const { embedLoja } = require('./store');
          const result = await embedLoja(produto);
          const msg = await canalLoja.send({ embeds: [result.embed], components: [result.row] });
          await db.saveProdutoMsg(produto.id, msg.id, canalLoja.id);
      }

      await logAction(guild, 'ADMIN', `Produto **${nome}** adicionado por <@${user.id}>`, user);
      return interaction.editReply({ content: `✅ Produto **${nome}** adicionado com sucesso!` });
    }

    if (commandName === 'limpar') {
      const qtd = options.getInteger('quantidade');
      await interaction.channel.bulkDelete(qtd);
      return interaction.reply({ content: `✅ ${qtd} mensagens limpas!`, flags: MessageFlags.Ephemeral });
    }

    if (commandName === 'registro-setup') {
      const { embedRegistro, rowRegistro } = require('./registration');
      await interaction.channel.send({ embeds: [embedRegistro()], components: [rowRegistro()] });
      return interaction.reply({ content: '✅ Registro enviado!', flags: MessageFlags.Ephemeral });
    }

    if (commandName === 'pix-test') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const pId = options.getInteger('produto_id');
        const plano = options.getString('plano');

        const produto = await db.getProduto(pId);
        if (!produto) return interaction.editReply({ content: '❌ Produto não encontrado.' });

        const { _finalizarCompraPlano } = require('./pixCompra');
        
        // Simula o objeto de plano que o pixCompra espera
        const planoFake = { 
            tipo: `${produto.nome} - ${plano}`, 
            preco: produto[`preco_${plano}`],
            link: produto.link // Passa o link do arquivo para o teste
        };
        
        // Simula a aprovação automática
        await _finalizarCompraPlano(interaction.client, guild, user, planoFake, 999);
        
        await logAction(guild, 'ADMIN', `⚠️ TESTE: <@${user.id}> simulou pagamento de **${produto.nome}** (${plano})`, user);
        return interaction.editReply({ content: `✅ **SIMULAÇÃO CONCLUÍDA!** Verifique sua DM para ver a entrega do plano **${plano}**.` });
    }

  } catch (err) {
    console.error('[COMMAND ERROR]', err);
    if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: `❌ Erro: ${err.message}`, flags: MessageFlags.Ephemeral });
    } else {
        await interaction.editReply({ content: `❌ Erro: ${err.message}` });
    }
  }
}

module.exports = { commands, handleCommand };
