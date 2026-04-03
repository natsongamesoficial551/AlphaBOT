const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const db = require('../database');
const { embedProduto, embedProdutoFree, embedListaProdutos, embedPedidosAbertos, embedErro, embedSucesso, embedLog,
        embedPedidoConfirmado, embedEntregaProduto, embedSaldo, embedExtrato, embedCoinRecebido } = require('../embeds');
const { embedAuthPayload, AUTH_CHANNEL_ID } = require('./myauth');

const CANAL_PAGO_ID = '1484718869716140163';
const CANAL_FREE_ID = '1484718898413703270';

const commands = [

  new SlashCommandBuilder()
    .setName('auth-setup')
    .setDescription('Envia o embed de solicitação de Auth ID no canal configurado')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('auth-usuarios')
    .setDescription('Lista todos os usuários com Auth ID aprovado')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('timeauth')
    .setDescription('Define a expiração do Auth ID de um usuário (ANO/MÊS/SEMANA/DIA/HORA)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName('usuario').setDescription('Usuário do Discord').setRequired(true))
    .addIntegerOption(o => o.setName('ano').setDescription('Anos (0 = ignorar)').setRequired(true).setMinValue(0))
    .addIntegerOption(o => o.setName('mes').setDescription('Meses (0 = ignorar)').setRequired(true).setMinValue(0))
    .addIntegerOption(o => o.setName('semana').setDescription('Semanas (0 = ignorar)').setRequired(true).setMinValue(0))
    .addIntegerOption(o => o.setName('dia').setDescription('Dias (0 = ignorar)').setRequired(true).setMinValue(0))
    .addIntegerOption(o => o.setName('hora').setDescription('Horas (0 = ignorar)').setRequired(true).setMinValue(0)),

  new SlashCommandBuilder()
    .setName('produto-add')
    .setDescription('Adiciona um produto pago à loja')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(o => o.setName('nome').setDescription('Nome do produto').setRequired(true))
    .addIntegerOption(o => o.setName('preco_coins').setDescription('Preço em XIT Coins (ex: 250)').setRequired(true))
    .addStringOption(o => o.setName('descricao').setDescription('Descrição do produto').setRequired(true))
    .addAttachmentOption(o => o.setName('arquivo').setDescription('Arquivo do produto (zip, pdf, etc.) para entrega na DM').setRequired(false)),

  new SlashCommandBuilder()
    .setName('produto-add-free')
    .setDescription('Adiciona um produto gratuito ao xit-free')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(o => o.setName('nome').setDescription('Nome do produto').setRequired(true))
    .addStringOption(o => o.setName('descricao').setDescription('Descrição do produto').setRequired(true))
    .addAttachmentOption(o => o.setName('arquivo').setDescription('Arquivo do produto (zip, pdf, etc.) para entrega na DM').setRequired(false))
    .addStringOption(o => o.setName('link').setDescription('Link de acesso gratuito (alternativo ao arquivo)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('produto-listar')
    .setDescription('Lista todos os produtos ativos')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('produto-deletar')
    .setDescription('Remove um produto pago ou gratuito pelo ID')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addIntegerOption(o => o.setName('id').setDescription('ID do produto').setRequired(true)),

  new SlashCommandBuilder()
    .setName('pedidos')
    .setDescription('Lista pedidos em aberto')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('confirmar')
    .setDescription('Confirma pagamento de um pedido ou pacote de coins')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addIntegerOption(o => o.setName('pedido_id').setDescription('ID do pedido').setRequired(true)),

  // ── Moeda ─────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('moeda-enviar')
    .setDescription('Envia XIT Coins para um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true))
    .addIntegerOption(o => o.setName('quantidade').setDescription('Quantidade de coins').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo (ex: Pagamento PIX #12)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('moeda-remover')
    .setDescription('Remove XIT Coins de um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true))
    .addIntegerOption(o => o.setName('quantidade').setDescription('Quantidade de coins').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false)),

  new SlashCommandBuilder()
    .setName('moeda-ver')
    .setDescription('Ver saldo de XIT Coins de qualquer membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true)),

  new SlashCommandBuilder()
    .setName('saldo')
    .setDescription('Ver seu saldo de XIT Coins'),

  new SlashCommandBuilder()
    .setName('extrato')
    .setDescription('Ver seu histórico de XIT Coins'),

  new SlashCommandBuilder()
    .setName('comprar-coins')
    .setDescription('Ver pacotes e comprar XIT Coins'),

  new SlashCommandBuilder()
    .setName('anuncio')
    .setDescription('Envia um anúncio embed em um canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(o => o.setName('titulo').setDescription('Título do anúncio').setRequired(true))
    .addStringOption(o => o.setName('mensagem').setDescription('Mensagem').setRequired(true))
    .addChannelOption(o => o.setName('canal').setDescription('Canal destino').setRequired(false)),

  new SlashCommandBuilder()
    .setName('youtube-set')
    .setDescription('Configura o canal do YouTube para auto-post')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('url').setDescription('URL do canal YouTube').setRequired(true))
    .addChannelOption(o => o.setName('canal').setDescription('Canal Discord para postar').setRequired(true)),

  new SlashCommandBuilder()
    .setName('cargo')
    .setDescription('Adiciona ou remove um cargo de um membro')
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

async function handleCommand(interaction) {
  const { commandName, guild, user } = interaction;

  try {

    // ── /produto-add ──────────────────────────────────────
    if (commandName === 'produto-add') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const nome       = interaction.options.getString('nome');
      const precoCoins = interaction.options.getInteger('preco_coins');
      const descricao  = interaction.options.getString('descricao');
      const arquivo    = interaction.options.getAttachment('arquivo');

      // Salva a URL CDN do Discord no campo link, e o nome do arquivo em imagem_url
      // (reutilizamos imagem_url para guardar o nome original do arquivo)
      const linkArquivo  = arquivo ? arquivo.url        : '';
      const nomeArquivo  = arquivo ? arquivo.name       : '';

      const produto = await db.addProduto(nome, descricao, 'coins', precoCoins, linkArquivo, nomeArquivo, 'pago', 'pago');
      if (!produto) return interaction.editReply({ embeds: [embedErro('Erro ao salvar produto no banco.')] });

      const canal = guild.channels.cache.get(CANAL_PAGO_ID);
      if (!canal) {
        return interaction.editReply({ embeds: [embedErro('Canal de produtos pagos não encontrado. Verifique o ID no código.')] });
      }

      const { embed, row } = embedProduto(produto);
      const msg = await canal.send({ embeds: [embed], components: [row] });
      await db.saveProdutoMsg(produto.id, msg.id, canal.id);

      const infoArquivo = arquivo
        ? `\n📎 Arquivo: \`${nomeArquivo}\` — será enviado via DM na entrega.`
        : '\n⚠️ Nenhum arquivo anexado — entrega sem arquivo.';

      await interaction.editReply({ embeds: [embedSucesso(`Produto **${nome}** publicado em <#${canal.id}>! ID: \`#${produto.id}\`${infoArquivo}`)] });
      _log(guild, 'admin', `Produto **${nome}** (ID #${produto.id}) adicionado por <@${user.id}>`, user.id);
      return;
    }

    // ── /produto-add-free ─────────────────────────────────
    if (commandName === 'produto-add-free') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const nome      = interaction.options.getString('nome');
      const descricao = interaction.options.getString('descricao');
      const arquivo   = interaction.options.getAttachment('arquivo');
      const linkTexto = interaction.options.getString('link') || '';

      // Arquivo tem prioridade sobre link de texto
      const linkArquivo = arquivo ? arquivo.url  : linkTexto;
      const nomeArquivo = arquivo ? arquivo.name : '';

      const produto = await db.addProduto(nome, descricao, 'Grátis', 0, linkArquivo, nomeArquivo, 'free', 'free');
      if (!produto) return interaction.editReply({ embeds: [embedErro('Erro ao salvar produto no banco.')] });

      const canal = guild.channels.cache.get(CANAL_FREE_ID);
      if (!canal) {
        return interaction.editReply({ embeds: [embedErro('Canal xit-free não encontrado. Verifique o ID no código.')] });
      }

      const { embed, row } = embedProdutoFree(produto);
      const msg = await canal.send({ embeds: [embed], components: [row] });
      await db.saveProdutoMsg(produto.id, msg.id, canal.id);

      const infoEntrega = arquivo
        ? `\n📎 Arquivo: \`${nomeArquivo}\` — será enviado via DM.`
        : linkTexto
          ? `\n🔗 Link configurado.`
          : '\n⚠️ Nenhum arquivo ou link configurado.';

      await interaction.editReply({ embeds: [embedSucesso(`Produto gratuito **${nome}** publicado em <#${canal.id}>! ID: \`#${produto.id}\`${infoEntrega}`)] });
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
      await interaction.editReply({ embeds: [embedSucesso(`Produto **${produto.nome}** (ID #${id}) removido com sucesso.`)] });
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

      // Pedido de COIN — credita moedas automaticamente
      if (pedido.produto_nome?.startsWith('COIN-')) {
        const quantidade = parseInt(pedido.produto_nome.replace('COIN-', ''));
        const validos = [100, 250, 500, 1000];
        if (!validos.includes(quantidade)) {
          return interaction.editReply({ embeds: [embedErro(`Pacote de coin inválido: ${quantidade}`)] });
        }
        await db.adicionarSaldo(pedido.comprador_id, quantidade, `Compra de pacote via PIX (Pedido #${pedidoId})`);
        const novoSaldo = await db.getSaldo(pedido.comprador_id);

        try {
          const comprador = await interaction.client.users.fetch(pedido.comprador_id);
          const membro    = await guild.members.fetch(pedido.comprador_id);
          await comprador.send({ embeds: [embedCoinRecebido(membro, quantidade, novoSaldo)] });
        } catch (_) {}

        await interaction.editReply({ embeds: [embedSucesso(`✅ **${quantidade} 🪙** creditados para <@${pedido.comprador_id}>!\nSaldo atual: **${novoSaldo} 🪙**`)] });
        _log(guild, 'admin', `Pedido coin #${pedidoId} confirmado — ${quantidade} 🪙 para <@${pedido.comprador_id}>`, user.id);
        return;
      }

      // Pedido de PRODUTO normal
      const produto     = await db.getProduto(pedido.produto_id);
      const nomeProduto = produto?.nome || pedido.produto_nome || 'Produto';
      const linkProduto = produto?.link || null;
      const nomeArquivo = produto?.imagem_url || null; // nome original do arquivo

      try {
        const comprador = await interaction.client.users.fetch(pedido.comprador_id);
        await comprador.send({ embeds: [embedPedidoConfirmado({ nome: nomeProduto }, pedido.comprador_id)] });

        if (linkProduto) {
          // Verifica se é URL CDN do Discord (arquivo enviado pelo admin)
          if (_isDiscordCDN(linkProduto)) {
            await _enviarArquivoDM(comprador, nomeProduto, linkProduto, nomeArquivo);
          } else {
            // Link externo normal (ex: Mediafire)
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

      const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle(`📢 ${titulo}`)
        .setDescription(msg)
        .setTimestamp()
        .setFooter({ text: `⚡ Alpha Xit • ${user.username}` });

      await canal.send({ embeds: [embed] });
      await interaction.editReply({ embeds: [embedSucesso(`Anúncio enviado em <#${canal.id}>!`)] });
      return;
    }

    // ── /youtube-set ──────────────────────────────────────
    if (commandName === 'youtube-set') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const url   = interaction.options.getString('url');
      const canal = interaction.options.getChannel('canal');
      await db.setYTConfig(guild.id, canal.id, url);
      await interaction.editReply({ embeds: [embedSucesso(`YouTube configurado!\n🔗 URL: ${url}\n📺 Canal: <#${canal.id}>`)] });
      return;
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
      _log(guild, 'admin', `Cargo **${cargo.name}** ${sub === 'add' ? 'adicionado para' : 'removido de'} <@${alvo.id}> por <@${user.id}>`, user.id);
      return;
    }

    // ── /moderar ──────────────────────────────────────────
    if (commandName === 'moderar') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const sub    = interaction.options.getSubcommand();
      const alvo   = interaction.options.getMember('usuario');
      const motivo = interaction.options.getString('motivo') || 'Sem motivo informado';

      if (sub === 'ban') {
        await alvo.ban({ reason: motivo });
        await interaction.editReply({ embeds: [embedSucesso(`<@${alvo.id}> banido.\nMotivo: ${motivo}`)] });
      } else if (sub === 'kick') {
        await alvo.kick(motivo);
        await interaction.editReply({ embeds: [embedSucesso(`<@${alvo.id}> expulso.\nMotivo: ${motivo}`)] });
      } else if (sub === 'mute') {
        const min = interaction.options.getInteger('minutos');
        await alvo.timeout(min * 60 * 1000, motivo);
        await interaction.editReply({ embeds: [embedSucesso(`<@${alvo.id}> silenciado por **${min} min**.\nMotivo: ${motivo}`)] });
      }
      _log(guild, 'admin', `${sub.toUpperCase()}: <@${alvo.id}> | ${motivo} | por <@${user.id}>`, user.id);
      return;
    }

    // ── /moeda-enviar ─────────────────────────────────────
    if (commandName === 'moeda-enviar') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const alvo       = interaction.options.getUser('usuario');
      const quantidade = interaction.options.getInteger('quantidade');
      const motivo     = interaction.options.getString('motivo') || 'Enviado pelo admin';

      if (quantidade <= 0) return interaction.editReply({ embeds: [embedErro('A quantidade deve ser maior que 0.')] });

      await db.adicionarSaldo(alvo.id, quantidade, motivo);
      const novoSaldo = await db.getSaldo(alvo.id);

      try {
        const membro = await guild.members.fetch(alvo.id);
        await alvo.send({ embeds: [embedCoinRecebido(membro, quantidade, novoSaldo)] });
      } catch (_) {}

      await interaction.editReply({ embeds: [embedSucesso(`**${quantidade} 🪙** enviados para <@${alvo.id}>!\nSaldo atual: **${novoSaldo} 🪙**\nMotivo: ${motivo}`)] });
      _log(guild, 'admin', `<@${user.id}> enviou ${quantidade} 🪙 para <@${alvo.id}> — ${motivo}`, user.id);
      return;
    }

    // ── /moeda-remover ────────────────────────────────────
    if (commandName === 'moeda-remover') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const alvo       = interaction.options.getUser('usuario');
      const quantidade = interaction.options.getInteger('quantidade');
      const motivo     = interaction.options.getString('motivo') || 'Removido pelo admin';

      const saldoAtual = await db.getSaldo(alvo.id);
      if (saldoAtual < quantidade) {
        return interaction.editReply({ embeds: [embedErro(`<@${alvo.id}> só tem **${saldoAtual} 🪙**. Impossível remover **${quantidade} 🪙**.`)] });
      }

      await db.removerSaldo(alvo.id, quantidade, motivo);
      const novoSaldo = await db.getSaldo(alvo.id);

      await interaction.editReply({ embeds: [embedSucesso(`**${quantidade} 🪙** removidos de <@${alvo.id}>!\nSaldo atual: **${novoSaldo} 🪙**`)] });
      _log(guild, 'admin', `<@${user.id}> removeu ${quantidade} 🪙 de <@${alvo.id}> — ${motivo}`, user.id);
      return;
    }

    // ── /moeda-ver ────────────────────────────────────────
    if (commandName === 'moeda-ver') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const alvo   = interaction.options.getUser('usuario');
      const saldo  = await db.getSaldo(alvo.id);
      const extrato = await db.getExtrato(alvo.id, 5);

      const { EmbedBuilder: EB } = require('discord.js');
      const embed = new EB()
        .setColor(0xF1C40F)
        .setTitle(`🪙 Saldo de ${alvo.username}`)
        .setDescription(`**${saldo} 🪙 XIT Coins**`)
        .setThumbnail(alvo.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: '⚡ Alpha Xit' });

      if (extrato.length) {
        const linhas = extrato.map(t =>
          `${t.tipo === 'credito' ? '➕' : '➖'} ${t.quantidade} 🪙 — ${t.descricao}`
        ).join('\n');
        embed.addFields({ name: 'Últimas transações', value: linhas, inline: false });
      }

      return interaction.editReply({ embeds: [embed] });
    }

    // ── /saldo ────────────────────────────────────────────
    if (commandName === 'saldo') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const saldo  = await db.getSaldo(user.id);
      const membro = await guild.members.fetch(user.id);
      return interaction.editReply({ embeds: [embedSaldo(membro, saldo)] });
    }

    // ── /extrato ──────────────────────────────────────────
    if (commandName === 'extrato') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const transacoes = await db.getExtrato(user.id, 10);
      const membro = await guild.members.fetch(user.id);
      return interaction.editReply({ embeds: [embedExtrato(membro, transacoes)] });
    }

    // ── /comprar-coins ────────────────────────────────────
    if (commandName === 'comprar-coins') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const { embedPacotesMoeda } = require('../embeds');
      const { embed, row } = embedPacotesMoeda();
      return interaction.editReply({ embeds: [embed], components: [row] });
    }

    // ── /auth-setup ───────────────────────────────────────
    if (commandName === 'auth-setup') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const channel = interaction.guild.channels.cache.get(AUTH_CHANNEL_ID);
      if (!channel) {
        return interaction.editReply({ embeds: [embedErro(`Canal de auth não encontrado! Configure AUTH_CHANNEL_ID no .env (atual: \`${AUTH_CHANNEL_ID}\`)`)] });
      }
      const { embed, row } = embedAuthPayload();
      await channel.send({ embeds: [embed], components: [row] });
      return interaction.editReply({ embeds: [{ color: 0x2ECC71, description: `✅ Embed de autenticação enviado em <#${AUTH_CHANNEL_ID}>!` }] });
    }

    // ── /auth-usuarios ────────────────────────────────────
    if (commandName === 'auth-usuarios') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const { listarAuthUsers, totalAuthUsers } = require('../database');
      const total    = await totalAuthUsers();
      const usuarios = await listarAuthUsers(20);

      if (!usuarios.length) {
        return interaction.editReply({ embeds: [embedErro('Nenhum usuário aprovado ainda.')] });
      }

      const linhas = usuarios.map(u => {
        const expiry = u.expiry_adm
          ? `📅 ${new Date(u.expiry_adm).toLocaleDateString('pt-BR')}`
          : '♾️ Permanente';
        const hwid = u.hwid ? '🖥️ Vinculado' : '🔓 Livre';
        return `\`${u.username}\` — ${u.discord_tag} — ${expiry} — ${hwid}`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🔑 Auth IDs Aprovados — ${total} usuário(s)`)
        .setDescription(linhas.slice(0, 4000))
        .setFooter({ text: 'Mostrando últimos 20 • Alpha Xit Auth' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ── /timeauth ─────────────────────────────────────────
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
      if (!conta) {
        return interaction.editReply({ embeds: [embedErro(`<@${alvo.id}> não possui um Auth ID aprovado.`)] });
      }

      let dataExpiry = null;
      let dataLabel  = '♾️ Permanente (sem expiração)';

      const total = anos + meses + semanas + dias + horas;
      if (total > 0) {
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
        const dataFormatada = agora.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        dataLabel = `📅 ${partes.join(', ')} — expira em ${dataFormatada}`;
      }

      await setExpiryAdm(alvo.id, dataExpiry);

      // Notifica o usuário via DM
      try {
        await alvo.send({
          embeds: [new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📅 Sua licença foi atualizada!')
            .setDescription(
              `O **staff** atualizou a expiração do seu **Auth ID**.\n\n` +
              `> ⏳ **Nova expiração:** ${dataLabel}`
            )
            .setFooter({ text: 'Alpha Xit Auth' })
            .setTimestamp()
          ],
        });
      } catch (_) {}

      await interaction.editReply({
        embeds: [embedSucesso(
          `Auth ID de <@${alvo.id}> (\`${conta.username}\`) atualizado!\nNova expiração: **${dataLabel}**`
        )],
      });
      _log(guild, 'admin', `/timeauth aplicado em <@${alvo.id}> — ${dataLabel} por <@${user.id}>`, user.id);
      return;
    }

  } catch (err) {
    console.error(`[CMD:${commandName}]`, err);
    const payload = { embeds: [embedErro(`Erro interno: \`${err.message}\``)], ephemeral: true };
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.reply(payload);
    } catch (_) {}
  }
}

// ── Helpers ───────────────────────────────────────────────

/**
 * Verifica se a URL é do CDN do Discord (arquivo enviado diretamente pelo Discord).
 */
function _isDiscordCDN(url) {
  if (!url) return false;
  return url.startsWith('https://cdn.discordapp.com/') ||
         url.startsWith('https://media.discordapp.net/');
}

/**
 * Baixa o arquivo da URL CDN do Discord e envia como attachment na DM do usuário.
 * Se o download falhar, cai de volta para enviar o link no embed.
 * @param {import('discord.js').User} destinatario
 * @param {string} nomeProduto
 * @param {string} urlArquivo  URL CDN do Discord
 * @param {string|null} nomeArquivo  Nome original do arquivo (ex: produto.zip)
 */
async function _enviarArquivoDM(destinatario, nomeProduto, urlArquivo, nomeArquivo) {
  const https = require('https');
  const http  = require('http');
  const { EmbedBuilder } = require('discord.js');

  const embedEntrega = new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle('📦 Entrega — Alpha Xit')
    .setDescription(`Seu produto **${nomeProduto}** foi entregue! Aproveite! 🎉\n\nO arquivo está em anexo abaixo. ⬇️`)
    .setTimestamp()
    .setFooter({ text: '⚡ Alpha Xit' });

  try {
    // Baixa o arquivo em memória como Buffer
    const buffer = await _downloadBuffer(urlArquivo);
    const fileName = nomeArquivo || _nomeDoUrl(urlArquivo);
    const attachment = new AttachmentBuilder(buffer, { name: fileName });
    await destinatario.send({ embeds: [embedEntrega], files: [attachment] });
  } catch (err) {
    console.error('[ENTREGA] Falha ao baixar/enviar arquivo, enviando link:', err.message);
    // Fallback: envia o link direto
    embedEntrega.setDescription(
      `Seu produto **${nomeProduto}** foi entregue! Aproveite! 🎉`
    ).addFields({ name: '🔗 Download', value: urlArquivo, inline: false });
    await destinatario.send({ embeds: [embedEntrega] });
  }
}

/**
 * Baixa uma URL e retorna um Buffer com o conteúdo.
 */
function _downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http');
    lib.get(url, (res) => {
      // Segue redirecionamentos
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return _downloadBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Extrai o nome do arquivo de uma URL.
 */
function _nomeDoUrl(url) {
  try {
    const partes = new URL(url).pathname.split('/');
    return partes[partes.length - 1] || 'arquivo';
  } catch {
    return 'arquivo';
  }
}

async function _log(guild, tipo, descricao, autorId) {
  db.addLog(guild.id, tipo, descricao, autorId);
  const logCh = guild.channels.cache.find(c => c.name === '📋・bot-logs');
  if (logCh) {
    try { await logCh.send({ embeds: [embedLog(tipo, descricao, autorId)] }); } catch (_) {}
  }
}

module.exports = { commands, handleCommand };
