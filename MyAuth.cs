/*
 * MyAuth.cs — Sistema de autenticação Alpha Xit
 * 
 * O Form tem APENAS login (conta já foi criada no Discord).
 * HWID (CPU ID + MAC) é enviado no login para vincular o PC à conta.
 * A partir daí, só aquele PC consegue logar naquela conta.
 *
 * ─── DEPENDÊNCIA ─────────────────────────────────────────────────────────────
 *   Adicione referência: System.Management
 *   (Projeto → Adicionar Referência → System.Management)
 *
 * ─── CONFIGURAÇÃO no Form1.cs ────────────────────────────────────────────────
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
 * ─── No Form1() (construtor) — IDÊNTICO ao KeyAuth ───────────────────────────
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
 *           statusLogin.Text = "Conectado ao servidor. Faça login para continuar.";
 *   }
 *
 * ─── No Form1_Load — IDÊNTICO ao KeyAuth ─────────────────────────────────────
 *
 *   private void Form1_Load(object sender, EventArgs e)
 *   {
 *       MyAuthApp.init();
 *       if (!MyAuthApp.response.success)
 *       {
 *           MessageBox.Show(MyAuthApp.response.message);
 *           Application.Exit();
 *       }
 *   }
 *
 * ─── RealizarLogin() — IDÊNTICO ao KeyAuth ───────────────────────────────────
 *
 *   private void RealizarLogin()
 *   {
 *       if (string.IsNullOrWhiteSpace(Username.Text) || string.IsNullOrWhiteSpace(Pass.Text))
 *       {
 *           statusLogin.Text = "Preencha usuário e senha!";
 *           return;
 *       }
 *       statusLogin.Text = "Autenticando...";
 *
 *       MyAuthApp.login(Username.Text.Trim(), Pass.Text.Trim());
 *       if (MyAuthApp.response.success)
 *       {
 *           statusLogin.Text = "Login efetuado com sucesso!";
 *           l1.Visible = false;
 *           l1.SendToBack();
 *           p1.BringToFront();
 *           status.Text = "Bem-vindo " + MyAuthApp.user_data.username + "! Painel pronto para uso.";
 *           MyAuthApp.log($"Usuário {MyAuthApp.user_data.username} acessou o painel");
 *       }
 *       else
 *       {
 *           statusLogin.Text = MyAuthApp.response.message;
 *       }
 *   }
 *
 * ─── Botão Entrar — IDÊNTICO ao KeyAuth ──────────────────────────────────────
 *
 *   private void lczxy7AnimatedButton11_Click(object sender, EventArgs e)
 *   {
 *       RealizarLogin();
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

        public api(string name, string baseUrl, string secret, string version)
        {
            this.name    = name;
            this.baseUrl = baseUrl.TrimEnd('/');
            this.secret  = secret;
            this.version = version;
        }

        // ── Estruturas públicas — idênticas ao KeyAuth ────────────────────────
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

        // ── init() — chame no construtor e no Form1_Load ──────────────────────
        public void init()
        {
            try
            {
                _hwid = GetHWID();

                var payload = new { version = this.version, hwid = _hwid };
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

        // ── login() — envia HWID junto, servidor vincula PC à conta ──────────
        // Na 1ª vez: HWID é salvo e vinculado à conta
        // Nas próximas: se o HWID for diferente, bloqueia e manda DM no Discord
        public void login(string username, string password)
        {
            CheckInit();
            try
            {
                var payload = new
                {
                    username,
                    password,
                    hwid = _hwid ?? GetHWID(),
                };

                var json = Post("/auth/login", payload);
                var obj  = JObject.Parse(json);

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
                            foreach (var s in subs)
                                user_data.subscriptions.Add(new Data
                                {
                                    subscription = s["subscription"]?.Value<string>(),
                                    expiry       = s["expiry"]?.Value<string>(),
                                    timeleft     = s["timeleft"]?.Value<string>(),
                                });
                    }
                }
            }
            catch (WebException wex) { HandleWebException(wex); }
            catch (Exception ex)
            {
                response.success = false;
                response.message = "Erro: " + ex.Message;
            }
        }

        // ── log() — registra acesso, idêntico ao KeyAuth ─────────────────────
        public void log(string message)
        {
            if (!initialized || user_data?.username == null) return;
            try { Post("/auth/log", new { username = user_data.username, message }); }
            catch { }
        }

        // ── HWID: CPU ID + MAC Address → SHA256 ───────────────────────────────
        public static string GetHWID()
        {
            try
            {
                string cpu = GetCpuId();
                string mac = GetMacAddress();
                string raw = $"ALPHAXITHWID|{cpu}|{mac}";

                using (var sha = SHA256.Create())
                {
                    var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(raw));
                    var sb    = new StringBuilder();
                    foreach (var b in bytes) sb.AppendFormat("{0:x2}", b);
                    return sb.ToString();
                }
            }
            catch
            {
                string raw = $"ALPHAXITHWID_FB|{Environment.MachineName}|{Environment.UserName}";
                using (var sha = SHA256.Create())
                {
                    var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(raw));
                    var sb    = new StringBuilder();
                    foreach (var b in bytes) sb.AppendFormat("{0:x2}", b);
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
                    {
                        var id = o["ProcessorId"]?.ToString();
                        if (!string.IsNullOrWhiteSpace(id)) return id.Trim();
                    }
            }
            catch { }
            return "NOCPU";
        }

        private static string GetMacAddress()
        {
            try
            {
                foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
                    if (nic.NetworkInterfaceType == NetworkInterfaceType.Ethernet ||
                        nic.NetworkInterfaceType == NetworkInterfaceType.Wireless80211)
                    {
                        var mac = nic.GetPhysicalAddress().ToString();
                        if (!string.IsNullOrWhiteSpace(mac) && mac != "000000000000")
                            return mac;
                    }
            }
            catch { }
            return "NOMAC";
        }

        // ── Helpers ───────────────────────────────────────────────────────────
        private void CheckInit()
        {
            if (!initialized)
                throw new InvalidOperationException("Chame MyAuthApp.init() antes de login().");
        }

        private string Post(string endpoint, object payload)
        {
            var url  = baseUrl + endpoint;
            var body = Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(payload));

            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls11;

            var req           = (HttpWebRequest)WebRequest.Create(url);
            req.Method        = "POST";
            req.ContentType   = "application/json";
            req.ContentLength = body.Length;
            req.Timeout       = 15000;

            using (var s = req.GetRequestStream()) s.Write(body, 0, body.Length);
            using (var r = (HttpWebResponse)req.GetResponse())
            using (var rd = new StreamReader(r.GetResponseStream(), Encoding.UTF8))
                return rd.ReadToEnd();
        }

        private void HandleWebException(WebException wex)
        {
            if (wex.Response is HttpWebResponse err)
            {
                using (var rd = new StreamReader(err.GetResponseStream(), Encoding.UTF8))
                {
                    try
                    {
                        var obj = JObject.Parse(rd.ReadToEnd());
                        response.success = false;
                        response.message = obj["message"]?.Value<string>() ?? "Erro no servidor.";
                    }
                    catch
                    {
                        response.success = false;
                        response.message = "Erro HTTP " + (int)err.StatusCode;
                    }
                }
            }
            else
            {
                response.success = false;
                response.message = "Sem conexão. Verifique sua internet.";
            }
        }
    }
}
