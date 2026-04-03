/**
 * pixQrCode.js — Geração de QR Code Pix (padrão EMV / BR Code)
 *
 * Gera o payload Pix estático conforme especificação do Banco Central
 * e retorna um Buffer PNG do QR Code pronto para envio como anexo no Discord.
 */

const qrcode = require('qrcode');

/**
 * Calcula o CRC16-CCITT do payload Pix.
 * @param {string} str
 * @returns {string} 4 caracteres hexadecimais em maiúsculas
 */
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return ((crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0'));
}

/**
 * Formata um campo EMV: ID (2 dígitos) + tamanho (2 dígitos) + valor.
 */
function campo(id, valor) {
  const v = String(valor);
  return `${id}${v.length.toString().padStart(2, '0')}${v}`;
}

/**
 * Gera o payload Pix estático (BR Code) conforme padrão do Banco Central.
 *
 * @param {object} opts
 * @param {string} opts.pixKey       - Chave Pix (CPF, telefone, e-mail, chave aleatória)
 * @param {string} opts.merchantName - Nome do recebedor (máx. 25 chars)
 * @param {string} opts.merchantCity - Cidade do recebedor (máx. 15 chars)
 * @param {string} opts.amount       - Valor em reais, ex: "13.00"
 * @param {string} opts.txid         - ID da transação (máx. 25 chars, sem espaços/acentos)
 * @returns {string} payload Pix pronto para QR Code
 */
function gerarPayloadPix({ pixKey, merchantName, merchantCity, amount, txid }) {
  // Sanitiza campos conforme limite do padrão
  const nome    = merchantName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 25);
  const cidade  = merchantCity.normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 15);
  const txidSan = (txid || 'ALPHABOT').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || 'ALPHABOT';
  const valor   = parseFloat(amount).toFixed(2);

  // Campo 26 — Merchant Account Information (GUI + chave)
  const gui    = campo('00', 'BR.GOV.BCB.PIX');
  const chave  = campo('01', pixKey);
  const mai    = campo('26', gui + chave);

  // Monta payload sem CRC
  let payload =
    campo('00', '01') +          // Payload Format Indicator
    campo('01', '12') +          // Point of Initiation Method (12 = estático)
    mai +                        // Merchant Account Information
    campo('52', '0000') +        // Merchant Category Code
    campo('53', '986') +         // Transaction Currency (BRL)
    campo('54', valor) +         // Transaction Amount
    campo('58', 'BR') +          // Country Code
    campo('59', nome) +          // Merchant Name
    campo('60', cidade) +        // Merchant City
    campo('62', campo('05', txidSan)) + // Additional Data (TXID)
    '6304';                      // CRC placeholder

  return payload + crc16(payload);
}

/**
 * Gera um Buffer PNG do QR Code Pix.
 *
 * @param {object} opts - Mesmos parâmetros de gerarPayloadPix
 * @returns {Promise<Buffer>} Buffer PNG do QR Code
 */
async function gerarQrCodePix(opts) {
  const payload = gerarPayloadPix(opts);
  const buffer  = await qrcode.toBuffer(payload, {
    errorCorrectionLevel: 'M',
    type: 'png',
    width: 400,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  return { buffer, payload };
}

module.exports = { gerarQrCodePix, gerarPayloadPix };
