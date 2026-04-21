/**
 * pixCompra.js — Versão FINAL (copyPaste e qrCodeBase64)
 */
const {
    EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags
} = require('discord.js');

const db        = require('../database');
const { embedPedidoConfirmado, embedEntregaProduto, embedErro } = require('../embeds');
const { criarTransacao, aguardarPagamento, reaisParaCentavos } = require('./promisse');

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
        const { _isDiscordCDN, _enviarArquivoDM } = require('./buttons');
        if (_isDiscordCDN(linkProduto)) await _enviarArquivoDM(user, produto.nome, linkProduto, produtoAtual?.imagem_url);
        else await user.send({ embeds: [embedEntregaProduto({ nome: produto.nome, link: linkProduto })] });
    }
}

async function _finalizarCompraPlano(client, guild, user, plano, pedidoId) {
    const { logAction } = require('./security');
    const { gerarAuthKey } = require('./myauth');

    await db.decrementarEstoque(plano.tipo);
    const authKey = gerarAuthKey();

    // Cria solicitação aprovada automaticamente para o usuário criar login
    // Mas antes, vamos enviar a chave e as instruções
    const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('✅ Plano Ativado!')
        .setDescription(
            `Seu pagamento do **Plano ${plano.tipo}** foi confirmado! 🎉\n\n` +
            `🔑 **Sua Auth Key:** \`${authKey}\`\n\n` +
            `**Próximo passo:**\n` +
            `Escaneie o QR-Code abaixo ou clique no link para criar seu **Usuário e Senha** de acesso ao software.`
        )
        .addFields({ name: '⚠️ Importante', value: 'Guarde sua Auth Key em local seguro. Ela é única e pessoal.' })
        .setTimestamp();

    // Gerar QR Code para o registro (link para um formulário ou instrução de comando)
    // Como o usuário quer QR Code, vamos simular um link de registro
    const registerUrl = `https://alphaxit.com/register?key=${authKey}&discord=${user.id}`;
    
    const qrcode = require('qrcode');
    const qrBuffer = await qrcode.toBuffer(registerUrl);
    const attachment = new AttachmentBuilder(qrBuffer, { name: 'registro_qrcode.png' });
    embed.setImage('attachment://registro_qrcode.png');

    await user.send({ embeds: [embed], files: [attachment] });
    await logAction(guild, 'VENDA', `Plano **${plano.tipo}** vendido para <@${user.id}>. Key: ${authKey}`, user);
    
    // O sistema de login authApi.js precisa que o usuário exista em auth_users.
    // Como ele ainda vai criar o user/pass, podemos salvar a key em uma tabela temporária 
    // ou usar o sistema de auth_requests já existente marcando como "pago_pendente_registro"
    await db.run(`INSERT INTO auth_requests (discord_id, discord_tag, nome_completo, username, password_hash, status) VALUES (?,?,?,?,?,?)`, 
        [user.id, user.tag, 'Cliente Pago', `key_${authKey}`, 'pending_registration', 'pago_aguardando_registro']);
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

function _extrairValorNumerico(precoStr) {
    if (!precoStr) return '0.00';
    const limpo = String(precoStr).replace(/[^\d,.]/g, '').replace(',', '.');
    return parseFloat(limpo).toFixed(2);
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

module.exports = { iniciarCompraProdutoPIX, iniciarCompraPlanoPIX, abrirFormularioCompra, processarFormularioCompra, processarAprovacao, processarReprovacao };
