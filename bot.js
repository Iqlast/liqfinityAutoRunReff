const puppeteer = require('puppeteer');
const fs = require('fs');

const API_BASE_URL = 'https://api.testnet.liqfinity.com/v1/user';
const TOKEN_FILE = 'token.txt';
const INTERVAL_DELAY = 30000; // 30 detik

// Fungsi untuk membuat delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getTokens() {
    const data = fs.readFileSync(TOKEN_FILE, 'utf8');
    return data.split('\n').filter(token => token.trim() !== '');
}

async function fetchWithPuppeteer(url, token, method = 'GET', body = null) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
        // Set headers
        await page.setExtraHTTPHeaders({
            'authority': 'api.testnet.liqfinity.com',
            'sec-ch-ua-platform': '"Windows"',
            'authorization': `Bearer ${token}`,
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'accept': 'application/json, text/plain, */*',
            'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'origin': 'https://app.testnet.liqfinity.com',
            'sec-fetch-site': 'same-site',
            'sec-fetch-mode': 'cors',
            'sec-fetch-dest': 'empty',
            'referer': 'https://app.testnet.liqfinity.com/',
            'accept-encoding': 'gzip, deflate, br, zstd',
            'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'priority': 'u=1, i',
            'content-type': 'application/json'
        });

        let response;
        if (method === 'GET') {
            console.log(`Fetching data from: ${url}`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }); // Navigasi ke URL
            response = await page.evaluate(() => {
                return JSON.parse(document.body.innerText); // Ambil respons JSON dari body
            });
        } else if (method === 'POST') {
            console.log(`Posting data to: ${url}`);
            response = await page.evaluate(async (url, body) => {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });
                return res.json(); // Ambil respons JSON dari fetch
            }, url, body);
        }

        console.log('Server response:', response); // Log respons server
        await browser.close();
        return response;
    } catch (error) {
        console.error('Error in fetchWithPuppeteer:', error);
        await browser.close();
        return null;
    }
}

async function getRate(token) {
    const url = `${API_BASE_URL}/loans/currencies`;
    const response = await fetchWithPuppeteer(url, token, 'GET');
    if (response && response.success) {
        return response.data.currencies; // Ambil currencies dari data
    } else {
        console.error('Failed to fetch rates:', response);
        return null;
    }
}

async function confirmBorrow(token, principalCurrencyCode, collateralCurrencyCode, principalAmount, collateralAmount) {
    const url = `${API_BASE_URL}/loans/confirm-borrow`;
    const body = {
        principalCurrencyCode,
        collateralCurrencyCode,
        principalAmount,
        collateralAmount
    };
    const response = await fetchWithPuppeteer(url, token, 'POST', body);
    if (response && response.success) {
        return response.data; // Ambil data dari respons
    } else {
        console.error('Failed to confirm borrow:', response);
        return null;
    }
}

async function lockStake(token, amount, fee) {
    const url = `${API_BASE_URL}/stakes/USDT/stake/create`;
    const body = {
        amount,
        fee
    };
    const response = await fetchWithPuppeteer(url, token, 'POST', body);
    if (response && response.success) {
        return response.data; // Ambil data dari respons
    } else {
        console.error('Failed to lock stake:', response);
        return null;
    }
}

async function main() {
    const tokens = await getTokens();
    console.log(`Loaded ${tokens.length} tokens`);

    for (const token of tokens) {
        console.log(`Processing token: ${token}`);

        // Proses borrow untuk setiap currency
        for (const currency of ['LTC', 'BTC', 'ETH']) {
            // Ambil rate terbaru
            const rates = await getRate(token);
            if (!rates) {
                console.error('Failed to fetch rates. Skipping currency.');
                continue;
            }

            const rateInfo = rates.find(r => r.code === currency);
            if (!rateInfo) {
                console.error(`Rate not found for ${currency}. Skipping.`);
                continue;
            }

            const rate = rateInfo.rate; // Ambil rate dari respons
            const principalAmount = rate; // Gunakan rate sebagai principalAmount
            const collateralAmount = 1; // Tetap 1

            console.log(`Confirming borrow for ${currency} with rate ${rate}`);
            const borrowResult = await confirmBorrow(token, 'USDT', currency, principalAmount, collateralAmount);
            console.log('Borrow result:', borrowResult);

            // Delay 30 detik setelah posting
            console.log(`Waiting for ${INTERVAL_DELAY / 1000} seconds before continuing...`);
            await delay(INTERVAL_DELAY);
        }

        // Proses lock stake setelah semua borrow selesai
        console.log(`Locking stake for token ${token}`);
        const stakeResult = await lockStake(token, "80885.1086", "0.005311422649016");
        console.log('Stake result:', stakeResult);
    }
}

main().catch(console.error);
