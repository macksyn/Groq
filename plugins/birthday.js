// birthday.js
import fs from 'fs';
import path from 'path';
import moment from 'moment-timezone';
import { fileURLToPath } from 'url';
import { COMMAND_CATEGORIES } from '../lib/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database and settings paths
const dbPath = path.join(__dirname, '../../database.json');
const settingsPath = path.join(__dirname, '../../birthday_settings.json');

// Default birthday settings
const defaultSettings = {
    enableReminders: true,
    enableAutoWishes: true,
    reminderDays: [7, 3, 1], // Days before birthday to send reminders
    reminderTime: '09:00',
    wishTime: '00:01',
    enableGroupReminders: true,
    enablePrivateReminders: true,
    reminderGroups: []
};

// Load settings
let birthdaySettings = defaultSettings;
if (fs.existsSync(settingsPath)) {
    try {
        const loadedSettings = JSON.parse(fs.readFileSync(settingsPath));
        birthdaySettings = { ...defaultSettings, ...loadedSettings };
    } catch (error) {
        console.error('Error loading birthday settings:', error);
        birthdaySettings = defaultSettings;
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
export default async function birthdayPlugin(m, sock, config) {
    const prefix = config.PREFIX;
    const body = m.body;
    const isCommand = body.startsWith(prefix);
    if (!isCommand) return;

    const args = body.slice(prefix.length).trim().split(' ');
    const command = args.shift().toLowerCase();

    // Set birthday command
    if (command === 'setbday' || command === 'setbirthday') {
        const db = loadDatabase();
        const dateString = args.join(' ');
        
        const birthday = moment(dateString, ['DD-MM-YYYY', 'DD/MM/YYYY', 'MM-DD-YYYY', 'MM/DD/YYYY']);
        if (!birthday.isValid()) {
            return m.reply('❌ Invalid date format. Please use DD-MM-YYYY or MM-DD-YYYY.\nExample: .setbday 15-08-2000');
        }

        if (!db.users[m.sender]) db.users[m.sender] = {};
        db.users[m.sender].birthday = birthday.format('DD-MM-YYYY');
        saveDatabase(db);
        
        return m.reply(`✅ Your birthday has been set to: ${birthday.format('DD MMMM, YYYY')}`);
    }

    // View my birthday command
    if (command === 'mybday' || command === 'mybirthday') {
        const db = loadDatabase();
        const user = db.users[m.sender];
        
        if (!user || !user.birthday) {
            return m.reply('📝 You have not set your birthday yet. Use .setbday to set it.');
        }
        
        const birthday = moment(user.birthday, 'DD-MM-YYYY');
        const nextBirthday = birthday.clone().year(moment().year());
        if (nextBirthday.isBefore(moment())) {
            nextBirthday.add(1, 'year');
        }
        
        const daysUntil = nextBirthday.diff(moment(), 'days') + 1;
        
        return m.reply(`🎂 Your birthday is on: ${birthday.format('DD MMMM, YYYY')}\n\n🎈 It's coming up in ${daysUntil} days!`);
    }

    // View upcoming birthdays command
    if (command === 'upcomingbday' || command === 'upcomingbirthdays') {
        const db = loadDatabase();
        const birthdays = [];
        
        for (const jid in db.users) {
            const user = db.users[jid];
            if (user.birthday) {
                const birthday = moment(user.birthday, 'DD-MM-YYYY');
                const nextBirthday = birthday.clone().year(moment().year());
                if (nextBirthday.isBefore(moment())) {
                    nextBirthday.add(1, 'year');
                }
                birthdays.push({ jid, birthday: nextBirthday });
            }
        }
        
        birthdays.sort((a, b) => a.birthday.diff(b.birthday));
        
        let reply = '🗓️ *Upcoming Birthdays:*\n\n';
        const now = moment();
        
        birthdays.slice(0, 10).forEach(b => {
            const isToday = b.birthday.isSame(now, 'day');
            const isTomorrow = b.birthday.isSame(now.clone().add(1, 'day'), 'day');
            let dateText = b.birthday.format('DD MMMM');
            
            if (isToday) dateText = '🎉 *Today*';
            if (isTomorrow) dateText = '🎈 *Tomorrow*';
            
            reply += `• ${b.jid.split('@')[0]} - ${dateText}\n`;
        });
        
        await m.reply(reply);
    }
}

// Plugin metadata
export const info = {
    name: 'Birthday',
    version: '1.0.0',
    author: 'Fresh Bot Team',
    description: 'Manages user birthdays and sends out wishes and reminders.',
    category: COMMAND_CATEGORIES.GENERAL,
    commands: [
        {
            name: 'setbday',
            description: 'Set your birthday for the bot to remember.',
            usage: '.setbday DD-MM-YYYY',
            aliases: ['setbirthday']
        },
        {
            name: 'mybday',
            description: 'View your set birthday and how many days are left.',
            usage: '.mybday',
            aliases: ['mybirthday']
        },
        {
            name: 'upcomingbday',
            description: 'Shows a list of all upcoming birthdays.',
            usage: '.upcomingbday',
            aliases: ['upcomingbirthdays']
        }
    ]
};
