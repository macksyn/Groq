// economy.js
import fs from 'fs';
import path from 'path';
import moment from 'moment-timezone';
import { fileURLToPath } from 'url';
import { isAdmin, isOwner } from '../lib/helpers.js';
import { COMMAND_CATEGORIES } from '../lib/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database and settings paths
const dbPath = path.join(__dirname, '../../database.json');
const settingsPath = path.join(__dirname, '../../economy_settings.json');

// Default economy settings
const defaultSettings = {
    startingBalance: 0,
    startingBankBalance: 0,
    dailyMinAmount: 500,
    dailyMaxAmount: 1000,
    workCooldownMinutes: 60,
    workJobs: [
        { name: 'Uber Driver', min: 200, max: 800 },
        { name: 'Food Delivery', min: 150, max: 600 },
        { name: 'Freelancer', min: 300, max: 1200 },
        { name: 'Tutor', min: 250, max: 900 },
        { name: 'Cleaner', min: 180, max: 500 },
        { name: 'Mechanic', min: 400, max: 1000 }
    ],
    robCooldownMinutes: 1,
    robSuccessRate: 0.9,
    robMaxStealPercent: 0.5,
    robMinTargetBalance: 0,
    robMinRobberBalance: 100,
    robMinSteal: 10,
    robFailPenalty: 100,
    clanCreationCost: 5000,
    currency: '₦',
    timezone: 'Africa/Lagos'
};

// Load settings
let ecoSettings = defaultSettings;
if (fs.existsSync(settingsPath)) {
    try {
        const loadedSettings = JSON.parse(fs.readFileSync(settingsPath));
        ecoSettings = { ...defaultSettings, ...loadedSettings };
    } catch (error) {
        console.error('Error loading economy settings:', error);
        ecoSettings = defaultSettings;
    }
}

// Helper functions for database operations
function loadDatabase() {
    try {
        return JSON.parse(fs.readFileSync(dbPath));
    } catch (error) {
        console.error('Error loading database:', error);
        return { users: {}, groups: {}, settings: {} };
    }
}

function saveDatabase(data) {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving database:', error);
    }
}

// Exported utility functions
export function getUserData(jid) {
    const db = loadDatabase();
    return db.users[jid] || initUser(jid);
}

export function updateUserData(jid, data) {
    const db = loadDatabase();
    db.users[jid] = { ...db.users[jid], ...data };
    saveDatabase(db);
}

export function addMoney(jid, amount, source = 'income') {
    const userData = getUserData(jid);
    userData.wallet = (userData.wallet || 0) + amount;
    userData.transactions.push({ amount, source, timestamp: moment().toISOString() });
    updateUserData(jid, userData);
}

export function initUser(jid) {
    const db = loadDatabase();
    if (!db.users[jid]) {
        db.users[jid] = {
            wallet: ecoSettings.startingBalance,
            bank: ecoSettings.startingBankBalance,
            transactions: [],
            cooldowns: {
                daily: null,
                work: null,
                rob: null
            }
        };
        saveDatabase(db);
    }
    return db.users[jid];
}

// Main plugin function to handle commands
export default async function economyPlugin(m, sock, config) {
    const prefix = config.PREFIX;
    const body = m.body;
    const isCommand = body.startsWith(prefix);
    if (!isCommand) return;

    const args = body.slice(prefix.length).trim().split(' ');
    const command = args.shift().toLowerCase();
    const db = loadDatabase();
    const user = db.users[m.sender] || initUser(m.sender);

    // Balance command
    if (command === 'balance' || command === 'bal') {
        const currency = ecoSettings.currency;
        return m.reply(`💰 *${m.pushName}'s Balance*
        
        • Wallet: ${currency}${user.wallet}
        • Bank: ${currency}${user.bank}
        • Total: ${currency}${user.wallet + user.bank}
        `);
    }

    // Daily reward command
    if (command === 'daily') {
        const lastDaily = user.cooldowns.daily;
        if (lastDaily && moment().isSame(moment(lastDaily), 'day')) {
            return m.reply('⏳ You have already claimed your daily reward today. Come back tomorrow!');
        }

        const amount = Math.floor(Math.random() * (ecoSettings.dailyMaxAmount - ecoSettings.dailyMinAmount + 1)) + ecoSettings.dailyMinAmount;
        addMoney(m.sender, amount, 'Daily Reward');
        user.cooldowns.daily = moment().toISOString();
        saveDatabase(db);
        
        return m.reply(`✅ You received your daily reward of ${ecoSettings.currency}${amount}!`);
    }

    // Work command
    if (command === 'work') {
        const lastWork = moment(user.cooldowns.work);
        const cooldownEndTime = lastWork.add(ecoSettings.workCooldownMinutes, 'minutes');
        
        if (moment().isBefore(cooldownEndTime)) {
            const timeLeft = moment.duration(cooldownEndTime.diff(moment()));
            return m.reply(`⏳ You are on a work cooldown. You can work again in ${timeLeft.minutes()} minutes and ${timeLeft.seconds()} seconds.`);
        }

        const job = ecoSettings.workJobs[Math.floor(Math.random() * ecoSettings.workJobs.length)];
        const amount = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;
        addMoney(m.sender, amount, 'Work');
        user.cooldowns.work = moment().toISOString();
        saveDatabase(db);

        return m.reply(`💻 You worked as an ${job.name} and earned ${ecoSettings.currency}${amount}.`);
    }
}

// Plugin metadata
export const info = {
    name: 'Economy',
    version: '1.0.0',
    author: 'Fresh Bot Team',
    description: 'Manages the bot\'s in-chat economy system.',
    category: COMMAND_CATEGORIES.FUN,
    commands: [
        {
            name: 'balance',
            description: 'Shows your current wallet and bank balance.',
            usage: '.balance',
            aliases: ['bal']
        },
        {
            name: 'daily',
            description: 'Claim your daily money reward.',
            usage: '.daily'
        },
        {
            name: 'work',
            description: 'Work a random job to earn money.',
            usage: '.work'
        }
    ]
};
