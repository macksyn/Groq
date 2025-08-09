// attendance.js
import fs from 'fs';
import path from 'path';
import moment from 'moment-timezone';
import { fileURLToPath } from 'url';
import { isAdmin, isOwner } from '../lib/helpers.js';
import { COMMAND_CATEGORIES } from '../lib/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database and settings paths (adjusted to fit plugin directory structure)
const dbPath = path.join(__dirname, '../../database.json');
const settingsPath = path.join(__dirname, '../../attendance_settings.json');

// Default attendance settings
const defaultSettings = {
    rewardAmount: 500,
    requireImage: false,
    imageRewardBonus: 200,
    minFieldLength: 2,
    enableStreakBonus: true,
    streakBonusMultiplier: 1.5,
    adminNumbers: []
};

// Load settings
let attendanceSettings = defaultSettings;
if (fs.existsSync(settingsPath)) {
    try {
        const loadedSettings = JSON.parse(fs.readFileSync(settingsPath));
        attendanceSettings = { ...defaultSettings, ...loadedSettings };
    } catch (error) {
        console.error('Error loading attendance settings:', error);
        attendanceSettings = defaultSettings;
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

// Main plugin function to handle commands
export default async function attendancePlugin(m, sock, config) {
    const prefix = config.PREFIX;
    const body = m.body;
    const isCommand = body.startsWith(prefix);
    if (!isCommand) return;

    const args = body.slice(prefix.length).trim().split(' ');
    const command = args.shift().toLowerCase();

    // Check-in command
    if (command === 'present' || command === 'p') {
        const db = loadDatabase();
        const user = db.users[m.sender] || { attendance: { lastCheck: null, streak: 0 } };
        const now = moment().format('YYYY-MM-DD');

        if (user.attendance.lastCheck === now) {
            return m.reply('❌ You have already marked your attendance today!');
        }

        user.attendance.lastCheck = now;
        user.attendance.streak = (moment().subtract(1, 'day').format('YYYY-MM-DD') === user.attendance.lastCheck)
            ? user.attendance.streak + 1
            : 1;

        // Reward logic
        let reward = attendanceSettings.rewardAmount;
        if (attendanceSettings.enableStreakBonus && user.attendance.streak > 1) {
            reward *= attendanceSettings.streakBonusMultiplier;
        }

        // Add reward to economy
        // This assumes addMoney is exported from your economy plugin or a lib file
        // addMoney(m.sender, reward, 'Attendance Bonus');

        db.users[m.sender] = user;
        saveDatabase(db);

        return m.reply(`✅ Attendance marked successfully!\n💰 You received a reward of ${reward} for being present.\n🔥 Your current streak is: ${user.attendance.streak}`);
    }

    // Settings command (owner only)
    if (command === 'attendanceset' && isOwner(m.sender, config.OWNER_NUMBER)) {
        // Handle attendance settings
        // Example: .attendanceset reward 1000
    }
}

// Plugin metadata
export const info = {
    name: 'Attendance',
    version: '1.0.0',
    author: 'Fresh Bot Team',
    description: 'Plugin for managing group attendance and streaks.',
    category: COMMAND_CATEGORIES.GENERAL,
    commands: [
        {
            name: 'present',
            description: 'Marks your attendance for the day and gets a reward.',
            usage: '.present',
            aliases: ['p']
        },
        {
            name: 'attendanceset',
            description: 'Owner-only command to manage attendance settings.',
            usage: '.attendanceset [setting] [value]',
            ownerOnly: true
        }
    ]
};
