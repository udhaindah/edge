import axios from 'axios';
import chalk from 'chalk';
import Table from 'cli-table3';
import fs from 'fs/promises';

async function readWalletAddresses() {
    try {
        const data = await fs.readFile('address.txt', 'utf-8');
        const addresses = data.split('\n').map(addr => addr.trim()).filter(addr => addr !== '');
        if (addresses.length === 0) {
            throw new Error('File address.txt kosong.');
        }
        return addresses.slice(0, 10);
    } catch (error) {
        console.error(chalk.red(`[ERROR] Gagal membaca file: ${error.message}`));
        process.exit(1);
    }
}

async function readProxies() {
    try {
        const data = await fs.readFile('proxy.txt', 'utf-8');
        const proxies = data.split('\n').map(proxy => proxy.trim()).filter(proxy => proxy !== '');
        if (proxies.length === 0) {
            throw new Error('File proxy.txt kosong.');
        }
        return proxies;
    } catch (error) {
        console.error(chalk.red(`[ERROR] Gagal membaca file: ${error.message}`));
        process.exit(1);
    }
}

let table;

function createTable(wallets) {
    table = new Table({
        head: [chalk.cyan('WALLET ADDRESS'), chalk.cyan('STATUS'), chalk.cyan('NODE POINT')],
        colWidths: [60, 20, 20],
        style: { border: ['green'] }
    });

    wallets.forEach(wallet => {
        table.push([wallet, chalk.yellow('PENDING'), '-']);
    });

    console.clear();
    console.log(table.toString());
}

function updateTable(wallet, status, nodePoint) {
    const index = table.findIndex(row => row[0] === wallet);
    if (index !== -1) {
        table[index] = [wallet, status, nodePoint];
    }
    console.clear();
    console.log(table.toString());
}

async function testProxy(proxy) {
    try {
        const axiosInstance = axios.create({
            proxy: {
                host: proxy.split('@')[1].split(':')[0],
                port: parseInt(proxy.split(':')[2]),
            },
            auth: {
                username: proxy.split('//')[1].split(':')[0],
                password: proxy.split(':')[2].split('@')[0],
            }
        });

        const response = await axiosInstance.get('https://dashboard.layeredge.io/api/node-points/start');
        return response.status === 200; // Check if the response is successful
    } catch (error) {
        console.error(chalk.red(`[ERROR] Proxy ${proxy} failed: ${error.message}`));
        return false;
    }
}

async function startNodePoints(walletAddress, proxy) {
    try {
        updateTable(walletAddress, chalk.blue('STARTING'), '-');
        
        const axiosInstance = axios.create({
            proxy: {
                host: proxy.split('@')[1].split(':')[0],
                port: parseInt(proxy.split(':')[2]),
            },
            auth: {
                username: proxy.split('//')[1].split(':')[0],
                password: proxy.split(':')[2].split('@')[0],
            }
        });

        const response = await axiosInstance.post('https://dashboard.layeredge.io/api/node-points/start', {
            walletAddress: walletAddress
        });

        if (response.data && response.data.lastStartTime) {
            updateTable(walletAddress, chalk.green('SUCCESS'), `Start: ${response.data.lastStartTime}`);
            return response.data.lastStartTime;
        } else {
            throw new Error('lastStartTime tidak ditemukan dalam response');
        }
    } catch (error) {
        console.error(chalk.red(`[ERROR] startNodePoints failed for ${walletAddress} with proxy ${proxy}: ${error.message}`));
        updateTable(walletAddress, chalk.red('FAILED'), '-');
        return null;
    }
}

async function sendNodePoints(walletAddress, lastStartTime, proxy) {
    try {
        updateTable(walletAddress, chalk.blue('PROCESSING'), '-');
        
        const axiosInstance = axios.create({
            proxy: {
                host: proxy.split('@')[1].split(':')[0],
                port: parseInt(proxy.split(':')[2]),
            },
            auth: {
                username: proxy.split('//')[1].split(':')[0],
                password: proxy.split(':')[2].split('@')[0],
            }
        });

        const response = await axiosInstance.post('https://dashboard.layeredge.io/api/node-points', {
            walletAddress: walletAddress,
            lastStartTime: lastStartTime
        });

        if (response.data && response.data.nodePoints !== undefined) {
            updateTable(walletAddress, chalk.green('SUCCESS'), response.data.nodePoints);
        } else {
            updateTable(walletAddress, chalk.yellow('NO DATA'), '-');
        }
    } catch (error) {
        console.error(chalk.red(`[ERROR] sendNodePoints failed for ${walletAddress} with proxy ${proxy}: ${error.message}`));
        updateTable(walletAddress, chalk.red('FAILED'), '-');
    }
}

async function processWallets(wallets, proxies) {
    for (const wallet of wallets) {
        let success = false; // Track if we succeeded with any proxy
        for (const proxy of proxies) {
            const isProxyWorking = await testProxy(proxy);
            if (isProxyWorking) {
                const lastStartTime = await startNodePoints(wallet, proxy);
                if (lastStartTime) {
                    await sendNodePoints(wallet, lastStartTime, proxy);
                    success = true; // Mark as successful if we got a response
                    break; // Exit the proxy loop if successful
                }
            } else {
                updateTable(wallet, chalk.red('FAILED'), '-');
            }
        }
        if (!success) {
            updateTable(wallet, chalk.red('ALL PROXIES FAILED'), '-');
        }
    }
}

async function main() {
    const walletAddresses = await readWalletAddresses();
    const proxies = await readProxies();
    createTable(walletAddresses);
    await processWallets(walletAddresses, proxies);
}

const intervalTime = 3000;
console.log(chalk.green(`Bot akan berjalan setiap ${intervalTime / 1000} detik`));
setInterval(main, intervalTime); // Call the main function at the specified interval
main(); // Initial call to start the process