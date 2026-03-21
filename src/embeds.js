const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const COR = {
  principal : 0x9B59B6,
  sucesso   : 0x2ECC71,
  erro      : 0xE74C3C,
  aviso     : 0xF39C12,
  info      : 0x3498DB,
  youtube   : 0xFF0000,
  produto   : 0xF1C40F,
  pedido    : 0x1ABC9C,
  pix       : 0x27AE60,
  admin     : 0xE67E22,
};

const FOOTER = { text: '⚡ Alpha Xit' };

// ── Canais fixos ────────────────────────────────────────────

function embedBoasVindas() {
  return new EmbedBuilder()
    .setColor(COR.principal)
    .setTitle('👋 Bem-vindo ao **Alpha Xit**!')
    .setDescription(
      '> O melhor servidor de produtos digitais.\n\n' +
      '📌 **Primeiros passos:**\n' +
      '**1.** Leia as regras no canal **#📜・regras**\n' +
      '**2.** Registre-se no canal **#✅・registro**\n' +
      '**3.** Explore a loja e aproveite!'
    )
    .addFields({ name: '🆓 Xit Free', value: 'Acesse o canal **#🆓・xit-free** para conteúdo gratuito sem precisar de registro!', inline: false })
    .setImage('https://i.imgur.com/placeholder.png')
    .setTimestamp()
    .setFooter(FOOTER);
}

function embedRegras() {
  return new EmbedBuilder()
    .setColor(COR.info)
    .setTitle('📜 Regras do Alpha Xit')
    .setDescription('Leia com atenção. O descumprimento resulta em punição.')
    .addFields(
      { name: '1️⃣ Respeito', value: 'Respeite todos os membros e a equipe.', inline: false },
      { name: '2️⃣ Sem spam', value: 'Proibido spam, flood e mensagens repetidas.', inline: false },
      { name: '3️⃣ Sem links', value: 'Não divulgue links sem autorização da equipe.', inline: false },
      { name: '4️⃣ Produtos', value: 'Não compartilhe produtos comprados com terceiros.', inline: false },
      { name: '5️⃣ Pagamentos', value: 'Fraudes ou chargebacks resultam em banimento permanente.', inline: false },
      { name: '6️⃣ Siga a equipe', value: 'Acate as decisões dos admins e staff.', inline: false },
    )
    .setTimestamp()
    .setFooter(FOOTER);
}

function embedRegistro() {
  const embed = new EmbedBuilder()
    .setColor(COR.sucesso)
    .setTitle('✅ Registro de Membro')
    .setDescription(
      'Para se registrar, você precisa criar o seu **XIT ID** — um código de 4 dígitos único que vai te identificar no servidor.\n\n' +
      '> Clique no botão abaixo, escolha seu XIT ID e ganhe acesso completo!'
    )
    .addFields(
      { name: '🔢 XIT ID', value: '• Exatamente **4 dígitos** (ex: `1234`, `0042`)\n• Único — ninguém pode ter o mesmo que você\n• Será seu identificador permanente no servidor', inline: false },
      { name: '🎁 O que você ganha', value: '• Acesso aos canais da comunidade\n• Acesso à loja\n• Cargo exclusivo com seu XIT ID', inline: false },
    )
    .setTimestamp()
    .setFooter(FOOTER);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_registrar')
      .setLabel('✅ Criar meu XIT ID')
      .setStyle(ButtonStyle.Success)
  );
  return { embed, row };
}

function embedXitFree() {
  return new EmbedBuilder()
    .setColor(COR.principal)
    .setTitle('🆓 Xit Free — Conteúdo Gratuito')
    .setDescription('Aqui você encontra conteúdo gratuito disponibilizado pela equipe Alpha Xit.\n\n> Sem precisar de registro. Aproveite!')
    .addFields({ name: '📦 O que tem aqui?', value: 'Dicas, materiais gratuitos e prévias dos nossos produtos.', inline: false })
    .setTimestamp()
    .setFooter(FOOTER);
}

function embedComoComprar() {
  const embed = new EmbedBuilder()
    .setColor(COR.pix)
    .setTitle('🛒 Como Comprar — Alpha Xit')
    .setDescription('Comprar aqui é simples e rápido! Veja o passo a passo:')
    .addFields(
      { name: '1️⃣ Escolha o produto', value: 'Navegue pelos canais de produtos e clique em **"Comprar"**.', inline: false },
      { name: '2️⃣ Receba o PIX', value: 'O bot enviará a chave PIX e o valor na sua **DM**.', inline: false },
      { name: '3️⃣ Pague e confirme', value: 'Efetue o pagamento e aguarde a confirmação da equipe.', inline: false },
      { name: '4️⃣ Receba o produto', value: 'Após confirmado, o produto digital será entregue na sua **DM**. ✅', inline: false },
    )
    .addFields({ name: '⚠️ Atenção', value: 'Sempre salve o comprovante. Em caso de dúvidas, contate um @🛡️ ꜱᴛᴀꜰꜰ.', inline: false })
    .setTimestamp()
    .setFooter(FOOTER);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_ver_produtos')
      .setLabel('🛒 Ver produtos')
      .setStyle(ButtonStyle.Primary)
  );
  return { embed, row };
}

// ── Produtos ─────────────────────────────────────────────

function embedProduto(produto) {
  const embed = new EmbedBuilder()
    .setColor(COR.produto)
    .setTitle(`🛒 ${produto.nome}`)
    .setDescription(produto.descricao || 'Sem descrição.')
    .addFields(
      { name: '💰 Preço', value: `**R$ ${produto.preco}**`, inline: true },
      { name: '🆔 ID do produto', value: `\`#${produto.id}\``, inline: true },
    )
    .setTimestamp()
    .setFooter(FOOTER);

  if (produto.link) embed.addFields({ name: '🔗 Mais informações', value: produto.link, inline: false });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_comprar_${produto.id}`)
      .setLabel('💳 Comprar agora')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`btn_info_${produto.id}`)
      .setLabel('ℹ️ Mais detalhes')
      .setStyle(ButtonStyle.Secondary)
  );
  return { embed, row };
}

function embedProdutoFree(produto) {
  const embed = new EmbedBuilder()
    .setColor(COR.sucesso)
    .setTitle(`🆓 ${produto.nome}`)
    .setDescription(produto.descricao || 'Produto gratuito.')
    .addFields(
      { name: '💰 Preço', value: '**GRÁTIS**', inline: true },
      { name: '🆔 ID do produto', value: `\`#${produto.id}\``, inline: true },
    )
    .setTimestamp()
    .setFooter(FOOTER);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_download_${produto.id}`)
      .setLabel('⬇️ Obter grátis')
      .setStyle(ButtonStyle.Success),
  );
  return { embed, row };
}

function embedListaProdutos(produtos) {
  if (!produtos.length) {
    return {
      embed: new EmbedBuilder()
        .setColor(COR.aviso)
        .setTitle('🛒 Loja Alpha Xit')
        .setDescription('Nenhum produto cadastrado no momento.')
        .setFooter(FOOTER),
      row: null,
    };
  }
  const embed = new EmbedBuilder()
    .setColor(COR.principal)
    .setTitle('🛒 Loja Alpha Xit')
    .setDescription(`**${produtos.length}** produto(s) disponível(is) — clique em um produto para comprar.`)
    .setTimestamp()
    .setFooter(FOOTER);

  produtos.slice(0, 10).forEach(p => {
    embed.addFields({ name: `#${p.id} • ${p.nome}`, value: `💰 R$ ${p.preco} | 📦 ${p.categoria}`, inline: false });
  });
  return { embed, row: null };
}

// ── Registro ─────────────────────────────────────────────

function embedRegistroSucesso(member, xitId) {
  return new EmbedBuilder()
    .setColor(COR.sucesso)
    .setTitle('✅ Registro Concluído!')
    .setDescription(`Bem-vindo, <@${member.id}>! Você agora é um **membro** do Alpha Xit.`)
    .addFields(
      { name: '🔢 Seu XIT ID', value: `\`${xitId}\``, inline: true },
      { name: '🎁 Acesso liberado!', value: 'Você já pode acessar todos os canais de membro.', inline: false },
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp()
    .setFooter(FOOTER);
}

function embedJaRegistrado(xitId) {
  return new EmbedBuilder()
    .setColor(COR.aviso)
    .setTitle('⚠️ Já registrado!')
    .setDescription(`Você já possui o cargo de membro.${xitId ? `\n\n🔢 Seu XIT ID: \`${xitId}\`` : ''}`)
    .setFooter(FOOTER);
}

function embedBoasVindasDM(member, xitId) {
  return new EmbedBuilder()
    .setColor(COR.principal)
    .setTitle(`👋 Bem-vindo ao Alpha Xit, ${member.user.username}!`)
    .setDescription('Seu registro foi concluído com sucesso!\n\nAgora você tem acesso completo ao servidor.')
    .addFields(
      { name: '🔢 Seu XIT ID', value: `\`${xitId}\` — guarde esse código!`, inline: false },
      { name: '🛒 Loja', value: 'Explore os produtos nos canais da categoria **Loja**.', inline: false },
      { name: '🆓 Xit Free', value: 'Não esqueça de conferir o canal **#🆓・xit-free**!', inline: false },
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp()
    .setFooter(FOOTER);
}

// ── PIX / Pedidos ────────────────────────────────────────

function embedPIX(produto, pedidoId) {
  return new EmbedBuilder()
    .setColor(COR.pix)
    .setTitle('💳 Pagamento via PIX')
    .setDescription(`Você solicitou a compra de **${produto.nome}**.\n\nRealize o pagamento abaixo e aguarde a confirmação da equipe.`)
    .addFields(
      { name: '💰 Valor', value: `**R$ ${produto.preco}**`, inline: true },
      { name: '🆔 Pedido', value: `**#${pedidoId}**`, inline: true },
      { name: '🔑 Chave PIX', value: `\`${process.env.PIX_KEY || 'Contate um staff'}\``, inline: false },
      { name: '👤 Favorecido', value: process.env.PIX_NAME || 'Alpha Xit', inline: false },
      { name: '📋 Instruções', value: '1. Copie a chave PIX acima\n2. Realize o pagamento\n3. Envie o comprovante para um **@🛡️ ꜱᴛᴀꜰꜰ**\n4. Aguarde a confirmação!', inline: false },
    )
    .setTimestamp()
    .setFooter({ text: `⚡ Alpha Xit • Pedido #${pedidoId}` });
}

function embedPedidoConfirmado(produto, comprador) {
  return new EmbedBuilder()
    .setColor(COR.sucesso)
    .setTitle('✅ Pagamento Confirmado!')
    .setDescription(`Olá <@${comprador}>! Seu pagamento do produto **${produto.nome}** foi confirmado.\n\nSeu produto será entregue em breve na sua DM!`)
    .setTimestamp()
    .setFooter(FOOTER);
}

function embedEntregaProduto(produto) {
  const embed = new EmbedBuilder()
    .setColor(COR.sucesso)
    .setTitle('📦 Entrega — Alpha Xit')
    .setDescription(`Seu produto **${produto.nome}** foi entregue! Aproveite! 🎉`)
    .setTimestamp()
    .setFooter(FOOTER);
  if (produto.link) embed.addFields({ name: '🔗 Acesso', value: produto.link, inline: false });
  return embed;
}

// ── YouTube ──────────────────────────────────────────────

function embedNovoVideo(video) {
  return new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle(`▶️ Novo vídeo! ${video.title}`)
    .setDescription(`Um novo vídeo foi publicado no canal!\n\n🔗 [Assistir agora](${video.link})`)
    .setImage(video.thumbnail || null)
    .addFields({ name: '📅 Publicado em', value: video.pubDate || 'Agora', inline: true })
    .setTimestamp()
    .setFooter(FOOTER);
}

// ── Admin ────────────────────────────────────────────────

function embedPedidosAbertos(pedidos) {
  if (!pedidos.length) {
    return new EmbedBuilder()
      .setColor(COR.sucesso)
      .setTitle('📋 Pedidos em Aberto')
      .setDescription('Nenhum pedido aguardando confirmação!')
      .setFooter(FOOTER);
  }
  const embed = new EmbedBuilder()
    .setColor(COR.admin)
    .setTitle(`📋 Pedidos em Aberto — ${pedidos.length} pedido(s)`)
    .setTimestamp()
    .setFooter(FOOTER);

  pedidos.slice(0, 15).forEach(p => {
    embed.addFields({
      name: `#${p.id} • ${p.produto_nome}`,
      value: `👤 <@${p.comprador_id}> | 📅 ${p.criado_em}`,
      inline: false,
    });
  });
  return embed;
}

function embedLog(tipo, descricao, autorId) {
  const cores = { registro: COR.sucesso, compra: COR.pix, admin: COR.admin, erro: COR.erro, youtube: 0xFF0000 };
  return new EmbedBuilder()
    .setColor(cores[tipo] || COR.info)
    .setTitle(`📋 Log — ${tipo.toUpperCase()}`)
    .setDescription(descricao)
    .addFields({ name: '👤 Autor', value: autorId ? `<@${autorId}>` : 'Sistema', inline: true })
    .setTimestamp()
    .setFooter(FOOTER);
}

function embedErro(msg) {
  return new EmbedBuilder()
    .setColor(COR.erro)
    .setTitle('❌ Erro')
    .setDescription(msg)
    .setFooter(FOOTER);
}

function embedSucesso(msg) {
  return new EmbedBuilder()
    .setColor(COR.sucesso)
    .setTitle('✅ Sucesso')
    .setDescription(msg)
    .setFooter(FOOTER);
}

module.exports = {
  embedBoasVindas, embedRegras, embedRegistro, embedXitFree, embedComoComprar,
  embedProduto, embedProdutoFree, embedListaProdutos,
  embedRegistroSucesso, embedJaRegistrado, embedBoasVindasDM,
  embedPIX, embedPedidoConfirmado, embedEntregaProduto,
  embedNovoVideo,
  embedPedidosAbertos, embedLog, embedErro, embedSucesso,
};
