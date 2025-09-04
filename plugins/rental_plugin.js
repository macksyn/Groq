import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';
import { unifiedUserManager } from '../lib/pluginIntegration.js';

// Plugin information export
export const info = {
  name: 'Rental Simulation',
  version: '2.1.0',
  author: 'Bot Developer',
  description: 'Enhanced rental simulation with fixed billing cycles, accurate payment tracking, and robust eviction system.',
  commands: [
    {
      name: 'rent',
      aliases: ['rental'],
      description: 'Main command for the rental simulation system.'
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
  PAYMENT_HISTORY: 'payment_history',
  BILLING_CYCLES: 'billing_cycles'
};

// Database connection
let db = null;
let mongoClient = null;

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Default settings
const defaultSettings = {
  rentAmount: 50000,
  paymentFrequency: 'monthly',
  monthlyDueDay: 1,
  weeklyDueDay: 5,
  currencySymbol: '₦',
  gracePeriodDays: 3,
  reminderDays: [7, 3, 1],
  autoEvict: true,
  autoDeduct: true,
  adminOnly: false,
  allowDirectPayment: true,
  lateFeesEnabled: false,
  lateFeeAmount: 5000,
  maxLateFeeDays: 30
};

// Settings cache
let rentalSettings = {};

// Initialize MongoDB
async function initDatabase() {
  if (db) return db;
  
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db(DATABASE_NAME);
    
    await Promise.all([
      db.collection(COLLECTIONS.RENTAL_GROUPS).createIndex({ groupId: 1 }, { unique: true }),
      db.collection(COLLECTIONS.TENANTS).createIndex({ tenantId: 1, groupId: 1 }, { unique: true }),
      db.collection(COLLECTIONS.TENANTS).createIndex({ groupId: 1 }),
      db.collection(COLLECTIONS.PAYMENT_HISTORY).createIndex({ tenantId: 1, groupId: 1 }),
      db.collection(COLLECTIONS.PAYMENT_HISTORY).createIndex({ groupId: 1, date: -1 }),
      db.collection(COLLECTIONS.BILLING_CYCLES).createIndex({ groupId: 1, tenantId: 1, periodStart: 1 }, { unique: true })
    ]);
    
    console.log('✅ MongoDB connected successfully for Rental Plugin v2.1');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    throw error;
  }
}

// Load and cache settings
async function loadSettings(groupId) {
  try {
    const settings = await db.collection(COLLECTIONS.RENTAL_SETTINGS).findOne({ groupId });
    rentalSettings[groupId] = settings ? { ...defaultSettings, ...settings.data } : { ...defaultSettings };
    return rentalSettings[groupId];
  } catch (error) {
    console.error(`Error loading settings for ${groupId}:`, error);
    rentalSettings[groupId] = { ...defaultSettings };
    return rentalSettings[groupId];
  }
}

// Save settings
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

// Fixed Billing Period Calculation
async function calculateTenantBillingPeriod(tenant, groupId, settings) {
  const now = moment();
  let periodStart, periodEnd, dueDate;

  // Use group creation or tenant join date as anchor
  const anchorDate = tenant.joinDate ? moment(tenant.joinDate) : moment();
  const group = await db.collection(COLLECTIONS.RENTAL_GROUPS).findOne({ groupId });
  const baseDate = group.createdAt ? moment(group.createdAt) : anchorDate;

  if (settings.paymentFrequency === 'monthly') {
    // Set due date to the configured day of the current month
    const dueDay = Math.min(settings.monthlyDueDay, now.daysInMonth());
    dueDate = now.clone().startOf('month').date(dueDay).startOf('day');
    periodStart = now.clone().startOf('month').startOf('day');
    periodEnd = dueDate.clone().endOf('day');

    // Check if the current period is paid
    const hasPaid = await db.collection(COLLECTIONS.BILLING_CYCLES).findOne({
      tenantId: tenant.tenantId,
      groupId,
      periodStart: periodStart.toDate(),
      paid: true
    });

    // If current period is paid and today is on/after due date, advance to next period
    if (hasPaid && now.isSameOrAfter(dueDate, 'day')) {
      dueDate = now.clone().add(1, 'month').startOf('month').date(dueDay).startOf('day');
      periodStart = now.clone().startOf('month').add(1, 'month').startOf('day');
      periodEnd = dueDate.clone().endOf('day');
    }
  } else {
    // Weekly billing (unchanged for brevity)
    const weekStart = now.clone().startOf('isoWeek');
    dueDate = weekStart.clone().isoWeekday(settings.weeklyDueDay).startOf('day');
    periodStart = weekStart.clone().startOf('day');
    periodEnd = dueDate.clone().endOf('day');

    const hasPaid = await db.collection(COLLECTIONS.BILLING_CYCLES).findOne({
      tenantId: tenant.tenantId,
      groupId,
      periodStart: periodStart.toDate(),
      paid: true
    });

    if (hasPaid && now.isSameOrAfter(dueDate, 'day')) {
      dueDate = weekStart.clone().add(1, 'week').isoWeekday(settings.weeklyDueDay).startOf('day');
      periodStart = weekStart.clone().add(1, 'week').startOf('day');
      periodEnd = dueDate.clone().endOf('day');
    }
  }

  // Check if the period exists in billing_cycles, create if not
  const cycle = await db.collection(COLLECTIONS.BILLING_CYCLES).findOne({
    tenantId: tenant.tenantId,
    groupId,
    periodStart: periodStart.toDate()
  });

  if (!cycle) {
    await db.collection(COLLECTIONS.BILLING_CYCLES).insertOne({
      tenantId: tenant.tenantId,
      groupId,
      periodStart: periodStart.toDate(),
      periodEnd: periodEnd.toDate(),
      dueDate: dueDate.toDate(),
      paid: false,
      amountDue: settings.rentAmount,
      createdAt: new Date()
    });
  }

  return {
    periodStart,
    periodEnd,
    dueDate,
    isOverdue: now.isAfter(dueDate, 'day'),
    daysUntilDue: dueDate.diff(now, 'days') > 0 ? dueDate.diff(now, 'days') : 0,
    daysOverdue: now.isAfter(dueDate, 'day') ? now.diff(dueDate, 'days') : 0
  };
}

// Check if tenant has paid for current or any overdue period
async function hasPaidCurrentPeriod(tenantId, groupId, billingInfo) {
  const payment = await db.collection(COLLECTIONS.PAYMENT_HISTORY).findOne({
    tenantId,
    groupId,
    periodStart: billingInfo.periodStart.toDate()
  });

  if (payment) {
    // Mark billing cycle as paid (if not already)
    await db.collection(COLLECTIONS.BILLING_CYCLES).updateOne(
      { tenantId, groupId, periodStart: billingInfo.periodStart.toDate() },
      { $set: { paid: true, paidDate: payment.date } }
    );
    return true;
  }
  return false;
}

// Check for any unpaid periods
async function getUnpaidPeriods(tenantId, groupId, settings) {
  const now = moment();
  const cycles = await db.collection(COLLECTIONS.BILLING_CYCLES).find({
    tenantId,
    groupId,
    paid: false,
    dueDate: { $lte: now.toDate() }
  }).sort({ periodStart: 1 }).toArray();

  return cycles.map(cycle => ({
    periodStart: moment(cycle.periodStart),
    periodEnd: moment(cycle.periodEnd),
    dueDate: moment(cycle.dueDate),
    isOverdue: now.isAfter(moment(cycle.dueDate), 'day'),
    daysOverdue: now.isAfter(moment(cycle.dueDate), 'day') ? now.diff(moment(cycle.dueDate), 'days') : 0
  }));
}

// Monitoring System
async function checkRentals(sock) {
  try {
    const startTime = Date.now();
    const groups = await db.collection(COLLECTIONS.RENTAL_GROUPS).find({ active: true }).toArray();
    
    if (groups.length === 0) {
      console.log('📭 No active rental groups found');
      return;
    }

    console.log(`🔍 Checking rent status for ${groups.length} groups...`);
    let totalProcessed = 0;
    let totalEvicted = 0;
    let totalAutoDeducted = 0;

    for (const group of groups) {
      try {
        const settings = await loadSettings(group.groupId);
        const tenants = await db.collection(COLLECTIONS.TENANTS).find({ groupId: group.groupId }).toArray();
        console.log(`🏘️ Processing ${tenants.length} tenants in group ${group.groupId}`);

        for (const tenant of tenants) {
          totalProcessed++;
          const billingInfo = await calculateTenantBillingPeriod(tenant, group.groupId, settings);
          const unpaidPeriods = await getUnpaidPeriods(tenant.tenantId, group.groupId, settings);

          // Handle current period
          const hasPaidCurrent = await hasPaidCurrentPeriod(tenant.tenantId, group.groupId, billingInfo);

          if (!hasPaidCurrent && !billingInfo.isOverdue) {
            await handleRentReminders(sock, tenant, group, settings, billingInfo);
          } else if (unpaidPeriods.length > 0) {
            // Handle overdue periods
            const autoDeducted = await handleOverdueRent(sock, tenant, group, settings, unpaidPeriods[0]);
            if (autoDeducted) totalAutoDeducted++;
            const stillUnpaid = (await getUnpaidPeriods(tenant.tenantId, group.groupId, settings)).length > 0;
            if (settings.autoEvict && stillUnpaid) {
              const evicted = await handleEvictionCheck(sock, tenant, group, settings, unpaidPeriods[0]);
              if (evicted) totalEvicted++;
            }
          }
        }
      } catch (groupError) {
        console.error(`❌ Error processing group ${group.groupId}:`, groupError);
      }
    }

    const processingTime = Date.now() - startTime;
    console.log(`✅ Rent check completed: ${totalProcessed} tenants processed, ${totalAutoDeducted} auto-deducted, ${totalEvicted} evicted (${processingTime}ms)`);
    
  } catch (error) {
    console.error('❌ Critical error in checkRentals:', error);
  }
}

async function handleRentReminders(sock, tenant, group, settings, billingInfo) {
  const daysUntilDue = billingInfo.daysUntilDue;
  
  for (const reminderDay of settings.reminderDays) {
    if (daysUntilDue === reminderDay) {
      const reminderMsg = `🔔 *RENT REMINDER* 🔔\n\n` +
                         `Your rent of *${settings.currencySymbol}${settings.rentAmount.toLocaleString()}* is due in *${reminderDay} day(s)*!\n\n` +
                         `📅 Due Date: *${billingInfo.dueDate.format('dddd, MMM Do, YYYY')}*\n` +
                         `💰 Your Rent Wallet: *${settings.currencySymbol}${tenant.wallet.toLocaleString()}*\n` +
                         `📊 Status: ${tenant.wallet >= settings.rentAmount ? '✅ Ready!' : '❌ Insufficient funds'}\n\n` +
                         `${tenant.wallet < settings.rentAmount ? `💡 Transfer funds: \`rent wallet transfer ${settings.rentAmount - tenant.wallet}\`` : '✨ You\'re all set!'}`;
      
      await sock.sendMessage(tenant.tenantId, { text: reminderMsg });
      console.log(`📬 Sent ${reminderDay}-day reminder to ${tenant.tenantId.split('@')[0]}`);
      break;
    }
  }
}

async function handleOverdueRent(sock, tenant, group, settings, billingInfo) {
  if (settings.autoDeduct && tenant.wallet >= settings.rentAmount) {
    await processRentPayment(tenant, group, settings, billingInfo, 'auto_deduct');
    
    const paymentMsg = `✅ *RENT AUTO-DEDUCTED* ✅\n\n` +
                      `Amount: *${settings.currencySymbol}${settings.rentAmount.toLocaleString()}*\n` +
                      `Period: ${billingInfo.periodStart.format('MMM Do')} - ${billingInfo.dueDate.format('MMM Do, YYYY')}\n` +
                      `New Balance: *${settings.currencySymbol}${(tenant.wallet - settings.rentAmount).toLocaleString()}*\n\n` +
                      `✨ Thank you for your payment!`;
    
    await sock.sendMessage(tenant.tenantId, { text: paymentMsg });
    console.log(`💳 Auto-deducted rent from ${tenant.tenantId.split('@')[0]}`);
    return true;
  } else {
    const lateNoticeMsg = `🚨 *RENT OVERDUE* 🚨\n\n` +
                         `Your rent was due on *${billingInfo.dueDate.format('MMM Do, YYYY')}* and is now *${billingInfo.daysOverdue} day(s) overdue*!\n\n` +
                         `💰 Amount Due: *${settings.currencySymbol}${settings.rentAmount.toLocaleString()}*\n` +
                         `💳 Your Wallet: *${settings.currencySymbol}${tenant.wallet.toLocaleString()}*\n` +
                         `📉 Shortfall: *${settings.currencySymbol}${Math.max(0, settings.rentAmount - tenant.wallet).toLocaleString()}*\n\n` +
                         `⚠️ Grace Period: ${settings.gracePeriodDays} days\n` +
                         `🚪 Eviction in: ${Math.max(0, settings.gracePeriodDays - billingInfo.daysOverdue)} days\n\n` +
                         `💡 Pay now to avoid eviction!`;
    
    await sock.sendMessage(tenant.tenantId, { text: lateNoticeMsg });
    console.log(`⚠️ Sent overdue notice to ${tenant.tenantId.split('@')[0]} (${billingInfo.daysOverdue} days late)`);
    return false;
  }
}

async function handleEvictionCheck(sock, tenant, group, settings, billingInfo) {
  const gracePeriodEnd = billingInfo.dueDate.clone().add(settings.gracePeriodDays, 'days').endOf('day');
  const today = moment();
  
  // Double-check payment status
  const hasPaid = await hasPaidCurrentPeriod(tenant.tenantId, group.groupId, billingInfo);
  if (hasPaid) {
    console.log(`✅ ${tenant.tenantId.split('@')[0]} paid, skipping eviction`);
    return false;
  }

  if (today.isAfter(gracePeriodEnd)) {
    try {
      await sock.groupParticipantsUpdate(group.groupId, [tenant.tenantId], "remove");
      await db.collection(COLLECTIONS.TENANTS).deleteOne({ 
        tenantId: tenant.tenantId, 
        groupId: group.groupId 
      });
      await db.collection(COLLECTIONS.PAYMENT_HISTORY).insertOne({
        tenantId: tenant.tenantId,
        groupId: group.groupId,
        amount: 0,
        date: new Date(),
        method: 'eviction',
        reason: `Evicted after ${billingInfo.daysOverdue} days overdue (grace period: ${settings.gracePeriodDays} days)`
      });
      const evictionMsg = `🚨 *TENANT EVICTED* 🚨\n\n` +
                         `@${tenant.tenantId.split('@')[0]} has been removed for non-payment.\n\n` +
                         `📅 Rent was due: ${billingInfo.dueDate.format('MMM Do, YYYY')}\n` +
                         `⏰ Days overdue: ${billingInfo.daysOverdue}\n` +
                         `💰 Amount owed: ${settings.currencySymbol}${settings.rentAmount.toLocaleString()}`;
      
      await sock.sendMessage(group.groupId, { text: evictionMsg, mentions: [tenant.tenantId] });
      console.log(`🚪 Evicted ${tenant.tenantId.split('@')[0]} from group ${group.groupId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to evict ${tenant.tenantId}:`, error);
      return false;
    }
  }
  
  return false;
}

async function processRentPayment(tenant, group, settings, billingInfo, method = 'manual') {
  const newBalance = tenant.wallet - settings.rentAmount;
  const paymentDate = new Date();
  
  await db.collection(COLLECTIONS.TENANTS).updateOne(
    { tenantId: tenant.tenantId, groupId: group.groupId },
    { 
      $set: { 
        wallet: newBalance, 
        lastPaidDate: paymentDate
      },
      $inc: { totalPaid: settings.rentAmount, paymentCount: 1 }
    }
  );
  
  await db.collection(COLLECTIONS.PAYMENT_HISTORY).insertOne({
    tenantId: tenant.tenantId,
    groupId: group.groupId,
    amount: settings.rentAmount,
    date: paymentDate,
    method,
    periodStart: billingInfo.periodStart.toDate(),
    periodEnd: billingInfo.dueDate.toDate(),
    daysLate: billingInfo.daysOverdue || 0
  });
  
  await db.collection(COLLECTIONS.BILLING_CYCLES).updateOne(
    { tenantId: tenant.tenantId, groupId: group.groupId, periodStart: billingInfo.periodStart.toDate() },
    { $set: { paid: true, paidDate: paymentDate } }
  );
  
  return { newBalance, paymentDate };
}

// Wallet transfer
async function transferToRentWallet(userId, amount, groupId, reason = 'Transfer to rent wallet') {
  try {
    const tenant = await db.collection(COLLECTIONS.TENANTS).findOne({ tenantId: userId, groupId });
    if (!tenant) return { success: false, error: 'tenant_not_found' };
    
    const economyData = await getUserEconomyData(userId);
    if (economyData.balance < amount) {
      return { success: false, error: 'insufficient_funds', economyBalance: economyData.balance, required: amount };
    }
    
    const deductSuccess = await unifiedUserManager.removeMoney(userId, amount, reason);
    if (!deductSuccess) return { success: false, error: 'economy_deduct_failed' };
    
    const updateResult = await db.collection(COLLECTIONS.TENANTS).updateOne(
      { tenantId: userId, groupId },
      { $inc: { wallet: amount } }
    );
    
    if (updateResult.matchedCount === 0) {
      await unifiedUserManager.addMoney(userId, amount, 'Refund - rental transfer failed');
      return { success: false, error: 'rental_update_failed' };
    }
    
    const finalEconomyData = await getUserEconomyData(userId);
    const finalTenant = await db.collection(COLLECTIONS.TENANTS).findOne({ tenantId: userId, groupId });
    
    return { 
      success: true, 
      newEconomyBalance: finalEconomyData.balance,
      newRentWallet: finalTenant.wallet,
      transferAmount: amount
    };
  } catch (error) {
    console.error('❌ Transfer error:', error);
    return { success: false, error: 'system_error' };
  }
}

async function getUserEconomyData(userId) {
  try {
    return await unifiedUserManager.getUserData(userId);
  } catch (error) {
    console.error('Error getting user economy data:', error);
    return { balance: 0 };
  }
}

async function initEconomyUser(userId) {
  try {
    return await unifiedUserManager.initUser(userId);
  } catch (error) {
    console.error('Error initializing economy user:', error);
    throw error;
  }
}

// Monitoring control
let monitoringInterval = null;

function startMonitoring(sock) {
  if (monitoringInterval) clearInterval(monitoringInterval);
  
  const checkInterval = 6 * 60 * 60 * 1000;
  console.log(`🏘️ Starting rental monitoring (6-hour intervals)`);
  
  monitoringInterval = setInterval(() => checkRentals(sock), checkInterval);
  setTimeout(() => checkRentals(sock), 30000);
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
    console.error('Error checking admin status:', error);
    return false;
  }
}

function extractMentions(message) {
  const mentions = [];
  if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
    mentions.push(...message.message.extendedTextMessage.contextInfo.mentionedJid);
  }
  return mentions;
}

// Command Handler
export default async function rentalHandler(m, sock, config) {
  try {
    if (!db) await initDatabase();
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
    try {
      await sock.sendMessage(m.key.remoteJid, { text: '❌ An error occurred. Please try again later.' }, { quoted: m });
    } catch (e) {
      console.error('Failed to send error message:', e);
    }
  }
}

async function handleSubCommand(subCommand, args, context) {
  const { from, senderId } = context;
  const isAdmin = await isAuthorized(context.sock, from, senderId);
  const settings = await loadSettings(from);
  
  const rentalGroup = await db.collection(COLLECTIONS.RENTAL_GROUPS).findOne({ groupId: from });
  const needsSetup = ['setup', 'help'].includes(subCommand);
  
  if (!rentalGroup && !needsSetup) {
    return context.reply('❌ Rental system not set up in this group. Admin should use `rent setup` first.');
  }
  
  const adminCommands = ['setup', 'addtenant', 'defaulters', 'evict', 'disable', 'stats'];
  if (adminCommands.includes(subCommand) && settings.adminOnly && !isAdmin) {
    return context.reply('🚫 This is an admin-only command.');
  }
  
  switch (subCommand) {
    case 'help': await showHelpMenu(context); break;
    case 'setup': await handleSetup(context); break;
    case 'pay': await handlePay(context); break;
    case 'wallet': await handleWallet(context, args); break;
    case 'status': await handleStatus(context); break;
    case 'settings': await handleSettings(context, args); break;
    case 'addtenant': await handleAddTenant(context, args); break;
    case 'defaulters': await handleDefaulters(context); break;
    case 'evict': await handleEvict(context, args); break;
    case 'disable': await handleDisable(context); break;
    case 'stats': await handleStats(context); break;
    default: 
      await context.reply(`❓ Unknown command '*${subCommand}*'. Use \`rent help\` for available options.`);
  }
}

async function showHelpMenu(context) {
  const { reply, config } = context;
  const prefix = config.PREFIX;
  
  const menu = `🏘️ *RENTAL SIMULATION v2.1* 🏘️\n\n` +
               `*👤 Tenant Commands:*\n` +
               `• \`${prefix}rent status\` - Check your rent status\n` +
               `• \`${prefix}rent pay\` - Pay rent manually\n` +
               `• \`${prefix}rent wallet\` - View wallet balances\n` +
               `• \`${prefix}rent wallet transfer <amount>\` - Move money to rent wallet\n\n` +
               `*👑 Admin Commands:*\n` +
               `• \`${prefix}rent setup\` - Initialize rental system\n` +
               `• \`${prefix}rent addtenant @user\` - Add new tenant\n` +
               `• \`${prefix}rent defaulters\` - List overdue tenants\n` +
               `• \`${prefix}rent evict @user\` - Manual eviction\n` +
               `• \`${prefix}rent settings\` - Configure system\n` +
               `• \`${prefix}rent stats\` - View group statistics\n` +
               `• \`${prefix}rent disable\` - Disable rental system\n\n` +
               `✨ *Features:* Fixed billing cycles, Auto-deduction, Smart reminders, Robust eviction`;
  
  await reply(menu);
}

async function handleSetup(context) {
  const { from, reply, sock } = context;
  
  const existingGroup = await db.collection(COLLECTIONS.RENTAL_GROUPS).findOne({ groupId: from });
  if (existingGroup) {
    return reply('✅ Rental system is already active in this group.\n\n💡 Use `rent settings` to modify configuration or `rent disable` to turn off.');
  }

  await reply('⏳ *Setting up rental system...*\n\nEnrolling all group members as tenants...');
  
  try {
    const groupMetadata = await sock.groupMetadata(from);
    const participants = groupMetadata.participants.map(p => p.id);
    
    console.log(`📋 Setting up rental for ${participants.length} participants`);
    
    const economyPromises = participants.map(id => initEconomyUser(id).catch(e => console.log(`Economy init failed for ${id}:`, e)));
    await Promise.all(economyPromises);
    
    const tenantInserts = participants.map(id => ({
      tenantId: id,
      groupId: from,
      wallet: 0,
      joinDate: new Date(),
      lastPaidDate: null,
      totalPaid: 0,
      paymentCount: 0
    }));
    
    const tenantOps = tenantInserts.map(tenant => ({
      updateOne: {
        filter: { tenantId: tenant.tenantId, groupId: from },
        update: { $setOnInsert: tenant },
        upsert: true
      }
    }));
    
    const bulkResult = await db.collection(COLLECTIONS.TENANTS).bulkWrite(tenantOps);
    
    await db.collection(COLLECTIONS.RENTAL_GROUPS).insertOne({ 
      groupId: from, 
      active: true, 
      createdAt: new Date(),
      tenantCount: participants.length
    });
    
    // Initialize billing cycles for tenants
    const now = moment();
    const settings = await loadSettings(from);
    const billingInfo = await calculateTenantBillingPeriod({ joinDate: new Date() }, from, settings);
    
    const cycleInserts = participants.map(id => ({
      tenantId: id,
      groupId: from,
      periodStart: billingInfo.periodStart.toDate(),
      periodEnd: billingInfo.periodEnd.toDate(),
      dueDate: billingInfo.dueDate.toDate(),
      paid: false,
      amountDue: settings.rentAmount,
      createdAt: new Date()
    }));
    
    await db.collection(COLLECTIONS.BILLING_CYCLES).insertMany(cycleInserts);
    await saveSettings(from);
    
    const totalTenants = await db.collection(COLLECTIONS.TENANTS).countDocuments({ groupId: from });
    const setupMsg = `✅ *RENTAL SYSTEM ACTIVATED!* ✅\n\n` +
                    `👥 *Tenants Enrolled:* ${totalTenants}\n` +
                    `💰 *Monthly Rent:* ${settings.currencySymbol}${settings.rentAmount.toLocaleString()}\n` +
                    `📅 *Next Due Date:* ${billingInfo.dueDate.format('MMM Do, YYYY')}\n` +
                    `⏰ *Grace Period:* ${settings.gracePeriodDays} days\n` +
                    `🔄 *Auto-deduction:* ${settings.autoDeduct ? 'Enabled' : 'Disabled'}\n\n` +
                    `💡 Tenants can now transfer money from their economy wallets to pay rent!`;
    
    await reply(setupMsg);
    console.log(`✅ Rental setup complete for group ${from} with ${totalTenants} tenants`);
    
  } catch (error) {
    console.error('❌ Setup error:', error);
    await reply('❌ Setup failed. Please try again or contact support.');
  }
}

async function handleStatus(context) {
  const { from, reply, senderId } = context;
  const settings = rentalSettings[from];
  const tenant = await db.collection(COLLECTIONS.TENANTS).findOne({ 
    tenantId: senderId, 
    groupId: from 
  });
  
  if (!tenant) {
    return reply('❌ You are not registered as a tenant in this group.');
  }
  
  // Get the earliest unpaid period, or current period if none unpaid
  const unpaidPeriods = await getUnpaidPeriods(senderId, from, settings);
  let billingInfo;
  if (unpaidPeriods.length > 0) {
    billingInfo = unpaidPeriods[0]; // Use earliest unpaid period
  } else {
    billingInfo = await calculateTenantBillingPeriod(tenant, from, settings);
  }
  
  const hasPaid = await hasPaidCurrentPeriod(senderId, from, billingInfo);
  await initEconomyUser(senderId);
  const economyData = await getUserEconomyData(senderId);
  
  let statusEmoji, statusText, actionText = '';
  
  if (hasPaid) {
    statusEmoji = '✅';
    statusText = 'PAID';
    actionText = 'You\'re all set for this period!';
  } else if (!billingInfo.isOverdue) {
    statusEmoji = '⏳';
    statusText = 'PENDING';
    actionText = `Due in ${billingInfo.daysUntilDue} day(s)`;
  } else {
    statusEmoji = '🚨';
    statusText = `OVERDUE (${unpaidPeriods.length} period${unpaidPeriods.length > 1 ? 's' : ''})`;
    actionText = `${unpaidPeriods.length > 0 ? unpaidPeriods[0].daysOverdue : billingInfo.daysOverdue} day(s) late!`;
  }
  
  const statusMsg = `📊 *YOUR RENT STATUS* 📊\n\n` +
                   `${statusEmoji} *Status:* ${statusText}\n` +
                   `📅 *Current Period:* ${billingInfo.periodStart.format('MMM Do')} - ${billingInfo.dueDate.format('MMM Do, YYYY')}\n` +
                   `💰 *Rent Amount:* ${settings.currencySymbol}${settings.rentAmount.toLocaleString()}\n` +
                   `⏰ *${actionText}*\n\n` +
                   `💳 *WALLET BALANCES:*\n` +
                   `🏦 Economy: ${settings.currencySymbol}${economyData.balance?.toLocaleString() || 0}\n` +
                   `🏠 Rent: ${settings.currencySymbol}${tenant.wallet.toLocaleString()}\n\n` +
                   `${!hasPaid && tenant.wallet < settings.rentAmount ? 
                     `⚠️ *Insufficient rent funds!*\n💡 Transfer: \`rent wallet transfer ${settings.rentAmount - tenant.wallet}\`` :
                     !hasPaid ? `✅ *Ready to pay!*\n💡 Pay now: \`rent pay\`` : 
                     '🎉 *Thank you for your payment!*'}`;
  
  await reply(statusMsg);
}

async function handlePay(context) {
  const { from, reply, senderId } = context;
  const settings = rentalSettings[from];
  const tenant = await db.collection(COLLECTIONS.TENANTS).findOne({ 
    tenantId: senderId, 
    groupId: from 
  });
  
  if (!tenant) {
    return reply('❌ You are not registered as a tenant in this group.');
  }
  
  const unpaidPeriods = await getUnpaidPeriods(senderId, from, settings);
  if (unpaidPeriods.length === 0) {
    const billingInfo = await calculateTenantBillingPeriod(tenant, from, settings);
    if (!billingInfo.isOverdue) {
      return reply(`✅ No payment due yet!\n\n📅 Next Due: ${billingInfo.dueDate.format('MMM Do, YYYY')}`);
    }
  }
  
  const billingInfo = unpaidPeriods[0] || await calculateTenantBillingPeriod(tenant, from, settings);
  const hasPaid = await hasPaidCurrentPeriod(senderId, from, billingInfo);
  
  if (hasPaid) {
    return reply(`✅ You have already paid rent for this period!\n\n📅 Period: ${billingInfo.periodStart.format('MMM Do')} - ${billingInfo.dueDate.format('MMM Do, YYYY')}`);
  }
  
  if (tenant.wallet < settings.rentAmount) {
    const shortfall = settings.rentAmount - tenant.wallet;
    return reply(`❌ *Insufficient Rent Wallet Funds!*\n\n` +
                `💰 Required: ${settings.currencySymbol}${settings.rentAmount.toLocaleString()}\n` +
                `💳 Your Balance: ${settings.currencySymbol}${tenant.wallet.toLocaleString()}\n` +
                `📉 Shortfall: ${settings.currencySymbol}${shortfall.toLocaleString()}\n\n` +
                `💡 Transfer funds: \`rent wallet transfer ${shortfall}\``);
  }
  
  const paymentResult = await processRentPayment(tenant, { groupId: from }, settings, billingInfo, 'manual');
  
  const paymentMsg = `✅ *RENT PAYMENT SUCCESSFUL!* ✅\n\n` +
                    `💰 Amount Paid: ${settings.currencySymbol}${settings.rentAmount.toLocaleString()}\n` +
                    `📅 Period: ${billingInfo.periodStart.format('MMM Do')} - ${billingInfo.dueDate.format('MMM Do, YYYY')}\n` +
                    `💳 New Rent Wallet: ${settings.currencySymbol}${paymentResult.newBalance.toLocaleString()}\n` +
                    `📊 Payment Date: ${moment().format('MMM Do, YYYY h:mm A')}\n\n` +
                    `🎉 Thank you for your prompt payment!`;
  
  await reply(paymentMsg);
}

async function handleWallet(context, args) {
  const { from, reply, senderId, config, m } = context;
  const settings = rentalSettings[from];
  const isAdmin = await isAuthorized(context.sock, from, senderId);
  
  if (args.length === 0) {
    const tenant = await db.collection(COLLECTIONS.TENANTS).findOne({ tenantId: senderId, groupId: from });
    if (!tenant) return reply('❌ You are not registered as a tenant in this group.');
    
    await initEconomyUser(senderId);
    const economyData = await getUserEconomyData(senderId);
    const billingInfo = await calculateTenantBillingPeriod(tenant, from, settings);
    
    const walletMsg = `💰 *YOUR WALLET OVERVIEW* 💰\n\n` +
                     `🏦 *Economy Wallet:* ${settings.currencySymbol}${economyData.balance?.toLocaleString() || 0}\n` +
                     `🏠 *Rent Wallet:* ${settings.currencySymbol}${tenant.wallet.toLocaleString()}\n` +
                     `💵 *Total Available:* ${settings.currencySymbol}${((economyData.balance || 0) + tenant.wallet).toLocaleString()}\n\n` +
                     `📋 *RENT INFORMATION:*\n` +
                     `• Next Due: ${billingInfo.dueDate.format('MMM Do, YYYY')}\n` +
                     `• Amount: ${settings.currencySymbol}${settings.rentAmount.toLocaleString()}\n` +
                     `• Status: ${tenant.wallet >= settings.rentAmount ? '✅ Ready' : '❌ Insufficient'}\n\n` +
                     `💡 *Quick Actions:*\n` +
                     `${tenant.wallet < settings.rentAmount ? 
                       `• Transfer: \`${config.PREFIX}rent wallet transfer ${settings.rentAmount - tenant.wallet}\`` : 
                       `• Pay Rent: \`${config.PREFIX}rent pay\``}\n` +
                     `• Check Status: \`${config.PREFIX}rent status\``;
    
    return reply(walletMsg);
  }
  
  const action = args[0]?.toLowerCase();
  if (action === 'transfer') {
    await handleWalletTransfer(context, args.slice(1));
  } else if (action === 'add' && isAdmin) {
    await handleWalletAdd(context, args.slice(1));
  } else if (action === 'check' && isAdmin) {
    await handleWalletCheck(context, args.slice(1));
  } else {
    const helpMsg = `💰 *WALLET COMMANDS* 💰\n\n` +
                   `*All Users:*\n` +
                   `• \`${config.PREFIX}rent wallet\` - View your wallets\n` +
                   `• \`${config.PREFIX}rent wallet transfer <amount>\` - Transfer funds\n\n` +
                   `${isAdmin ? `*Admin Only:*\n• \`${config.PREFIX}rent wallet add @user <amount>\`\n• \`${config.PREFIX}rent wallet check @user\`\n\n` : ''}` +
                   `💡 The rent wallet is separate from your economy wallet for better tracking.`;
    
    await reply(helpMsg);
  }
}

async function handleWalletTransfer(context, args) {
  const { from, reply, senderId, config } = context;
  const settings = rentalSettings[from];
  
  const amount = parseInt(args[0]);
  if (isNaN(amount) || amount <= 0) {
    return reply(`❌ Please provide a valid amount.\n\n*Usage:* \`${config.PREFIX}rent wallet transfer <amount>\`\n*Example:* \`${config.PREFIX}rent wallet transfer 50000\``);
  }
  
  const tenant = await db.collection(COLLECTIONS.TENANTS).findOne({ tenantId: senderId, groupId: from });
  if (!tenant) return reply('❌ You are not registered as a tenant in this group.');
  
  await initEconomyUser(senderId);
  const transferResult = await transferToRentWallet(senderId, amount, from, 'Manual transfer to rent wallet');
  
  if (!transferResult.success) {
    let errorMsg = '❌ Transfer failed: ';
    switch (transferResult.error) {
      case 'insufficient_funds':
        errorMsg = `❌ *Insufficient Economy Wallet Funds!*\n\n` +
                  `💰 Your Balance: ${settings.currencySymbol}${transferResult.economyBalance?.toLocaleString() || 0}\n` +
                  `💸 Amount Needed: ${settings.currencySymbol}${amount.toLocaleString()}\n` +
                  `📉 Shortfall: ${settings.currencySymbol}${(amount - (transferResult.economyBalance || 0)).toLocaleString()}\n\n` +
                  `💡 Earn more money through group activities!`;
        break;
      case 'tenant_not_found':
        errorMsg += 'You are not registered as a tenant.';
        break;
      default:
        errorMsg += 'System error. Please try again.';
    }
    return reply(errorMsg);
  }
  
  const successMsg = `✅ *TRANSFER SUCCESSFUL!* ✅\n\n` +
                    `💸 *Transferred:* ${settings.currencySymbol}${amount.toLocaleString()}\n\n` +
                    `💰 *Updated Balances:*\n` +
                    `🏦 Economy: ${settings.currencySymbol}${transferResult.newEconomyBalance.toLocaleString()}\n` +
                    `🏠 Rent: ${settings.currencySymbol}${transferResult.newRentWallet.toLocaleString()}\n\n` +
                    `📊 *Rent Status:* ${transferResult.newRentWallet >= settings.rentAmount ? '✅ Ready to pay!' : `❌ Need ${settings.currencySymbol}${(settings.rentAmount - transferResult.newRentWallet).toLocaleString()} more`}`;
  
  await reply(successMsg);
}

async function handleWalletAdd(context, args) {
  const { from, reply, m } = context;
  const settings = rentalSettings[from];
  const mentions = extractMentions(m);
  const amount = parseInt(args[args.length - 1]);
  
  if (mentions.length === 0 || isNaN(amount) || amount <= 0) {
    return reply('❌ *Invalid Usage*\n\n*Format:* `rent wallet add @user <amount>`\n*Example:* `rent wallet add @john 25000`');
  }
  
  const userId = mentions[0];
  const tenant = await db.collection(COLLECTIONS.TENANTS).findOne({ tenantId: userId, groupId: from });
  if (!tenant) return reply(`❌ @${userId.split('@')[0]} is not a tenant in this group.`, [userId]);
  
  const newBalance = tenant.wallet + amount;
  await db.collection(COLLECTIONS.TENANTS).updateOne(
    { tenantId: userId, groupId: from },
    { $set: { wallet: newBalance } }
  );
  
  await db.collection(COLLECTIONS.PAYMENT_HISTORY).insertOne({
    tenantId: userId,
    groupId: from,
    amount: amount,
    date: new Date(),
    method: 'admin_credit',
    reason: 'Admin wallet addition'
  });
  
  const addMsg = `✅ *WALLET CREDIT SUCCESSFUL!* ✅\n\n` +
                `👤 Tenant: @${userId.split('@')[0]}\n` +
                `💰 Amount Added: ${settings.currencySymbol}${amount.toLocaleString()}\n` +
                `💳 New Balance: ${settings.currencySymbol}${newBalance.toLocaleString()}\n` +
                `📊 Rent Status: ${newBalance >= settings.rentAmount ? '✅ Sufficient' : '❌ Still insufficient'}`;
  
  await reply(addMsg, [userId]);
}

async function handleWalletCheck(context, args) {
  const { from, reply, m } = context;
  const settings = rentalSettings[from];
  const mentions = extractMentions(m);
  
  if (mentions.length === 0) return reply('❌ Please mention a user to check.\n\n*Usage:* `rent wallet check @user`');
  
  const userId = mentions[0];
  const tenant = await db.collection(COLLECTIONS.TENANTS).findOne({ tenantId: userId, groupId: from });
  if (!tenant) return reply(`❌ @${userId.split('@')[0]} is not a tenant.`, [userId]);
  
  await initEconomyUser(userId);
  const economyData = await getUserEconomyData(userId);
  const billingInfo = await calculateTenantBillingPeriod(tenant, from, settings);
  const hasPaid = await hasPaidCurrentPeriod(userId, from, billingInfo);
  
  const recentPayments = await db.collection(COLLECTIONS.PAYMENT_HISTORY)
    .find({ tenantId: userId, groupId: from })
    .sort({ date: -1 })
    .limit(3)
    .toArray();
  
  let paymentHistory = '';
  if (recentPayments.length > 0) {
    paymentHistory = '\n\n📜 *Recent Payments:*\n';
    recentPayments.forEach((payment, index) => {
      paymentHistory += `${index + 1}. ${moment(payment.date).format('MMM Do')}: ${settings.currencySymbol}${payment.amount.toLocaleString()} (${payment.method})\n`;
    });
  }
  
  const checkMsg = `💰 *TENANT WALLET DETAILS* 💰\n\n` +
                  `👤 *Tenant:* @${userId.split('@')[0]}\n` +
                  `📅 *Join Date:* ${moment(tenant.joinDate).format('MMM Do, YYYY')}\n\n` +
                  `💳 *CURRENT BALANCES:*\n` +
                  `🏦 Economy: ${settings.currencySymbol}${economyData.balance?.toLocaleString() || 0}\n` +
                  `🏠 Rent: ${settings.currencySymbol}${tenant.wallet.toLocaleString()}\n\n` +
                  `📊 *RENT STATUS:*\n` +
                  `• Period: ${billingInfo.periodStart.format('MMM Do')} - ${billingInfo.dueDate.format('MMM Do, YYYY')}\n` +
                  `• Amount Due: ${settings.currencySymbol}${settings.rentAmount.toLocaleString()}\n` +
                  `• Status: ${hasPaid ? '✅ PAID' : billingInfo.isOverdue ? '🚨 OVERDUE' : '⏳ PENDING'}\n` +
                  `• Total Payments: ${tenant.paymentCount || 0}${paymentHistory}`;
  
  await reply(checkMsg, [userId]);
}

async function handleDefaulters(context) {
  const { from, reply, sock } = context; 
  const settings = rentalSettings[from];

  let groupMetadata;
  try {
    groupMetadata = await sock.groupMetadata(from);
  } catch (e) {
    console.error("Could not fetch group metadata for defaulters list:", e);
    return reply("❌ Could not fetch group member details. Please try again.");
  }
  
  const tenants = await db.collection(COLLECTIONS.TENANTS).find({ groupId: from }).toArray();
  console.log(`🔍 Checking ${tenants.length} tenants for defaulters in group ${from}`);
  
  const defaulters = [];
  const checkPromises = tenants.map(async (tenant) => {
    const unpaidPeriods = await getUnpaidPeriods(tenant.tenantId, from, settings);
    if (unpaidPeriods.length > 0) {
      const billingInfo = unpaidPeriods[0];
      const gracePeriodEnd = billingInfo.dueDate.clone().add(settings.gracePeriodDays, 'days');
      const willBeEvicted = settings.autoEvict && moment().isAfter(gracePeriodEnd, 'day');
      
      defaulters.push({
        tenant,
        daysOverdue: billingInfo.daysOverdue,
        willBeEvicted,
        canPayNow: tenant.wallet >= settings.rentAmount
      });
    }
  });
  
  await Promise.all(checkPromises);
  
  console.log(`📊 Found ${defaulters.length} defaulters out of ${tenants.length} tenants`);
  
  if (defaulters.length === 0) {
    const billingInfo = await calculateTenantBillingPeriod({ joinDate: new Date() }, from, settings);
    const statusMsg = `✅ *NO DEFAULTERS FOUND!* ✅\n\n` +
                     `All ${tenants.length} tenants are up to date with their rent.\n\n` +
                     `📅 *Current Period:* ${billingInfo.periodStart.format('MMM Do')} - ${billingInfo.dueDate.format('MMM Do, YYYY')}\n` +
                     `💰 *Rent Amount:* ${settings.currencySymbol}${settings.rentAmount.toLocaleString()}\n` +
                     `📊 *Status:* ${billingInfo.isOverdue ? 'Overdue but all paid!' : 'Not due yet'}\n\n` +
                     `🎉 Excellent payment compliance!`;
    
    return reply(statusMsg);
  }
  
  defaulters.sort((a, b) => b.daysOverdue - a.daysOverdue);
  
  const billingInfo = await calculateTenantBillingPeriod({ joinDate: new Date() }, from, settings);
  let defaultersMsg = `🚨 *RENT DEFAULTERS* (${defaulters.length}) 🚨\n\n` +
                     `📅 *Example Due Date:* ${billingInfo.dueDate.format('MMM Do, YYYY')}\n` +
                     `💰 *Amount:* ${settings.currencySymbol}${settings.rentAmount.toLocaleString()}\n\n`;
  
  const mentions = [];
  defaulters.forEach((defaulter, index) => {
    mentions.push(defaulter.tenant.tenantId);
    const participant = groupMetadata.participants.find(p => p.id === defaulter.tenant.tenantId);
    const username = participant?.pushname || participant?.name || `User (${defaulter.tenant.tenantId.split('@')[0]})`;
    const userMention = `@${defaulter.tenant.tenantId.split('@')[0]}`;
    
    defaultersMsg += `${index + 1}. *${username}* (${userMention})\n`;
    defaultersMsg += `   💳 Wallet: ${settings.currencySymbol}${defaulter.tenant.wallet.toLocaleString()}\n`;
    defaultersMsg += `   📊 Status: ${defaulter.canPayNow ? '✅ Can pay now' : '❌ Insufficient funds'}\n`;
    
    if (defaulter.willBeEvicted) {
      defaultersMsg += `   🚪 ⚠️ *WILL BE EVICTED SOON*\n`;
    } else {
      const daysLeft = Math.max(0, settings.gracePeriodDays - defaulter.daysOverdue);
      defaultersMsg += `   ⏳ Grace period: ${daysLeft} days left\n`;
    }
    defaultersMsg += `\n`;
  });
  
  defaultersMsg += `⚙️ *Settings:*\n` +
                  `• Grace Period: ${settings.gracePeriodDays} days\n` +
                  `• Auto-Eviction: ${settings.autoEvict ? 'ON' : 'OFF'}\n` +
                  `• Auto-Deduction: ${settings.autoDeduct ? 'ON' : 'OFF'}`;
  
  await reply(defaultersMsg, mentions);
}

async function handleSettings(context, args) {
  const { from, reply, config } = context;
  const settings = rentalSettings[from];
  
  if (args.length === 0) {
    const billingInfo = await calculateTenantBillingPeriod({ joinDate: new Date() }, from, settings);
    const settingsMsg = `⚙️ *RENTAL SYSTEM SETTINGS* ⚙️\n\n` +
                       `💰 *Rent Amount:* ${settings.currencySymbol}${settings.rentAmount.toLocaleString()}\n` +
                       `📅 *Frequency:* ${settings.paymentFrequency}\n` +
                       `📆 *Due Day:* ${settings.paymentFrequency === 'monthly' ? 
                         `${settings.monthlyDueDay}${getOrdinalSuffix(settings.monthlyDueDay)} of each month` :
                         moment().isoWeekday(settings.weeklyDueDay).format('dddd')}\n` +
                       `📅 *Next Due:* ${billingInfo.dueDate.format('MMM Do, YYYY')}\n` +
                       `⏰ *Grace Period:* ${settings.gracePeriodDays} days\n` +
                       `🔔 *Reminders:* ${settings.reminderDays.join(', ')} days before\n` +
                       `🔄 *Auto-deduct:* ${settings.autoDeduct ? 'ON' : 'OFF'}\n` +
                       `🚪 *Auto-evict:* ${settings.autoEvict ? 'ON' : 'OFF'}\n` +
                       `👑 *Admin Only:* ${settings.adminOnly ? 'ON' : 'OFF'}\n\n` +
                       `*🛠️ Configuration Commands:*\n` +
                       `• \`${config.PREFIX}rent settings amount <number>\`\n` +
                       `• \`${config.PREFIX}rent settings frequency monthly <day>\`\n` +
                       `• \`${config.PREFIX}rent settings frequency weekly <day_name>\`\n` +
                       `• \`${config.PREFIX}rent settings grace <days>\`\n` +
                       `• \`${config.PREFIX}rent settings autoevict on/off\`\n` +
                       `• \`${config.PREFIX}rent settings autodeduct on/off\``;
    
    return reply(settingsMsg);
  }
  
  const key = args[0]?.toLowerCase();
  const value1 = args[1]?.toLowerCase();
  const value2 = args[2]?.toLowerCase();
  
  let response = '';
  let settingsChanged = false;
  
  const dayMap = { 
    'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 
    'friday': 5, 'saturday': 6, 'sunday': 7 
  };
  
  switch (key) {
    case 'amount':
      const amount = parseInt(value1);
      if (!isNaN(amount) && amount > 0 && amount <= 10000000) {
        settings.rentAmount = amount;
        response = `✅ Rent amount updated to *${settings.currencySymbol}${amount.toLocaleString()}*`;
        settingsChanged = true;
      } else {
        response = `❌ Invalid amount. Must be between 1 and 10,000,000.`;
      }
      break;
      
    case 'frequency':
      if (value1 === 'monthly') {
        const day = parseInt(value2) || 1;
        if (day >= 1 && day <= 28) {
          settings.paymentFrequency = 'monthly';
          settings.monthlyDueDay = day;
          response = `✅ Frequency set to *monthly* on the *${day}${getOrdinalSuffix(day)}* of each month.`;
          settingsChanged = true;
        } else {
          response = `❌ Monthly due day must be between 1-28.\n*Usage:* \`${config.PREFIX}rent settings frequency monthly <day>\``;
        }
      } else if (value1 === 'weekly' && value2 && dayMap[value2]) {
        settings.paymentFrequency = 'weekly';
        settings.weeklyDueDay = dayMap[value2];
        response = `✅ Frequency set to *weekly* every *${value2.charAt(0).toUpperCase() + value2.slice(1)}*.`;
        settingsChanged = true;
      } else {
        response = `❌ Invalid frequency setting.\n\n*Valid Options:*\n• \`${config.PREFIX}rent settings frequency monthly <1-28>\`\n• \`${config.PREFIX}rent settings frequency weekly <day_name>\``;
      }
      break;
      
    case 'grace':
      const graceDays = parseInt(value1);
      if (!isNaN(graceDays) && graceDays >= 0 && graceDays <= 30) {
        settings.gracePeriodDays = graceDays;
        response = `✅ Grace period updated to *${graceDays} day(s)*`;
        settingsChanged = true;
      } else {
        response = `❌ Grace period must be between 0-30 days.`;
      }
      break;
      
    case 'autoevict':
      if (['on', 'off'].includes(value1)) {
        settings.autoEvict = value1 === 'on';
        response = `✅ Auto-eviction *${value1.toUpperCase()}*`;
        settingsChanged = true;
      } else {
        response = `❌ Use 'on' or 'off' for auto-eviction.`;
      }
      break;
      
    case 'autodeduct':
      if (['on', 'off'].includes(value1)) {
        settings.autoDeduct = value1 === 'on';
        response = `✅ Auto-deduction *${value1.toUpperCase()}*`;
        settingsChanged = true;
      } else {
        response = `❌ Use 'on' or 'off' for auto-deduction.`;
      }
      break;
      
    default:
      response = `❓ Unknown setting '*${key}*'.\n\n*Available Settings:*\n• amount, frequency, grace, autoevict, autodeduct\n\n*Help:* \`${config.PREFIX}rent settings\``;
  }
  
  if (settingsChanged) {
    await saveSettings(from);
    const billingInfo = await calculateTenantBillingPeriod({ joinDate: new Date() }, from, settings);
    response += `\n\n📅 *Next due date:* ${billingInfo.dueDate.format('MMM Do, YYYY')}`;
  }
  
  await reply(response);
}

async function handleAddTenant(context, args) {
  const { from, reply, m } = context;
  const settings = rentalSettings[from];
  const mentions = extractMentions(m);
  
  if (mentions.length === 0) return reply('❌ Please mention a user to add as tenant.\n\n*Usage:* `rent addtenant @user`');
  
  const userId = mentions[0];
  const existingTenant = await db.collection(COLLECTIONS.TENANTS).findOne({ tenantId: userId, groupId: from });
  if (existingTenant) return reply(`❌ @${userId.split('@')[0]} is already a tenant in this group.`, [userId]);
  
  await initEconomyUser(userId);
  
  const joinDate = new Date();
  const billingInfo = await calculateTenantBillingPeriod({ joinDate }, from, settings);
  
  await db.collection(COLLECTIONS.TENANTS).insertOne({
    tenantId: userId,
    groupId: from,
    wallet: 0,
    joinDate,
    lastPaidDate: null,
    totalPaid: 0,
    paymentCount: 0
  });
  
  await db.collection(COLLECTIONS.BILLING_CYCLES).insertOne({
    tenantId: userId,
    groupId: from,
    periodStart: billingInfo.periodStart.toDate(),
    periodEnd: billingInfo.periodEnd.toDate(),
    dueDate: billingInfo.dueDate.toDate(),
    paid: false,
    amountDue: settings.rentAmount,
    createdAt: new Date()
  });
  
  await db.collection(COLLECTIONS.RENTAL_GROUPS).updateOne(
    { groupId: from },
    { $inc: { tenantCount: 1 } }
  );
  
  const addMsg = `✅ *TENANT ADDED SUCCESSFULLY!* ✅\n\n` +
                `👤 New Tenant: @${userId.split('@')[0]}\n` +
                `🏠 Rent Wallet: ${settings.currencySymbol}0\n` +
                `💰 Monthly Rent: ${settings.currencySymbol}${settings.rentAmount.toLocaleString()}\n` +
                `📅 Next Due: ${billingInfo.dueDate.format('MMM Do, YYYY')}\n\n` +
                `💡 They can now transfer funds and participate in the rental system!`;
  
  await reply(addMsg, [userId]);
}

async function handleEvict(context, args) {
  const { from, reply, m, sock } = context;
  const mentions = extractMentions(m);
  
  if (mentions.length === 0) return reply('❌ Please mention a user to evict.\n\n*Usage:* `rent evict @user`');
  
  const userId = mentions[0];
  const tenant = await db.collection(COLLECTIONS.TENANTS).findOne({ tenantId: userId, groupId: from });
  if (!tenant) return reply(`❌ @${userId.split('@')[0]} is not a tenant in this group.`, [userId]);
  
  try {
    await sock.groupParticipantsUpdate(from, [userId], "remove");
    await db.collection(COLLECTIONS.TENANTS).deleteOne({ tenantId: userId, groupId: from });
    await db.collection(COLLECTIONS.PAYMENT_HISTORY).insertOne({
      tenantId: userId,
      groupId: from,
      amount: 0,
      date: new Date(),
      method: 'manual_eviction',
      reason: 'Manual eviction by admin'
    });
    await db.collection(COLLECTIONS.RENTAL_GROUPS).updateOne(
      { groupId: from },
      { $inc: { tenantCount: -1 } }
    );
    
    const evictionMsg = `🚨 *MANUAL EVICTION EXECUTED* 🚨\n\n` +
                       `@${userId.split('@')[0]} has been removed from the rental system.\n\n` +
                       `📅 Eviction Date: ${moment().format('MMM Do, YYYY h:mm A')}\n` +
                       `👑 Evicted By: Admin\n` +
                       `💰 Final Wallet Balance: ${settings.currencySymbol}${tenant.wallet.toLocaleString()}`;
    
    await reply(evictionMsg, [userId]);
    console.log(`🚪 Manually evicted ${userId.split('@')[0]} from group ${from}`);
    
  } catch (error) {
    console.error('❌ Eviction error:', error);
    await reply('❌ Failed to evict tenant. They may have already left the group or an error occurred.');
  }
}

async function handleDisable(context) {
  const { from, reply } = context;
  
  try {
    await db.collection(COLLECTIONS.RENTAL_GROUPS).updateOne(
      { groupId: from },
      { $set: { active: false, disabledAt: new Date() } }
    );
    
    const tenantCount = await db.collection(COLLECTIONS.TENANTS).countDocuments({ groupId: from });
    const totalPayments = await db.collection(COLLECTIONS.PAYMENT_HISTORY).countDocuments({ 
      groupId: from,
      method: { $ne: 'eviction' }
    });
    
    const disableMsg = `🛑 *RENTAL SYSTEM DISABLED* 🛑\n\n` +
                      `The rental simulation has been deactivated for this group.\n\n` +
                      `📊 *Final Statistics:*\n` +
                      `• Total Tenants: ${tenantCount}\n` +
                      `• Total Payments: ${totalPayments}\n` +
                      `• Disabled: ${moment().format('MMM Do, YYYY h:mm A')}\n\n` +
                      `💡 Use \`rent setup\` to reactivate anytime.`;
    
    await reply(disableMsg);
    console.log(`🛑 Disabled rental system for group ${from}`);
    
  } catch (error) {
    console.error('❌ Disable error:', error);
    await reply('❌ Failed to disable rental system. Please try again.');
  }
}

async function handleStats(context) {
  const { from, reply, sock } = context;
  const settings = rentalSettings[from];
  
  try {
    const [
      tenantCount,
      totalPayments,
      totalRevenue,
      evictionCount,
      recentPayments
    ] = await Promise.all([
      db.collection(COLLECTIONS.TENANTS).countDocuments({ groupId: from }),
      db.collection(COLLECTIONS.PAYMENT_HISTORY).countDocuments({ 
        groupId: from,
        method: { $ne: 'eviction' }
      }),
      db.collection(COLLECTIONS.PAYMENT_HISTORY).aggregate([
        { $match: { groupId: from, method: { $ne: 'eviction' } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).toArray(),
      db.collection(COLLECTIONS.PAYMENT_HISTORY).countDocuments({ 
        groupId: from,
        method: { $in: ['eviction', 'manual_eviction'] }
      }),
      db.collection(COLLECTIONS.PAYMENT_HISTORY).find({ 
        groupId: from,
        method: { $ne: 'eviction' }
      }).sort({ date: -1 }).limit(5).toArray()
    ]);
    
    const billingInfo = await calculateTenantBillingPeriod({ joinDate: new Date() }, from, settings);
    const revenue = totalRevenue[0]?.total || 0;
    
    const currentPeriodPayments = await db.collection(COLLECTIONS.PAYMENT_HISTORY).countDocuments({
      groupId: from,
      periodStart: billingInfo.periodStart.toDate(),
      method: { $ne: 'eviction' }
    });
    
    const paymentRate = tenantCount > 0 ? Math.round((currentPeriodPayments / tenantCount) * 100) : 0;
    
    let recentPaymentsText = '';
    const mentions = [];
    if (recentPayments.length > 0) {
      recentPaymentsText = '\n\n📜 *Recent Payments:*\n';
      recentPayments.forEach((payment, index) => {
        const userMention = `@${payment.tenantId.split('@')[0]}`;
        mentions.push(payment.tenantId);
        recentPaymentsText += `${index + 1}. ${userMention}: ${settings.currencySymbol}${payment.amount.toLocaleString()} (${moment(payment.date).format('MMM Do')})\n`;
      });
    }
    
    const statsMsg = `📊 *RENTAL SYSTEM STATISTICS* 📊\n\n` +
                    `🏘️ *Group Overview:*\n` +
                    `• Active Tenants: ${tenantCount}\n` +
                    `• Total Payments: ${totalPayments}\n` +
                    `• Total Revenue: ${settings.currencySymbol}${revenue.toLocaleString()}\n` +
                    `• Evictions: ${evictionCount}\n\n` +
                    `📅 *Current Period:* ${billingInfo.periodStart.format('MMM Do')} - ${billingInfo.dueDate.format('MMM Do')}\n` +
                    `💰 *Period Revenue Target:* ${settings.currencySymbol}${(tenantCount * settings.rentAmount).toLocaleString()}\n` +
                    `📊 *Payment Rate:* ${paymentRate}% (${currentPeriodPayments}/${tenantCount})\n` +
                    `⏰ *Days ${billingInfo.isOverdue ? 'Overdue' : 'Until Due'}:* ${billingInfo.isOverdue ? billingInfo.daysOverdue : billingInfo.daysUntilDue}\n\n` +
                    `⚙️ *System Settings:*\n` +
                    `• Auto-deduct: ${settings.autoDeduct ? '✅' : '❌'}\n` +
                    `• Auto-evict: ${settings.autoEvict ? '✅' : '❌'}\n` +
                    `• Grace Period: ${settings.gracePeriodDays} days${recentPaymentsText}`;
    
    await reply(statsMsg, mentions);
    
  } catch (error) {
    console.error('❌ Stats error:', error);
    await reply('❌ Failed to generate statistics. Please try again.');
  }
}

function getOrdinalSuffix(num) {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

export async function initPlugin(sock) {
  try {
    console.log('🔧 Initializing Rental Plugin v2.1...');
    await initDatabase();
    
    const groups = await db.collection(COLLECTIONS.RENTAL_GROUPS).find({ active: true }).toArray();
    for (const group of groups) {
      await loadSettings(group.groupId);
    }
    
    startMonitoring(sock);
    console.log(`✅ Rental Plugin v2.1 initialized successfully with ${groups.length} active groups.`);
  } catch (error) {
    console.error('❌ Failed to initialize Rental Plugin v2.1:', error);
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
    rentalSettings = {};
    console.log('✅ Rental Plugin v2.1 cleaned up successfully.');
  } catch (error) {
    console.error('❌ Error cleaning up Rental Plugin v2.1:', error);
  }
}
