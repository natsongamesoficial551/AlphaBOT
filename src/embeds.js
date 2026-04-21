/**
 * embeds.js — Todas as embeds do bot (versão refatorada)
 * REMOVIDO: XIT ID, registroSucesso, jaRegistrado, boasVindasDM, saldo, extrato, pacotesMoeda, coins
 * ATUALIZADO: embedComoComprar reflete compra direta por PIX, produto com imagem
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const COR = {
  principal : 0x9B59B6,
  sucesso   : 0x2ECC71,
  erro      : 0xE74C3C,
  aviso     : 0xF39C12,
  info      : 0x3498DB,
  produto   : 0xF1C40F,
  pedido    : 0x1ABC9C,
  pix       : 0x27AE60,
  admin     : 0xE67E22,
};

const FOOTER = { text: '⚡ Alpha Xit' };

// ── Canais fixos ──────────────────────────────────────────────────────────────

function embedBoasVindas() {
  return new EmbedBuilder()
    .setColor(COR.principal)
    .setTitle('👋 Bem-vindo ao **Alpha Xit**!')
    .setDescription(
      '> O melhor servidor de produtos digitais.\n\n' +
      '📌 **Primeiros passos:**\n' +
      '**1.** Leia as regras no canal **#📜・regras**\n' +
      '**2.** Explore a loja nos canais de produtos\n' +
      '**3.** Para acessar nosso software, solicite um **Auth ID** no canal de autenticação\n\n' +
      '🆓 Confira o canal **#🆓・xit-free** para conteúdo gratuito!'
    )
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

function embedXitFree() {
  return new EmbedBuilder()
    .setColor(COR.principal)
    .setTitle('🆓 Xit Free — Conteúdo Gratuito')
    .setDescription(
      'Aqui você encontra conteúdo gratuito disponibilizado pela equipe Alpha Xit.\n\n' +
      '> Clique em **Obter Grátis** em qualquer produto abaixo!\n' +
      '> O arquivo será enviado diretamente na sua **DM**. 📩'
    )
    .setTimestamp()
    .setFooter(FOOTER);
}

function embedComoComprar() {
  const embed = new EmbedBuilder()
    .setColor(COR.pix)
    .setTitle('🛒 Como Comprar — Alpha Xit')
    .setDescription('Comprar aqui é simples, rápido e seguro! Veja o passo a passo:')
    .addFields(
      { name: '1️⃣ Escolha o produto', value: 'Navegue pelos canais de produtos e clique em **"Comprar"**.', inline: false },
      { name: '2️⃣ Receba o QR Code', value: 'O bot vai gerar um **QR Code Pix** e enviar na sua **DM** com o valor exato.', inline: false },
      { name: '3️⃣ Efetue o pagamento', value: 'Escaneie o QR Code ou use o **Pix Copia e Cola** no seu app bancário.', inline: false },
      { name: '4️⃣ Aguarde a confirmação', value: 'Nossa equipe verifica e aprova o pagamento rapidamente.', inline: false },
      { name: '5️⃣ Receba seu produto', value: 'Após aprovado, o arquivo é entregue automaticamente na sua **DM**. ✅', inline: false },
      { name: '⚠️ Atenção', value: 'Sempre pague o **valor exato**. Em dúvidas, fale com um **@🛡️ ꜱᴛᴀꜰꜰ**.', inline: false },
    )
    .setTimestamp()
    .setFooter(FOOTER);

  return { embed, row: null };
}

// ── Produtos ──────────────────────────────────────────────────────────────────

function embedProduto(produto) {
  const recursosFormatados = produto.recursos
    ? produto.recursos.split(',').map(r => `> ✅ ${r.trim()}`).join('\n')
    : null;

  const embed = new EmbedBuilder()
    .setColor(COR.produto)
    .setTitle(`🛒 ${produto.nome}`)
    .setDescription(
      `${produto.descricao || 'Sem descrição.'}\n\n` +
      (recursosFormatados ? `**⚡ Funcionalidades:**\n${recursosFormatados}\n\n` : '') +
      `💰 **Preço:** \`${produto.preco || 'R$ 0,00'}\`\n` +
      `📦 **Entrega:** Arquivo enviado na sua DM após confirmação do pagamento\n` +
      `💳 **Pagamento:** Via PIX (QR Code enviado na DM)`
    )
    .setFooter({ text: `⚡ Alpha Xit • ID #${produto.id}` })
    .setTimestamp();

  if (produto.imagem_url_banner) embed.setImage(produto.imagem_url_banner);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_comprar_${produto.id}`)
      .setLabel(`💳 Comprar — ${produto.preco || '—'}`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`btn_info_${produto.id}`)
      .setLabel('ℹ️ Mais detalhes')
      .setStyle(ButtonStyle.Secondary),
  );
  return { embed, row };
}

function embedProdutoFree(produto) {
  const recursosFormatados = produto.recursos
    ? produto.recursos.split(',').map(r => `> ✅ ${r.trim()}`).join('\n')
    : null;

  const embed = new EmbedBuilder()
    .setColor(COR.sucesso)
    .setTitle(`🆓 ${produto.nome}`)
    .setDescription(
      `${produto.descricao || 'Produto gratuito.'}\n\n` +
      (recursosFormatados ? `**⚡ O que inclui:**\n${recursosFormatados}\n\n` : '') +
      `💚 **Preço:** \`GRÁTIS\`\n` +
      `📦 **Entrega:** Arquivo enviado na sua DM ao clicar no botão`
    )
    .setFooter({ text: `⚡ Alpha Xit Free • ID #${produto.id}` })
    .setTimestamp();

  if (produto.imagem_url_banner) embed.setImage(produto.imagem_url_banner);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_download_${produto.id}`)
      .setLabel('📥 Obter Grátis')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`btn_info_${produto.id}`)
      .setLabel('ℹ️ Mais detalhes')
      .setStyle(ButtonStyle.Secondary),
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
    .setDescription(`**${produtos.length}** produto(s) disponível(is)`)
    .setTimestamp()
    .setFooter(FOOTER);

  produtos.slice(0, 10).forEach(p => {
    embed.addFields({
      name: `#${p.id} • ${p.nome}`,
      value: `💰 ${p.preco || 'Grátis'} | 🏷️ ${p.tipo === 'free' ? 'Gratuito' : 'Pago'}`,
      inline: false,
    });
  });
  return { embed, row: null };
}

// ── PIX / Pedidos ─────────────────────────────────────────────────────────────

function embedPIX(produto, pedidoId) {
  return new EmbedBuilder()
    .setColor(COR.pix)
    .setTitle('💳 Pagamento via PIX — Alpha Xit')
    .setDescription(
      `Você solicitou a compra de **${produto.nome}**.\n\n` +
      `Realize o pagamento abaixo e aguarde a confirmação da equipe.`
    )
    .addFields(
      { name: '💰 Valor',      value: `**${produto.preco || '—'}**`,                            inline: true  },
      { name: '🆔 Pedido',     value: `**#${pedidoId}**`,                                       inline: true  },
      { name: '🔑 Chave PIX',  value: `\`${process.env.PIX_KEY || 'Configure PIX_KEY no .env'}\``, inline: false },
      { name: '👤 Favorecido', value: process.env.PIX_NAME || 'Alpha Xit',                      inline: false },
      { name: '📋 Passos',     value: '1. Copie a chave PIX\n2. Pague o valor exato\n3. Aguarde a aprovação da equipe\n4. Produto entregue na DM automaticamente!', inline: false },
    )
    .setTimestamp()
    .setFooter({ text: `⚡ Alpha Xit • Pedido #${pedidoId}` });
}

function embedPedidoConfirmado(produto, compradorId) {
  return new EmbedBuilder()
    .setColor(COR.sucesso)
    .setTitle('✅ Pagamento Confirmado!')
    .setDescription(
      `Olá <@${compradorId}>! Seu pagamento do produto **${produto.nome}** foi confirmado! 🎉\n\n` +
      `Siga as instruções enviadas na sua **DM** para criar sua conta e receber seu **Auth ID**.`
    )
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

  if (produto.link && !produto.link.includes('cdn.discordapp.com')) {
    embed.addFields({ name: '🔗 Acesso', value: produto.link, inline: false });
  }
  return embed;
}

// ── YouTube ───────────────────────────────────────────────────────────────────

function embedNovoVideo(video) {
  return new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle(`▶️ Novo vídeo! ${video.title}`)
    .setDescription(`Um novo vídeo foi publicado!\n\n🔗 [Assistir agora](${video.link})`)
    .setImage(video.thumbnail || null)
    .addFields({ name: '📅 Publicado em', value: video.pubDate || 'Agora', inline: true })
    .setTimestamp()
    .setFooter(FOOTER);
}

// ── Admin ─────────────────────────────────────────────────────────────────────

function embedPedidosAbertos(pedidos) {
  if (!pedidos.length) {
    return new EmbedBuilder()
      .setColor(COR.aviso)
      .setTitle('📋 Pedidos em Aberto')
      .setDescription('Nenhum pedido aguardando confirmação.')
      .setFooter(FOOTER);
  }
  const embed = new EmbedBuilder()
    .setColor(COR.admin)
    .setTitle('📋 Pedidos em Aberto')
    .setDescription(`**${pedidos.length}** pedido(s) pendente(s).`)
    .setTimestamp()
    .setFooter(FOOTER);

  pedidos.slice(0, 10).forEach(p => {
    embed.addFields({
      name: `Pedido #${p.id} • ${p.produto_nome}`,
      value: `👤 <@${p.comprador_id}>\n📅 ${p.criado_em}`,
      inline: false,
    });
  });
  return embed;
}

function embedSucesso(msg) {
  return new EmbedBuilder().setColor(COR.sucesso).setDescription(`✅ ${msg}`);
}

function embedErro(msg) {
  return new EmbedBuilder().setColor(COR.erro).setDescription(`❌ ${msg}`);
}

function embedLog(tipo, desc, autorId) {
  const cores = {
    'ALERTA': 0xFF0000,
    'SEGURANÇA': 0xFF0000,
    'ADMIN': 0xE67E22,
    'VENDA': 0x2ECC71,
    'ENTRADA': 0x3498DB
  };
  return new EmbedBuilder()
    .setColor(cores[tipo.toUpperCase()] || 0x9B59B6)
    .setTitle(`🛡️ Log: ${tipo.toUpperCase()}`)
    .setDescription(desc)
    .addFields({ name: 'Responsável', value: autorId ? `<@${autorId}>` : 'Sistema', inline: true })
    .setTimestamp()
    .setFooter({ text: 'Alpha Xit Security' });
}

module.exports = {
  embedBoasVindas, embedRegras, embedXitFree, embedComoComprar,
  embedProduto, embedProdutoFree, embedListaProdutos,
  embedPIX, embedPedidoConfirmado, embedEntregaProduto,
  embedNovoVideo,
  embedPedidosAbertos, embedSucesso, embedErro, embedLog,
};
