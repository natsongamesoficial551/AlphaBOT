/**
 * commands.js — Comandos do bot (versão refatorada)
 *
 * MUDANÇAS:
 * - Removido: XIT ID, canal de registro, Xit Coins, moeda virtual
 * - Agora /produto-add e /produto-add-free exigem IMAGEM obrigatória
 * - Compra de produto: direto por PIX (sem coins)
 * - Embed bonita com imagem, descrição detalhada, seletor de produto no canal
 * - Segurança: nenhum link/arquivo exposto no embed público
 */

const {
  SlashCommandBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, MessageFlags, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');
const db = require('../database');
const {
  embedErro, embedSucesso, embedLog,
  embedPedidoConfirmado, embedEntregaProduto,
  embedPedidosAbertos, embedListaProdutos,
} = require('../embeds');
const { embedAuthPayload, AUTH_CHANNEL_ID } = require('./myauth');

const CANAL_PAGO_ID = process.env.CANAL_PAGO_ID || '1484718869716140163';
const CANAL_FREE_ID = process.env.CANAL_FREE_ID || '1484718898413703270';

// ── Definição dos comandos ────────────────────────────────────────────────────

const commands = [

  // Auth
  new SlashCommandBuilder()
    .setName('auth-setup')
    .setDescription('Envia o embed de Auth ID no canal configurado')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('auth-usuarios')
    .setDescription('Lista usuários com Auth ID aprovado')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('auth-resetsenha')
    .setDescription('Re-hasheia a senha de um usuário (corrige contas antigas com hash errado)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName('usuario').setDescription('Usuário do Discord').setRequired(true))
    .addStringOption(o => o.setName('nova_senha').setDescription('Nova senha para o usuário').setRequired(true)),

  new SlashCommandBuilder()
    .setName('auth-atualizar-todos')
    .setDescription('Gera um novo Auth ID para TODOS os usuários e envia na DM (reseta HWID)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('timeauth')
    .setDescription('Define a expiração do Auth ID de um usuário')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName('usuario').setDescription('Usuário do Discord').setRequired(true))
    .addIntegerOption(o => o.setName('ano').setDescription('Anos (0 = ignorar)').setRequired(true).setMinValue(0))
    .addIntegerOption(o => o.setName('mes').setDescription('Meses (0 = ignorar)').setRequired(true).setMinValue(0))
    .addIntegerOption(o => o.setName('semana').setDescription('Semanas (0 = ignorar)').setRequired(true).setMinValue(0))
    .addIntegerOption(o => o.setName('dia').setDescription('Dias (0 = ignorar)').setRequired(true).setMinValue(0))
    .addIntegerOption(o => o.setName('hora').setDescription('Horas (0 = ignorar)').setRequired(true).setMinValue(0)),

  // Produtos pagos
  new SlashCommandBuilder()
    .setName('produto-add')
    .setDescription('Adiciona um produto pago à loja com imagem e embed detalhada')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(o => o.setName('nome').setDescription('Nome do produto').setRequired(true))
    .addStringOption(o => o.setName('preco').setDescription('Preço em reais (ex: 29.90)').setRequired(true))
    .addStringOption(o => o.setName('descricao').setDescription('Descrição detalhada do produto').setRequired(true))
    .addAttachmentOption(o => o.setName('imagem').setDescription('Imagem de divulgação do produto (JPG/PNG)').setRequired(true))
    .addAttachmentOption(o => o.setName('arquivo').setDescription('Arquivo do produto para entrega na DM (zip, etc.)').setRequired(false))
    .addStringOption(o => o.setName('recursos').setDescription('Lista de recursos/funcionalidades (separados por vírgula)').setRequired(false)),

  // Produtos gratuitos
  new SlashCommandBuilder()
    .setName('produto-add-free')
    .setDescription('Adiciona um produto gratuito ao canal xit-free com imagem')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(o => o.setName('nome').setDescription('Nome do produto').setRequired(true))
    .addStringOption(o => o.setName('descricao').setDescription('Descrição detalhada do produto').setRequired(true))
    .addAttachmentOption(o => o.setName('imagem').setDescription('Imagem de divulgação do produto (JPG/PNG)').setRequired(true))
    .addAttachmentOption(o => o.setName('arquivo').setDescription('Arquivo do produto para entrega na DM').setRequired(false))
    .addStringOption(o => o.setName('link').setDescription('Link de acesso (alternativo ao arquivo)').setRequired(false))
    .addStringOption(o => o.setName('recursos').setDescription('Lista de recursos/funcionalidades (separados por vírgula)').setRequired(false)),

  // Gerenciamento
  new SlashCommandBuilder()
    .setName('produto-listar')
    .setDescription('Lista todos os produtos ativos')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('produto-deletar')
    .setDescription('Remove um produto pelo ID')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addIntegerOption(o => o.setName('id').setDescription('ID do produto').setRequired(true)),

  new SlashCommandBuilder()
    .setName('pedidos')
    .setDescription('Lista pedidos em aberto')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('confirmar')
    .setDescription('Confirma pagamento de um pedido')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addIntegerOption(o => o.setName('pedido_id').setDescription('ID do pedido').setRequired(true)),

  // Utilitários
  new SlashCommandBuilder()
    .setName('anuncio')
    .setDescription('Envia um anúncio em um canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(o => o.setName('titulo').setDescription('Título do anúncio').setRequired(true))
    .addStringOption(o => o.setName('mensagem').setDescription('Mensagem').setRequired(true))
    .addChannelOption(o => o.setName('canal').setDescription('Canal destino').setRequired(false)),

  new SlashCommandBuilder()
    .setName('youtube-set')
    .setDescription('Configura o canal do YouTube para auto-post')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('url').setDescription('URL do canal YouTube').setRequired(true))
    .addChannelOption(o => o.setName('canal').setDescription('Canal Discord').setRequired(true)),

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
      .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false)))
    .addSubcommand(s => s.setName('mute').setDescription('Silencia um usuário')
      .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true))
      .addIntegerOption(o => o.setName('minutos').setDescription('Duração em minutos').setRequired(true))
      .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false))),
];

// ── Handler ───────────────────────────────────────────────────────────────────

async function handleCommand(interaction) {
  const { commandName, guild, user } = interaction;

  try {

    // ── /produto-add ──────────────────────────────────────
    if (commandName === 'produto-add') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const nome      = interaction.options.getString('nome');
      const preco     = interaction.options.getString('preco');
      const descricao = interaction.options.getString('descricao');
      const imagem    = interaction.options.getAttachment('imagem');
      const arquivo   = interaction.options.getAttachment('arquivo');
      const recursos  = interaction.options.getString('recursos') || '';

      // Valida imagem
      if (!imagem || !imagem.contentType?.startsWith('image/')) {
        return interaction.editReply({ embeds: [embedErro('A imagem é obrigatória e deve ser JPG ou PNG.')] });
      }

      // Valida preço
      const precoNum = parseFloat(preco.replace(',', '.'));
      if (isNaN(precoNum) || precoNum <= 0) {
        return interaction.editReply({ embeds: [embedErro('Preço inválido. Use o formato: 29.90')] });
      }

      // Salva produto (imagem_url = URL da imagem de divulgação, link = arquivo de entrega)
      const produto = await db.addProduto(
        nome, descricao, `R$ ${precoNum.toFixed(2).replace('.', ',')}`, 0,
        arquivo ? arquivo.url : '',
        arquivo ? arquivo.name : '',
        'pago', 'pago',
        imagem.url,   // URL da imagem de divulgação
        recursos,
      );

      if (!produto) return interaction.editReply({ embeds: [embedErro('Erro ao salvar produto no banco.')] });

      const canal = guild.channels.cache.get(CANAL_PAGO_ID);
      if (!canal) return interaction.editReply({ embeds: [embedErro(`Canal pago não encontrado. Configure CANAL_PAGO_ID no .env`)] });

      const { embed, row } = _embedProdutoPago(produto);
      const msg = await canal.send({ embeds: [embed], components: [row] });
      await db.saveProdutoMsg(produto.id, msg.id, canal.id);

      await interaction.editReply({
        embeds: [embedSucesso(
          `✅ Produto **${nome}** publicado em <#${canal.id}>!\n` +
          `🆔 ID: \`#${produto.id}\`\n` +
          `💰 Preço: **R$ ${precoNum.toFixed(2).replace('.', ',')}**\n` +
          (arquivo ? `📎 Arquivo de entrega: \`${arquivo.name}\`` : '⚠️ Nenhum arquivo de entrega adicionado.')
        )],
      });
      _log(guild, 'admin', `Produto pago **${nome}** (ID #${produto.id}) adicionado por <@${user.id}>`, user.id);
      return;
    }

    // ── /produto-add-free ─────────────────────────────────
    if (commandName === 'produto-add-free') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const nome      = interaction.options.getString('nome');
      const descricao = interaction.options.getString('descricao');
      const imagem    = interaction.options.getAttachment('imagem');
      const arquivo   = interaction.options.getAttachment('arquivo');
      const linkTexto = interaction.options.getString('link') || '';
      const recursos  = interaction.options.getString('recursos') || '';

      if (!imagem || !imagem.contentType?.startsWith('image/')) {
        return interaction.editReply({ embeds: [embedErro('A imagem é obrigatória e deve ser JPG ou PNG.')] });
      }

      const linkEntrega  = arquivo ? arquivo.url  : linkTexto;
      const nomeArquivo  = arquivo ? arquivo.name : '';

      const produto = await db.addProduto(
        nome, descricao, 'Grátis', 0,
        linkEntrega, nomeArquivo,
        'free', 'free',
        imagem.url,
        recursos,
      );

      if (!produto) return interaction.editReply({ embeds: [embedErro('Erro ao salvar produto.')] });

      const canal = guild.channels.cache.get(CANAL_FREE_ID);
      if (!canal) return interaction.editReply({ embeds: [embedErro(`Canal free não encontrado. Configure CANAL_FREE_ID no .env`)] });

      const { embed, row } = _embedProdutoFree(produto);
      const msg = await canal.send({ embeds: [embed], components: [row] });
      await db.saveProdutoMsg(produto.id, msg.id, canal.id);

      await interaction.editReply({
        embeds: [embedSucesso(
          `✅ Produto gratuito **${nome}** publicado em <#${canal.id}>!\n` +
          `🆔 ID: \`#${produto.id}\`` +
          (arquivo ? `\n📎 Arquivo: \`${arquivo.name}\`` : linkTexto ? `\n🔗 Link: configurado` : '\n⚠️ Sem entrega configurada.')
        )],
      });
      _log(guild, 'admin', `Produto gratuito **${nome}** (ID #${produto.id}) adicionado por <@${user.id}>`, user.id);
      return;
    }

    // ── /produto-listar ───────────────────────────────────
    if (commandName === 'produto-listar') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const produtos = await db.listarProdutos();
      const { embed } = embedListaProdutos(produtos);
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /produto-deletar ──────────────────────────────────
    if (commandName === 'produto-deletar') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const id = interaction.options.getInteger('id');
      const produto = await db.getProduto(id);
      if (!produto) return interaction.editReply({ embeds: [embedErro(`Produto #${id} não encontrado.`)] });
      await db.deletarProduto(id);
      await interaction.editReply({ embeds: [embedSucesso(`Produto **${produto.nome}** (ID #${id}) removido.`)] });
      _log(guild, 'admin', `Produto #${id} removido por <@${user.id}>`, user.id);
      return;
    }

    // ── /pedidos ──────────────────────────────────────────
    if (commandName === 'pedidos') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const pedidos = await db.getPedidosAbertos();
      const embed = embedPedidosAbertos(pedidos);
      if (!pedidos.length) return interaction.editReply({ embeds: [embed] });

      const rows = pedidos.slice(0, 5).map(p =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`btn_confirmar_${p.id}`).setLabel(`✅ #${p.id}`).setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`btn_cancelar_${p.id}`).setLabel(`❌ #${p.id}`).setStyle(ButtonStyle.Danger),
        )
      );
      return interaction.editReply({ embeds: [embed], components: rows });
    }

    // ── /confirmar ────────────────────────────────────────
    if (commandName === 'confirmar') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const pedidoId = interaction.options.getInteger('pedido_id');
      const pedido   = await db.getPedido(pedidoId);
      if (!pedido) return interaction.editReply({ embeds: [embedErro(`Pedido #${pedidoId} não encontrado.`)] });
      if (pedido.status !== 'aguardando') return interaction.editReply({ embeds: [embedErro(`Pedido #${pedidoId} já foi ${pedido.status}.`)] });

      await db.confirmarPedido(pedidoId);

      const produto     = await db.getProduto(pedido.produto_id);
      const nomeProduto = produto?.nome || pedido.produto_nome || 'Produto';
      const linkProduto = produto?.link || null;
      const nomeArquivo = produto?.imagem_url_arquivo || produto?.imagem_url || null;

      try {
        const comprador = await interaction.client.users.fetch(pedido.comprador_id);
        await comprador.send({ embeds: [embedPedidoConfirmado({ nome: nomeProduto }, pedido.comprador_id)] });

        if (linkProduto) {
          if (_isDiscordCDN(linkProduto)) {
            await _enviarArquivoDM(comprador, nomeProduto, linkProduto, nomeArquivo);
          } else {
            await comprador.send({ embeds: [embedEntregaProduto({ nome: nomeProduto, link: linkProduto })] });
          }
        }
      } catch (_) {}

      await interaction.editReply({ embeds: [embedSucesso(`Pedido #${pedidoId} de **${nomeProduto}** confirmado e entregue na DM!`)] });
      _log(guild, 'admin', `Pedido #${pedidoId} confirmado por <@${user.id}>`, user.id);
      return;
    }

    // ── /anuncio ──────────────────────────────────────────
    if (commandName === 'anuncio') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const titulo = interaction.options.getString('titulo');
      const msg    = interaction.options.getString('mensagem');
      const canal  = interaction.options.getChannel('canal') || guild.channels.cache.find(c => c.name.includes('anuncios'));
      if (!canal) return interaction.editReply({ embeds: [embedErro('Canal não encontrado.')] });

      await canal.send({
        embeds: [new EmbedBuilder()
          .setColor(0x9B59B6)
          .setTitle(`📢 ${titulo}`)
          .setDescription(msg)
          .setTimestamp()
          .setFooter({ text: `⚡ Alpha Xit • ${user.username}` })],
      });
      return interaction.editReply({ embeds: [embedSucesso(`Anúncio enviado em <#${canal.id}>!`)] });
    }

    // ── /youtube-set ──────────────────────────────────────
    if (commandName === 'youtube-set') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const url   = interaction.options.getString('url');
      const canal = interaction.options.getChannel('canal');
      await db.setYTConfig(guild.id, canal.id, url);
      return interaction.editReply({ embeds: [embedSucesso(`YouTube configurado!\n🔗 ${url}\n📺 <#${canal.id}>`)] });
    }

    // ── /cargo ────────────────────────────────────────────
    if (commandName === 'cargo') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const sub   = interaction.options.getSubcommand();
      const alvo  = interaction.options.getMember('usuario');
      const cargo = interaction.options.getRole('cargo');
      if (sub === 'add') {
        await alvo.roles.add(cargo);
        await interaction.editReply({ embeds: [embedSucesso(`Cargo **${cargo.name}** adicionado para <@${alvo.id}>.`)] });
      } else {
        await alvo.roles.remove(cargo);
        await interaction.editReply({ embeds: [embedSucesso(`Cargo **${cargo.name}** removido de <@${alvo.id}>.`)] });
      }
      _log(guild, 'admin', `Cargo ${cargo.name} ${sub === 'add' ? 'adicionado a' : 'removido de'} <@${alvo.id}> por <@${user.id}>`, user.id);
      return;
    }

    // ── /moderar ──────────────────────────────────────────
    if (commandName === 'moderar') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const sub    = interaction.options.getSubcommand();
      const alvo   = interaction.options.getMember('usuario');
      const motivo = interaction.options.getString('motivo') || 'Sem motivo';
      if (sub === 'ban') {
        await alvo.ban({ reason: motivo });
        await interaction.editReply({ embeds: [embedSucesso(`<@${alvo.id}> banido.\nMotivo: ${motivo}`)] });
      } else if (sub === 'kick') {
        await alvo.kick(motivo);
        await interaction.editReply({ embeds: [embedSucesso(`<@${alvo.id}> expulso.\nMotivo: ${motivo}`)] });
      } else if (sub === 'mute') {
        const min = interaction.options.getInteger('minutos');
        await alvo.timeout(min * 60_000, motivo);
        await interaction.editReply({ embeds: [embedSucesso(`<@${alvo.id}> silenciado por **${min} min**.\nMotivo: ${motivo}`)] });
      }
      _log(guild, 'admin', `${sub.toUpperCase()}: <@${alvo.id}> | ${motivo} | por <@${user.id}>`, user.id);
      return;
    }

    // ── /auth-setup ───────────────────────────────────────
    if (commandName === 'auth-setup') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const channel = interaction.guild.channels.cache.get(AUTH_CHANNEL_ID);
      if (!channel) return interaction.editReply({ embeds: [embedErro(`Canal de auth não encontrado. Configure AUTH_CHANNEL_ID no .env`)] });
      const { embed, row } = embedAuthPayload();
      await channel.send({ embeds: [embed], components: [row] });
      return interaction.editReply({ embeds: [embedSucesso(`Embed de autenticação enviado em <#${AUTH_CHANNEL_ID}>!`)] });
    }

    // ── /auth-usuarios ────────────────────────────────────
    if (commandName === 'auth-usuarios') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const { listarAuthUsers, totalAuthUsers } = require('../database');
      const total    = await totalAuthUsers();
      const usuarios = await listarAuthUsers(20);

      if (!usuarios.length) return interaction.editReply({ embeds: [embedErro('Nenhum usuário aprovado ainda.')] });

      const linhas = usuarios.map(u => {
        const expiry = u.expiry_adm ? `📅 ${new Date(u.expiry_adm).toLocaleDateString('pt-BR')}` : '♾️ Permanente';
        const hwid   = u.hwid ? '🖥️ Vinculado' : '🔓 Livre';
        return `\`${u.username}\` — ${u.discord_tag} — ${expiry} — ${hwid}`;
      }).join('\n');

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`🔑 Auth IDs Aprovados — ${total} usuário(s)`)
          .setDescription(linhas.slice(0, 4000))
          .setFooter({ text: 'Mostrando últimos 20 • Alpha Xit Auth' })
          .setTimestamp()],
      });
    }

    // ── /auth-resetsenha ──────────────────────────────────────────
    if (commandName === 'auth-resetsenha') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const alvo      = interaction.options.getUser('usuario');
      const novaSenha = interaction.options.getString('nova_senha');

      const { getAuthUserByDiscord, getDB } = require('../database');
      const { hashPassword: hashPwd } = require('./myauth');

      const conta = await getAuthUserByDiscord(alvo.id);
      if (!conta) return interaction.editReply({ embeds: [embedErro(`<@${alvo.id}> não possui Auth ID aprovado.`)] });

      const novoHash = hashPwd(novaSenha);
      const dbConn   = await getDB();
      await dbConn.execute({ sql: `UPDATE auth_users SET password_hash=? WHERE discord_id=?`, args: [novoHash, alvo.id] });

      // Notifica o usuário via DM
      try {
        await alvo.send({
          embeds: [new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('🔒 Senha Atualizada')
            .setDescription(
              `Olá, **${conta.nome_completo}**!\n\n` +
              `O **staff** redefiniu sua senha de acesso ao software.\n\n` +
              `**👤 Usuário:** \`${conta.username}\`\n` +
              `**🔑 Nova Senha:** \`${novaSenha}\`\n\n` +
              `> ⚠️ Guarde sua nova senha com segurança!`
            )
            .setFooter({ text: 'Alpha Xit Auth' })
            .setTimestamp()],
        });
      } catch (_) {}

      await interaction.editReply({
        embeds: [embedSucesso(
          `✅ Senha de <@${alvo.id}> (\`${conta.username}\`) redefinida com sucesso!\n` +
          `A nova senha foi enviada na DM do usuário.`
        )],
      });
      _log(guild, 'admin', `/auth-resetsenha: senha de <@${alvo.id}> redefinida por <@${user.id}>`, user.id);
      return;
    }

    // ── /auth-atualizar-todos ───────────────────────────────────────
    if (commandName === 'auth-atualizar-todos') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const { getDB } = require('../database');
      const { gerarAuthKey: gKey } = require('./myauth');

      const dbConn = await getDB();
      const users  = (await dbConn.execute({ sql: `SELECT discord_id, username, nome_completo FROM auth_users`, args: [] })).rows;

      if (!users.length) return interaction.editReply({ embeds: [embedErro('Nenhum usuário encontrado no banco.')] });

      let sucessos = 0;
      let falhas   = 0;

      for (const row of users) {
        const discordId    = row[0];
        const username     = row[1];
        const nomeCompleto = row[2];
        const novaKey      = gKey();

        try {
          // Atualiza no banco
          await dbConn.execute({
            sql: `UPDATE auth_users SET auth_key = ?, hwid = NULL WHERE discord_id = ?`,
            args: [novaKey, discordId]
          });

          // Tenta enviar DM
          try {
            const userAlvo = await interaction.client.users.fetch(discordId);
            await userAlvo.send({
              embeds: [new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle('🔄 Auth ID Atualizado — Sistema Renovado!')
                .setDescription(
                  `Olá, **${nomeCompleto}**!\n\n` +
                  `Nosso sistema foi atualizado para maior segurança. Seu **Auth ID** foi renovado.\n\n` +
                  `**🔑 Novo Auth ID:**\n` +
                  `\`\`\`\n${novaKey}\n\`\`\`\n` +
                  `**👤 Usuário:** \`${username}\`\n\n` +
                  `**Como usar:**\n` +
                  `> 1. Abra o software Alpha Xit\n` +
                  `> 2. Use seu usuário e senha de sempre\n` +
                  `> 3. Insira o **Novo Auth ID** acima\n\n` +
                  `*Nota: O HWID foi resetado.*`
                )
                .setFooter({ text: 'Alpha Xit Auth' })
                .setTimestamp()
              ],
            });
            sucessos++;
          } catch (e) {
            console.error(`[UPDATE-ALL] Erro DM ${discordId}:`, e.message);
            sucessos++; // Consideramos sucesso pois atualizou no banco
          }
        } catch (err) {
          console.error(`[UPDATE-ALL] Erro Banco ${discordId}:`, err.message);
          falhas++;
        }
      }

      await interaction.editReply({
        embeds: [embedSucesso(
          `✅ **Atualização em massa concluída!**\n\n` +
          `👤 Usuários processados: **${users.length}**\n` +
          `✅ Sucessos: **${sucessos}**\n` +
          `❌ Falhas: **${falhas}**\n\n` +
          `*Nota: Usuários com DM fechada receberam a atualização no banco, mas não a mensagem.*`
        )],
      });
      _log(guild, 'admin', `/auth-atualizar-todos: ${sucessos} usuários atualizados por <@${user.id}>`, user.id);
      return;
    }

    // ── /timeauth ───────────────────────────────────────────────────
    if (commandName === 'timeauth') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const alvo    = interaction.options.getUser('usuario');
      const anos    = interaction.options.getInteger('ano')    || 0;
      const meses   = interaction.options.getInteger('mes')    || 0;
      const semanas = interaction.options.getInteger('semana') || 0;
      const dias    = interaction.options.getInteger('dia')    || 0;
      const horas   = interaction.options.getInteger('hora')   || 0;

      const { setExpiryAdm, getAuthUserByDiscord } = require('../database');
      const conta = await getAuthUserByDiscord(alvo.id);
      if (!conta) return interaction.editReply({ embeds: [embedErro(`<@${alvo.id}> não possui Auth ID aprovado.`)] });

      let dataExpiry = null;
      let dataLabel  = '♾️ Permanente';

      if (anos + meses + semanas + dias + horas > 0) {
        const agora = new Date();
        agora.setFullYear(agora.getFullYear() + anos);
        agora.setMonth(agora.getMonth() + meses);
        agora.setDate(agora.getDate() + semanas * 7 + dias);
        agora.setHours(agora.getHours() + horas);
        dataExpiry = agora.toISOString();
        const partes = [];
        if (anos)    partes.push(`${anos} ano${anos > 1 ? 's' : ''}`);
        if (meses)   partes.push(`${meses} ${meses > 1 ? 'meses' : 'mês'}`);
        if (semanas) partes.push(`${semanas} semana${semanas > 1 ? 's' : ''}`);
        if (dias)    partes.push(`${dias} dia${dias > 1 ? 's' : ''}`);
        if (horas)   partes.push(`${horas} hora${horas > 1 ? 's' : ''}`);
        dataLabel = `📅 ${partes.join(', ')} — ${agora.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
      }

      await setExpiryAdm(alvo.id, dataExpiry);

      try {
        await alvo.send({
          embeds: [new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📅 Sua licença foi atualizada!')
            .setDescription(`O **staff** atualizou seu **Auth ID**.\n\n> ⏳ **Nova expiração:** ${dataLabel}`)
            .setFooter({ text: 'Alpha Xit Auth' })
            .setTimestamp()],
        });
      } catch (_) {}

      await interaction.editReply({
        embeds: [embedSucesso(`Auth ID de <@${alvo.id}> (\`${conta.username}\`) atualizado!\nNova expiração: **${dataLabel}**`)],
      });
      _log(guild, 'admin', `/timeauth: <@${alvo.id}> — ${dataLabel} por <@${user.id}>`, user.id);
      return;
    }

  } catch (err) {
    console.error(`[CMD:${commandName}]`, err);
    try {
      const payload = { embeds: [embedErro('Erro interno.')], flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.reply(payload);
    } catch (_) {}
  }
}

// ── Embeds de produto (bonitas, com imagem) ───────────────────────────────────

function _embedProdutoPago(produto) {
  const recursosFormatados = produto.recursos
    ? produto.recursos.split(',').map(r => `> ✅ ${r.trim()}`).join('\n')
    : null;

  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle(`🛒 ${produto.nome}`)
    .setDescription(
      `${produto.descricao}\n\n` +
      (recursosFormatados ? `**⚡ Funcionalidades:**\n${recursosFormatados}\n\n` : '') +
      `💰 **Preço:** \`${produto.preco}\`\n` +
      `📦 **Entrega:** Arquivo enviado na sua DM após confirmação do pagamento\n` +
      `💳 **Pagamento:** Via PIX (instruções enviadas na DM)`
    )
    .setFooter({ text: `⚡ Alpha Xit • ID #${produto.id}` })
    .setTimestamp();

  // Imagem de divulgação (campo imagem_url_banner)
  if (produto.imagem_url_banner) {
    embed.setImage(produto.imagem_url_banner);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_comprar_${produto.id}`)
      .setLabel(`💳 Comprar — ${produto.preco}`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`btn_info_${produto.id}`)
      .setLabel('ℹ️ Mais informações')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embed, row };
}

function _embedProdutoFree(produto) {
  const recursosFormatados = produto.recursos
    ? produto.recursos.split(',').map(r => `> ✅ ${r.trim()}`).join('\n')
    : null;

  const embed = new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle(`🆓 ${produto.nome}`)
    .setDescription(
      `${produto.descricao}\n\n` +
      (recursosFormatados ? `**⚡ O que inclui:**\n${recursosFormatados}\n\n` : '') +
      `💚 **Preço:** \`GRÁTIS\`\n` +
      `📦 **Entrega:** Arquivo enviado na sua DM ao clicar no botão`
    )
    .setFooter({ text: `⚡ Alpha Xit Free • ID #${produto.id}` })
    .setTimestamp();

  if (produto.imagem_url_banner) {
    embed.setImage(produto.imagem_url_banner);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_download_${produto.id}`)
      .setLabel('📥 Obter Grátis')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`btn_info_${produto.id}`)
      .setLabel('ℹ️ Mais informações')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embed, row };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _isDiscordCDN(url) {
  if (!url) return false;
  return url.startsWith('https://cdn.discordapp.com/') ||
         url.startsWith('https://media.discordapp.net/');
}

async function _enviarArquivoDM(destinatario, nomeProduto, urlArquivo, nomeArquivo) {
  const { AttachmentBuilder } = require('discord.js');
  const embedEntrega = new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle('📦 Entrega — Alpha Xit')
    .setDescription(`Seu produto **${nomeProduto}** foi entregue! 🎉\n\nO arquivo está em anexo abaixo. ⬇️`)
    .setTimestamp()
    .setFooter({ text: '⚡ Alpha Xit' });

  try {
    const buffer   = await _downloadBuffer(urlArquivo);
    const fileName = nomeArquivo || _nomeDoUrl(urlArquivo);
    await destinatario.send({ embeds: [embedEntrega], files: [new AttachmentBuilder(buffer, { name: fileName })] });
  } catch (err) {
    console.error('[ENTREGA]', err.message);
    embedEntrega.setDescription(`Seu produto **${nomeProduto}** foi entregue! 🎉`)
      .addFields({ name: '🔗 Download', value: urlArquivo, inline: false });
    await destinatario.send({ embeds: [embedEntrega] });
  }
}

function _downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http');
    lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return _downloadBuffer(res.headers.location).then(resolve).catch(reject);
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function _nomeDoUrl(url) {
  try { return new URL(url).pathname.split('/').pop() || 'arquivo'; }
  catch { return 'arquivo'; }
}

async function _log(guild, tipo, descricao, autorId) {
  db.addLog(guild.id, tipo, descricao, autorId);
  const logCh = guild.channels.cache.find(c => c.name === '📋・bot-logs');
  if (logCh) try { await logCh.send({ embeds: [embedLog(tipo, descricao, autorId)] }); } catch (_) {}
}

module.exports = { commands, handleCommand };
