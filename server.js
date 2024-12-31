const express = require('express');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const { default: makeWASocket, Browsers, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');
const pino = require('pino');
const readline = require('readline');
const chalk = require('chalk');

const app = express();
app.use(express.json());
app.use(express.static('public')); // برای سرویس‌دهی فایل‌های HTML

let phoneNumber = "93730285765"; // شماره پیش‌فرض (در صورت نیاز می‌توانید این را از HTML دریافت کنید)

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function qr() {
    let { version, isLatest } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./sessions');
    const msgRetryCounterCache = new NodeCache(); // برای retry پیام‌ها
    const XeonBotInc = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // برای اینکه QR در ترمینال نمایش داده نشود
        browser: Browsers.windows('Firefox'), 
        auth: {
            creds: state.creds,
            keys: state.keys,
        },
    });

    if (phoneNumber) {
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

        // اینجا باید شماره تلفن را وارد کنید یا از کاربر بگیرید
        if (!Object.keys(PHONENUMBER_MCC).some(v => phoneNumber.startsWith(v))) {
            console.log(chalk.bgBlack(chalk.redBright("Start with country code of your WhatsApp Number")));
            process.exit(0);
        }

        setTimeout(async () => {
            let code = await XeonBotInc.requestPairingCode(phoneNumber);
            code = code?.match(/.{1,4}/g)?.join("-") || code;

            // ساخت QR code
            qrcode.toDataURL(code, (err, qrCode) => {
                if (err) {
                    console.error('Error generating QR code:', err);
                    return;
                }
                console.log(`QR Code generated: ${qrCode}`);
                // ارسال QR code به صفحه HTML
                sendQRCodeToClient(qrCode);
            });
        }, 3000);
    }

    XeonBotInc.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;
        if (connection == "open") {
            await XeonBotInc.sendMessage(XeonBotInc.user.id, { text: `*SESSION ID GENERATED SUCCESSFULY* ✅\n` });
            let sessionXeon = fs.readFileSync('./sessions/creds.json', 'utf-8');
            await XeonBotInc.sendMessage(XeonBotInc.user.id, { text: sessionXeon });
            process.exit(0);
        }

        if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
            qr(); // اگر ارتباط قطع شد، دوباره تلاش می‌کنیم
        }
    });
}

function sendQRCodeToClient(qrCode) {
    // ارسال QR code به صفحه HTML
    app.post('/sendQRCode', (req, res) => {
        res.json({ qrCode });
    });
}

app.post('/connect', async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }
    qr();
    res.status(200).json({ message: 'Pairing initiated' });
});

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
