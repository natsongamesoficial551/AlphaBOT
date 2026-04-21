/**
 * pixCompra.js — Versão ULTRA DEFINITIVA (Funções Globais)
 */
const {
    EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags
} = require('discord.js');

const db        = require('../database');
const { embedPedidoConfirmado, embedEntregaProduto, embedErro } = require('../embeds');
const { criarTransacao, aguardarPagamento, reaisParaCentavos } = require('./promisse');

// --- FUNÇÕES UTILITÁRIAS (DEFINIDAS NO TOPO PARA EVITAR ERROS) ---

function _isDiscordCDN(url) {
    return url && (typeof url === 'string') && (url.includes('cdn.discordapp.com') || url.includes('media.discordapp.net'));
}

async function _enviarArquivoDM(user, nome, link, thumb) {
    try {
        const embed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle(`📦 Entrega: ${nome}`)
            .setDescription(`Aqui está o seu arquivo! Clique no botão acima ou baixe o anexo abaixo.`)
            .setTimestamp();
        
        if (thumb) embed.setThumbnail(thumb);

        const attachment = new AttachmentBuilder(link);
        await user.send({ embeds: [embed], files: [attachment] });
    } catch (e) {
        console.error('[DM FILE ERROR]', e.message);
        await user.send(`📦 **Seu arquivo (${nome}):** ${link}\n*(Não consegui enviar o arquivo direto, use o link acima)*`);
    }
}

function _extrairValorNumerico(precoStr) {
    if (!precoStr) return '0.00';
    const limpo = String(precoStr).replace(/[^\d,.]/g, '').replace(',', '.');
    return parseFloat(limpo).toFixed(2);
}

// ----------------------------------------------------------------

const _pollingAtivo = new Map();

async function iniciarCompraProdutoPIX(client, guild, user, produto, pedidoId) {
    return _iniciarFluxoPix(client, guild, user, produto.nome, produto.preco, pedidoId, (c, g, u, pId) => _finalizarCompraProduto(c, g, u, produto, pId));
}

async function iniciarCompraPlanoPIX(client, guild, user, plano, pedidoId) {
    return _iniciarFluxoPix(client, guild, user, `Plano ${plano.tipo}`, plano.preco, pedidoId, (c, g, u, pId) => _finalizarCompraPlano(c, g, u, plano, pId));
}

async function _iniciarFluxoPix(client, guild, user, nomeItem, preco, pedidoId, onConfirm) {
    const valorReais    = _extrairValorNumerico(preco);
    const valorCentavos = reaisParaCentavos(valorReais);

    try {
        const transacao = await criarTransacao(valorCentavos);
        const transacaoId = transacao.id;
        let pixCopiaECola = transacao.pixCopiaECola;
        const qrCodeImage = transacao.qrCodeImage;

        const arquivos = [];
        let qrCodeBuffer = null;
        if (qrCodeImage && qrCodeImage.startsWith('data:image')) {
            try {
                const base64Data = qrCodeImage.split(',')[1];
                qrCodeBuffer = Buffer.from(base64Data, 'base64');
            } catch (e) { console.error('[BASE64 ERROR]', e.message); }
        }

        if (!pixCopiaECola) throw new Error('API Promisse não retornou o código Pix');

        const embed = new EmbedBuilder()
            .setColor(0x27AE60)
            .setTitle('💳 Pagamento via PIX — Automático')
            .setDescription(`Olá **${user.username}**! Seu pedido foi gerado.\n\nPague o valor abaixo via **Pix Copia e Cola** ou **QR Code**.`)
            .addFields(
                { name: '📦 Item',      value: `**${nomeItem}**`, inline: true },
                { name: '💰 Valor',     value: `**R$ ${valorReais.replace('.', ',')}**`, inline: true },
                { name: '🆔 Pedido',    value: `**#${pedidoId}**`, inline: true },
                { name: '📋 PIX Copia e Cola', value: `\`\`\`${pixCopiaECola}\`\`\``, inline: false }
            )
            .setFooter({ text: `⚡ Alpha Xit • Transação Segura • #${pedidoId}` })
            .setTimestamp();

        if (qrCodeBuffer) {
            arquivos.push(new AttachmentBuilder(qrCodeBuffer, { name: 'qrcode.png' }));
            embed.setImage('attachment://qrcode.png');
        }

        const dmMsg = await user.send({ embeds: [embed], files: arquivos });
        _iniciarPolling(client, guild, user, pedidoId, transacaoId, dmMsg, onConfirm);

    } catch (error) {
        console.error('[PIX ERROR]', error.message);
        await user.send({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle('❌ Erro no Pagamento').setDescription('Sistema temporariamente indisponível.')] }).catch(() => {});
    }
}

async function _finalizarCompraProduto(client, guild, user, produto, pedidoId) {
    await user.send({ embeds: [embedPedidoConfirmado({ nome: produto.nome }, user.id)] }).catch(() => {});
    const produtoAtual = await db.getProduto(produto.id);
    const linkProduto  = produtoAtual?.link || produto.link;

    if (linkProduto) {
        if (_isDiscordCDN(linkProduto)) await _enviarArquivoDM(user, produto.nome, linkProduto, produtoAtual?.imagem_url);
        else await user.send({ embeds: [embedEntregaProduto({ nome: produto.nome, link: linkProduto })] });
    }
}

async function _finalizarCompraPlano(client, guild, user, plano, pedidoId) {
    const { logAction } = require('./security');
    const { gerarAuthKey } = require('./myauth');

    await db.decrementarEstoque(plano.tipo);
    const authKey = gerarAuthKey();

    // Calcula expiração baseada no tipo de plano
    const agora = new Date();
    let expDate = new Date();
    let labelPlano = "Permanente";

    const tipoLower = plano.tipo.toLowerCase();
    if (tipoLower.includes('diario') || tipoLower.includes('diário')) {
        expDate.setHours(agora.getHours() + 24);
        labelPlano = "24 Horas";
    } else if (tipoLower.includes('semanal')) {
        expDate.setDate(agora.getDate() + 7);
        labelPlano = "7 Dias";
    } else if (tipoLower.includes('mensal')) {
        expDate.setMonth(agora.getMonth() + 1);
        labelPlano = "30 Dias";
    } else if (tipoLower.includes('bimestral')) {
        expDate.setMonth(agora.getMonth() + 2);
        labelPlano = "60 Dias";
    } else {
        expDate = null; // Permanente se não identificar
    }

    const expiryIso = expDate ? expDate.toISOString() : null;
    const expiryDisplay = expDate ? expDate.toLocaleString('pt-BR') : '♾️ Permanente';

    const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('✅ Plano Ativado!')
        .setDescription(
            `Seu pagamento do **${plano.tipo}** foi confirmado! 🎉\n\n` +
            `🔑 **Sua Auth Key:** \`${authKey}\`\n` +
            `⏳ **Duração:** ${labelPlano}\n` +
            `📅 **Expira em:** ${expiryDisplay}\n\n` +
            `📦 **Seu Download:** [Clique aqui para baixar o Software](${plano.link || 'https://google.com'})\n\n` +
            `**Próximo passo:**\n` +
            `1. Baixe o arquivo acima.\n` +
            `2. Ao abrir, use a **Auth Key** acima para se registrar.\n` +
            `3. Crie seu **Usuário e Senha** dentro do próprio software.`
        )
        .addFields({ name: '⚠️ Importante', value: 'Guarde sua Auth Key em local seguro. Ela é única e pessoal.' })
        .setTimestamp();

    // Tenta enviar o arquivo diretamente se for um link do Discord
    if (plano.link && _isDiscordCDN(plano.link)) {
        await user.send({ embeds: [embed] });
        await _enviarArquivoDM(user, plano.tipo, plano.link);
    } else {
        await user.send({ embeds: [embed] });
    }
    await logAction(guild, 'VENDA', `Plano **${plano.tipo}** (${labelPlano}) vendido para <@${user.id}>. Key: ${authKey}`, user);
    
    // Usa a função centralizada do DB que agora tem "ON CONFLICT" para evitar erros
    await db.criarSolicitacao(user.id, user.tag, `Plano ${labelPlano}`, `key_${authKey}`, 'pending_registration');
    
    // Atualiza o status para identificar que foi pago via Pix automático
    const req = await db.getAsync(`SELECT id FROM auth_requests WHERE discord_id = ?`, [user.id]);
    if (req) {
        await db.atualizarStatusSolicitacao(req.id, 'pago_aguardando_registro');
    }
    
    // Se o usuário já tiver uma conta vinculada, atualizamos a expiração dela
    const contaExistente = await db.getAuthUserByDiscord(user.id);
    if (contaExistente) {
        await db.setExpiryAdm(user.id, expiryIso);
        await user.send(`🔄 **Sua licença existente foi atualizada!** Nova expiração: ${expiryDisplay}`);
    }
}

async function _iniciarPolling(client, guild, user, pedidoId, transacaoId, dmMsg, onConfirm) {
    if (_pollingAtivo.has(pedidoId)) return;
    _pollingAtivo.set(pedidoId, true);

    try {
        await aguardarPagamento(transacaoId, () => {});

        const pedido = await db.getPedido(pedidoId);
        if (!pedido || pedido.status !== 'aguardando') return;

        await db.confirmarPedido(pedidoId);

        // Dá o cargo de membro (conforme solicitado)
        try {
            const guildObj = client.guilds.cache.get(process.env.GUILD_ID || guild.id);
            const member = await guildObj.members.fetch(user.id).catch(() => null);
            if (member) {
                const roleMembro = guildObj.roles.cache.find(r => r.name === 'Membros');
                if (roleMembro) await member.roles.add(roleMembro).catch(() => {});
            }
        } catch (e) {}

        if (onConfirm) await onConfirm(client, guild, user, pedidoId);

        if (dmMsg) {
            const embedPago = new EmbedBuilder()
                .setColor(0x2ECC71)
                .setTitle('✅ Pagamento Confirmado!')
                .setDescription(`Seu pagamento do pedido **#${pedidoId}** foi confirmado! 🎉`)
                .setTimestamp();
            await dmMsg.edit({ embeds: [embedPago], files: [], components: [] }).catch(() => {});
        }

    } catch (error) {
        console.log(`[POLLING] Pedido #${pedidoId} encerrado: ${error.message}`);
    } finally {
        _pollingAtivo.delete(pedidoId);
    }
}

// Stubs para manter compatibilidade
async function abrirFormularioCompra(i) { i.reply({ content: 'Clique no botão de compra para receber o Pix na DM.', flags: 64 }); }
async function processarFormularioCompra(i) {}
async function processarAprovacao(i) { i.reply({ content: 'Este pedido é automático.', flags: 64 }); }
async function processarReprovacao(i) {
    const id = parseInt(i.customId.replace('btn_pix_reprovar_', ''));
    await db.cancelarPedido(id);
    i.reply({ content: `Pedido #${id} cancelado.`, flags: 64 });
}

module.exports = { iniciarCompraProdutoPIX, iniciarCompraPlanoPIX, abrirFormularioCompra, processarFormularioCompra, processarAprovacao, processarReprovacao, _finalizarCompraPlano };
