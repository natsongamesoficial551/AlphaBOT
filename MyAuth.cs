/*
 * MyAuth.cs — Sistema Auth Key Alpha Xit
 *
 * FLUXO:
 *   1. Pessoa cria conta no Discord (bot)
 *   2. Staff aprova → Auth Key enviada na DM (formato XXXXXX-XXXXXX-XXXXXX)
 *   3. Pessoa abre o software, digita Usuário + Senha + Auth Key
 *   4. 24h de uso ativo (conta só quando o painel está aberto)
 *   5. Após esgotar as 24h → cooldown de 30 dias, depois renova
 *
 * DEPENDÊNCIA: Adicione referência System.Management no projeto
 *   Projeto → Adicionar Referência → System.Management
 *
 * ─── CONFIGURAÇÃO ────────────────────────────────────────────────────────────
 *
 *   using MyAuth;
 *
 *   public static api MyAuthApp = new api(
 *       name:    "Borgesnatan09's Application",
 *       baseUrl: "https://alphabot-ywqw.onrender.com",
 *       secret:  "alpha_xit_bot_2024",
 *       version: "1.0"
 *   );
 *
 * ─── Form1() construtor ───────────────────────────────────────────────────────
 *
 *   public Form1()
 *   {
 *       InitializeComponent();
 *       l1.BringToFront();
 *       l1.Visible = true;
 *
 *       MyAuthApp.init();
 *       if (!MyAuthApp.response.success)
 *           statusLogin.Text = "Erro de conexão: " + MyAuthApp.response.message;
 *       else
 *           statusLogin.Text = "Conectado. Insira suas credenciais e Auth Key.";
 *   }
 *
 * ─── Form1_Load ───────────────────────────────────────────────────────────────
 *
 *   private void Form1_Load(object sender, EventArgs e)
 *   {
 *       MyAuthApp.init();
 *       if (!MyAuthApp.response.success) {
 *           MessageBox.Show(MyAuthApp.response.message);
 *           Application.Exit();
 *       }
 *   }
 *
 * ─── RealizarLogin() ──────────────────────────────────────────────────────────
 *   // Adicione um campo TextBox chamado AuthKey no seu Form
 *
 *   private void RealizarLogin()
 *   {
 *       if (string.IsNullOrWhiteSpace(Username.Text) ||
 *           string.IsNullOrWhiteSpace(Pass.Text) ||
 *           string.IsNullOrWhiteSpace(AuthKey.Text))
 *       {
 *           statusLogin.Text = "Preencha usuário, senha e Auth Key!";
 *           return;
 *       }
 *       statusLogin.Text = "Autenticando...";
 *
 *       MyAuthApp.activate(Username.Text.Trim(), Pass.Text.Trim(), AuthKey.Text.Trim());
 *       if (MyAuthApp.response.success)
 *       {
 *           statusLogin.Text = "Auth Key ativada!";
 *           l1.Visible = false;
 *           l1.SendToBack();
 *           p1.BringToFront();
 *           status.Text = "Bem-vindo " + MyAuthApp.user_data.username +
 *                         "! Tempo restante: " + MyAuthApp.user_data.tempo_restante;
 *           MyAuthApp.StartHeartbeat();  // ← inicia contagem de uso ativo
 *           MyAuthApp.log("Usuário " + MyAuthApp.user_data.username + " ativou o painel");
 *       }
 *       else
 *       {
 *           statusLogin.Text = MyAuthApp.response.message;
 *       }
 *   }
 *
 * ─── Quando o Form principal fechar ──────────────────────────────────────────
 *
 *   protected override void OnFormClosing(FormClosingEventArgs e)
 *   {
 *       MyAuthApp.StopHeartbeat();
 *       base.OnFormClosing(e);
 *   }
 */

using System;
using System.Collections.Generic;
using System.Management;
using System.Net;
using System.Net.NetworkInformation;
using System.Text;
using System.IO;
using System.Security.Cryptography;
using System.Threading;
using System.Windows.Forms;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MyAuth
{
    public class api
    {
        private readonly string name;
        private readonly string baseUrl;
        private readonly string secret;
        private readonly string version;

        private bool   initialized = false;
        private string _hwid       = null;
        private string _authKey    = null;
        private Timer  _heartbeatTimer = null;

        public api(string name, string baseUrl, string secret, string version)
        {
            this.name    = name;
            this.baseUrl = baseUrl.TrimEnd('/');
            this.secret  = secret;
            this.version = version;
        }

        // ── Estruturas públicas ───────────────────────────────────────────────
        public response_class  response  = new response_class();
        public user_data_class user_data = new user_data_class();

        public class response_class
        {
            public bool   success { get; set; }
            public string message { get; set; }
        }

        public class user_data_class
        {
            public string       username       { get; set; }
            public string       nome_completo  { get; set; }
            public string       auth_key       { get; set; }
            public string       hwid           { get; set; }
            public string       createdate     { get; set; }
            public string       tempo_restante { get; set; }
            public List<Data>   subscriptions  { get; set; }
        }

        public class Data
        {
            public string subscription { get; set; }
            public string expiry       { get; set; }
            public string timeleft     { get; set; }
        }

        // ── init() ────────────────────────────────────────────────────────────
        public void init()
        {
            try
            {
                _hwid = GetHWID();
                var json = Post("/auth/init", new { version = this.version, hwid = _hwid });
                var obj  = JObject.Parse(json);

                response.success = obj["success"]?.Value<bool>() ?? false;
                response.message = obj["message"]?.Value<string>() ?? "Erro desconhecido";

                if (response.success) initialized = true;
            }
            catch (Exception ex)
            {
                response.success = false;
                response.message = "Falha de conexão: " + ex.Message;
            }
        }

        // ── activate() — envia user + senha + auth_key ────────────────────────
        public void activate(string username, string password, string authKey)
        {
            CheckInit();
            try
            {
                _authKey = authKey.Trim().ToUpper();

                var payload = new { username, password, auth_key = _authKey, hwid = _hwid ?? GetHWID() };
                var json    = Post("/auth/activate", payload);
                var obj     = JObject.Parse(json);

                response.success = obj["success"]?.Value<bool>() ?? false;
                response.message = obj["message"]?.Value<string>() ?? "Erro desconhecido";

                if (response.success)
                {
                    var info = obj["info"];
                    if (info != null)
                    {
                        user_data.username      = info["username"]?.Value<string>();
                        user_data.nome_completo = info["nome_completo"]?.Value<string>();
                        user_data.auth_key      = info["auth_key"]?.Value<string>();
                        user_data.hwid          = info["hwid"]?.Value<string>();
                        user_data.createdate    = info["createdate"]?.Value<string>();
                        user_data.tempo_restante = info["tempo_restante"]?.Value<string>();

                        var subs = info["subscriptions"] as JArray;
                        user_data.subscriptions = new List<Data>();
                        if (subs != null)
                            foreach (var s in subs)
                                user_data.subscriptions.Add(new Data {
                                    subscription = s["subscription"]?.Value<string>(),
                                    expiry       = s["expiry"]?.Value<string>(),
                                    timeleft     = s["timeleft"]?.Value<string>(),
                                });
                    }
                }
            }
            catch (WebException wex) { HandleWebException(wex); }
            catch (Exception ex) { response.success = false; response.message = ex.Message; }
        }

        // ── StartHeartbeat() — chame após login bem-sucedido ─────────────────
        // Envia heartbeat a cada 60s para contar o tempo de uso ativo
        public void StartHeartbeat()
        {
            if (_authKey == null || _heartbeatTimer != null) return;

            _heartbeatTimer = new Timer(state =>
            {
                try
                {
                    var json = Post("/auth/heartbeat", new { auth_key = _authKey });
                    var obj  = JObject.Parse(json);

                    bool ok = obj["success"]?.Value<bool>() ?? false;

                    if (!ok)
                    {
                        string msg = obj["message"]?.Value<string>() ?? "";
                        bool esgotado = obj["esgotado"]?.Value<bool>() ?? false;

                        StopHeartbeat();

                        // Fecha o software na thread da UI
                        Application.Invoke(() => {
                            MessageBox.Show(
                                esgotado
                                    ? "Suas 24 horas foram utilizadas!\n\nCooldown de 30 dias iniciado.\nO software será encerrado."
                                    : msg,
                                "Alpha Xit — Sessão encerrada",
                                MessageBoxButtons.OK,
                                MessageBoxIcon.Warning
                            );
                            Application.Exit();
                        });
                    }
                }
                catch { /* falha silenciosa no heartbeat */ }
            }, null, TimeSpan.FromSeconds(60), TimeSpan.FromSeconds(60));
        }

        // ── StopHeartbeat() — chame quando o Form fechar ─────────────────────
        public void StopHeartbeat()
        {
            _heartbeatTimer?.Dispose();
            _heartbeatTimer = null;
        }

        // ── log() ─────────────────────────────────────────────────────────────
        public void log(string message)
        {
            if (!initialized || user_data?.username == null) return;
            try { Post("/auth/log", new { username = user_data.username, message }); } catch { }
        }

        // ── HWID: CPU ID + MAC Address → SHA256 ───────────────────────────────
        public static string GetHWID()
        {
            try
            {
                string raw = $"ALPHAXITHWID|{GetCpuId()}|{GetMacAddress()}";
                using (var sha = SHA256.Create())
                {
                    var b = sha.ComputeHash(Encoding.UTF8.GetBytes(raw));
                    var sb = new StringBuilder();
                    foreach (var x in b) sb.AppendFormat("{0:x2}", x);
                    return sb.ToString();
                }
            }
            catch
            {
                string raw = $"ALPHAXITHWID_FB|{Environment.MachineName}|{Environment.UserName}";
                using (var sha = SHA256.Create())
                {
                    var b = sha.ComputeHash(Encoding.UTF8.GetBytes(raw));
                    var sb = new StringBuilder();
                    foreach (var x in b) sb.AppendFormat("{0:x2}", x);
                    return sb.ToString();
                }
            }
        }

        private static string GetCpuId()
        {
            try
            {
                using (var s = new ManagementObjectSearcher("SELECT ProcessorId FROM Win32_Processor"))
                    foreach (ManagementObject o in s.Get())
                    { var id = o["ProcessorId"]?.ToString(); if (!string.IsNullOrWhiteSpace(id)) return id.Trim(); }
            }
            catch { }
            return "NOCPU";
        }

        private static string GetMacAddress()
        {
            try
            {
                foreach (var n in NetworkInterface.GetAllNetworkInterfaces())
                    if (n.NetworkInterfaceType == NetworkInterfaceType.Ethernet ||
                        n.NetworkInterfaceType == NetworkInterfaceType.Wireless80211)
                    {
                        var m = n.GetPhysicalAddress().ToString();
                        if (!string.IsNullOrWhiteSpace(m) && m != "000000000000") return m;
                    }
            }
            catch { }
            return "NOMAC";
        }

        // ── Helpers ───────────────────────────────────────────────────────────
        private void CheckInit()
        {
            if (!initialized)
                throw new InvalidOperationException("Chame MyAuthApp.init() antes de activate().");
        }

        private string Post(string endpoint, object payload)
        {
            var url  = baseUrl + endpoint;
            var body = Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(payload));

            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls11;
            var req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = "POST"; req.ContentType = "application/json";
            req.ContentLength = body.Length; req.Timeout = 15000;

            using (var s = req.GetRequestStream()) s.Write(body, 0, body.Length);
            using (var r = (HttpWebResponse)req.GetResponse())
            using (var rd = new StreamReader(r.GetResponseStream(), Encoding.UTF8))
                return rd.ReadToEnd();
        }

        private void HandleWebException(WebException wex)
        {
            if (wex.Response is HttpWebResponse err)
                using (var rd = new StreamReader(err.GetResponseStream(), Encoding.UTF8))
                {
                    try { var o = JObject.Parse(rd.ReadToEnd()); response.success = false; response.message = o["message"]?.Value<string>() ?? "Erro."; }
                    catch { response.success = false; response.message = "Erro HTTP " + (int)err.StatusCode; }
                }
            else { response.success = false; response.message = "Sem conexão. Verifique sua internet."; }
        }
    }

    // Helper para invocar na thread UI do WinForms
    internal static class Application
    {
        public static void Invoke(Action a) { System.Windows.Forms.Application.OpenForms[0]?.Invoke(a); }
        public static void Exit() { System.Windows.Forms.Application.Exit(); }
    }
}
