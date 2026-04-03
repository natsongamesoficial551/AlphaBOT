const RSSParser = require('rss-parser');
const parser = new RSSParser();
const db = require('../database');
const { embedNovoVideo } = require('../embeds');

function ytUrlToRSS(url) {
  // Formato: /channel/UCxxxxxx  (mais confiável)
  const channelMatch = url.match(/channel\/(UC[\w-]+)/);
  if (channelMatch) {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelMatch[1]}`;
  }

  // Formato: /user/nome
  const userMatch = url.match(/\/user\/([\w-]+)/);
  if (userMatch) {
    return `https://www.youtube.com/feeds/videos.xml?user=${userMatch[1]}`;
  }

  // Formato: @handle — usa channel_id via variável de ambiente YOUTUBE_CHANNEL_ID
  // Se YOUTUBE_CHANNEL_ID estiver definido, usa ele diretamente (mais confiável)
  const handleMatch = url.match(/@([\w-]+)/);
  if (handleMatch) {
    const channelId = process.env.YOUTUBE_CHANNEL_ID;
    if (channelId) {
      return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    }
    // Fallback: tenta como user (pode não funcionar para handles novos)
    console.warn('[YT] ⚠️  Handle @' + handleMatch[1] + ' detectado mas YOUTUBE_CHANNEL_ID não definido. Defina YOUTUBE_CHANNEL_ID=UCxxxxxxxx no Render para garantir funcionamento.');
    return `https://www.youtube.com/feeds/videos.xml?user=${handleMatch[1]}`;
  }

  return null;
}

async function checkYouTube(client, primeiroCheck = false) {
  const guildId = process.env.GUILD_ID;
  if (!guildId) return;

  // ✅ CORRIGIDO: getYTConfig é async — precisa de await
  const config  = await db.getYTConfig(guildId);
  const ytUrl   = config?.yt_url || process.env.YOUTUBE_CHANNEL_URL;
  const canalId = config?.canal_id;

  if (!ytUrl) return;

  const rssUrl = ytUrlToRSS(ytUrl);
  if (!rssUrl) {
    console.warn('[YT] URL inválida:', ytUrl);
    return;
  }

  let feed;
  try {
    feed = await parser.parseURL(rssUrl);
  } catch (err) {
    if (err.message.includes('404')) {
      console.warn('[YT] ⚠️  RSS 404 — use o ID do canal: youtube.com/channel/UCxxxxxxxx ou defina YOUTUBE_CHANNEL_ID no Render');
    } else {
      console.error('[YT] Erro ao buscar RSS:', err.message);
    }
    return;
  }

  if (!feed.items?.length) return;

  const latestVideo = feed.items[0];
  const videoId     = latestVideo.id || latestVideo.guid || latestVideo.link;
  const ultimoId    = config?.ultimo_video_id;

  // Primeiro check do boot — só salva o ID, não posta
  if (primeiroCheck || !ultimoId) {
    if (videoId !== ultimoId) {
      // ✅ CORRIGIDO: updateUltimoVideo é async — precisa de await
      await db.updateUltimoVideo(guildId, videoId);
      console.log(`[YT] Boot — vídeo mais recente salvo: ${latestVideo.title}`);
    } else {
      console.log('[YT] Boot — nenhum vídeo novo.');
    }
    return;
  }

  // Checks subsequentes — só posta se for vídeo diferente
  if (videoId === ultimoId) {
    console.log('[YT] Sem vídeo novo.');
    return;
  }

  // ✅ CORRIGIDO: updateUltimoVideo é async — precisa de await
  await db.updateUltimoVideo(guildId, videoId);

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const canal = canalId
    ? guild.channels.cache.get(canalId)
    : guild.channels.cache.find(c => c.name === '▶️・novos-videos');

  if (!canal) return;

  const videoIdClean = videoId.includes('watch?v=')
    ? videoId.split('watch?v=')[1]
    : videoId.split(':').pop();

  const video = {
    title   : latestVideo.title,
    link    : latestVideo.link,
    pubDate : latestVideo.pubDate
      ? new Date(latestVideo.pubDate).toLocaleDateString('pt-BR')
      : 'Agora',
    thumbnail: `https://img.youtube.com/vi/${videoIdClean}/maxresdefault.jpg`,
  };

  const cargoMembro = guild.roles.cache.find(r => r.name === '✅ ᴍᴇᴍʙʀᴏ');
  const mencao = cargoMembro ? `<@&${cargoMembro.id}>` : '';

  try {
    await canal.send({
      content: `${mencao} 🎬 Novo vídeo publicado!`.trim(),
      embeds: [embedNovoVideo(video)],
    });
    console.log(`[YT] ✅ Novo vídeo postado: ${video.title}`);
  } catch (err) {
    console.error('[YT] Erro ao postar:', err.message);
  }
}

function startYouTubePoller(client) {
  const intervalMin = parseInt(process.env.YOUTUBE_CHECK_INTERVAL) || 10;
  console.log(`[YT] Poller iniciado — checando a cada ${intervalMin} min`);

  // Primeiro check: só salva o ID mais recente, NÃO posta
  setTimeout(() => checkYouTube(client, true), 10_000);

  // Checks subsequentes: posta se houver vídeo novo
  setInterval(() => checkYouTube(client, false), intervalMin * 60 * 1000);
}

module.exports = { startYouTubePoller };
