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
  // 1. Sanitiza a chave Pix
  let chave = pixKey.trim();
  
  if (chave.includes('@')) {
    // E-mail: mantém como está (trim já feito)
  } else {
    // Remove tudo que não é alfanumérico
    const apenasNumeros = chave.replace(/\D/g, '');
    const apenasAlfanumerico = chave.replace(/[^a-zA-Z0-9]/g, '');

    if (apenasNumeros.length === 11) {
      // Provavelmente CPF: usa apenas os números
      chave = apenasNumeros;
    } else if (apenasNumeros.length === 10 || (apenasNumeros.length === 11 && (apenasNumeros.startsWith('9') || apenasNumeros[2] === '9'))) {
      // Telefone sem o 55: adiciona 55
      chave = '55' + apenasNumeros;
    } else if (apenasNumeros.length === 12 || apenasNumeros.length === 13) {
      // Telefone já com 55 ou similar: usa apenas números
      chave = apenasNumeros;
    } else {
      // Chave aleatória ou outro formato: usa alfanumérico limpo
      chave = apenasAlfanumerico;
    }
  }

  // 2. Sanitiza Nome e Cidade (remove acentos e limita tamanho)
  const nome    = merchantName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 25);
  const cidade  = merchantCity.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 15);
  
  // 3. TXID: O padrão para Pix estático permite '***' ou um ID alfanumérico sem espaços
  const txidSan = (txid || '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  
  // 4. Valor: Garante ponto como separador decimal
  const valor   = parseFloat(amount.replace(',', '.')).toFixed(2);

  // Campo 26 — Merchant Account Information (GUI + chave)
  const gui    = campo('00', 'BR.GOV.BCB.PIX');
  const cChave = campo('01', chave);
  const mai    = campo('26', gui + cChave);

  // Monta payload sem CRC
  let payload =
    campo('00', '01') +          // Payload Format Indicator
    campo('01', '12') +          // Point of Initiation Method (12 = estático)
    mai +                        // Merchant Account Information
    campo('52', '0000') +        // Merchant Category Code
    campo('53', '986') +         // Transaction Currency (BRL)
    campo('54', valor) +         // Transaction Amount
    campo('58', 'BR') +          // Country Code
    campo('59', nome || 'ALPHABOT') + // Merchant Name
    campo('60', cidade || 'SAO PAULO') + // Merchant City
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
    errorCorrectionLevel: 'L', // Nível L é mais comum para QR Codes de pagamento (mais simples de ler)
    type: 'png',
    width: 512,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  return { buffer, payload };
}

module.exports = { gerarQrCodePix, gerarPayloadPix };
