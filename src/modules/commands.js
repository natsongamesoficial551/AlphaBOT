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
    .addAttachmentOption(o => o.setName('imagem').setDescription('A imagem do produto').setRequired(true))
    .addIntegerOption(o => o.setName('estoque').setDescription('Quantidade em estoque').setRequired(true))
    .addAttachmentOption(o => o.setName('arquivo').setDescription('Arquivo do software (opcional se usar link)'))
    .addStringOption(o => o.setName('link_download').setDescription('Link de download (opcional se usar arquivo)')),

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
  new SlashCommandBuilder()
    .setName('hwid-reset')
    .setDescription('Reseta o HWID de um usuário para permitir login em outro PC')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName('usuario').setDescription('O usuário para resetar o HWID').setRequired(true)),
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
      const linkDownload = options.getString('link_download');
      const imagem = options.getAttachment('imagem');
      const est = options.getInteger('estoque');

      const linkFinal = linkDownload || (arquivo ? arquivo.url : null);
      if (!linkFinal) {
          return interaction.editReply({ content: '❌ Você precisa fornecer um **Arquivo** ou um **Link de Download**!' });
      }

      // Salva no banco
      const produto = await db.addProdutoFull(nome, desc, recs, pD, pS, pM, pB, linkFinal, imagem.url, est);;
      
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
        // Removemos o deferReply aqui para evitar o erro "Unknown interaction" se o banco demorar
        const pId = options.getInteger('produto_id');
        const plano = options.getString('plano');

        const produto = await db.getProduto(pId);
        if (!produto) return interaction.reply({ content: '❌ Produto não encontrado.', flags: MessageFlags.Ephemeral });

        // Resposta imediata para evitar timeout do Discord
        await interaction.reply({ content: `⏳ Iniciando simulação para **${produto.nome}** (${plano})...`, flags: MessageFlags.Ephemeral });

        const { _finalizarCompraPlano } = require('./pixCompra');
        
        const planoFake = { 
            tipo: `${produto.nome} - ${plano}`, 
            preco: produto[`preco_${plano}`],
            link: produto.link
        };
        
        try {
            await _finalizarCompraPlano(interaction.client, guild, user, planoFake, 999);
            await logAction(guild, 'ADMIN', `⚠️ TESTE: <@${user.id}> simulou pagamento de **${produto.nome}** (${plano})`, user);
            return interaction.editReply({ content: `✅ **SIMULAÇÃO CONCLUÍDA!** Verifique sua DM para criar sua conta do plano **${plano}**.` });
        } catch (e) {
            console.error('[PIX-TEST ERROR]', e);
            return interaction.editReply({ content: `❌ Erro no teste: ${e.message}` });
        }
    }

    if (commandName === 'hwid-reset') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const targetUser = options.getUser('usuario');
        
        const conta = await db.getAuthUserByDiscord(targetUser.id);
        if (!conta) {
            return interaction.editReply({ content: `❌ O usuário <@${targetUser.id}> não possui um Auth ID vinculado.` });
        }

        await db.run(`UPDATE auth_users SET hwid = NULL WHERE discord_id = ?`, [targetUser.id]);
        await logAction(guild, 'ADMIN', `HWID do usuário <@${targetUser.id}> foi resetado por <@${user.id}>`, user);
        
        try {
            await targetUser.send({
                embeds: [new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle('🔄 HWID Resetado')
                    .setDescription('Seu **HWID** foi resetado pelo staff. Agora você pode logar novamente no seu PC ou em um novo computador.')
                    .setFooter({ text: 'Alpha Xit Auth' })
                    .setTimestamp()]
            });
        } catch (e) {}

        return interaction.editReply({ content: `✅ HWID do usuário **${targetUser.tag}** resetado com sucesso!` });
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
