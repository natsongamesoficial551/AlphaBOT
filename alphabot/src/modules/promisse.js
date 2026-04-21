/**
 * promisse.js — Integração com a API Promisse (PIX automático)
 * 
 * Endpoints:
 *   POST https://api.promisse.com.br/transactions   → Criar pagamento PIX
 *   GET  https://api.promisse.com.br/transactions/:id → Consultar status
 */

const https = require('https');

const BASE_URL  = 'https://api.promisse.com.br';
const API_KEY   = process.env.PROMISSE_API_KEY || '';

// Timeout de polling: 15 minutos (em ms)
const POLLING_TIMEOUT_MS  = 15 * 60 * 1000;
// Intervalo entre checagens: 10 segundos
const POLLING_INTERVAL_MS = 10 * 1000;

// ── Helpers HTTP ──────────────────────────────────────────────────────────────

function _request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;

        const options = {
            hostname: 'api.promisse.com.br',
            path,
            method,
            headers: {
                'Authorization': API_KEY,
                'Content-Type':  'application/json',
            },
        };

        if (payload) {
            options.headers['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(`[Promisse] HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
                    }
                } catch (e) {
                    reject(new Error(`[Promisse] Resposta inválida: ${data}`));
                }
            });
        });

        req.on('error', reject);

        if (payload) req.write(payload);
        req.end();
    });
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Cria uma transação PIX na Promisse.
 * @param {number} amountCentavos - Valor em centavos (ex: R$10,00 = 1000)
 * @returns {Promise<{ id: string, qrCode?: string, pixCopiaECola?: string, status: string }>}
 */
async function criarTransacao(amountCentavos) {
    if (!API_KEY) throw new Error('PROMISSE_API_KEY não configurada no .env');

    const data = await _request('POST', '/transactions', { amount: amountCentavos });
    return data;
}

/**
 * Consulta o status de uma transação existente.
 * @param {string} id - ID da transação retornado pelo criarTransacao
 * @returns {Promise<{ id: string, status: string, [key: string]: any }>}
 */
async function consultarTransacao(id) {
    if (!id) throw new Error('ID da transação é obrigatório');
    const data = await _request('GET', `/transactions/${id}`);
    return data;
}

/**
 * Converte valor em reais (string ou number) para centavos inteiros.
 * Exemplos: "10,50" → 1050 | "10.50" → 1050 | 10.5 → 1050
 */
function reaisParaCentavos(valor) {
    const limpo = String(valor).replace(/[^\d,.]/g, '').replace(',', '.');
    return Math.round(parseFloat(limpo) * 100);
}

/**
 * Aguarda o pagamento de uma transação fazendo polling automático.
 * Resolve com a transação quando status === 'paid' (ou 'approved').
 * Rejeita com erro se timeout atingido ou status === 'cancelled'/'expired'.
 * 
 * @param {string} transacaoId
 * @param {Function} [onCheck] - Callback opcional chamado a cada checagem: onCheck(transacao)
 * @returns {Promise<object>} Objeto da transação quando pago
 */
function aguardarPagamento(transacaoId, onCheck) {
    return new Promise((resolve, reject) => {
        const inicio = Date.now();

        const timer = setInterval(async () => {
            try {
                const transacao = await consultarTransacao(transacaoId);
                const status = (transacao.status || '').toLowerCase();

                if (typeof onCheck === 'function') onCheck(transacao);

                // Status que indica pagamento confirmado
                if (status === 'paid' || status === 'approved' || status === 'completed') {
                    clearInterval(timer);
                    return resolve(transacao);
                }

                // Status que indica falha/cancelamento
                if (status === 'cancelled' || status === 'expired' || status === 'failed') {
                    clearInterval(timer);
                    return reject(new Error(`Transação ${transacaoId} encerrada com status: ${status}`));
                }

                // Timeout
                if (Date.now() - inicio >= POLLING_TIMEOUT_MS) {
                    clearInterval(timer);
                    return reject(new Error(`Timeout aguardando pagamento da transação ${transacaoId}`));
                }

            } catch (err) {
                clearInterval(timer);
                reject(err);
            }
        }, POLLING_INTERVAL_MS);
    });
}

module.exports = { criarTransacao, consultarTransacao, aguardarPagamento, reaisParaCentavos };
