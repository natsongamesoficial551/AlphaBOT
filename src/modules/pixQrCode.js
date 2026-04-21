const QRCode = require('qrcode');

/**
 * pixQrCode.js — Gerador de QR Code Pix (padrão BRCode EMV)
 */
class PixGenerator {
    constructor(key, name, city, amount, txid) {
        this.key    = key;
        this.name   = _sanitize(name).slice(0, 25);
        this.city   = _sanitize(city).slice(0, 15);
        this.amount = parseFloat(String(amount).replace(',', '.')).toFixed(2);
        this.txid   = (txid || '***').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || '***';
    }

    _tlv(id, value) {
        const v    = String(value);
        const size = v.length.toString().padStart(2, '0');
        return `${id}${size}${v}`;
    }

    getPayload() {
        const payloadFormat = this._tlv('00', '01');
        const gui           = this._tlv('00', 'br.gov.bcb.pix');
        const key           = this._tlv('01', this.key);
        const merchantAcct  = this._tlv('26', gui + key);
        const mcc           = this._tlv('52', '0000');
        const currency      = this._tlv('53', '986');
        const amount        = parseFloat(this.amount) > 0 ? this._tlv('54', this.amount) : '';
        const country       = this._tlv('58', 'BR');
        const name          = this._tlv('59', this.name);
        const city          = this._tlv('60', this.city);
        const txidField     = this._tlv('05', this.txid);
        const additionalData = this._tlv('62', txidField);

        const payload =
            payloadFormat +
            merchantAcct  +
            mcc           +
            currency      +
            amount        +
            country       +
            name          +
            city          +
            additionalData +
            '6304';

        return payload + this._crc16(payload);
    }

    _crc16(str) {
        let crc = 0xFFFF;
        const poly = 0x1021;
        for (let i = 0; i < str.length; i++) {
            crc ^= str.charCodeAt(i) << 8;
            for (let j = 0; j < 8; j++) {
                crc = (crc & 0x8000) ? ((crc << 1) ^ poly) : (crc << 1);
            }
        }
        crc &= 0xFFFF;
        return crc.toString(16).toUpperCase().padStart(4, '0');
    }
}

function _sanitize(str) {
    return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, '').trim();
}

/**
 * Gera o payload Pix e o QR Code em buffer PNG.
 * Se params.payloadForced for enviado, ignora a geração local e usa o payload da API.
 */
async function gerarQrCodePix({ pixKey, merchantName, merchantCity, amount, txid, payloadForced }) {
    // Se a API Promisse já deu o payload, usamos ele para gerar o QR Code
    const payload = payloadForced || new PixGenerator(pixKey, merchantName, merchantCity, amount, txid).getPayload();
    
    const buffer = await QRCode.toBuffer(payload, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width:  400,
        color:  { dark: '#000000', light: '#FFFFFF' },
    });

    return { payload, buffer };
}

module.exports = { gerarQrCodePix };
