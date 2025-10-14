/**
 * Simple CLI to start the BrickVault Relayer
 * 
 * Usage:
 *   ts-node start.ts
 *   
 * Or after build:
 *   node dist/start.js
 */

import { RelayerService } from './src/RelayerService.js';
import { getConfig, validateConfig, getConfigSummary } from './src/config/index.js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       BrickVault Cross-Chain Relayer                      ║');
  console.log('║       Stacks (sBTC) ↔ EVM (OFTUSDC)                      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Load configuration
    console.log('📋 Loading configuration...\n');
    const config = getConfig();

    // Validate configuration
    const validation = validateConfig(config);
    if (!validation.isValid) {
      console.error('❌ Configuration validation failed:\n');
      validation.errors.forEach(error => {
        console.error(`   • ${error}`);
      });
      console.error('\n💡 Please check your .env file and try again.');
      console.error('   See env.example for configuration template.\n');
      process.exit(1);
    }

    // Display configuration summary
    console.log('✅ Configuration validated successfully!\n');
    const summary = getConfigSummary(config);
    console.log('📊 Configuration Summary:');
    console.log('   Environment:', summary.environment);
    console.log('   \n   Stacks:');
    console.log('   - Network:', summary.stacks.network);
    console.log('   - API URL:', summary.stacks.apiUrl);
    console.log('   - Contract:', summary.stacks.contractAddress);
    console.log('   \n   EVM:');
    console.log('   - Network:', summary.evm.network);
    console.log('   - RPC URL:', summary.evm.rpcUrl);
    console.log('   - Manager Contract:', summary.evm.stacksManagerAddress);
    console.log('   - Private Key:', summary.evm.privateKey);
    console.log('   \n   Monitoring:');
    console.log('   - Poll Interval:', summary.monitoring.interval, 'ms');
    console.log('   - Max Retries:', summary.monitoring.maxRetries);
    console.log('\n');

    // Create and start relayer service
    const relayer = new RelayerService(config);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n\n⚠️  Received SIGINT, shutting down gracefully...');
      await relayer.stop();
      console.log('👋 Relayer stopped. Goodbye!\n');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n\n⚠️  Received SIGTERM, shutting down gracefully...');
      await relayer.stop();
      console.log('👋 Relayer stopped. Goodbye!\n');
      process.exit(0);
    });

    // Start the relayer
    await relayer.start();

    // Keep the process running
    console.log('\n💡 Press Ctrl+C to stop the relayer\n');
    console.log('─'.repeat(60));

  } catch (error) {
    console.error('\n❌ Fatal error starting relayer:\n');
    console.error(error);
    console.error('\n');
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

