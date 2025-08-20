// plugins/rental_plugin.js
import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';

// Plugin information export
export const info = {
  name: 'Rental Simulation',
  version: '1.0.0',
  author: 'Bot Developer',
  description: 'Manages a rental simulation in WhatsApp groups with wallets, rent payments, and automatic evictions.',
  commands: [
    {
      name: 'rent',
      aliases: ['rental'],
      description: 'Main command for the rental simulation.'
    }
  ]
};

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.DATABASE_NAME || 'whatsapp_bot';
const COLLECTIONS = {
  RENTAL_GROUPS: 'rental_groups',
  TENANTS: 'tenants',
  RENTAL_SETTINGS: 'rental_settings',
  PAYMENT_HISTORY: 'payment_history'
};

// Database connection
let db = null;
let mongoClient = null;

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Default settings for new rental groups
const defaultSettings = {
  rentAmount: 50000,
  paymentFrequency: 'monthly', // 'monthly' or 'weekly'
  dueDay: 1, // Day of the month (1-28) or day of the week for weekly (1=Monday, 7=Sunday)
  currencySymbol: '₦',
  gracePeriodDays: 3, // Days after due date before eviction
  reminderDays: [7, 3, 1], // Days before due date to send reminders
  autoEvict: true,
  adminOnly: true,
  allowDirectPayment: true
};

// Initialize settings cache
let rentalSettings = {};

// Initialize MongoDB connection
async function initDatabase() {
  if (db) return db;
  
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db(DATABASE_NAME);
    
    // Create indexes for better performance
    await db.collection(COLLECTIONS.RENTAL_GROUPS).createIndex({ groupId: 1 }, { unique: true });
    await db.collection(COLLECTIONS.TENANTS).createIndex({ tenantId: 1, groupId: 1 }, { unique: true });
    await db.collection(COLLECTIONS.PAYMENT_HISTORY).createIndex({ tenantId: 1, groupId: 1 });
    
    console.log('✅ MongoDB connected successfully for Rental Plugin');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed for Rental Plugin:', error);
    throw error;
  }
}

// Load settings for a specific group from the database
async function loadSettings(groupId) {
  try {
    const settings = await db.collection(COLLECTIONS.RENTAL_SETTINGS).findOne({ groupId });
    if (settings) {
      rentalSettings[groupId] = { ...defaultSettings, ...settings.data };
    } else {
      rentalSettings[groupId] = { ...defaultSettings };
    }
  } catch (error) {
    console.error(`Error loading settings for ${groupId}:`, error);
    rentalSettings[groupId] = { ...defaultSettings };
  }
}

// Save settings for a specific group to the database
async function saveSettings(groupId) {
  try {
    await db.collection(COLLECTIONS.RENTAL_SETTINGS).replaceOne(
      { groupId },
      { groupId, data: rentalSettings[groupId], updatedAt: new Date() },
      { upsert: true }
    );
  } catch (error) {
    console.error(`Error saving settings for ${groupId}:`, error);
  }
}

// =======================
// 🏡 RENTAL CORE FUNCTIONS
// =======================

/**
 * Checks all rental groups for due payments, sends reminders, and processes evictions.
 * @param {object} sock The bot's socket connection.
 */
async function checkRentals(sock) {
  try {
    const groups = await db.collection(COLLECTIONS.RENTAL_GROUPS).find({ active: true }).toArray();
    if (groups.length === 0) return;

    console.log(`🔍 Checking rent status for ${groups.length} groups...`);

    for (const group of groups) {
      await loadSettings(group.groupId);
      const settings = rentalSettings[group.groupId];
      const tenants = await db.collection(COLLECTIONS.TENANTS).find({ groupId: group.groupId }).toArray();
      const today = moment();

      for (const tenant of tenants) {
        const lastPaid = tenant.lastPaidDate ? moment(tenant.lastPaidDate) : null;
        let dueDate;

        // Calculate the next due date
        if (settings.paymentFrequency === 'monthly') {
          dueDate = lastPaid ? moment(lastPaid).add(1, 'months') : moment(tenant.joinDate).date(settings.dueDay);
        } else { // weekly
          dueDate = lastPaid ? moment(lastPaid).add(1, 'weeks') : moment(tenant.joinDate).isoWeekday(settings.dueDay);
        }
        
        if (today.isBefore(dueDate)) { // Rent not due yet, check for reminders
            for (const reminderDay of settings.reminderDays) {
                if (today.isSame(moment(dueDate).subtract(reminderDay, 'days'), 'day')) {
                    const reminderMsg = `👋 Hello Tenant,\n\nJust a friendly reminder that your rent of *${settings.currencySymbol}${settings.rentAmount}* is due in ${reminderDay} day(s) on ${dueDate.format('MMM Do, YYYY')}.\n\nEnsure your wallet has sufficient funds!`;
                    await sock.sendMessage(tenant.tenantId, { text: reminderMsg });
                }
            }
        } else { // Rent is due or overdue
            const gracePeriodEnd = moment(dueDate).add(settings.gracePeriodDays, 'days');

            // Attempt to auto-deduct rent
            if (tenant.wallet >= settings.rentAmount) {
                const newBalance = tenant.wallet - settings.rentAmount;
                await db.collection(COLLECTIONS.TENANTS).updateOne({ _id: tenant._id }, {
                    $set: { wallet: newBalance, lastPaidDate: new Date() }
                });
                await db.collection(COLLECTIONS.PAYMENT_HISTORY).insertOne({
                    tenantId: tenant.tenantId,
                    groupId: group.groupId,
                    amount: settings.rentAmount,
                    date: new Date(),
                    method: 'wallet_auto'
                });
                const paymentMsg = `✅ Rent Paid!\n\nYour rent of *${settings.currencySymbol}${settings.rentAmount}* has been automatically deducted from your wallet.\n\nYour new balance is *${settings.currencySymbol}${newBalance}*.`;
                await sock.sendMessage(tenant.tenantId, { text: paymentMsg });
            } else { // Insufficient funds, handle late payment/eviction
                if (settings.autoEvict && today.isAfter(gracePeriodEnd)) {
                    // Evict tenant
                    const evictionMsg = `🚨 EVICTION NOTICE 🚨\n\nTenant ${tenant.tenantId.split('@')[0]} has been evicted for failure to pay rent of *${settings.currencySymbol}${settings.rentAmount}* due on ${dueDate.format('MMM Do, YYYY')}.`;
                    await sock.sendMessage(group.groupId, { text: evictionMsg });
                    await sock.groupParticipantsUpdate(group.groupId, [tenant.tenantId], "remove");
                    await db.collection(COLLECTIONS.TENANTS).deleteOne({ _id: tenant._id });
                } else {
                    // Send late payment warning
                    const daysOverdue = today.diff(dueDate, 'days');
                    const warningMsg = `❗️ RENT OVERDUE ❗️\n\nYour rent of *${settings.currencySymbol}${settings.rentAmount}* was due on ${dueDate.format('MMM Do, YYYY')} and is now *${daysOverdue} day(s) overdue*.\n\nPlease pay immediately to avoid eviction.`;
                    await sock.sendMessage(tenant.tenantId, { text: warningMsg });
                }
            }
        }
      }
    }
  } catch (error) {
    console.error('Error in checkRentals:', error);
  }
}


let monitoringInterval = null;

function startMonitoring(sock) {
  if (monitoringInterval) clearInterval(monitoringInterval);
  
  // Check every 24 hours
  const checkInterval = 24 * 60 * 60 * 1000; 
  console.log(`🏘️ Starting Rental monitoring (checking daily)`);
  monitoringInterval = setInterval(() => checkRentals(sock), checkInterval);

  // Initial check after 10 seconds
  setTimeout(() => checkRentals(sock), 10000);
}

function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    console.log('🛑 Rental monitoring stopped');
  }
}

// =======================
// 🔐 AUTHORIZATION
// =======================

async function isAuthorized(sock, from, sender) {
  // Only allow commands in groups
  if (!from.endsWith('@g.us')) return false;

  try {
    const groupMetadata = await sock.groupMetadata(from);
    const groupAdmins = groupMetadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);
      
    return groupAdmins.includes(sender);
  } catch (error) {
    console.error('Error checking group admin status:', error);
    return false;
  }
}

// =======================
// 📋 COMMAND HANDLERS
// =======================

export default async function rentalHandler(m, sock, config) {
  try {
    if (!db) await initDatabase();
    
    // Load group settings if not already cached
    if (m.key.remoteJid && !rentalSettings[m.key.remoteJid]) {
      await loadSettings(m.key.remoteJid);
    }
    
    if (!m.body || !m.body.startsWith(config.PREFIX)) return;
    
    const args = m.body.slice(config.PREFIX.length).trim().split(' ');
    const command = args[0].toLowerCase();
    
    const isRentCommand = ['rent', 'rental'].includes(command);
    if (!isRentCommand) return;
    
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    
    const reply = async (text) => await sock.sendMessage(from, { text }, { quoted: m });
    const context = { m, sock, config, senderId, from, reply };

    const subCommand = args[1]?.toLowerCase() || 'help';
    await handleSubCommand(subCommand, args.slice(2), context);

  } catch (error) {
    console.error('❌ Rental plugin error:', error);
  }
}

async function handleSubCommand(subCommand, args, context) {
  const isAdmin = await isAuthorized(context.sock, context.from, context.senderId);

  // Admin commands
  if (['setup', 'addtenant', 'defaulters', 'settings', 'evict'].includes(subCommand)) {
    if (!isAdmin) {
      await context.reply('🚫 This is an admin-only command.');
      return;
    }
    switch (subCommand) {
      case 'setup': await handleSetup(context); break;
      case 'addtenant': await handleAddTenant(context, args); break;
      case 'defaulters': await handleListDefaulters(context); break;
      case 'settings': await handleSettings(context, args); break;
      case 'evict': await handleEvict(context, args); break;
    }
  } 
  // User commands
  else {
    switch (subCommand) {
      case 'help': await showHelpMenu(context.reply, context.config.PREFIX); break;
      case 'pay': await handlePay(context); break;
      case 'wallet': await handleWallet(context, args, isAdmin); break;
      default:
        await context.reply(`❓ Unknown rent command. Use *${context.config.PREFIX}rent help* for options.`);
    }
  }
}

async function showHelpMenu(reply, prefix) {
  const menu = `🏘️ *RENTAL SIMULATION MENU* 🏘️\n\n` +
               `*👤 Tenant Commands:*\n` +
               `• *${prefix}rent pay* - Pay your monthly rent from your wallet.\n` +
               `• *${prefix}rent wallet* - Check your wallet balance.\n\n` +
               `*👑 Admin Commands:*\n` +
               `• *${prefix}rent setup* - Initialize the rental system in this group.\n` +
               `• *${prefix}rent addtenant @user* - Add a user as a tenant.\n` +
               `• *${prefix}rent defaulters* - List tenants with overdue rent.\n` +
               `• *${prefix}rent evict @user* - Manually evict a tenant.\n` +
               `• *${prefix}rent wallet add @user <amount>* - Add funds to a tenant's wallet.\n` +
               `• *${prefix}rent settings* - View or change rental settings.`;
  await reply(menu);
}

// Admin command to set up the rental system
async function handleSetup(context) {
  const { from, reply } = context;
  const existingGroup = await db.collection(COLLECTIONS.RENTAL_GROUPS).findOne({ groupId: from });
  
  if (existingGroup) {
    await reply('✅ This group is already set up for the rental simulation.');
    return;
  }
  
  await db.collection(COLLECTIONS.RENTAL_GROUPS).insertOne({
    groupId: from,
    active: true,
    createdAt: new Date()
  });
  
  await loadSettings(from); // Load defaults
  await saveSettings(from); // Save defaults to DB
  
  await reply('✅ *Rental Simulation Activated!*\n\nThis group is now ready. Use `rent settings` to customize rent amount, due dates, etc. Add tenants with `rent addtenant @user`.');
}

// Admin command to add a new tenant
async function handleAddTenant(context, args) {
    const { from, reply, m } = context;
    const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    
    if (!mentionedJid) {
        await reply(`📝 Please mention the user you want to add as a tenant.\nExample: *${context.config.PREFIX}rent addtenant @user*`);
        return;
    }

    const existingTenant = await db.collection(COLLECTIONS.TENANTS).findOne({ tenantId: mentionedJid, groupId: from });
    if (existingTenant) {
        await reply('This user is already a tenant in this group.');
        return;
    }

    const tenantData = {
        tenantId: mentionedJid,
        groupId: from,
        wallet: 0,
        joinDate: new Date(),
        lastPaidDate: null
    };

    await db.collection(COLLECTIONS.TENANTS).insertOne(tenantData);
    await reply(`✅ Success! *@${mentionedJid.split('@')[0]}* has been added as a tenant.`);
}

// Tenant command to pay rent
async function handlePay(context) {
    const { from, senderId, reply } = context;
    const settings = rentalSettings[from];
    
    const tenant = await db.collection(COLLECTIONS.TENANTS).findOne({ tenantId: senderId, groupId: from });
    if (!tenant) {
        await reply('You are not registered as a tenant in this group.');
        return;
    }

    if (tenant.wallet < settings.rentAmount) {
        await reply(`❌ Insufficient funds! You need *${settings.currencySymbol}${settings.rentAmount}* but only have *${settings.currencySymbol}${tenant.wallet}* in your wallet.`);
        return;
    }

    const newBalance = tenant.wallet - settings.rentAmount;
    await db.collection(COLLECTIONS.TENANTS).updateOne({ _id: tenant._id }, {
        $set: { wallet: newBalance, lastPaidDate: new Date() }
    });
    await db.collection(COLLECTIONS.PAYMENT_HISTORY).insertOne({
        tenantId: tenant.tenantId,
        groupId: from,
        amount: settings.rentAmount,
        date: new Date(),
        method: 'wallet_manual'
    });

    await reply(`✅ Rent Paid Successfully!\n\nAmount: *${settings.currencySymbol}${settings.rentAmount}*\nNew Wallet Balance: *${settings.currencySymbol}${newBalance}*`);
}

// User/Admin command for wallet management
async function handleWallet(context, args, isAdmin) {
    const { from, senderId, reply, m } = context;
    const subCmd = args[0]?.toLowerCase();

    if (isAdmin && subCmd === 'add') {
        const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const amount = parseInt(args[2]);

        if (!mentionedJid || isNaN(amount) || amount <= 0) {
            await reply(`📝 Usage: *${context.config.PREFIX}rent wallet add @user <amount>*`);
            return;
        }

        const result = await db.collection(COLLECTIONS.TENANTS).updateOne(
            { tenantId: mentionedJid, groupId: from },
            { $inc: { wallet: amount } }
        );

        if (result.matchedCount === 0) {
            await reply('This user is not a registered tenant.');
            return;
        }
        const updatedTenant = await db.collection(COLLECTIONS.TENANTS).findOne({ tenantId: mentionedJid, groupId: from });
        await reply(`✅ Success! Added *${rentalSettings[from].currencySymbol}${amount}* to @${mentionedJid.split('@')[0]}'s wallet.\nNew balance: *${rentalSettings[from].currencySymbol}${updatedTenant.wallet}*`);
    } else {
        const tenant = await db.collection(COLLECTIONS.TENANTS).findOne({ tenantId: senderId, groupId: from });
        if (!tenant) {
            await reply('You are not registered as a tenant.');
            return;
        }
        await reply(`🏦 Your wallet balance is: *${rentalSettings[from].currencySymbol}${tenant.wallet}*`);
    }
}

// Admin command to list defaulters
async function handleListDefaulters(context) {
    const { from, reply } = context;
    const settings = rentalSettings[from];
    const tenants = await db.collection(COLLECTIONS.TENANTS).find({ groupId: from }).toArray();
    
    let defaulters = [];
    const today = moment();

    for (const tenant of tenants) {
        const lastPaid = tenant.lastPaidDate ? moment(tenant.lastPaidDate) : null;
        let dueDate;
        if (settings.paymentFrequency === 'monthly') {
            dueDate = lastPaid ? moment(lastPaid).add(1, 'months') : moment(tenant.joinDate).date(settings.dueDay);
        } else {
            dueDate = lastPaid ? moment(lastPaid).add(1, 'weeks') : moment(tenant.joinDate).isoWeekday(settings.dueDay);
        }

        if (today.isAfter(dueDate) && tenant.wallet < settings.rentAmount) {
            defaulters.push({
                name: tenant.tenantId.split('@')[0],
                dueDate: dueDate.format('MMM Do, YYYY'),
                daysOverdue: today.diff(dueDate, 'days')
            });
        }
    }

    if (defaulters.length === 0) {
        await reply('✅ No defaulters found. All tenants have paid their rent.');
        return;
    }

    let message = `*❗️ LATE RENT PAYMENTS ❗️*\n\n`;
    defaulters.forEach((d, i) => {
        message += `${i+1}. *@${d.name}*\n   - Due Date: ${d.dueDate}\n   - Overdue by: ${d.daysOverdue} day(s)\n`;
    });
    await reply(message);
}

// Admin command to manage settings
async function handleSettings(context, args) {
    const { from, reply } = context;
    const settings = rentalSettings[from];

    if (args.length === 0) {
        let settingsMsg = `⚙️ *RENTAL SETTINGS for this group* ⚙️\n\n`;
        settingsMsg += `• Rent Amount: *${settings.currencySymbol}${settings.rentAmount}*\n`;
        settingsMsg += `• Frequency: *${settings.paymentFrequency}*\n`;
        settingsMsg += `• Due Day: *${settings.dueDay}*\n`;
        settingsMsg += `• Grace Period: *${settings.gracePeriodDays} days*\n`;
        settingsMsg += `• Auto-Evict: *${settings.autoEvict ? 'On' : 'Off'}*\n\n`;
        settingsMsg += `To change a setting, use:\n\`${context.config.PREFIX}rent settings <key> <value>\`\nExample: \`${context.config.PREFIX}rent settings amount 55000\``;
        await reply(settingsMsg);
        return;
    }
    
    const key = args[0].toLowerCase();
    const value = args[1];
    let response = '';

    switch (key) {
        case 'amount':
            const amount = parseInt(value);
            if (!isNaN(amount) && amount > 0) {
                settings.rentAmount = amount;
                response = `✅ Rent amount updated to *${settings.currencySymbol}${amount}*`;
            } else {
                response = `❌ Invalid amount.`;
            }
            break;
        case 'frequency':
            if (['monthly', 'weekly'].includes(value)) {
                settings.paymentFrequency = value;
                response = `✅ Payment frequency set to *${value}*.`;
            } else {
                response = `❌ Invalid frequency. Use 'monthly' or 'weekly'.`;
            }
            break;
        // Add more cases for other settings like 'dueDay', 'gracePeriod', 'autoEvict'
        default:
            response = `❓ Unknown setting. Available keys: amount, frequency.`;
    }

    await saveSettings(from);
    await reply(response);
}

// Admin command to manually evict a tenant
async function handleEvict(context, args) {
    const { from, reply, m, sock } = context;
    const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

    if (!mentionedJid) {
        await reply(`📝 Please mention the tenant to evict.\nExample: *${context.config.PREFIX}rent evict @user*`);
        return;
    }

    try {
        await sock.groupParticipantsUpdate(from, [mentionedJid], "remove");
        await db.collection(COLLECTIONS.TENANTS).deleteOne({ tenantId: mentionedJid, groupId: from });
        await reply(`✅ Tenant @${mentionedJid.split('@')[0]} has been manually evicted.`);
    } catch (e) {
        await reply(`❌ Eviction failed. The bot may not have admin privileges, or the user is the group creator.`);
        console.error('Eviction error:', e);
    }
}

// =======================
// 🔄 PLUGIN LIFECYCLE
// =======================

export async function initPlugin(sock) {
  try {
    console.log('🔧 Initializing Rental plugin...');
    await initDatabase();
    startMonitoring(sock);
    console.log('✅ Rental plugin initialized successfully.');
  } catch (error) {
    console.error('❌ Failed to initialize Rental plugin:', error);
  }
}

export async function cleanupPlugin() {
  try {
    stopMonitoring();
    if (mongoClient) {
      await mongoClient.close();
      mongoClient = null;
      db = null;
    }
    console.log('✅ Rental plugin cleaned up successfully.');
  } catch (error) {
    console.error('❌ Error cleaning up Rental plugin:', error);
  }
}
