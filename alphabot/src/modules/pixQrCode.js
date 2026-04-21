const QRCode = require('qrcode');

/**
 * Pix QR Code Generator (BRCode EMV)
 */
class PixGenerator {
    constructor(key, name, city, amount, txid) {
        this.key = key;
        this.name = name;
        this.city = city;
        this.amount = amount;
        this.txid = txid || '***';
    }

    _format(id, value) {
        const size = String(value).length.toString().padStart(2, '0');
        return `${id}${size}${value}`;
    }

    getPayload() {
        const gui = this._format('00', 'br.gov.bcb.pix');
        const key = this._format('01', this.key);
        
        const merchantAccount = this._format('26', gui + key);
        const merchantCategory = this._format('52', '0000');
        const transactionCurrency = this._format('53', '986');
        const transactionAmount = this._format('54', this.amount);
        const countryCode = this._format('58', 'BR');
        const merchantName = this._format('59', this.name.slice(0, 25));
        const merchantCity = this._format('60', this.city.slice(0, 15));
        
        const txid = this._format('05', this.txid);
        const additionalData = this._format('62', txid);

        let payload = '000201' +
            merchantAccount +
            merchantCategory +
            transactionCurrency +
            transactionAmount +
            countryCode +
            merchantName +
            merchantCity +
            additionalData +
            '6304';

        return payload + this._crc16(payload);
    }

    _crc16(str) {
        let crc = 0xFFFF;
        const polynomial = 0x1021;
        for (let i = 0; i < str.length; i++) {
            let b = str.charCodeAt(i);
            for (let j = 0; j < 8; j++) {
                let bit = ((b >> (7 - j) & 1) === 1);
                let c15 = ((crc >> 15 & 1) === 1);
                crc <<= 1;
                if (c15 ^ bit) crc ^= polynomial;
            }
        }
        crc &= 0xFFFF;
        return crc.toString(16).toUpperCase().padStart(4, '0');
    }
}

async function gerarQrCodePix({ pixKey, merchantName, merchantCity, amount, txid }) {
    const amountFixed = parseFloat(String(amount).replace(',', '.')).toFixed(2);
    const generator = new PixGenerator(pixKey, merchantName, merchantCity, amountFixed, txid);
    const payload = generator.getPayload();
    const buffer = await QRCode.toBuffer(payload, { margin: 2, width: 400 });

    return { payload, buffer };
}

module.exports = { gerarQrCodePix };
