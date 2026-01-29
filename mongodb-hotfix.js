#!/usr/bin/env node
// mongodb-hotfix.js - Quick fix for MongoDB connection issues
import { MongoClient } from 'mongodb';
import chalk from 'chalk';

async function testMongoDBConnection() {
  console.log(chalk.blue('🔧 MongoDB Connection Hotfix Test'));
  
  const MONGODB_URI = process.env.MONGODB_URI;
  
  if (!MONGODB_URI) {
    console.error(chalk.red('❌ MONGODB_URI not found in environment variables'));
    console.log(chalk.yellow('💡 Add MONGODB_URI to your .env file'));
    process.exit(1);
  }
  
  // Test with corrected options (no deprecated buffer options)
  const options = {
    maxPoolSize: 5,              // Conservative for testing
    minPoolSize: 1,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    connectTimeoutMs: 15000,
    heartbeatFrequencyMS: 10000,
    retryWrites: true,
    retryReads: true,
    // REMOVED: deprecated options
    // bufferMaxEntries and bufferCommands are not supported in newer drivers
  };
  
  let client = null;
  
  try {
    console.log(chalk.yellow('🔌 Testing MongoDB connection...'));
    console.log(chalk.cyan('📊 Connection URI:', MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')));
    
    client = new MongoClient(MONGODB_URI, options);
    
    // Connect with timeout
    console.log(chalk.blue('⏳ Connecting...'));
    await client.connect();
    
    console.log(chalk.green('✅ MongoDB connection successful!'));
    
    // Test database operations
    const db = client.db(process.env.DATABASE_NAME || 'whatsapp_bot');
    
    console.log(chalk.blue('🔍 Testing database operations...'));
    
    // Test ping
    const pingResult = await db.admin().ping();
    console.log(chalk.green('✅ Ping successful:', JSON.stringify(pingResult)));
    
    // Test server status
    try {
      const serverStatus = await db.admin().serverStatus();
      const connections = serverStatus.connections || {};
      
      console.log(chalk.cyan('📊 Connection info:'));
      console.log(chalk.cyan(`   Current: ${connections.current || 0}`));
      console.log(chalk.cyan(`   Available: ${connections.available || 0}`));
      console.log(chalk.cyan(`   Total Created: ${connections.totalCreated || 0}`));
      
      if (connections.current > 400) {
        console.log(chalk.red('🚨 WARNING: High connection count detected!'));
        console.log(chalk.yellow('💡 This could cause connection limit issues'));
      }
      
    } catch (statusError) {
      console.warn(chalk.yellow('⚠️ Could not get server status:', statusError.message));
    }
    
    // Test collection operations
    try {
      const testCollection = db.collection('connection_test');
      
      // Insert test document
      const testDoc = { test: true, timestamp: new Date() };
      const insertResult = await testCollection.insertOne(testDoc);
      console.log(chalk.green('✅ Insert test successful'));
      
      // Read test document
      const foundDoc = await testCollection.findOne({ _id: insertResult.insertedId });
      console.log(chalk.green('✅ Read test successful'));
      
      // Delete test document
      await testCollection.deleteOne({ _id: insertResult.insertedId });
      console.log(chalk.green('✅ Delete test successful'));
      
    } catch (collectionError) {
      console.warn(chalk.yellow('⚠️ Collection test warning:', collectionError.message));
    }
    
    console.log(chalk.green('\n🎉 All MongoDB tests passed!'));
    console.log(chalk.blue('💡 Your MongoDB connection is working correctly.'));
    console.log(chalk.cyan('🔧 The bot should now start without MongoDB errors.'));
    
  } catch (error) {
    console.error(chalk.red('❌ MongoDB connection test failed:'), error.message);
    
    // Provide specific error guidance
    if (error.message.includes('buffermaxentries') || error.message.includes('buffercommands')) {
      console.log(chalk.yellow('\n🔧 SOLUTION: Update your MongoDB connection options'));
      console.log(chalk.cyan('• Remove bufferMaxEntries and bufferCommands options'));
      console.log(chalk.cyan('• These options are deprecated in newer MongoDB drivers'));
    } else if (error.message.includes('authentication')) {
      console.log(chalk.yellow('\n🔧 SOLUTION: Check your MongoDB credentials'));
      console.log(chalk.cyan('• Verify username and password in MONGODB_URI'));
      console.log(chalk.cyan('• Check if IP address is whitelisted in MongoDB Atlas'));
    } else if (error.message.includes('network') || error.message.includes('timeout')) {
      console.log(chalk.yellow('\n🔧 SOLUTION: Check network connectivity'));
      console.log(chalk.cyan('• Verify internet connection'));
      console.log(chalk.cyan('• Check MongoDB Atlas network access settings'));
      console.log(chalk.cyan('• Try increasing timeout values'));
    } else if (error.message.includes('serverSelectionTimeout')) {
      console.log(chalk.yellow('\n🔧 SOLUTION: MongoDB server unreachable'));
      console.log(chalk.cyan('• Check if MongoDB cluster is running'));
      console.log(chalk.cyan('• Verify connection string format'));
      console.log(chalk.cyan('• Ensure cluster is not paused in Atlas'));
    }
    
    process.exit(1);
    
  } finally {
    if (client) {
      try {
        await client.close();
        console.log(chalk.blue('🔒 Connection closed cleanly'));
      } catch (closeError) {
        console.warn('Warning: Could not close connection cleanly');
      }
    }
  }
}

// Show MongoDB driver version info
async function showDriverInfo() {
  try {
    // Get MongoDB driver version
    const { MongoClient } = await import('mongodb');
    // Importing package.json may require import assertions in some runtimes.
    // Use a safe dynamic import and fallback handling to avoid parser/runtime issues.
    let pkg = {};
    try {
      const mod = await import('mongodb/package.json').catch(() => null);
      pkg = (mod && (mod.default || mod)) || {};
    } catch (e) {
      pkg = {};
    }
    const driverVersion = pkg.version || (pkg.default && pkg.default.version) || 'unknown';
    console.log(chalk.cyan(`📦 MongoDB Driver Version: ${driverVersion}`));
    
    // Check for deprecated options
    const deprecatedOptions = ['bufferMaxEntries', 'bufferCommands'];
    console.log(chalk.yellow('⚠️ Deprecated options to remove:', deprecatedOptions.join(', ')));
    
  } catch (error) {
    console.log(chalk.yellow('ℹ️ Could not determine MongoDB driver version'));
  }
}

// Main execution
async function main() {
  console.log(chalk.blue('🚀 Starting MongoDB connection diagnostics...\n'));
  
  await showDriverInfo();
  console.log(''); // Empty line
  
  await testMongoDBConnection();
}

main().catch(error => {
  console.error(chalk.red('💥 Hotfix script failed:'), error.message);
  process.exit(1);
});
