# AlphaBot — Auth Próprio (sem KeyAuth)

Bot Discord com sistema de autenticação **100% gratuito**, hospedado no próprio Render.  
Substitui o KeyAuth completamente — sem mensalidade, sem limites de usuários.

---

## Como funciona

O bot e a API de auth rodam no **mesmo processo** no Render:

- Usuário clica "Criar Conta" no Discord
- Bot salva no banco SQLite local
- API REST embutida (/auth/*) fica exposta na mesma URL do bot
- C# chama /auth/init e /auth/login via MyAuth.cs (substitui KeyAuth.cs)

---

## Setup no Render

### Variáveis de ambiente

| Variável | Descrição |
|---|---|
| DISCORD_TOKEN | Token do seu bot |
| GUILD_ID | ID do servidor Discord |
| AUTH_BOT_SECRET | Senha secreta da API (coloque o mesmo no C#) |
| AUTH_SALT | Salt para hash de senhas (mude para algo único!) |
| AUTH_CHANNEL_ID | Canal onde pedidos pagos aparecem para o staff |
| PIX_KEY | Sua chave PIX |
| PIX_NAME | Seu nome no PIX |
| DB_PATH | /data/alphabot.db (use Disk no Render) |

### Disk no Render (IMPORTANTE para persistência)

1. Render → seu serviço → Disks
2. Adicione: Mount Path = /data, tamanho = 1 GB
3. Defina DB_PATH=/data/alphabot.db nas env vars

---

## Comandos Discord

- /auth-setup — Envia o embed de criação de conta
- /auth-usuarios — Lista todos os usuários cadastrados

---

## Integração C# com MyAuth.cs

### Configuração (substitui o bloco KeyAuth)

```csharp
using MyAuth;

public static api MyAuthApp = new api(
    name:    "Borgesnatan09's Application",
    baseUrl: "https://SEU-BOT.onrender.com",
    secret:  "alpha_xit_bot_2024",
    version: "1.0"
);
```

### Form1() construtor

```csharp
MyAuthApp.init();
if (!MyAuthApp.response.success)
    statusLogin.Text = "Erro de conexão: " + MyAuthApp.response.message;
else
    statusLogin.Text = "Conectado ao servidor. Faça login para continuar.";
```

### Form1_Load

```csharp
MyAuthApp.init();
if (!MyAuthApp.response.success) {
    MessageBox.Show(MyAuthApp.response.message);
    Application.Exit();
}
```

### RealizarLogin

```csharp
MyAuthApp.login(Username.Text.Trim(), Pass.Text.Trim());
if (MyAuthApp.response.success) {
    l1.Visible = false;
    p1.BringToFront();
    status.Text = "Bem-vindo " + MyAuthApp.user_data.username + "!";
    MyAuthApp.log($"Usuário {MyAuthApp.user_data.username} acessou o painel");
} else {
    statusLogin.Text = MyAuthApp.response.message;
}
```

---

## Endpoints da API

| Método | Endpoint | Descrição |
|---|---|---|
| GET | /auth/health | Status da API |
| POST | /auth/init | Inicializa sessão |
| POST | /auth/login | Autentica usuário |
| POST | /auth/register | Cria usuário (interno, bot only) |
| POST | /auth/log | Registra log |
| GET | /auth/check/:user | Verifica se usuário existe |
| GET | /auth/users | Lista todos os usuários |
