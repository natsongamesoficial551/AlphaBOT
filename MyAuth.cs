/*
 * MyAuth.cs — Sistema de autenticação própria Alpha Xit
 * 
 * Funcionalidades:
 *   ✅ Login com usuário + senha
 *   ✅ HWID (CPU ID + MAC Address) — 1 conta por PC
 *   ✅ Verificação de HWID antes de criar conta
 *   ✅ DM no Discord ao detectar tentativa em outro PC
 *   ✅ Verificação de expiração de licença
 *   ✅ Log de acesso
 *
 * ─── Configuração no Form1.cs ────────────────────────────────────────────────
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
 * ─── No RealizarLogin() — IDÊNTICO ao KeyAuth: ───────────────────────────────
 *
 *   MyAuthApp.login(Username.Text.Trim(), Pass.Text.Trim());
 *   if (MyAuthApp.response.success) {
 *       statusLogin.Text = "Login efetuado com sucesso!";
 *       l1.Visible = false;
 *       l1.SendToBack();
 *       p1.BringToFront();
 *       status.Text = "Bem-vindo " + MyAuthApp.user_data.username + "! Painel pronto para uso.";
 *       MyAuthApp.log($"Usuário {MyAuthApp.user_data.username} acessou o painel");
 *   } else {
 *       statusLogin.Text = MyAuthApp.response.message;
 *   }
 *
 * ─── Botão Entrar — IDÊNTICO ao KeyAuth: ─────────────────────────────────────
 *
 *   private void lczxy7AnimatedButton11_Click(object sender, EventArgs e)
 *   {
 *       RealizarLogin();
 *   }
 */

using System;
using System.Collections.Generic;
using System.Management;          // para CPU ID — adicione referência: System.Management
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
        // ── Configuração ─────────────────────────────────────────────────────
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
                // Gera o HWID na inicialização (CPU ID + MAC Address)
                _hwid = GetHWID();

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
        /// Autentica o usuário com verificação de HWID.
        /// Idêntico ao KeyAuthApp.login(username, password)
        /// </summary>
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
            catch { }
        }

        // ── HWID ─────────────────────────────────────────────────────────────

        /// <summary>
        /// Gera um identificador único do PC baseado em CPU ID + MAC Address.
        /// Resultado é hash SHA256 para não expor dados brutos.
        /// </summary>
        public static string GetHWID()
        {
            try
            {
                string cpuId  = GetCpuId();
                string macAdr = GetMacAddress();
                string raw    = $"ALPHAXITHWID|{cpuId}|{macAdr}";

                using (var sha256 = SHA256.Create())
                {
                    byte[] bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(raw));
                    var sb = new StringBuilder();
                    foreach (byte b in bytes)
                        sb.AppendFormat("{0:x2}", b);
                    return sb.ToString();
                }
            }
            catch
            {
                // Fallback: usa nome da máquina + nome do usuário do Windows
                string raw = $"ALPHAXITHWID_FALLBACK|{Environment.MachineName}|{Environment.UserName}";
                using (var sha256 = SHA256.Create())
                {
                    byte[] bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(raw));
                    var sb = new StringBuilder();
                    foreach (byte b in bytes)
                        sb.AppendFormat("{0:x2}", b);
                    return sb.ToString();
                }
            }
        }

        private static string GetCpuId()
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT ProcessorId FROM Win32_Processor"))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        var id = obj["ProcessorId"]?.ToString();
                        if (!string.IsNullOrWhiteSpace(id)) return id.Trim();
                    }
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
                {
                    if (nic.NetworkInterfaceType == NetworkInterfaceType.Ethernet ||
                        nic.NetworkInterfaceType == NetworkInterfaceType.Wireless80211)
                    {
                        var mac = nic.GetPhysicalAddress().ToString();
                        if (!string.IsNullOrWhiteSpace(mac) && mac != "000000000000")
                            return mac;
                    }
                }
            }
            catch { }
            return "NOMAC";
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

            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls11;

            var request             = (HttpWebRequest)WebRequest.Create(url);
            request.Method          = "POST";
            request.ContentType     = "application/json";
            request.ContentLength   = reqBody.Length;
            request.Timeout         = 15000;

            using (var stream = request.GetRequestStream())
                stream.Write(reqBody, 0, reqBody.Length);

            using (var resp   = (HttpWebResponse)request.GetResponse())
            using (var reader = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                return reader.ReadToEnd();
        }

        private void HandleWebException(WebException wex)
        {
            if (wex.Response is HttpWebResponse errResp)
            {
                using (var reader = new StreamReader(errResp.GetResponseStream(), Encoding.UTF8))
                {
                    try
                    {
                        var obj = JObject.Parse(reader.ReadToEnd());
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
