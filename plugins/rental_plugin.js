// plugins/rental_plugin.js
import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';

// Plugin information export
export const info = {
  name: 'Rental Simulation',
  version: '1.3.0',
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

// Set Nigeria timezone (Africa/Lagos)
moment.tz.setDefault('Africa/Lagos');

// Default settings for new rental groups
const defaultSettings = {
  rentAmount: 50000,
  paymentFrequency: 'monthly', // 'monthly' or 'weekly'
  dueDay: 5, // For weekly frequency: 1=Monday, 5=Friday, 7=Sunday. Ignored for monthly.
  currencySymbol: '₦',
  gracePeriodDays: 3, // Days after due date before eviction
  reminderDays: [3, 1], // Days before due date to send reminders
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
    rentalSettings[groupId] = settings ? { ...defaultSettings, ...settings.data } : { ...defaultSettings };
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
        let dueDateForCurrentPeriod, periodStart, periodEnd;

        // Determine the current billing cycle
        if (settings.paymentFrequency === 'monthly') {
            dueDateForCurrentPeriod = moment().endOf('month');
            periodStart = moment().startOf('month');
            periodEnd = dueDateForCurrentPeriod;
        } else { // 'weekly'
            periodStart = moment().startOf('isoWeek'); // Monday
            periodEnd = moment().endOf('isoWeek');     // Sunday
            dueDateForCurrentPeriod = moment().isoWeekday(settings.dueDay); // The specified day in the current week
        }

        const hasPaidForCurrentPeriod = tenant.lastPaidDate && moment(tenant.lastPaidDate).isBetween(periodStart, periodEnd, null, '[]');
        
        if (hasPaidForCurrentPeriod) {
            continue; // Paid up, move to next tenant
        }

        // --- NOT PAID FOR CURRENT PERIOD ---
        if (today.isBefore(dueDateForCurrentPeriod, 'day')) {
            // Rent is not due yet, check for reminders
            for (const reminderDay of settings.reminderDays) {
                if (today.isSame(moment(dueDateForCurrentPeriod).subtract(reminderDay, 'days'), 'day')) {
                    const reminderMsg = `👋 Hello Tenant,\n\nJust a friendly reminder that your rent of *${settings.currencySymbol}${settings.rentAmount}* is due in *${reminderDay} day(s)* on *${dueDateForCurrentPeriod.format('dddd, MMM Do')}*.\n\nEnsure your wallet is sufficient!`;
                    await sock.sendMessage(tenant.tenantId, { text: reminderMsg });
                }
            }
        } else { // Rent is due or overdue
            const gracePeriodEnd = moment(dueDateForCurrentPeriod).add(settings.gracePeriodDays, 'days');

            if (tenant.wallet >= settings.rentAmount) {
                // Auto-deduct rent
                const newBalance = tenant.wallet - settings.rentAmount;
                await db.collection(COLLECTIONS.TENANTS).updateOne({ _id: tenant._id }, { $set: { wallet: newBalance, lastPaidDate: new Date() } });
                await db.collection(COLLECTIONS.PAYMENT_HISTORY).insertOne({ tenantId: tenant.tenantId, groupId: group.groupId, amount: settings.rentAmount, date: new Date(), method: 'wallet_auto' });
                const paymentMsg = `✅ Rent Paid!\n\nYour rent of *${settings.currencySymbol}${settings.rentAmount}* for the period ending *${dueDateForCurrentPeriod.format('MMM Do, YYYY')}* has been deducted.\n\nNew balance: *${settings.currencySymbol}${newBalance}*.`;
                await sock.sendMessage(tenant.tenantId, { text: paymentMsg });
            } else {
                // Insufficient funds, handle late payment/eviction
                if (settings.autoEvict && today.isAfter(gracePeriodEnd)) {
                    const evictionMsg = `🚨 EVICTION NOTICE 🚨\n\nTenant *@${tenant.tenantId.split('@')[0]}* has been evicted for failure to pay rent due on *${dueDateForCurrentPeriod.format('MMM Do')}*.`;
                    await sock.sendMessage(group.groupId, { text: evictionMsg, mentions: [tenant.tenantId] });
                    await sock.groupParticipantsUpdate(group.groupId, [tenant.tenantId], "remove");
                    await db.collection(COLLECTIONS.TENANTS).deleteOne({ _id: tenant._id });
                } else {
                    const daysOverdue = today.diff(dueDateForCurrentPeriod, 'days');
                    const warningMsg = `❗️ RENT OVERDUE ❗️\n\nYour rent was due on *${dueDateForCurrentPeriod.format('MMM Do')}* and is now *${daysOverdue} day(s) overdue*.\n\nPlease pay immediately to avoid eviction.`;
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

// Helper function to get current billing period info
function getCurrentBillingPeriod(settings) {
  let dueDateForCurrentPeriod, periodStart, periodEnd;
  
  if (settings.paymentFrequency === 'monthly') {
    dueDateForCurrentPeriod = moment().endOf('month');
    periodStart = moment().startOf('month');
    periodEnd = dueDateForCurrentPeriod;
  } else { // 'weekly'
    periodStart = moment().startOf('isoWeek');
    periodEnd = moment().endOf('isoWeek');
    dueDateForCurrentPeriod = moment().isoWeekday(settings.dueDay);
  }
  
  return { dueDateForCurrentPeriod, periodStart, periodEnd };
}

// Check if user exists in database
async function getTenant(tenantId, groupId) {
  return await db.collection(COLLECTIONS.TENANTS).findOne({ tenantId, groupId });
}

// --- Monitoring, Authorization, and other utility functions ---

let monitoringInterval = null;

function startMonitoring(sock) {
  if (monitoringInterval) clearInterval(monitoringInterval);
  const checkInterval = 24 * 60 * 60 * 1000; // Check daily
  console.log(`🏘️ Starting Rental monitoring (checking daily)`);
  monitoringInterval = setInterval(() => checkRentals(sock), checkInterval);
  setTimeout(() => checkRentals(sock), 10000); // Initial check
}

function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    console.log('🛑 Rental monitoring stopped');
  }
}

async function isAuthorized(sock, from, sender) {
  if (!from.endsWith('@g.us')) return false;
  try {
    const groupMetadata = await sock.groupMetadata(from);
    const groupAdmins = groupMetadata.participants.filter(p => p.admin).map(p => p.id);
    return groupAdmins.includes(sender);
  } catch (error) {
    console.error('Error checking group admin status:', error);
    return false;
  }
}

// Extract mentioned users from message
function extractMentions(message) {
  const mentions = [];
  if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
    mentions.push(...message.message.extendedTextMessage.contextInfo.mentionedJid);
  }
  return mentions;
}

// =======================
// 📋 COMMAND HANDLERS
// =======================

export default async function rentalHandler(m, sock, config) {
  try {
    if (!db) await initDatabase();
    if (m.key.remoteJid && !rentalSettings[m.key.remoteJid]) await loadSettings(m.key.remoteJid);
    if (!m.body || !m.body.startsWith(config.PREFIX)) return;
    
    const args = m.body.slice(config.PREFIX.length).trim().split(' ');
    const command = args[0].toLowerCase();
    if (!['rent', 'rental'].includes(command)) return;
    
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    const reply = async (text, mentions = []) => await sock.sendMessage(from, { text, mentions }, { quoted: m });
    const context = { m, sock, config, senderId, from, reply };

    const subCommand = args[1]?.toLowerCase() || 'help';
    await handleSubCommand(subCommand, args.slice(2), context);
  } catch (error) {
    console.error('❌ Rental plugin error:', error);
  }
}

async function handleSubCommand(subCommand, args, context) {
  const isAdmin = await isAuthorized(context.sock, context.from, context.senderId);
  const adminCommands = ['setup', 'addtenant', 'defaulters', 'settings', 'evict'];
  
  if (adminCommands.includes(subCommand)) {
    if (!isAdmin) return context.reply('🚫 This is an admin-only command.');
    switch (subCommand) {
      case 'setup': await handleSetup(context); break;
      case 'settings': await handleSettings(context, args); break;
      case 'addtenant': await handleAddTenant(context, args); break;
      case 'defaulters': await handleDefaulters(context); break;
      case 'evict': await handleEvict(context, args); break;
      default: await context.reply(`Admin command *${subCommand}* not found.`);
    }
  } else {
    switch (subCommand) {
      case 'help': await showHelpMenu(context.reply, context.config.PREFIX); break;
      case 'pay': await handlePay(context); break;
      case 'wallet': await handleWallet(context, args); break;
      default: await context.reply(`❓ Unknown command. Use *${context.config.PREFIX}rent help* for options.`);
    }
  }
}

async function showHelpMenu(reply, prefix) {
  const menu = `🏘️ *RENTAL SIMULATION MENU* 🏘️\n\n` +
               `*👤 Tenant Commands:*\n` +
               `• *${prefix}rent pay* - Pay your rent from your wallet\n` +
               `• *${prefix}rent wallet* - Check your wallet balance\n\n` +
               `*👑 Admin Commands:*\n` +
               `• *${prefix}rent setup* - Enroll all members as tenants\n` +
               `• *${prefix}rent addtenant @user* - Add a new user\n` +
               `• *${prefix}rent defaulters* - List tenants with overdue rent\n` +
               `• *${prefix}rent evict @user* - Manually evict a tenant\n` +
               `• *${prefix}rent wallet add @user <amount>* - Add funds to tenant's wallet\n` +
               `• *${prefix}rent wallet check @user* - Check user's wallet\n` +
               `• *${prefix}rent settings* - View or change rental settings`;
  await reply(menu);
}

async function handleSetup(context) {
    const { from, reply, sock } = context;
    const existingGroup = await db.collection(COLLECTIONS.RENTAL_GROUPS).findOne({ groupId: from });
    if (existingGroup) return reply('✅ This group is already set up for rental simulation.');

    await reply('⏳ Setting up rental system and enrolling all group members...');
    const groupMetadata = await sock.groupMetadata(from);
    const participants = groupMetadata.participants.map(p => p.id);
    
    const tenantOps = participants.map(id => ({
        updateOne: {
            filter: { tenantId: id, groupId: from },
            update: { $setOnInsert: { tenantId: id, groupId: from, wallet: 0, joinDate: new Date(), lastPaidDate: null } },
            upsert: true
        }
    }));

    let enrolledCount = 0;
    if (tenantOps.length > 0) {
        const result = await db.collection(COLLECTIONS.TENANTS).bulkWrite(tenantOps);
        enrolledCount = result.upsertedCount;
    }

    await db.collection(COLLECTIONS.RENTAL_GROUPS).insertOne({ groupId: from, active: true, createdAt: new Date() });
    await loadSettings(from);
    await saveSettings(from);
    
    await reply(`✅ *Rental Simulation Activated!*\n\nSuccessfully enrolled *${enrolledCount} members* as tenants.\nThe default due date is the end of each month.`);
}

async function handleSettings(context, args) {
    const { from, reply, config } = context;
    const settings = rentalSettings[from];
    const prefix = config.PREFIX;

    if (args.length === 0) {
        const dueDayName = moment().isoWeekday(settings.dueDay).format('dddd');
        let settingsMsg = `⚙️ *RENTAL SETTINGS* ⚙️\n\n` +
                          `• Amount: *${settings.currencySymbol}${settings.rentAmount}*\n` +
                          `• Frequency: *${settings.paymentFrequency}*\n` +
                          `  - Monthly due date: *End of month*\n` +
                          `  - Weekly due day: *${dueDayName}*\n` +
                          `• Grace Period: *${settings.gracePeriodDays} days*\n` +
                          `• Auto-Evict: *${settings.autoEvict ? 'On' : 'Off'}*\n\n` +
                          `*To Change Settings:*\n` +
                          `\`${prefix}rent settings amount <number>\`\n` +
                          `\`${prefix}rent settings frequency monthly\`\n` +
                          `\`${prefix}rent settings frequency weekly <day>\`\n` +
                          `\`${prefix}rent settings grace <days>\`\n` +
                          `\`${prefix}rent settings autoevict on/off\``;
        return reply(settingsMsg);
    }
    
    const key = args[0].toLowerCase();
    const value1 = args[1]?.toLowerCase();
    const value2 = args[2]?.toLowerCase();
    let response = '';

    const dayMap = { 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6, 'sunday': 7 };

    switch (key) {
        case 'amount':
            const amount = parseInt(value1);
            if (!isNaN(amount) && amount > 0) {
                settings.rentAmount = amount;
                response = `✅ Rent amount updated to *${settings.currencySymbol}${amount}*`;
            } else { response = `❌ Invalid amount.`; }
            break;
        case 'frequency':
            if (value1 === 'monthly') {
                settings.paymentFrequency = 'monthly';
                response = `✅ Frequency set to *monthly*. Rent is now due at the end of each month.`;
            } else if (value1 === 'weekly' && value2 && dayMap[value2]) {
                settings.paymentFrequency = 'weekly';
                settings.dueDay = dayMap[value2];
                response = `✅ Frequency set to *weekly*. Rent is now due every *${value2.charAt(0).toUpperCase() + value2.slice(1)}*.`;
            } else {
                response = `❌ Invalid usage. Use:\n\`${prefix}rent settings frequency monthly\`\nOR\n\`${prefix}rent settings frequency weekly <day_name>\``;
            }
            break;
        case 'grace':
            const graceDays = parseInt(value1);
            if (!isNaN(graceDays) && graceDays >= 0) {
                settings.gracePeriodDays = graceDays;
                response = `✅ Grace period updated to *${graceDays} days*`;
            } else { response = `❌ Invalid grace period.`; }
            break;
        case 'autoevict':
            if (value1 === 'on' || value1 === 'off') {
                settings.autoEvict = value1 === 'on';
                response = `✅ Auto-eviction turned *${value1}*`;
            } else { response = `❌ Use 'on' or 'off'`; }
            break;
        default:
            response = `❓ Unknown setting. Available keys: *amount*, *frequency*, *grace*, *autoevict*.`;
    }

    await saveSettings(from);
    await reply(response);
}

async function handleAddTenant(context, args) {
    const { from, reply, m } = context;
    const mentions = extractMentions(m);
    
    if (mentions.length === 0) {
        return reply('❌ Please mention a user to add as tenant.\nUsage: `rent addtenant @user`');
    }
    
    const userId = mentions[0];
    const existingTenant = await getTenant(userId, from);
    
    if (existingTenant) {
        return reply(`❌ @${userId.split('@')[0]} is already a tenant.`, [userId]);
    }
    
    await db.collection(COLLECTIONS.TENANTS).insertOne({
        tenantId: userId,
        groupId: from,
        wallet: 0,
        joinDate: new Date(),
        lastPaidDate: null
    });
    
    await reply(`✅ Successfully added @${userId.split('@')[0]} as a tenant.`, [userId]);
}

async function handleDefaulters(context) {
    const { from, reply } = context;
    const settings = rentalSettings[from];
    const { dueDateForCurrentPeriod, periodStart, periodEnd } = getCurrentBillingPeriod(settings);
    const today = moment();
    
    const tenants = await db.collection(COLLECTIONS.TENANTS).find({ groupId: from }).toArray();
    const defaulters = [];
    
    for (const tenant of tenants) {
        const hasPaidForCurrentPeriod = tenant.lastPaidDate && 
            moment(tenant.lastPaidDate).isBetween(periodStart, periodEnd, null, '[]');
        
        if (!hasPaidForCurrentPeriod && today.isAfter(dueDateForCurrentPeriod, 'day')) {
            const daysOverdue = today.diff(dueDateForCurrentPeriod, 'days');
            const gracePeriodEnd = moment(dueDateForCurrentPeriod).add(settings.gracePeriodDays, 'days');
            const willBeEvicted = settings.autoEvict && today.isAfter(gracePeriodEnd);
            
            defaulters.push({
                id: tenant.tenantId,
                wallet: tenant.wallet,
                daysOverdue,
                willBeEvicted
            });
        }
    }
    
    if (defaulters.length === 0) {
        return reply('✅ No defaulters found! All tenants are up to date with their rent.');
    }
    
    let defaultersMsg = `🚨 *RENT DEFAULTERS* 🚨\n\n`;
    defaultersMsg += `*Due Date:* ${dueDateForCurrentPeriod.format('MMM Do, YYYY')}\n`;
    defaultersMsg += `*Rent Amount:* ${settings.currencySymbol}${settings.rentAmount}\n\n`;
    
    const mentions = [];
    defaulters.forEach((defaulter, index) => {
        const username = defaulter.id.split('@')[0];
        mentions.push(defaulter.id);
        defaultersMsg += `${index + 1}. @${username}\n`;
        defaultersMsg += `   • Wallet: ${settings.currencySymbol}${defaulter.wallet}\n`;
        defaultersMsg += `   • Overdue: ${defaulter.daysOverdue} days\n`;
        if (defaulter.willBeEvicted) {
            defaultersMsg += `   • ⚠️ Will be evicted soon\n`;
        }
        defaultersMsg += `\n`;
    });
    
    defaultersMsg += `*Grace Period:* ${settings.gracePeriodDays} days\n`;
    defaultersMsg += `*Auto-Eviction:* ${settings.autoEvict ? 'Enabled' : 'Disabled'}`;
    
    await reply(defaultersMsg, mentions);
}

async function handleEvict(context, args) {
    const { from, reply, m, sock } = context;
    const mentions = extractMentions(m);
    
    if (mentions.length === 0) {
        return reply('❌ Please mention a user to evict.\nUsage: `rent evict @user`');
    }
    
    const userId = mentions[0];
    const tenant = await getTenant(userId, from);
    
    if (!tenant) {
        return reply(`❌ @${userId.split('@')[0]} is not a tenant in this group.`, [userId]);
    }
    
    // Remove from group
    try {
        await sock.groupParticipantsUpdate(from, [userId], "remove");
        await db.collection(COLLECTIONS.TENANTS).deleteOne({ tenantId: userId, groupId: from });
        
        const evictionMsg = `🚨 *MANUAL EVICTION* 🚨\n\nTenant @${userId.split('@')[0]} has been evicted by admin.`;
        await reply(evictionMsg, [userId]);
    } catch (error) {
        console.error('Error evicting tenant:', error);
        await reply('❌ Failed to evict tenant. Please try again or remove manually.');
    }
}

async function handlePay(context) {
    const { from, reply, senderId } = context;
    const settings = rentalSettings[from];
    const tenant = await getTenant(senderId, from);
    
    if (!tenant) {
        return reply('❌ You are not registered as a tenant in this group.');
    }
    
    if (tenant.wallet < settings.rentAmount) {
        return reply(`❌ Insufficient funds!\n\nRequired: ${settings.currencySymbol}${settings.rentAmount}\nYour balance: ${settings.currencySymbol}${tenant.wallet}\nShortfall: ${settings.currencySymbol}${settings.rentAmount - tenant.wallet}`);
    }
    
    // Check if already paid for current period
    const { periodStart, periodEnd, dueDateForCurrentPeriod } = getCurrentBillingPeriod(settings);
    const hasPaidForCurrentPeriod = tenant.lastPaidDate && 
        moment(tenant.lastPaidDate).isBetween(periodStart, periodEnd, null, '[]');
    
    if (hasPaidForCurrentPeriod) {
        return reply('✅ You have already paid rent for this period.');
    }
    
    // Process payment
    const newBalance = tenant.wallet - settings.rentAmount;
    await db.collection(COLLECTIONS.TENANTS).updateOne(
        { tenantId: senderId, groupId: from },
        { $set: { wallet: newBalance, lastPaidDate: new Date() } }
    );
    
    await db.collection(COLLECTIONS.PAYMENT_HISTORY).insertOne({
        tenantId: senderId,
        groupId: from,
        amount: settings.rentAmount,
        date: new Date(),
        method: 'manual_payment'
    });
    
    const paymentMsg = `✅ *RENT PAID SUCCESSFULLY!* ✅\n\n` +
                      `Amount: ${settings.currencySymbol}${settings.rentAmount}\n` +
                      `Period: ${periodStart.format('MMM Do')} - ${periodEnd.format('MMM Do, YYYY')}\n` +
                      `New balance: ${settings.currencySymbol}${newBalance}`;
    
    await reply(paymentMsg);
}

async function handleWallet(context, args) {
    const { from, reply, senderId, config, m } = context;
    const settings = rentalSettings[from];
    const isAdmin = await isAuthorized(context.sock, from, senderId);
    
    if (args.length === 0) {
        // Check own wallet
        const tenant = await getTenant(senderId, from);
        if (!tenant) {
            return reply('❌ You are not registered as a tenant in this group.');
        }
        
        const walletMsg = `💰 *YOUR WALLET* 💰\n\n` +
                         `Balance: ${settings.currencySymbol}${tenant.wallet}\n` +
                         `Rent Amount: ${settings.currencySymbol}${settings.rentAmount}\n` +
                         `Status: ${tenant.wallet >= settings.rentAmount ? '✅ Sufficient' : '❌ Insufficient'}`;
        
        return reply(walletMsg);
    }
    
    // Admin commands
    if (!isAdmin) {
        return reply('🚫 Only admins can manage other users\' wallets.');
    }
    
    const action = args[0]?.toLowerCase();
    
    if (action === 'add') {
        const mentions = extractMentions(m);
        const amount = parseInt(args[args.length - 1]); // Last argument should be amount
        
        if (mentions.length === 0) {
            return reply('❌ Please mention a user.\nUsage: `rent wallet add @user <amount>`');
        }
        
        if (isNaN(amount) || amount <= 0) {
            return reply('❌ Please provide a valid amount.');
        }
        
        const userId = mentions[0];
        const tenant = await getTenant(userId, from);
        
        if (!tenant) {
            return reply(`❌ @${userId.split('@')[0]} is not a tenant.`, [userId]);
        }
        
        const newBalance = tenant.wallet + amount;
        await db.collection(COLLECTIONS.TENANTS).updateOne(
            { tenantId: userId, groupId: from },
            { $set: { wallet: newBalance } }
        );
        
        await reply(`✅ Added ${settings.currencySymbol}${amount} to @${userId.split('@')[0]}'s wallet.\nNew balance: ${settings.currencySymbol}${newBalance}`, [userId]);
        
    } else if (action === 'check') {
        const mentions = extractMentions(m);
        
        if (mentions.length === 0) {
            return reply('❌ Please mention a user.\nUsage: `rent wallet check @user`');
        }
        
        const userId = mentions[0];
        const tenant = await getTenant(userId, from);
        
        if (!tenant) {
            return reply(`❌ @${userId.split('@')[0]} is not a tenant.`, [userId]);
        }
        
        const walletMsg = `💰 *WALLET INFO* 💰\n\n` +
                         `User: @${userId.split('@')[0]}\n` +
                         `Balance: ${settings.currencySymbol}${tenant.wallet}\n` +
                         `Rent Amount: ${settings.currencySymbol}${settings.rentAmount}\n` +
                         `Status: ${tenant.wallet >= settings.rentAmount ? '✅ Sufficient' : '❌ Insufficient'}`;
        
        await reply(walletMsg, [userId]);
        
    } else {
        await reply(`❌ Unknown wallet action.\nAvailable: *add*, *check*\n\nUsage:\n• \`${config.PREFIX}rent wallet add @user <amount>\`\n• \`${config.PREFIX}rent wallet check @user\``);
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
