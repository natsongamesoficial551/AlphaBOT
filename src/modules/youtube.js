const RSSParser = require('rss-parser');
const parser = new RSSParser();
const db = require('../database');
const { embedNovoVideo } = require('../embeds');

// Trava de memória para evitar que dois checks rodem ao mesmo tempo
let isChecking = false;

function ytUrlToRSS(url) {
  const channelMatch = url.match(/channel\/(UC[\w-]+)/);
  if (channelMatch) return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelMatch[1]}`;

  const userMatch = url.match(/\/user\/([\w-]+)/);
  if (userMatch) return `https://www.youtube.com/feeds/videos.xml?user=${userMatch[1]}`;

  const handleMatch = url.match(/@([\w-]+)/);
  if (handleMatch) {
    const channelId = process.env.YOUTUBE_CHANNEL_ID;
    if (channelId) return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    return `https://www.youtube.com/feeds/videos.xml?user=${handleMatch[1]}`;
  }
  return null;
}

async function checkYouTube(client) {
  if (isChecking) return; // Se já estiver checando, ignora este ciclo
  isChecking = true;

  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) return;

    // 1. Pega a config do banco (sempre a mais atualizada)
    const config = await db.getYTConfig(guildId);
    const ytUrl = config?.yt_url || process.env.YOUTUBE_CHANNEL_URL;
    const canalId = config?.canal_id;

    if (!ytUrl) return;

    const rssUrl = ytUrlToRSS(ytUrl);
    if (!rssUrl) return;

    // 2. Busca o feed
    const feed = await parser.parseURL(rssUrl);
    if (!feed.items?.length) return;

    const latestVideo = feed.items[0];
    const videoId = latestVideo.id || latestVideo.guid || latestVideo.link;
    
    // 3. VERIFICAÇÃO INFALÍVEL: Busca o ID salvo no banco novamente antes de postar
    // Isso garante que, se outro processo salvou o ID um segundo atrás, a gente não poste de novo.
    const configRecheck = await db.getYTConfig(guildId);
    const ultimoIdSalvo = configRecheck?.ultimo_video_id;

    if (videoId === ultimoIdSalvo) {
      console.log(`[YT] Vídeo já postado anteriormente: ${videoId}`);
      return;
    }

    // 4. SALVA NO BANCO ANTES DE TUDO
    // Usamos a nova função updateUltimoVideo que agora usa ON CONFLICT (garante o salvamento)
    console.log(`[YT] Novo vídeo detectado! Salvando ID ${videoId} no banco...`);
    await db.updateUltimoVideo(guildId, videoId);

    // 5. POSTA NO DISCORD
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const canal = canalId 
      ? guild.channels.cache.get(canalId) 
      : guild.channels.cache.find(c => c.name === '▶️・novos-videos');

    if (!canal) return;

    const videoIdClean = videoId.includes('watch?v=') ? videoId.split('watch?v=')[1] : videoId.split(':').pop();
    const video = {
      title: latestVideo.title,
      link: latestVideo.link,
      pubDate: latestVideo.pubDate ? new Date(latestVideo.pubDate).toLocaleDateString('pt-BR') : 'Agora',
      thumbnail: `https://img.youtube.com/vi/${videoIdClean}/maxresdefault.jpg`,
    };

    const cargoMembro = guild.roles.cache.find(r => r.name === '✅ ᴍᴇᴍʙʀᴏ');
    const mencao = cargoMembro ? `<@&${cargoMembro.id}>` : '';

    await canal.send({
      content: `${mencao} 🎬 Novo vídeo publicado!`.trim(),
      embeds: [embedNovoVideo(video)],
    });
    console.log(`[YT] ✅ Postagem concluída: ${video.title}`);

  } catch (err) {
    console.error('[YT] Erro no ciclo de checagem:', err.message);
  } finally {
    isChecking = false; // Libera para o próximo ciclo
  }
}

function startYouTubePoller(client) {
  const intervalMin = parseInt(process.env.YOUTUBE_CHECK_INTERVAL) || 10;
  console.log(`[YT] Poller iniciado — checando a cada ${intervalMin} min`);

  // Primeiro check: 20 segundos após o boot
  setTimeout(() => checkYouTube(client), 20000);

  // Checks subsequentes
  setInterval(() => checkYouTube(client), intervalMin * 60 * 1000);
}

module.exports = { startYouTubePoller };
