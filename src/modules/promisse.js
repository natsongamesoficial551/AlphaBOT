/**
 * promisse.js — Versão FINAL (Campo copyPaste e qrCodeBase64)
 */
const https = require('https');

const API_KEY = process.env.PROMISSE_API_KEY || '';

const POLLING_TIMEOUT_MS  = 15 * 60 * 1000;
const POLLING_INTERVAL_MS = 10 * 1000;

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

        if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);

        console.log(`[PROMISSE] Chamando ${method} ${path}...`);

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log(`[PROMISSE SUCCESS] Campos recebidos: ${Object.keys(parsed).join(', ')}`);
                        resolve(parsed);
                    } else {
                        console.error(`[PROMISSE ERROR] HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`);
                        reject(new Error(`HTTP ${res.statusCode}`));
                    }
                } catch (e) {
                    console.error(`[PROMISSE ERROR] Resposta não-JSON: ${data}`);
                    reject(new Error(`Resposta inválida`));
                }
            });
        });

        req.on('error', (e) => {
            console.error(`[PROMISSE REQUEST ERROR] ${e.message}`);
            reject(e);
        });

        if (payload) req.write(payload);
        req.end();
    });
}

async function criarTransacao(amountCentavos) {
    if (!API_KEY) {
        console.error('[PROMISSE] PROMISSE_API_KEY não encontrada no process.env do Render');
        throw new Error('Chave API não configurada no Render');
    }

    const data = await _request('POST', '/transactions', { amount: amountCentavos });
    
    // Mapeamento EXATO baseado nos logs: copyPaste e qrCodeBase64
    const pixCode = data.copyPaste || data.payload || data.pix_code || data.pixCode || data.qr_code_text || data.code || data.emv || data.brcode;
    const qrImage = data.qrCodeBase64 || data.pix_qr_code || data.qrCodeUrl || data.qr_code_url || data.qrCode || data.qr_code;

    return {
        id:            data.id,
        pixCopiaECola: pixCode,
        qrCodeImage:   qrImage,
        status:        data.status
    };
}

async function consultarTransacao(id) {
    const data = await _request('GET', `/transactions/${id}`);
    return data;
}

function reaisParaCentavos(valor) {
    const limpo = String(valor).replace(/[^\d,.]/g, '').replace(',', '.');
    return Math.round(parseFloat(limpo) * 100);
}

function aguardarPagamento(transacaoId, onCheck) {
    return new Promise((resolve, reject) => {
        const inicio = Date.now();
        const timer = setInterval(async () => {
            try {
                const transacao = await consultarTransacao(transacaoId);
                const status = (transacao.status || '').toLowerCase();
                if (typeof onCheck === 'function') onCheck(transacao);

                if (['paid', 'approved', 'completed'].includes(status)) {
                    clearInterval(timer);
                    return resolve(transacao);
                }
                if (['cancelled', 'expired', 'failed'].includes(status)) {
                    clearInterval(timer);
                    return reject(new Error(`Status: ${status}`));
                }
                if (Date.now() - inicio >= POLLING_TIMEOUT_MS) {
                    clearInterval(timer);
                    return reject(new Error(`Timeout`));
                }
            } catch (err) {
                console.error(`[Polling Error] ${err.message}`);
            }
        }, POLLING_INTERVAL_MS);
    });
}

module.exports = { criarTransacao, consultarTransacao, aguardarPagamento, reaisParaCentavos };
