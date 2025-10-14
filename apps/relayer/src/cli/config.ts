#!/usr/bin/env node

/**
 * Configuration CLI Tool
 * Manages relayer configuration for different environments
 */

import { getConfig, validateConfig, getConfigSummary, Environment } from '../config/index.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const HELP_TEXT = `
BrickVault Relayer Configuration CLI

Usage:
  node dist/cli/config.js [command] [options]

Commands:
  --show [env]           Show configuration for environment (default: current)
  --validate [env]       Validate configuration for environment
  --generate [env]       Generate environment file from current config
  --dev                  Show development configuration
  --staging              Show staging configuration  
  --prod                 Show production configuration

Examples:
  node dist/cli/config.js --show
  node dist/cli/config.js --show development
  node dist/cli/config.js --validate production
  node dist/cli/config.js --generate staging
  node dist/cli/config.js --dev
`;

function loadEnvFile(environment: Environment): Record<string, string> {
  const envPath = join(process.cwd(), 'config', `${environment}.env`);
  
  if (!existsSync(envPath)) {
    return {};
  }

  const envContent = readFileSync(envPath, 'utf-8');
  const envVars: Record<string, string> = {};
  
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    }
  });

  return envVars;
}

function setEnvVars(envVars: Record<string, string>) {
  Object.entries(envVars).forEach(([key, value]) => {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

function showConfig(environment?: Environment) {
  const env = environment || (process.env.NODE_ENV as Environment) || 'development';
  
  // Load environment-specific variables
  const envVars = loadEnvFile(env);
  setEnvVars(envVars);
  
  const config = getConfig(env);
  const summary = getConfigSummary(config);
  
  console.log(`\n🔧 BrickVault Relayer Configuration (${env.toUpperCase()})\n`);
  console.log(JSON.stringify(summary, null, 2));
  console.log();
}

function validateConfigEnv(environment?: Environment) {
  const env = environment || (process.env.NODE_ENV as Environment) || 'development';
  
  // Load environment-specific variables
  const envVars = loadEnvFile(env);
  setEnvVars(envVars);
  
  const config = getConfig(env);
  const validation = validateConfig(config);
  
  console.log(`\n✅ Configuration Validation (${env.toUpperCase()})\n`);
  
  if (validation.isValid) {
    console.log('✅ Configuration is valid!');
  } else {
    console.log('❌ Configuration has errors:');
    validation.errors.forEach(error => {
      console.log(`  - ${error}`);
    });
  }
  console.log();
}

function generateEnvFile(environment: Environment) {
  const config = getConfig(environment);
  
  let envContent = `# ${environment.charAt(0).toUpperCase() + environment.slice(1)} Environment Configuration\n`;
  envContent += `NODE_ENV=${environment}\n\n`;
  
  envContent += `# Stacks Configuration\n`;
  envContent += `STACKS_NETWORK=${config.stacks.network}\n`;
  envContent += `STACKS_API_URL=${config.stacks.apiUrl}\n`;
  envContent += `STACKS_CONTRACT_ADDRESS=${config.stacks.contractAddress}\n`;
  envContent += `STACKS_FEE_RATE=${config.stacks.feeRate}\n\n`;
  
  envContent += `# EVM Configuration\n`;
  envContent += `EVM_NETWORK=${config.evm.network}\n`;
  envContent += `EVM_RPC_URL=${config.evm.rpcUrl}\n`;
  envContent += `EVM_STACKS_MANAGER_ADDRESS=${config.evm.stacksManagerAddress}\n`;
  envContent += `EVM_PRIVATE_KEY=${config.evm.privateKey}\n`;
  envContent += `EVM_GAS_LIMIT=${config.evm.gasLimit}\n\n`;
  
  envContent += `# Monitoring Configuration\n`;
  envContent += `MONITORING_INTERVAL=${config.monitoring.interval}\n`;
  envContent += `MONITORING_MAX_RETRIES=${config.monitoring.maxRetries}\n`;
  envContent += `MONITORING_RETRY_DELAY=${config.monitoring.retryDelay}\n`;
  envContent += `MONITORING_BATCH_SIZE=${config.monitoring.batchSize}\n`;
  envContent += `MONITORING_TIMEOUT=${config.monitoring.timeout}\n\n`;
  
  envContent += `# Logging Configuration\n`;
  envContent += `LOG_LEVEL=${config.logging?.level}\n`;
  envContent += `LOG_ENABLE_CONSOLE=${config.logging?.enableConsole}\n`;
  envContent += `LOG_ENABLE_FILE=${config.logging?.enableFile}\n`;
  
  const envPath = join(process.cwd(), 'config', `${environment}.env`);
  writeFileSync(envPath, envContent);
  
  console.log(`\n📝 Generated ${environment}.env file at: ${envPath}\n`);
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP_TEXT);
    return;
  }
  
  const command = args[0];
  
  switch (command) {
    case '--show':
      const showEnv = args[1] as Environment;
      showConfig(showEnv);
      break;
      
    case '--validate':
      const validateEnv = args[1] as Environment;
      validateConfigEnv(validateEnv);
      break;
      
    case '--generate':
      const generateEnv = args[1] as Environment;
      if (!generateEnv) {
        console.error('❌ Environment required for --generate command');
        console.log('Usage: node dist/cli/config.js --generate [environment]');
        return;
      }
      generateEnvFile(generateEnv);
      break;
      
    case '--dev':
    case '--development':
      showConfig('development');
      break;
      
    case '--staging':
      showConfig('staging');
      break;
      
    case '--prod':
    case '--production':
      showConfig('production');
      break;
      
    default:
      console.error(`❌ Unknown command: ${command}`);
      console.log(HELP_TEXT);
  }
}

// Run CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
