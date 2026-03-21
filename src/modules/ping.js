const axios = require('axios');

function startAutoPing() {
  const url = process.env.AUTO_PING;
  if (!url) {
    console.log('[PING] AUTO_PING não configurado — ignorando.');
    return;
  }

  console.log(`[PING] Auto-ping ativo → ${url} (a cada 6 min)`);

  setInterval(async () => {
    try {
      await axios.get(url, { timeout: 10000 });
      console.log(`[PING] ✅ ${new Date().toLocaleTimeString('pt-BR')}`);
    } catch (err) {
      console.warn(`[PING] ⚠️ Falhou: ${err.message}`);
    }
  }, 6 * 60 * 1000);
}

module.exports = { startAutoPing };
