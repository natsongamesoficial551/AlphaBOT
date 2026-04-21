require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
const http = require('http');

console.log('=== ALPHABOT ULTRA-SECURE (INDependente) ===');
console.log('[ENV] TOKEN:', process.env.DISCORD_TOKEN ? `✅` : '❌ VAZIO');
console.log('[ENV] GUILD:', process.env.GUILD_ID || '❌ VAZIO');
console.log('[ENV] OWNER_ID:', process.env.OWNER_ID || '❌ VAZIO');

// ── HTTP — Render precisa de porta aberta (Health Check) ──────────────────────
const PORT = process.env.PORT || 3000;
http.createServer(async (req, res) => {
  // Auth API do Software
  if (req.url.startsWith('/auth')) {
    const { handleAuthRequest } = require('./src/authApi');
    return handleAuthRequest(req, res);
  }

  // Health check mínimo
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  res.writeHead(404);
  res.end();
}).listen(PORT, () => console.log(`[HTTP] Porta ${PORT} | Auth API em /auth`));

// ── Discord Bot ──────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

client.once('ready', async () => {
  console.log(`[READY] Bot: ${client.user.tag}`);
  global._discordClient = client;

  const { getDB }              = require('./src/database');
  const { seedTodosCanais }    = require('./src/seeder');
  const { registerCommands }   = require('./src/registerCommands');
  const { startYouTubePoller } = require('./src/modules/youtube');
  const { startAutoPing }      = require('./src/modules/ping');
  const { startExpiryPoller }  = require('./src/modules/expiry');

  await getDB();
  console.log('[DB] Pronto');

  await registerCommands();
  console.log('[CMD] Registrados');

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (guild) {
    await seedTodosCanais(guild);
    console.log('[SEED] Concluído');

    // Sistema de Registro Automático
    try {
        const { embedRegistro, rowRegistro } = require('./src/modules/registration');
        const db = require('./src/database');
        
        // Procura por nome exato ou que contenha "registro"
        const canalRegistro = guild.channels.cache.find(c => c.name === '🪪・registro' || c.name.includes('registro'));
        
        if (canalRegistro) {
            const fixa = await db.getMsgFixa(guild.id, 'registro');
            let enviarNova = false;

            if (fixa) {
                // Tenta buscar a mensagem para ver se ela ainda existe
                try {
                    const msgExistente = await canalRegistro.messages.fetch(fixa.message_id);
                    if (!msgExistente) enviarNova = true;
                } catch (e) {
                    enviarNova = true; // Mensagem foi deletada manualmente
                }
            } else {
                enviarNova = true;
            }

            if (enviarNova) {
                const msg = await canalRegistro.send({ embeds: [embedRegistro()], components: [rowRegistro()] });
                await db.saveMsgFixa(guild.id, canalRegistro.id, 'registro', msg.id);
                console.log(`[REGISTRO] ✅ Mensagem de registro enviada/atualizada em ${guild.name}`);
            }
        } else {
            console.warn(`[REGISTRO] ⚠️ Canal de registro não encontrado em ${guild.name}`);
        }
    } catch (err) { console.error('[AUTO-REGISTRO ERROR]', err.message); }
  }

  startYouTubePoller(client);
  startAutoPing();
  startExpiryPoller(client);
  console.log('[BOT] 🚀 100% pronto!');
});

// ── Handler de Mensagens (Comprovante Pix) ───────────────────────────────────
client.on('messageCreate', async (message) => {
    // Apenas mensagens na DM que contenham anexo (imagem do comprovante)
    if (!message.guild && !message.author.bot && message.attachments.size > 0) {
        const ownerId = process.env.OWNER_ID;
        if (!ownerId) return;

        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const db = require('./src/database');

        try {
            // Tenta encontrar o pedido mais recente desse usuário que está aguardando
            const pedidos = await db.queryAsync(
                `SELECT * FROM pedidos WHERE comprador_id = ? AND status = 'aguardando' ORDER BY criado_em DESC LIMIT 1`,
                [message.author.id]
            );
            const pedido = pedidos[0];

            const owner = await client.users.fetch(ownerId);
            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle('🧾 Novo Comprovante Recebido!')
                .setDescription(`O usuário <@${message.author.id}> (\`${message.author.tag}\`) enviou um comprovante na DM do bot.`)
                .setImage(message.attachments.first().url)
                .setFooter({ text: 'Verifique o valor e o TXID no seu banco antes de aprovar.' })
                .setTimestamp();

            if (pedido) {
                embed.addFields(
                    { name: '📦 Produto', value: pedido.produto_nome || 'Desconhecido', inline: true },
                    { name: '🆔 Pedido', value: `#${pedido.id}`, inline: true }
                );

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`btn_pix_aprovar_${pedido.id}`).setLabel('Aprovar e Entregar').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`btn_pix_reprovar_${pedido.id}`).setLabel('Reprovar').setStyle(ButtonStyle.Danger)
                );

                await owner.send({ embeds: [embed], components: [row] });
            } else {
                embed.addFields({ name: '⚠️ Atenção', value: 'Não encontrei um pedido pendente para este usuário no banco de dados.' });
                await owner.send({ embeds: [embed] });
            }

            await message.reply('✅ **Comprovante enviado para análise!** Aguarde a aprovação do dono para receber seu produto.');
        } catch (e) { console.error('[COMPROVANTE]', e.message); }
    }
});

client.on('interactionCreate', async (interaction) => {
  try {
    const { handleButton, handleModal, handleSelectMenu } = require('./src/modules/buttons');
    const { handleCommand }             = require('./src/modules/commands');
    if (interaction.isButton())               await handleButton(interaction);
    else if (interaction.isChatInputCommand()) await handleCommand(interaction);
    else if (interaction.isModalSubmit())      await handleModal(interaction);
    else if (interaction.isStringSelectMenu()) await handleSelectMenu(interaction);
  } catch (err) {
    console.error('[INTERACTION]', err.message);
    try {
      const payload = { embeds: [{ color: 0xE74C3C, description: `❌ Erro interno.` }], flags: 64 };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.reply(payload);
    } catch (_) {}
  }
});

client.on('guildMemberAdd', async (member) => {
    const { logAction } = require('./src/modules/security');
    const { embedBoasVindas } = require('./src/embeds');
    
    console.log(`[JOIN] ${member.user.tag} entrou no servidor.`);
    
    // Cargo Visitante
    const roleVisitante = member.guild.roles.cache.find(r => r.name === 'Visitante');
    if (roleVisitante) {
        await member.roles.add(roleVisitante).catch(e => console.error('[ROLE] Erro ao dar cargo visitante:', e.message));
    }

    // Boas-vindas
    const canalBoasVindas = member.guild.channels.cache.find(c => c.name === '👋・boas-vindas');
    if (canalBoasVindas) {
        await canalBoasVindas.send({ content: `Bem-vindo <@${member.id}>!`, embeds: [embedBoasVindas()] }).catch(e => console.error('[WELCOME] Erro ao enviar boas-vindas:', e.message));
    }

    await logAction(member.guild, 'ENTRADA', `Usuário <@${member.id}> (${member.user.tag}) entrou no servidor.`, member.user);
});

client.on('error', err => console.error('[CLIENT ERROR]', err.message));
process.on('unhandledRejection', err => console.error('[UNHANDLED]', err?.message || err));
process.on('uncaughtException',  err => console.error('[UNCAUGHT]',  err?.message || err));

const token = process.env.DISCORD_TOKEN;
if (token) {
    client.login(token).catch(err => console.error('[LOGIN]', err.message));
} else {
    console.error('❌ TOKEN VAZIO');
}
