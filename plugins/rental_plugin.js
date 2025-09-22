// plugins/rental_plugin.js - COMPLETELY REWRITTEN FOR EFFICIENCY & REALISM
import moment from 'moment-timezone';
import cron from 'node-cron';
import { PluginHelpers } from '../lib/pluginIntegration.js';

// Plugin information export
export const info = {
  name: 'Rental Simulation',
  version: '2.0.0',
  author: 'Bot Developer',
  description: 'Advanced rental simulation with realistic billing cycles, automatic payments, and smart eviction system.',
  commands: [
    {
      name: 'rent',
      aliases: ['rental'],
      description: 'Main command for the rental simulation system.'
    }
  ]
};

const COLLECTIONS = {
  RENTAL_GROUPS: 'rental_groups',
  TENANTS: 'tenants',
  RENTAL_SETTINGS: 'rental_settings',
  PAYMENT_HISTORY: 'payment_history',
  BILLING_CYCLES: 'billing_cycles'
};
// Database reference
let db = null;

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Improved default settings
const defaultSettings = {
  rentAmount: 50000,
  paymentFrequency: 'monthly', // 'monthly' or 'weekly'
  monthlyDueDay: 1, // Day of month (1-28) for monthly rent
  weeklyDueDay: 5, // Day of week (1=Mon, 7=Sun) for weekly rent
  currencySymbol: '₦',
  gracePeriodDays: 3,
  reminderDays: [7, 3, 1], // More realistic reminder schedule
  autoEvict: true,
  autoDeduct: true, // Auto-deduct from wallet on due date
  adminOnly: false, // Allow all tenants to use commands
  allowDirectPayment: true,
  lateFeesEnabled: false,
  lateFeeAmount: 5000,
  maxLateFeeDays: 30
};

// Settings cache
let rentalSettings = {};

// Initialize MongoDB with proper error handling
async function initDatabase() {
  if (db) return db;
  try {
    db = await PluginHelpers.getDatabase();
    await PluginHelpers.safeDBOperation(async (db) => {
      await db.collection(COLLECTIONS.RENTAL_GROUPS).createIndex({ groupId: 1 }, { unique: true });
      await db.collection(COLLECTIONS.TENANTS).createIndex({ tenantId: 1, groupId: 1 }, { unique: true });
      await db.collection(COLLECTIONS.TENANTS).createIndex({ groupId: 1 });
      await db.collection(COLLECTIONS.PAYMENT_HISTORY).createIndex({ tenantId: 1, groupId: 1 });
      await db.collection(COLLECTIONS.PAYMENT_HISTORY).createIndex({ groupId: 1, date: -1 });
      await db.collection(COLLECTIONS.BILLING_CYCLES).createIndex({ groupId: 1, tenantId: 1, periodStart: 1 }, { unique: true });
    });
    console.log('✅ MongoDB pooled connection for Rental Plugin');
    return db;
  } catch (error) {
    console.error('❌ MongoDB pooled connection failed for Rental Plugin:', error);
    throw error;
  }
}

// Load and cache settings
async function loadSettings(groupId) {
  try {
    const collection = await PluginHelpers.getCollection(COLLECTIONS.RENTAL_SETTINGS);
    const settings = await collection.findOne({ groupId });
    rentalSettings[groupId] = settings ? { ...defaultSettings, ...settings.data } : { ...defaultSettings };
    return rentalSettings[groupId];
  } catch (error) {
    console.error(`Error loading settings for ${groupId}:`, error);
    rentalSettings[groupId] = { ...defaultSettings };
    return rentalSettings[groupId];
  }
}

// Save settings efficiently
async function saveSettings(groupId) {
  try {
    await PluginHelpers.safeDBOperation(async (db, collection) => {
      await collection.replaceOne(
        { groupId },
        { groupId, data: rentalSettings[groupId], updatedAt: new Date() },
        { upsert: true }
      );
    }, COLLECTIONS.RENTAL_SETTINGS);
  } catch (error) {
    console.error(`Error saving settings for ${groupId}:`, error);
  }
}

// =======================
// 📅 IMPROVED BILLING LOGIC
// =======================

function calculateCurrentBillingPeriod(settings) {
  const now = moment();
  let periodStart, periodEnd, dueDate;
  
  if (settings.paymentFrequency === 'monthly') {
    // Monthly billing: rent due on specific day each month
    const currentMonth = now.clone().startOf('month');
    const dueDay = Math.min(settings.monthlyDueDay, currentMonth.daysInMonth());
    
    dueDate = currentMonth.clone().date(dueDay);
    
    // If due date has passed this month, next period starts now
    if (now.isAfter(dueDate, 'day')) {
      periodStart = dueDate.clone().add(1, 'day');
      const nextMonth = now.clone().add(1, 'month').startOf('month');
      const nextDueDay = Math.min(settings.monthlyDueDay, nextMonth.daysInMonth());
      periodEnd = nextMonth.clone().date(nextDueDay);
      dueDate = periodEnd.clone();
    } else {
      // Current period
      periodStart = currentMonth.clone().date(dueDay).subtract(1, 'month').add(1, 'day');
      periodEnd = dueDate.clone();
    }
  } else {
    // Weekly billing
    const startOfWeek = now.clone().startOf('isoWeek'); // Monday
    dueDate = startOfWeek.clone().isoWeekday(settings.weeklyDueDay);
    
    if (now.isAfter(dueDate, 'day')) {
      // Next week's period
      periodStart = dueDate.clone().add(1, 'day');
      periodEnd = startOfWeek.clone().add(1, 'week').isoWeekday(settings.weeklyDueDay);
      dueDate = periodEnd.clone();
    } else {
      // Current week's period
      periodStart = startOfWeek.clone().subtract(1, 'week').isoWeekday(settings.weeklyDueDay).add(1, 'day');
      periodEnd = dueDate.clone();
    }
  }
  
  return { 
    periodStart: periodStart.startOf('day'), 
    periodEnd: periodEnd.endOf('day'), 
    dueDate: dueDate.endOf('day'),
    isOverdue: now.isAfter(dueDate, 'day'),
    daysUntilDue: dueDate.diff(now, 'days'),
    daysOverdue: now.isAfter(dueDate, 'day') ? now.diff(dueDate, 'days') : 0
  };
}

// Check if tenant has paid for current period
async function hasPaidCurrentPeriod(tenantId, groupId, billingInfo) {
  const collection = await PluginHelpers.getCollection(COLLECTIONS.PAYMENT_HISTORY);
  const payment = await collection.findOne({
    tenantId,
    groupId,
    date: { 
      $gte: billingInfo.periodStart.toDate(), 
      $lte: billingInfo.periodEnd.toDate() 
    }
  });
  return !!payment;
}

// =======================
// 🔄 ENHANCED MONITORING SYSTEM
// =======================

async function checkRentals(sock) {
  try {
    const startTime = Date.now();
  const collection = await PluginHelpers.getCollection(COLLECTIONS.RENTAL_GROUPS);
  const groups = await collection.find({ active: true }).toArray();
    
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
        const billingInfo = calculateCurrentBillingPeriod(settings);
        const today = moment();

        console.log(`🏘️ Processing ${tenants.length} tenants in group ${group.groupId}`);
        console.log(`📅 Current billing period: ${billingInfo.periodStart.format('MMM Do')} - ${billingInfo.dueDate.format('MMM Do, YYYY')}`);

        for (const tenant of tenants) {
          totalProcessed++;
          const hasPaid = await hasPaidCurrentPeriod(tenant.tenantId, group.groupId, billingInfo);
          // Skip if already paid for current period
          if (hasPaid) {
            console.log(`✅ ${tenant.tenantId.split('@')[0]} has paid for current period`);
            continue;
          }
          // Handle different scenarios based on due date
          if (!billingInfo.isOverdue) {
            // Rent not due yet - send reminders
            await handleRentReminders(sock, tenant, group, settings, billingInfo);
          } else {
            // Rent is overdue
            await handleOverdueRent(sock, tenant, group, settings, billingInfo);
            // Granular warning: grace period expiring soon
            if (settings.autoEvict) {
              const gracePeriodEnd = billingInfo.dueDate.clone().add(settings.gracePeriodDays, 'days');
              const today = moment();
              const daysLeft = gracePeriodEnd.diff(today, 'days');
              if (daysLeft === 1) {
                const warningMsg = `⚠️ *FINAL WARNING* ⚠️\n\nYour rent is overdue and the grace period expires in *1 day*!\n\nPay now to avoid eviction from the group.\n\nDue Date: ${billingInfo.dueDate.format('MMM Do, YYYY')}\nGrace Period Ends: ${gracePeriodEnd.format('MMM Do, YYYY')}`;
                await sock.sendMessage(tenant.tenantId, { text: warningMsg });
                console.log(`⚠️ Sent final warning to ${tenant.tenantId.split('@')[0]}`);
              }
              const evicted = await handleEvictionCheck(sock, tenant, group, settings, billingInfo);
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
    // Auto-deduct rent
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
    // Send overdue notice
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
  const gracePeriodEnd = billingInfo.dueDate.clone().add(settings.gracePeriodDays, 'days');
  const today = moment();
  
  if (today.isAfter(gracePeriodEnd, 'day')) {
    try {
      // Remove from group
      await sock.groupParticipantsUpdate(group.groupId, [tenant.tenantId], "remove");
      
      // Remove from database
      const tenantsCollection = await PluginHelpers.getCollection(COLLECTIONS.TENANTS);
      await tenantsCollection.deleteOne({ 
        tenantId: tenant.tenantId, 
        groupId: group.groupId 
      });
      // Log eviction
      const paymentCollection = await PluginHelpers.getCollection(COLLECTIONS.PAYMENT_HISTORY);
      await paymentCollection.insertOne({
        tenantId: tenant.tenantId,
        groupId: group.groupId,
        amount: 0,
        date: new Date(),
        method: 'eviction',
        reason: `Evicted after ${billingInfo.daysOverdue} days overdue (grace period: ${settings.gracePeriodDays} days)`
      });
      
      // Notify group
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

// Process rent payment with proper tracking
async function processRentPayment(tenant, group, settings, billingInfo, method = 'manual') {
  const newBalance = tenant.wallet - settings.rentAmount;
  const paymentDate = new Date();
  
  // Update tenant wallet and last payment
  const tenantsCollection = await PluginHelpers.getCollection(COLLECTIONS.TENANTS);
  await tenantsCollection.updateOne(
    { tenantId: tenant.tenantId, groupId: group.groupId },
    { 
      $set: { 
        wallet: newBalance, 
        lastPaidDate: paymentDate,
        lastPaymentPeriod: billingInfo.periodStart.toISOString()
      } 
    }
  );
  // Record payment history
  const paymentCollection = await PluginHelpers.getCollection(COLLECTIONS.PAYMENT_HISTORY);
  await paymentCollection.insertOne({
    tenantId: tenant.tenantId,
    groupId: group.groupId,
    amount: settings.rentAmount,
    date: paymentDate,
    method: method,
    periodStart: billingInfo.periodStart.toDate(),
    periodEnd: billingInfo.dueDate.toDate(),
    daysLate: billingInfo.daysOverdue || 0
  });
  
  return { newBalance, paymentDate };
}

// Enhanced wallet transfer with better error handling
async function transferToRentWallet(userId, amount, groupId, reason = 'Transfer to rent wallet') {
  try {
    console.log(`💰 Transfer request: ${userId} → ${amount} in group ${groupId}`);
    
    // Validate tenant exists
    const tenantsCollection = await PluginHelpers.getCollection(COLLECTIONS.TENANTS);
    const tenant = await tenantsCollection.findOne({ 
      tenantId: userId, 
      groupId: groupId 
    });
    
    if (!tenant) {
      console.log(`❌ Tenant not found: ${userId} in group ${groupId}`);
      return { success: false, error: 'tenant_not_found' };
    }
    
    // Get economy balance
    const economyData = await getUserEconomyData(userId);
    if (economyData.balance < amount) {
      return { 
        success: false, 
        error: 'insufficient_funds', 
        economyBalance: economyData.balance,
        required: amount
      };
    }
    
    // Start transaction-like operations
    const deductSuccess = await unifiedUserManager.removeMoney(userId, amount, reason);
    if (!deductSuccess) {
      return { success: false, error: 'economy_deduct_failed' };
    }
    
    // Update rental wallet
    const updateResult = await tenantsCollection.updateOne(
      { tenantId: userId, groupId: groupId },
      { $inc: { wallet: amount } }
    );
    
    if (updateResult.matchedCount === 0) {
      // Refund economy wallet
      await unifiedUserManager.addMoney(userId, amount, 'Refund - rental transfer failed');
      return { success: false, error: 'rental_update_failed' };
    }
    
    // Get final balances
    const finalEconomyData = await getUserEconomyData(userId);
    const finalTenant = await tenantsCollection.findOne({ 
      tenantId: userId, 
      groupId: groupId 
    });
    
    console.log(`✅ Transfer successful: Economy: ${finalEconomyData.balance}, Rent: ${finalTenant.wallet}`);
    
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

// Economy integration helpers
async function getUserEconomyData(userId) {
  try {
    return await PluginHelpers.getUserData(userId);
  } catch (error) {
    console.error('Error getting user economy data:', error);
    return { balance: 0 };
  }
}

async function initEconomyUser(userId) {
  try {
    return await PluginHelpers.initUser(userId);
  } catch (error) {
    console.error('Error initializing economy user:', error);
    throw error;
  }
}

// =======================
// 🛠️ UTILITY FUNCTIONS
// =======================

let monitoringJob = null;

function startMonitoring(sock) {
  if (monitoringJob) monitoringJob.stop();
  // Schedule job every 6 hours (at minute 0)
  monitoringJob = cron.schedule('0 */6 * * *', () => {
    checkRentals(sock);
  });
  console.log(`🏘️ Rental monitoring scheduled every 6 hours via node-cron.`);
  // Initial check after 30 seconds
  setTimeout(() => checkRentals(sock), 30000);
}

function stopMonitoring() {
  if (monitoringJob) {
    monitoringJob.stop();
    monitoringJob = null;
    console.log('🛑 Rental monitoring stopped');
  }
}

async function isAuthorized(sock, from, sender) {
  if (!from.endsWith('@g.us')) return false;
  try {
    const groupMetadata = await sock.groupMetadata(from);
    const groupAdmins = groupMetadata.participants
      .filter(p => p.admin)
      .map(p => p.id);
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

// =======================
// 📋 COMMAND HANDLERS
// =======================

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
      await sock.sendMessage(m.key.remoteJid, { 
        text: '❌ An error occurred. Please try again later.' 
      }, { quoted: m });
    } catch (e) {
      console.error('Failed to send error message:', e);
    }
  }
}

async function handleSubCommand(subCommand, args, context) {
  // Already destructured above, do not redeclare
  const { from, senderId } = context;
  try {
    await initDatabase();
    const isAdmin = await isAuthorized(context.sock, from, senderId);
    const settings = await loadSettings(from);
    // Check if group is set up
    const rentalGroup = await db.collection(COLLECTIONS.RENTAL_GROUPS).findOne({ groupId: from });
    const needsSetup = ['setup', 'help'].includes(subCommand);
    if (!rentalGroup && !needsSetup) {
      return context.reply('❌ Rental system not set up in this group. Admin should use `rent setup` first.');
    }
    // Admin-only commands
    const adminCommands = ['setup', 'addtenant', 'defaulters', 'evict', 'disable', 'stats'];
    if (adminCommands.includes(subCommand) && settings.adminOnly && !isAdmin) {
      return context.reply('🚫 This is an admin-only command.');
    }
    // Route to handlers
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
  } catch (error) {
    console.error('❌ Critical error in handleSubCommand:', error);
    await context.reply('❌ A critical error occurred while processing your command. Please try again later or contact an admin.');
  }
}

async function showHelpMenu(context) {
  const { reply, config } = context;
  const prefix = config.PREFIX;
  
  const menu = `🏘️ *RENTAL SIMULATION v2.0* 🏘️\n\n` +
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
               `✨ *Features:* Auto-deduction, Smart reminders, Grace periods, Real-time tracking`;
  
  await reply(menu);
}

async function handleSetup(context) {
  const { from, reply, sock } = context;
  
  // Check if already set up
  const existingGroup = await db.collection(COLLECTIONS.RENTAL_GROUPS).findOne({ groupId: from });
  if (existingGroup) {
    return reply('✅ Rental system is already active in this group.\n\n💡 Use `rent settings` to modify configuration or `rent disable` to turn off.');
  }

  await reply('⏳ *Setting up rental system...*\n\nEnrolling all group members as tenants...');
  
  try {
    const groupMetadata = await sock.groupMetadata(from);
    const participants = groupMetadata.participants.map(p => p.id);
    
    console.log(`📋 Setting up rental for ${participants.length} participants`);
    
    // Initialize economy accounts for all participants
    const economyPromises = participants.map(id => initEconomyUser(id).catch(e => console.log(`Economy init failed for ${id}:`, e)));
    await Promise.all(economyPromises);
    
    // Batch insert tenants
    const tenantInserts = participants.map(id => ({
      tenantId: id,
      groupId: from,
      wallet: 0,
      joinDate: new Date(),
      lastPaidDate: null,
      lastPaymentPeriod: null,
      totalPaid: 0,
      paymentCount: 0
    }));
    
    // Use upsert to avoid duplicates
    const tenantOps = tenantInserts.map(tenant => ({
      updateOne: {
        filter: { tenantId: tenant.tenantId, groupId: from },
        update: { $setOnInsert: tenant },
        upsert: true
      }
    }));
    
    const bulkResult = await db.collection(COLLECTIONS.TENANTS).bulkWrite(tenantOps);
    
    // Create rental group record
    await db.collection(COLLECTIONS.RENTAL_GROUPS).insertOne({ 
      groupId: from, 
      active: true, 
      createdAt: new Date(),
      tenantCount: participants.length
    });
    
    // Initialize and save settings
    await loadSettings(from);
    await saveSettings(from);
    
    // Verify setup
    const totalTenants = await db.collection(COLLECTIONS.TENANTS).countDocuments({ groupId: from });
    const settings = rentalSettings[from];
    const billingInfo = calculateCurrentBillingPeriod(settings);
    
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
  
  const billingInfo = calculateCurrentBillingPeriod(settings);
  const hasPaid = await hasPaidCurrentPeriod(senderId, from, billingInfo);
  
  // Get economy wallet
  await initEconomyUser(senderId);
  const economyData = await getUserEconomyData(senderId);
  
  // Calculate payment status
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
    statusText = 'OVERDUE';
    actionText = `${billingInfo.daysOverdue} day(s) late!`;
  }
  
  const statusMsg = `📊 *YOUR RENT STATUS* 📊\n\n` +
                   `${statusEmoji} *Status:* ${statusText}\n` +
                   `📅 *Period:* ${billingInfo.periodStart.format('MMM Do')} - ${billingInfo.dueDate.format('MMM Do, YYYY')}\n` +
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
  
  const billingInfo = calculateCurrentBillingPeriod(settings);
  const hasPaid = await hasPaidCurrentPeriod(senderId, from, billingInfo);
  
  if (hasPaid) {
    return reply(`✅ You have already paid rent for this period!\n\n📅 Current Period: ${billingInfo.periodStart.format('MMM Do')} - ${billingInfo.dueDate.format('MMM Do, YYYY')}`);
  }
  
  if (tenant.wallet < settings.rentAmount) {
    const shortfall = settings.rentAmount - tenant.wallet;
    return reply(`❌ *Insufficient Rent Wallet Funds!*\n\n` +
                `💰 Required: ${settings.currencySymbol}${settings.rentAmount.toLocaleString()}\n` +
                `💳 Your Balance: ${settings.currencySymbol}${tenant.wallet.toLocaleString()}\n` +
                `📉 Shortfall: ${settings.currencySymbol}${shortfall.toLocaleString()}\n\n` +
                `💡 Transfer funds: \`rent wallet transfer ${shortfall}\``);
  }
  
  // Process payment
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
    // Show own wallet info
    const tenant = await db.collection(COLLECTIONS.TENANTS).findOne({ 
      tenantId: senderId, 
      groupId: from 
    });
    
    if (!tenant) {
      return reply('❌ You are not registered as a tenant in this group.');
    }
    
    await initEconomyUser(senderId);
    const economyData = await getUserEconomyData(senderId);
    const billingInfo = calculateCurrentBillingPeriod(settings);
    
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
  
  // Check if user is tenant
  const tenant = await db.collection(COLLECTIONS.TENANTS).findOne({ 
    tenantId: senderId, 
    groupId: from 
  });
  
  if (!tenant) {
    return reply('❌ You are not registered as a tenant in this group.');
  }
  
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
  const tenant = await db.collection(COLLECTIONS.TENANTS).findOne({ 
    tenantId: userId, 
    groupId: from 
  });
  
  if (!tenant) {
    return reply(`❌ @${userId.split('@')[0]} is not a tenant in this group.`, [userId]);
  }
  
  const newBalance = tenant.wallet + amount;
  await db.collection(COLLECTIONS.TENANTS).updateOne(
    { tenantId: userId, groupId: from },
    { $set: { wallet: newBalance } }
  );
  
  // Log admin wallet addition
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
  
  if (mentions.length === 0) {
    return reply('❌ Please mention a user to check.\n\n*Usage:* `rent wallet check @user`');
  }
  
  const userId = mentions[0];
  const tenant = await db.collection(COLLECTIONS.TENANTS).findOne({ 
    tenantId: userId, 
    groupId: from 
  });
  
  if (!tenant) {
    return reply(`❌ @${userId.split('@')[0]} is not a tenant.`, [userId]);
  }
  
  // Get their economy data and payment history
  await initEconomyUser(userId);
  const economyData = await getUserEconomyData(userId);
  const billingInfo = calculateCurrentBillingPeriod(settings);
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
  const { from, reply, sock } = context; // Added 'sock' to context destructuring
  const settings = rentalSettings[from];
  const billingInfo = calculateCurrentBillingPeriod(settings);

  // --- FIX START ---
  // Fetch group metadata once to get participant names efficiently
  let groupMetadata;
  try {
    groupMetadata = await sock.groupMetadata(from);
  } catch (e) {
    console.error("Could not fetch group metadata for defaulters list:", e);
    return reply("❌ Could not fetch group member details. Please try again.");
  }
  // --- FIX END ---
  
  const tenants = await db.collection(COLLECTIONS.TENANTS).find({ groupId: from }).toArray();
  console.log(`🔍 Checking ${tenants.length} tenants for defaulters in group ${from}`);
  
  const defaulters = [];
  const checkPromises = tenants.map(async (tenant) => {
    const hasPaid = await hasPaidCurrentPeriod(tenant.tenantId, from, billingInfo);
    
    if (billingInfo.isOverdue && !hasPaid) {
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
    const statusMsg = `✅ *NO DEFAULTERS FOUND!* ✅\n\n` +
                     `All ${tenants.length} tenants are up to date with their rent.\n\n` +
                     `📅 *Current Period:* ${billingInfo.periodStart.format('MMM Do')} - ${billingInfo.dueDate.format('MMM Do, YYYY')}\n` +
                     `💰 *Rent Amount:* ${settings.currencySymbol}${settings.rentAmount.toLocaleString()}\n` +
                     `📊 *Status:* ${billingInfo.isOverdue ? 'Overdue but all paid!' : 'Not due yet'}\n\n` +
                     `🎉 Excellent payment compliance!`;
    
    return reply(statusMsg);
  }
  
  defaulters.sort((a, b) => b.daysOverdue - a.daysOverdue);
  
  let defaultersMsg = `🚨 *RENT DEFAULTERS* (${defaulters.length}) 🚨\n\n` +
                     `📅 *Due Date:* ${billingInfo.dueDate.format('MMM Do, YYYY')}\n` +
                     `💰 *Amount:* ${settings.currencySymbol}${settings.rentAmount.toLocaleString()}\n` +
                     `⏰ *Days Overdue:* ${billingInfo.daysOverdue}\n\n`;
  
  const mentions = [];
  defaulters.forEach((defaulter, index) => {
    mentions.push(defaulter.tenant.tenantId);
    
    // --- FIX START ---
    // Look up the user's name from the fetched metadata
    const participant = groupMetadata.participants.find(p => p.id === defaulter.tenant.tenantId);
    const username = participant?.pushname || participant?.name || `User (${defaulter.tenant.tenantId.split('@')[0]})`;
    const userMention = `@${defaulter.tenant.tenantId.split('@')[0]}`;
    // --- FIX END ---

    // Updated message to show the name and the mention
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
    const billingInfo = calculateCurrentBillingPeriod(settings);
    
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
  
  await handleSettingsChange(context, args);
}

async function handleSettingsChange(context, args) {
  const { from, reply, config } = context;
  const settings = rentalSettings[from];
  
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
    
    // Add billing impact info
    const billingInfo = calculateCurrentBillingPeriod(settings);
    response += `\n\n📅 *Next due date:* ${billingInfo.dueDate.format('MMM Do, YYYY')}`;
  }
  
  await reply(response);
}

async function handleAddTenant(context, args) {
  const { from, reply, m } = context;
  const mentions = extractMentions(m);
  
  if (mentions.length === 0) {
    return reply('❌ Please mention a user to add as tenant.\n\n*Usage:* `rent addtenant @user`');
  }
  
  const userId = mentions[0];
  const existingTenant = await db.collection(COLLECTIONS.TENANTS).findOne({ 
    tenantId: userId, 
    groupId: from 
  });
  
  if (existingTenant) {
    return reply(`❌ @${userId.split('@')[0]} is already a tenant in this group.`, [userId]);
  }
  
  // Initialize economy account
  await initEconomyUser(userId);
  
  // Add to rental system
  await db.collection(COLLECTIONS.TENANTS).insertOne({
    tenantId: userId,
    groupId: from,
    wallet: 0,
    joinDate: new Date(),
    lastPaidDate: null,
    lastPaymentPeriod: null,
    totalPaid: 0,
    paymentCount: 0
  });
  
  // Update group tenant count
  await db.collection(COLLECTIONS.RENTAL_GROUPS).updateOne(
    { groupId: from },
    { $inc: { tenantCount: 1 } }
  );
  
  const addMsg = `✅ *TENANT ADDED SUCCESSFULLY!* ✅\n\n` +
                `👤 New Tenant: @${userId.split('@')[0]}\n` +
                `🏠 Rent Wallet: ${settings.currencySymbol}0\n` +
                `💰 Monthly Rent: ${settings.currencySymbol}${settings.rentAmount.toLocaleString()}\n\n` +
                `💡 They can now transfer funds and participate in the rental system!`;
  
  await reply(addMsg, [userId]);
}

async function handleEvict(context, args) {
  const { from, reply, m, sock } = context;
  const mentions = extractMentions(m);
  
  if (mentions.length === 0) {
    return reply('❌ Please mention a user to evict.\n\n*Usage:* `rent evict @user`');
  }
  
  const userId = mentions[0];
  const tenant = await db.collection(COLLECTIONS.TENANTS).findOne({ 
    tenantId: userId, 
    groupId: from 
  });
  
  if (!tenant) {
    return reply(`❌ @${userId.split('@')[0]} is not a tenant in this group.`, [userId]);
  }
  
  try {
    // Remove from WhatsApp group
    await sock.groupParticipantsUpdate(from, [userId], "remove");
    
    // Remove from database
    await db.collection(COLLECTIONS.TENANTS).deleteOne({ 
      tenantId: userId, 
      groupId: from 
    });
    
    // Log eviction
    await db.collection(COLLECTIONS.PAYMENT_HISTORY).insertOne({
      tenantId: userId,
      groupId: from,
      amount: 0,
      date: new Date(),
      method: 'manual_eviction',
      reason: 'Manual eviction by admin'
    });
    
    // Update group tenant count
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
    // Deactivate rental group
    await db.collection(COLLECTIONS.RENTAL_GROUPS).updateOne(
      { groupId: from },
      { $set: { active: false, disabledAt: new Date() } }
    );
    
    // Get final stats
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
    
    const billingInfo = calculateCurrentBillingPeriod(settings);
    const revenue = totalRevenue[0]?.total || 0;
    
    const currentPeriodPayments = await db.collection(COLLECTIONS.PAYMENT_HISTORY).countDocuments({
      groupId: from,
      date: { 
        $gte: billingInfo.periodStart.toDate(), 
        $lte: billingInfo.periodEnd.toDate() 
      },
      method: { $ne: 'eviction' }
    });
    
    const paymentRate = tenantCount > 0 ? Math.round((currentPeriodPayments / tenantCount) * 100) : 0;
    
    // --- FIX START ---
    let recentPaymentsText = '';
    const mentions = []; // ADDED: Array to hold the JIDs of users to be mentioned.

    if (recentPayments.length > 0) {
      recentPaymentsText = '\n\n📜 *Recent Payments:*\n';
      recentPayments.forEach((payment, index) => {
        // Create the text part of the mention (e.g., @1234567890)
        const userMention = `@${payment.tenantId.split('@')[0]}`;
        // Add the full JID to our mentions array
        mentions.push(payment.tenantId);
        
        // CHANGED: Use the userMention variable, which will be rendered as a clickable name.
        recentPaymentsText += `${index + 1}. ${userMention}: ${settings.currencySymbol}${payment.amount.toLocaleString()} (${moment(payment.date).format('MMM Do')})\n`;
      });
    }
    // --- FIX END ---
    
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
    
    // CHANGED: Pass the mentions array to the reply function.
    await reply(statsMsg, mentions);
    
  } catch (error) {
    console.error('❌ Stats error:', error);
    await reply('❌ Failed to generate statistics. Please try again.');
  }
}

// Utility function for ordinal numbers
function getOrdinalSuffix(num) {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

// =======================
// 🔄 PLUGIN LIFECYCLE
// =======================

export async function initPlugin(sock) {
  try {
    console.log('🔧 Initializing Enhanced Rental Plugin v2.0...');
    await initDatabase();
    
    // Load all group settings into cache
    const groups = await db.collection(COLLECTIONS.RENTAL_GROUPS).find({ active: true }).toArray();
    for (const group of groups) {
      await loadSettings(group.groupId);
    }
    
    startMonitoring(sock);
    console.log(`✅ Rental Plugin v2.0 initialized successfully with ${groups.length} active groups.`);
  } catch (error) {
    console.error('❌ Failed to initialize Rental Plugin v2.0:', error);
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
    
    // Clear settings cache
    rentalSettings = {};
    
    console.log('✅ Rental Plugin v2.0 cleaned up successfully.');
  } catch (error) {
    console.error('❌ Error cleaning up Rental Plugin v2.0:', error);
  }
}

// =======================
// 🎯 ADVANCED FEATURES
// =======================

// Batch operations for better performance
async function processGroupRentals(groupId, sock) {
  const settings = await loadSettings(groupId);
  const tenants = await db.collection(COLLECTIONS.TENANTS).find({ groupId }).toArray();
  const billingInfo = calculateCurrentBillingPeriod(settings);
  
  const operations = [];
  const notifications = [];
  
  for (const tenant of tenants) {
    const hasPaid = await hasPaidCurrentPeriod(tenant.tenantId, groupId, billingInfo);
    
    if (!hasPaid && billingInfo.isOverdue) {
      if (settings.autoDeduct && tenant.wallet >= settings.rentAmount) {
        // Queue auto-deduction
        operations.push({
          type: 'payment',
          tenant,
          amount: settings.rentAmount
        });
      } else if (settings.autoEvict) {
        const gracePeriodEnd = billingInfo.dueDate.clone().add(settings.gracePeriodDays, 'days');
        if (moment().isAfter(gracePeriodEnd, 'day')) {
          // Queue eviction
          operations.push({
            type: 'eviction',
            tenant
          });
        }
      }
    }
  }
  
  // Execute batched operations
  if (operations.length > 0) {
    console.log(`⚡ Processing ${operations.length} operations for group ${groupId}`);
    await executeBatchOperations(operations, groupId, sock, settings, billingInfo);
  }
}

async function executeBatchOperations(operations, groupId, sock, settings, billingInfo) {
  const payments = operations.filter(op => op.type === 'payment');
  const evictions = operations.filter(op => op.type === 'eviction');
  
  // Process payments in batch
  if (payments.length > 0) {
    const paymentUpdates = payments.map(op => ({
      updateOne: {
        filter: { tenantId: op.tenant.tenantId, groupId },
        update: { 
          $set: { 
            wallet: op.tenant.wallet - op.amount,
            lastPaidDate: new Date(),
            lastPaymentPeriod: billingInfo.periodStart.toISOString()
          },
          $inc: { 
            totalPaid: op.amount,
            paymentCount: 1
          }
        }
      }
    }));
    
    await db.collection(COLLECTIONS.TENANTS).bulkWrite(paymentUpdates);
    
    // Log payments
    const paymentLogs = payments.map(op => ({
      tenantId: op.tenant.tenantId,
      groupId,
      amount: op.amount,
      date: new Date(),
      method: 'auto_deduct_batch',
      periodStart: billingInfo.periodStart.toDate(),
      periodEnd: billingInfo.dueDate.toDate(),
      daysLate: billingInfo.daysOverdue
    }));
    
    await db.collection(COLLECTIONS.PAYMENT_HISTORY).insertMany(paymentLogs);
    console.log(`💳 Processed ${payments.length} automatic payments`);
  }
  
  // Process evictions
  if (evictions.length > 0) {
    const evictionIds = evictions.map(op => op.tenant.tenantId);
    
    try {
      // Remove from WhatsApp group
      await sock.groupParticipantsUpdate(groupId, evictionIds, "remove");
      
      // Remove from database
      await db.collection(COLLECTIONS.TENANTS).deleteMany({ 
        tenantId: { $in: evictionIds }, 
        groupId 
      });
      
      // Log evictions
      const evictionLogs = evictions.map(op => ({
        tenantId: op.tenant.tenantId,
        groupId,
        amount: 0,
        date: new Date(),
        method: 'auto_eviction_batch',
        reason: `Auto-evicted after ${billingInfo.daysOverdue} days overdue`
      }));
      
      await db.collection(COLLECTIONS.PAYMENT_HISTORY).insertMany(evictionLogs);
      
      // Update group tenant count
      await db.collection(COLLECTIONS.RENTAL_GROUPS).updateOne(
        { groupId },
        { $inc: { tenantCount: -evictions.length } }
      );
      
      console.log(`🚪 Processed ${evictions.length} evictions`);
      
    } catch (error) {
      console.error('❌ Batch eviction error:', error);
    }
  }
}

// Enhanced monitoring with smart scheduling
function getSmartCheckInterval() {
  const now = moment();
  const hour = now.hour();
  
  // More frequent checks during business hours (9 AM - 6 PM)
  if (hour >= 9 && hour <= 18) {
    return 2 * 60 * 60 * 1000; // Every 2 hours
  } else {
    return 6 * 60 * 60 * 1000; // Every 6 hours
  }
}

// Performance monitoring
let performanceStats = {
  totalChecks: 0,
  totalProcessingTime: 0,
  lastCheckTime: null,
  averageProcessingTime: 0
};

async function enhancedCheckRentals(sock) {
  const startTime = Date.now();
  performanceStats.totalChecks++;
  
  try {
    await checkRentals(sock);
    
    const processingTime = Date.now() - startTime;
    performanceStats.totalProcessingTime += processingTime;
    performanceStats.lastCheckTime = new Date();
    performanceStats.averageProcessingTime = performanceStats.totalProcessingTime / performanceStats.totalChecks;
    
    console.log(`⚡ Enhanced rent check completed in ${processingTime}ms (avg: ${Math.round(performanceStats.averageProcessingTime)}ms)`);
    
  } catch (error) {
    console.error('❌ Enhanced rent check failed:', error);
  }
}
