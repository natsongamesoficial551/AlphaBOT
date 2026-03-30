/*
 * MyAuth.cs — Substituto do KeyAuth para Alpha Xit
 * 
 * Uso idêntico ao KeyAuth original. Apenas troque:
 *   using KeyAuth;  →  using MyAuth;
 *   new api(name, ownerid, secret, version)
 *     →  new api(name, baseUrl, secret, version)
 *
 * ─── Configuração no Form1.cs (substitua o bloco KeyAuth) ────────────────────
 * 
 *   public static api MyAuthApp = new api(
 *       name:    "Borgesnatan09's Application",
 *       baseUrl: "https://SEU-BOT.onrender.com",   // URL do seu bot no Render
 *       secret:  "alpha_xit_bot_2024",              // AUTH_BOT_SECRET do .env
 *       version: "1.0"
 *   );
 *
 * ─── No Form1() (construtor): ─────────────────────────────────────────────────
 *
 *   MyAuthApp.init();
 *   if (!MyAuthApp.response.success)
 *       statusLogin.Text = "Erro de conexão: " + MyAuthApp.response.message;
 *   else
 *       statusLogin.Text = "Conectado ao servidor. Faça login para continuar.";
 *
 * ─── No Form1_Load: ──────────────────────────────────────────────────────────
 *
 *   MyAuthApp.init();
 *   if (!MyAuthApp.response.success) {
 *       MessageBox.Show(MyAuthApp.response.message);
 *       Application.Exit();
 *   }
 *
 * ─── No RealizarLogin(): ─────────────────────────────────────────────────────
 *
 *   MyAuthApp.login(Username.Text.Trim(), Pass.Text.Trim());
 *   if (MyAuthApp.response.success) {
 *       status.Text = "Bem-vindo " + MyAuthApp.user_data.username + "!";
 *       MyAuthApp.log($"Usuário {MyAuthApp.user_data.username} acessou o painel");
 *   }
 */

using System;
using System.Collections.Generic;
using System.Net;
using System.Text;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MyAuth
{
    public class api
    {
        // ── Configuração ─────────────────────────────────────────────────────
        private readonly string name;
        private readonly string baseUrl;    // ex: "https://seu-bot.onrender.com"
        private readonly string secret;     // AUTH_BOT_SECRET do .env do bot
        private readonly string version;

        private bool initialized = false;

        /// <summary>
        /// Cria uma instância da API de autenticação própria.
        /// Uso idêntico ao KeyAuth original — basta trocar ownerid/secret por baseUrl/secret.
        /// </summary>
        /// <param name="name">Nome da aplicação</param>
        /// <param name="baseUrl">URL base do bot no Render (ex: https://meubot.onrender.com)</param>
        /// <param name="secret">AUTH_BOT_SECRET configurado no .env do bot</param>
        /// <param name="version">Versão da aplicação</param>
        public api(string name, string baseUrl, string secret, string version)
        {
            this.name    = name;
            this.baseUrl = baseUrl.TrimEnd('/');
            this.secret  = secret;
            this.version = version;
        }

        // ── Estruturas públicas (idênticas ao KeyAuth) ────────────────────────
        public response_class  response  = new response_class();
        public user_data_class user_data = new user_data_class();

        public class response_class
        {
            public bool   success { get; set; }
            public string message { get; set; }
        }

        public class user_data_class
        {
            public string       username      { get; set; }
            public string       ip            { get; set; }
            public string       hwid          { get; set; }
            public string       createdate    { get; set; }
            public string       lastlogin     { get; set; }
            public List<Data>   subscriptions { get; set; }
        }

        public class Data
        {
            public string subscription { get; set; }
            public string expiry       { get; set; }
            public string timeleft     { get; set; }
        }

        // ── Métodos públicos (mesmos nomes do KeyAuth) ────────────────────────

        /// <summary>
        /// Inicializa conexão com o servidor de auth.
        /// Chame antes de qualquer outra função — idêntico ao KeyAuthApp.init()
        /// </summary>
        public void init()
        {
            try
            {
                var payload = new { version = this.version };
                var json    = Post("/auth/init", payload);
                var obj     = JObject.Parse(json);

                response.success = obj["success"]?.Value<bool>() ?? false;
                response.message = obj["message"]?.Value<string>() ?? "Erro desconhecido";

                if (response.success)
                    initialized = true;
            }
            catch (Exception ex)
            {
                response.success = false;
                response.message = "Falha de conexão: " + ex.Message;
            }
        }

        /// <summary>
        /// Autentica o usuário.
        /// Idêntico ao KeyAuthApp.login(username, password)
        /// </summary>
        public void login(string username, string password)
        {
            CheckInit();
            try
            {
                var payload = new { username, password };
                var json    = Post("/auth/login", payload);
                var obj     = JObject.Parse(json);

                response.success = obj["success"]?.Value<bool>() ?? false;
                response.message = obj["message"]?.Value<string>() ?? "Erro desconhecido";

                if (response.success)
                {
                    var info = obj["info"];
                    if (info != null)
                    {
                        user_data.username   = info["username"]?.Value<string>();
                        user_data.ip         = info["ip"]?.Value<string>();
                        user_data.hwid       = info["hwid"]?.Value<string>();
                        user_data.createdate = info["createdate"]?.Value<string>();
                        user_data.lastlogin  = info["lastlogin"]?.Value<string>();

                        var subs = info["subscriptions"] as JArray;
                        user_data.subscriptions = new List<Data>();
                        if (subs != null)
                        {
                            foreach (var s in subs)
                            {
                                user_data.subscriptions.Add(new Data
                                {
                                    subscription = s["subscription"]?.Value<string>(),
                                    expiry       = s["expiry"]?.Value<string>(),
                                    timeleft     = s["timeleft"]?.Value<string>(),
                                });
                            }
                        }
                    }
                }
            }
            catch (WebException wex)
            {
                HandleWebException(wex);
            }
            catch (Exception ex)
            {
                response.success = false;
                response.message = "Erro: " + ex.Message;
            }
        }

        /// <summary>
        /// Registra uma mensagem de log no servidor.
        /// Idêntico ao KeyAuthApp.log(msg)
        /// </summary>
        public void log(string message)
        {
            if (!initialized || user_data?.username == null) return;
            try
            {
                var payload = new { username = user_data.username, message };
                Post("/auth/log", payload);
            }
            catch { /* log falhou silenciosamente */ }
        }

        // ── Helpers internos ─────────────────────────────────────────────────

        private void CheckInit()
        {
            if (!initialized)
                throw new InvalidOperationException("Chame MyAuthApp.init() antes de qualquer outra função.");
        }

        private string Post(string endpoint, object payload)
        {
            var url     = baseUrl + endpoint;
            var reqBody = Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(payload));

            var request = (HttpWebRequest)WebRequest.Create(url);
            request.Method      = "POST";
            request.ContentType = "application/json";
            request.ContentLength = reqBody.Length;
            request.Timeout     = 15000;

            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls11;

            using (var stream = request.GetRequestStream())
                stream.Write(reqBody, 0, reqBody.Length);

            using (var resp = (HttpWebResponse)request.GetResponse())
            using (var reader = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                return reader.ReadToEnd();
        }

        private void HandleWebException(WebException wex)
        {
            if (wex.Response is HttpWebResponse errResp)
            {
                using (var reader = new StreamReader(errResp.GetResponseStream(), Encoding.UTF8))
                {
                    var json = reader.ReadToEnd();
                    try
                    {
                        var obj = JObject.Parse(json);
                        response.success = false;
                        response.message = obj["message"]?.Value<string>() ?? "Erro no servidor.";
                    }
                    catch
                    {
                        response.success = false;
                        response.message = "Erro HTTP " + (int)errResp.StatusCode;
                    }
                }
            }
            else
            {
                response.success = false;
                response.message = "Sem conexão com o servidor. Verifique sua internet.";
            }
        }
    }
}
