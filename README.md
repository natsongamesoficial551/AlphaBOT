# 🤖 AlphaBot — Bot do Servidor Alpha Xit

Bot completo para o servidor Alpha Xit. Gerencia registro, produtos, pedidos PIX, YouTube e moderação — tudo via **embeds com botões**.

---

## 🚀 Instalação local

```bash
npm install
cp .env.example .env
# Edite o .env com seu token e configurações
node index.js
```

---

## ⚙️ Variáveis de Ambiente (.env)

| Variável | Obrigatório | Descrição |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Token do bot (Discord Developer Portal) |
| `GUILD_ID` | ✅ | ID do seu servidor |
| `PIX_KEY` | ✅ | Sua chave PIX |
| `PIX_NAME` | ✅ | Nome do favorecido PIX |
| `YOUTUBE_CHANNEL_URL` | ⚡ | URL do canal YouTube |
| `YOUTUBE_CHECK_INTERVAL` | ⚡ | Minutos entre checagens (padrão: 10) |
| `DB_PATH` | ⚡ | Caminho do SQLite (padrão: `./data/alphabot.db`) |

---

## ☁️ Deploy no Render.com

1. Crie um novo **Web Service** no Render
2. Conecte seu repositório GitHub
3. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
4. Em **Environment Variables**, adicione todas as variáveis do `.env`
5. Em **Disks**, crie um disco:
   - **Mount Path:** `/data`
   - Isso garante que o SQLite persiste entre deploys
6. Configure `DB_PATH=/data/alphabot.db` nas variáveis

---

## 📌 Slash Commands (apenas admins)

| Comando | Descrição |
|---|---|
| `/produto-add` | Adiciona produto à loja com imagem e link |
| `/produto-listar` | Lista todos os produtos ativos |
| `/produto-deletar` | Remove um produto pelo ID |
| `/pedidos` | Lista pedidos aguardando confirmação com botões |
| `/confirmar` | Confirma pagamento e entrega produto na DM |
| `/anuncio` | Envia embed de anúncio em qualquer canal |
| `/youtube-set` | Configura canal YouTube para auto-post |
| `/cargo add/remove` | Gerencia cargos de membros |
| `/moderar ban/kick/mute` | Ações de moderação |

---

## 🔘 Botões automáticos

| Botão | Canal | O que faz |
|---|---|---|
| ✅ Registrar agora | #registro | Dá cargo @Membro, envia DM, loga no DB |
| 💳 Comprar agora | Canais de produto | Envia PIX na DM do comprador |
| ℹ️ Mais detalhes | Canais de produto | Mostra detalhes do produto (ephemeral) |
| 🛒 Ver produtos | #como-comprar | Lista produtos disponíveis |
| ✅ Confirmar #X | Admin via /pedidos | Confirma pagamento e entrega |
| ❌ Cancelar #X | Admin via /pedidos | Cancela pedido |

---

## 🗄️ Banco de Dados (SQLite)

O bot usa SQLite com as tabelas:

- `mensagens_fixas` — guarda `message_id` dos embeds fixos (evita reenvio)
- `membros` — registro de quem se registrou
- `produtos` — catálogo da loja
- `pedidos` — pedidos de compra e status
- `yt_config` — configuração e último vídeo do YouTube
- `logs` — histórico de ações

---

## 📁 Estrutura

```
alphabot/
├── index.js                    # Entrada principal
├── src/
│   ├── database.js             # SQLite + todas as queries
│   ├── embeds.js               # Todos os embeds centralizados
│   ├── seeder.js               # Envia embeds fixos nos canais
│   ├── registerCommands.js     # Registra slash commands
│   └── modules/
│       ├── buttons.js          # Handler de botões
│       ├── commands.js         # Handler de slash commands
│       └── youtube.js          # RSS poller YouTube
├── data/                       # Criado automaticamente (SQLite)
├── .env                        # Suas variáveis (não versionar!)
├── .env.example                # Modelo
└── package.json
```

---

## 🔑 Permissões necessárias no bot

Ao adicionar o bot, ele precisa de:
- Administrator (recomendado para setup completo)

Ou permissões individuais:
- Manage Roles, Manage Channels, Send Messages, Embed Links, Read Message History, Ban Members, Kick Members, Moderate Members
