const { REST, Routes } = require('discord.js');
const { commands } = require('./modules/commands');

async function registerCommands() {
  const token   = process.env.DISCORD_TOKEN;
  const guildId = process.env.GUILD_ID;

  if (!token || !guildId) {
    console.error('[CMDS] DISCORD_TOKEN ou GUILD_ID não configurados.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    console.log('[CMDS] Registrando slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(
        (await rest.get(Routes.oauth2CurrentApplication())).id,
        guildId
      ),
      { body: commands.map(c => c.toJSON()) }
    );
    console.log(`[CMDS] ✅ ${commands.length} comandos registrados!`);
  } catch (err) {
    console.error('[CMDS] Erro ao registrar comandos:', err.message);
  }
}

module.exports = { registerCommands };
