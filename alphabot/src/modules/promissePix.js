/**
 * promissePix.js — Integração com API Promisse para pagamentos PIX automáticos
 * 
 * Cria cobranças e valida pagamentos automaticamente via polling.
 */

const https = require('https');

const PROMISSE_BASE_URL = 'https://api.promisse.com.br';
const PROMISSE_API_KEY  = process.env.PROMISSE_API_KEY || '';

// Tempo entre cada verificação de status (em ms)
const POLLING_INTERVAL_MS = 10_000; // 10 segundos
// Tempo máximo esperando o pagamento (em ms)
const POLLING_TIMEOUT_MS  = 30 * 60 * 1000; // 30 minutos

// ── HTTP helper ───────────────────────────────────────────────────────────────

function _request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const options = {
            hostname: 'api.promisse.com.br',
            path,
            method,
            headers: {
                'Authorization': PROMISSE_API_KEY,
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        return reject(new Error(`[Promisse API] HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
                    }
                    resolve(parsed);
                } catch {
                    reject(new Error(`[Promisse API] Resposta inválida: ${data}`));
                }
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

// ── Funções principais ────────────────────────────────────────────────────────

/**
 * Cria uma cobrança PIX na Promisse.
 * @param {number} amountReais - Valor em REAIS (ex: 29.90)
 * @returns {{ id, pixCode, pixQrCodeUrl, amount, status }}
 */
async function criarCobrancaPix(amountReais) {
    // API recebe em centavos (inteiro)
    const amountCentavos = Math.round(parseFloat(amountReais) * 100);

    const resposta = await _request('POST', '/transactions', { amount: amountCentavos });

    return {
        id:          resposta.id,
        pixCode:     resposta.pix_code     || resposta.pixCode     || null,
        pixQrCodeUrl: resposta.pix_qr_code  || resposta.pixQrCodeUrl || null,
        amount:      amountReais,
        status:      resposta.status,
        raw:         resposta,
    };
}

/**
 * Consulta o status de uma transação na Promisse.
 * @param {string} transactionId
 * @returns {{ id, status, paid }}
 */
async function consultarTransacao(transactionId) {
    const resposta = await _request('GET', `/transactions/${transactionId}`);

    // Normaliza: a API pode retornar "paid", "approved", "completed"
    const statusRaw = (resposta.status || '').toLowerCase();
    const pago = statusRaw === 'paid' || statusRaw === 'approved' || statusRaw === 'completed';

    return {
        id:     resposta.id,
        status: statusRaw,
        paid:   pago,
        raw:    resposta,
    };
}

/**
 * Aguarda o pagamento de uma transação via polling.
 * Chama onPago() quando confirmado, ou onExpirado() quando o tempo esgota.
 * 
 * @param {string} transactionId
 * @param {{ onPago: Function, onExpirado: Function }} callbacks
 */
function aguardarPagamento(transactionId, { onPago, onExpirado }) {
    const iniciadoEm  = Date.now();
    let   timerId     = null;
    let   cancelado   = false;

    const verificar = async () => {
        if (cancelado) return;

        try {
            const transacao = await consultarTransacao(transactionId);

            if (transacao.paid) {
                cancelado = true;
                return onPago(transacao);
            }
        } catch (err) {
            console.error(`[PROMISSE POLLING] Erro ao verificar ${transactionId}:`, err.message);
        }

        if (Date.now() - iniciadoEm >= POLLING_TIMEOUT_MS) {
            cancelado = true;
            return onExpirado();
        }

        timerId = setTimeout(verificar, POLLING_INTERVAL_MS);
    };

    // Primeira verificação após o primeiro intervalo
    timerId = setTimeout(verificar, POLLING_INTERVAL_MS);

    // Retorna função para cancelar o polling (ex: pedido cancelado pelo admin)
    return () => {
        cancelado = true;
        if (timerId) clearTimeout(timerId);
    };
}

module.exports = { criarCobrancaPix, consultarTransacao, aguardarPagamento };
