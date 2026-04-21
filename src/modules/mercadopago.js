const { MercadoPagoConfig, Payment } = require('mercadopago');
const crypto = require('crypto');

// Configuração do Mercado Pago
// O usuário deve fornecer o Access Token nas variáveis de ambiente
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN || 'SEU_ACCESS_TOKEN_AQUI' 
});

const payment = new Payment(client);

/**
 * Cria um pagamento Pix dinâmico
 * @param {number} amount Valor do pagamento
 * @param {string} description Descrição do produto
 * @param {string} email Email do pagador (opcional para Pix, mas recomendado)
 * @returns {Promise<object>} Dados do pagamento incluindo QR Code
 */
async function createPixPayment(amount, description, email = 'contato@alphabot.com') {
    const body = {
        transaction_amount: amount,
        description: description,
        payment_method_id: 'pix',
        payer: {
            email: email,
        },
        // Webhook URL (deve ser configurada no painel do MP ou enviada aqui)
        // notification_url: process.env.WEBHOOK_URL 
    };

    try {
        const response = await payment.create({ body });
        return {
            id: response.id,
            status: response.status,
            qr_code: response.point_of_interaction.transaction_data.qr_code,
            qr_code_base64: response.point_of_interaction.transaction_data.qr_code_base64,
            ticket_url: response.point_of_interaction.transaction_data.ticket_url
        };
    } catch (error) {
        console.error('Erro ao criar pagamento Pix:', error);
        throw error;
    }
}

/**
 * Valida a assinatura do Webhook do Mercado Pago (Segurança Extra)
 * @param {string} xSignature Cabeçalho x-signature da requisição
 * @param {string} xRequestId Cabeçalho x-request-id da requisição
 * @param {string} dataID ID do recurso (payment.id)
 * @returns {boolean}
 */
function validateWebhookSignature(xSignature, xRequestId, dataID) {
    const secret = process.env.MP_WEBHOOK_SECRET;
    if (!secret) return true; // Se não houver secret, ignora (não recomendado para produção)

    // Lógica simplificada de validação baseada na doc do MP
    // O MP envia: ts=...,v1=...
    const parts = xSignature.split(',');
    let ts, v1;
    parts.forEach(part => {
        const [key, value] = part.split('=');
        if (key === 'ts') ts = value;
        if (key === 'v1') v1 = value;
    });

    const manifest = `id:${dataID};request-id:${xRequestId};ts:${ts};`;
    const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

    return hmac === v1;
}

/**
 * Busca detalhes de um pagamento pelo ID
 * @param {string} paymentId 
 */
async function getPaymentStatus(paymentId) {
    try {
        const response = await payment.get({ id: paymentId });
        return {
            id: response.id,
            status: response.status,
            status_detail: response.status_detail,
            external_reference: response.external_reference
        };
    } catch (error) {
        console.error('Erro ao buscar status do pagamento:', error);
        throw error;
    }
}

module.exports = {
    createPixPayment,
    getPaymentStatus,
    validateWebhookSignature
};
