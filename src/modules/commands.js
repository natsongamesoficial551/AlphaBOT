const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../database');
const { embedProduto, embedProdutoFree, embedListaProdutos, embedPedidosAbertos, embedErro, embedSucesso, embedLog, embedPedidoConfirmado, embedEntregaProduto } = require('../embeds');

const CANAL_PAGO_ID = '1484718869716140163';
const CANAL_FREE_ID = '1484718898413703270';

const commands = [

  new SlashCommandBuilder()
    .setName('produto-add')
    .setDescription('Adiciona um produto pago à loja')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(o => o.setName('nome').setDescription('Nome do produto').setRequired(true))
    .addStringOption(o => o.setName('preco').setDescription('Preço (ex: 19.90)').setRequired(true))
    .addStringOption(o => o.setName('descricao').setDescription('Descrição do produto').setRequired(true))
    .addStringOption(o => o.setName('link').setDescription('Link de entrega do produto').setRequired(false)),

  new SlashCommandBuilder()
    .setName('produto-add-free')
    .setDescription('Adiciona um produto gratuito ao xit-free')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(o => o.setName('nome').setDescription('Nome do produto').setRequired(true))
    .addStringOption(o => o.setName('descricao').setDescription('Descrição do produto').setRequired(true))
    .addStringOption(o => o.setName('link').setDescription('Link de acesso gratuito').setRequired(false)),

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
    .setDescription('Confirma pagamento de um pedido')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addIntegerOption(o => o.setName('pedido_id').setDescription('ID do pedido').setRequired(true)),

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

      const nome      = interaction.options.getString('nome');
      const preco     = interaction.options.getString('preco');
      const descricao = interaction.options.getString('descricao');
      const link      = interaction.options.getString('link') || '';

      const produto = db.addProduto(nome, descricao, preco, link, '', 'pago', 'pago');
      if (!produto) return interaction.editReply({ embeds: [embedErro('Erro ao salvar produto no banco.')] });

      const canal = guild.channels.cache.get(CANAL_PAGO_ID);
      if (!canal) {
        return interaction.editReply({ embeds: [embedErro('Canal de produtos pagos não encontrado. Verifique o ID no código.')] });
      }

      const { embed, row } = embedProduto(produto);
      const msg = await canal.send({ embeds: [embed], components: [row] });
      db.saveProdutoMsg(produto.id, msg.id, canal.id);

      await interaction.editReply({ embeds: [embedSucesso(`Produto **${nome}** publicado em <#${canal.id}>! ID: \`#${produto.id}\``)] });
      _log(guild, 'admin', `Produto **${nome}** (ID #${produto.id}) adicionado por <@${user.id}>`, user.id);
      return;
    }

    // ── /produto-add-free ─────────────────────────────────
    if (commandName === 'produto-add-free') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const nome      = interaction.options.getString('nome');
      const descricao = interaction.options.getString('descricao');
      const link      = interaction.options.getString('link') || '';

      const produto = db.addProduto(nome, descricao, 'Grátis', link, '', 'free', 'free');
      if (!produto) return interaction.editReply({ embeds: [embedErro('Erro ao salvar produto no banco.')] });

      const canal = guild.channels.cache.get(CANAL_FREE_ID);
      if (!canal) {
        return interaction.editReply({ embeds: [embedErro('Canal xit-free não encontrado. Verifique o ID no código.')] });
      }

      const { embed, row } = embedProdutoFree(produto);
      const msg = await canal.send({ embeds: [embed], components: [row] });
      db.saveProdutoMsg(produto.id, msg.id, canal.id);

      await interaction.editReply({ embeds: [embedSucesso(`Produto gratuito **${nome}** publicado em <#${canal.id}>! ID: \`#${produto.id}\``)] });
      _log(guild, 'admin', `Produto gratuito **${nome}** (ID #${produto.id}) adicionado por <@${user.id}>`, user.id);
      return;
    }

    // ── /produto-listar ───────────────────────────────────
    if (commandName === 'produto-listar') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const produtos = db.listarProdutos();
      const { embed } = embedListaProdutos(produtos);
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /produto-deletar ──────────────────────────────────
    if (commandName === 'produto-deletar') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const id = interaction.options.getInteger('id');
      const produto = db.getProduto(id);
      if (!produto) return interaction.editReply({ embeds: [embedErro(`Produto #${id} não encontrado.`)] });
      db.deletarProduto(id);
      await interaction.editReply({ embeds: [embedSucesso(`Produto **${produto.nome}** (ID #${id}) removido com sucesso.`)] });
      _log(guild, 'admin', `Produto #${id} removido por <@${user.id}>`, user.id);
      return;
    }

    // ── /pedidos ──────────────────────────────────────────
    if (commandName === 'pedidos') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const pedidos = db.getPedidosAbertos();
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
      const pedido = db.getPedido(pedidoId);
      if (!pedido) return interaction.editReply({ embeds: [embedErro(`Pedido #${pedidoId} não encontrado.`)] });
      if (pedido.status !== 'aguardando') return interaction.editReply({ embeds: [embedErro(`Pedido #${pedidoId} já foi ${pedido.status}.`)] });

      const produto = db.getProduto(pedido.produto_id);
      db.confirmarPedido(pedidoId);

      const nomeProduto = produto?.nome || pedido.produto_nome || 'Produto';
      const linkProduto = produto?.link || null;

      try {
        const comprador = await interaction.client.users.fetch(pedido.comprador_id);
        await comprador.send({ embeds: [embedPedidoConfirmado({ nome: nomeProduto }, pedido.comprador_id)] });
        if (linkProduto) await comprador.send({ embeds: [embedEntregaProduto({ nome: nomeProduto, link: linkProduto })] });
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
      db.setYTConfig(guild.id, canal.id, url);
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

  } catch (err) {
    console.error(`[CMD:${commandName}]`, err);
    const payload = { embeds: [embedErro(`Erro interno: \`${err.message}\``)], ephemeral: true };
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.reply(payload);
    } catch (_) {}
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
