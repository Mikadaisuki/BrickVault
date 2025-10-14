/**
 * Relayer Configuration System
 * Supports dev and prod modes with environment-based configuration
 */

export type Environment = 'development' | 'staging' | 'production' | 'test';

export interface StacksConfig {
  network: 'mainnet' | 'testnet';
  apiUrl: string;
  contractAddress: string;
  feeRate?: number;
  maxRetries?: number;
}

export interface EVMConfig {
  network: 'mainnet' | 'sepolia' | 'polygon' | 'arbitrum';
  rpcUrl: string;
  stacksManagerAddress: string;
  privateKey: string;
  gasLimit?: number;
  maxRetries?: number;
}

export interface MonitoringConfig {
  interval: number;
  maxRetries: number;
  retryDelay: number;
  batchSize?: number;
  timeout?: number;
}

export interface RelayerConfig {
  environment: Environment;
  stacks: StacksConfig;
  evm: EVMConfig;
  monitoring: MonitoringConfig;
  logging?: {
    level: 'debug' | 'info' | 'warn' | 'error';
    enableConsole: boolean;
    enableFile: boolean;
  };
}

// Default configurations for each environment
const DEFAULT_CONFIGS: Record<Environment, RelayerConfig> = {
  test: {
    environment: 'test',
    stacks: {
      network: 'testnet',
      apiUrl: 'https://api.testnet.hiro.so',
      contractAddress: 'SP[TEST-CONTRACT].brick-vault-gateway',
      feeRate: 0.000001,
      maxRetries: 3
    },
    evm: {
      network: 'sepolia',
      rpcUrl: 'http://localhost:8545',
      stacksManagerAddress: '0x[TEST-MANAGER-ADDRESS]',
      privateKey: '0x[TEST-EVM-KEY]',
      gasLimit: 800000,
      maxRetries: 3
    },
    monitoring: {
      interval: 1000, // 1 second for tests
      maxRetries: 3,
      retryDelay: 100,
      batchSize: 5,
      timeout: 5000
    },
    logging: {
      level: 'debug',
      enableConsole: false, // Disable console in tests
      enableFile: false
    }
  },

  development: {
    environment: 'development',
    stacks: {
      network: 'testnet',
      apiUrl: 'https://api.testnet.hiro.so',
      contractAddress: 'SP[DEV-CONTRACT].brick-vault-gateway',
      feeRate: 0.000001, // 1 micro-STX
      maxRetries: 3
    },
    evm: {
      network: 'sepolia',
      rpcUrl: 'https://sepolia.infura.io/v3/[DEV-INFURA-KEY]',
      stacksManagerAddress: '0x[DEV-MANAGER-ADDRESS]',
      privateKey: process.env.EVM_PRIVATE_KEY || '0x[DEV-EVM-KEY]',
      gasLimit: 800000,
      maxRetries: 3
    },
    monitoring: {
      interval: 5000, // 5 seconds for dev
      maxRetries: 3,
      retryDelay: 2000,
      batchSize: 10,
      timeout: 30000
    },
    logging: {
      level: 'debug',
      enableConsole: true,
      enableFile: false
    }
  },

  staging: {
    environment: 'staging',
    stacks: {
      network: 'testnet',
      apiUrl: 'https://api.testnet.hiro.so',
      contractAddress: 'SP[STAGING-CONTRACT].brick-vault-gateway',
      feeRate: 0.000001,
      maxRetries: 5
    },
    evm: {
      network: 'sepolia',
      rpcUrl: 'https://sepolia.infura.io/v3/[STAGING-INFURA-KEY]',
      stacksManagerAddress: '0x[STAGING-MANAGER-ADDRESS]',
      privateKey: process.env.EVM_PRIVATE_KEY || '0x[STAGING-EVM-KEY]',
      gasLimit: 800000,
      maxRetries: 5
    },
    monitoring: {
      interval: 3000, // 3 seconds for staging
      maxRetries: 5,
      retryDelay: 1500,
      batchSize: 20,
      timeout: 45000
    },
    logging: {
      level: 'info',
      enableConsole: true,
      enableFile: true
    }
  },

  production: {
    environment: 'production',
    stacks: {
      network: 'mainnet',
      apiUrl: 'https://api.hiro.so',
      contractAddress: 'SP[PROD-CONTRACT].brick-vault-gateway',
      feeRate: 0.000001,
      maxRetries: 10
    },
    evm: {
      network: 'mainnet',
      rpcUrl: 'https://mainnet.infura.io/v3/[PROD-INFURA-KEY]',
      stacksManagerAddress: '0x[PROD-MANAGER-ADDRESS]',
      privateKey: process.env.EVM_PRIVATE_KEY || '',
      gasLimit: 1000000,
      maxRetries: 10
    },
    monitoring: {
      interval: 2000, // 2 seconds for prod
      maxRetries: 10,
      retryDelay: 1000,
      batchSize: 50,
      timeout: 60000
    },
    logging: {
      level: 'warn',
      enableConsole: false,
      enableFile: true
    }
  }
};

/**
 * Get configuration for the specified environment
 */
export function getConfig(environment?: Environment): RelayerConfig {
  // Handle test environment properly
  let env: Environment;
  if (environment) {
    env = environment;
  } else if (process.env.NODE_ENV === 'test') {
    env = 'test';
  } else if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'staging' || process.env.NODE_ENV === 'production') {
    env = process.env.NODE_ENV as Environment;
  } else {
    env = 'development';
  }
  
  if (!DEFAULT_CONFIGS[env]) {
    throw new Error(`Invalid environment: ${env}. Supported environments: ${Object.keys(DEFAULT_CONFIGS).join(', ')}`);
  }

  const config = { ...DEFAULT_CONFIGS[env] };

  // Override with environment variables if present
  if (process.env.STACKS_NETWORK) {
    config.stacks.network = process.env.STACKS_NETWORK as 'mainnet' | 'testnet';
  }
  if (process.env.STACKS_API_URL) {
    config.stacks.apiUrl = process.env.STACKS_API_URL;
  }
  if (process.env.STACKS_CONTRACT_ADDRESS) {
    config.stacks.contractAddress = process.env.STACKS_CONTRACT_ADDRESS;
  }
  if (process.env.STACKS_FEE_RATE) {
    config.stacks.feeRate = parseFloat(process.env.STACKS_FEE_RATE);
  }

  if (process.env.EVM_NETWORK) {
    config.evm.network = process.env.EVM_NETWORK as 'mainnet' | 'sepolia' | 'polygon' | 'arbitrum';
  }
  if (process.env.EVM_RPC_URL) {
    config.evm.rpcUrl = process.env.EVM_RPC_URL;
  }
  if (process.env.EVM_STACKS_MANAGER_ADDRESS) {
    config.evm.stacksManagerAddress = process.env.EVM_STACKS_MANAGER_ADDRESS;
  }
  if (process.env.EVM_PRIVATE_KEY) {
    config.evm.privateKey = process.env.EVM_PRIVATE_KEY;
  }
  if (process.env.EVM_GAS_LIMIT) {
    config.evm.gasLimit = parseInt(process.env.EVM_GAS_LIMIT);
  }

  if (process.env.MONITORING_INTERVAL) {
    config.monitoring.interval = parseInt(process.env.MONITORING_INTERVAL);
  }
  if (process.env.MONITORING_MAX_RETRIES) {
    config.monitoring.maxRetries = parseInt(process.env.MONITORING_MAX_RETRIES);
  }
  if (process.env.MONITORING_RETRY_DELAY) {
    config.monitoring.retryDelay = parseInt(process.env.MONITORING_RETRY_DELAY);
  }
  if (process.env.MONITORING_BATCH_SIZE) {
    config.monitoring.batchSize = parseInt(process.env.MONITORING_BATCH_SIZE);
  }
  if (process.env.MONITORING_TIMEOUT) {
    config.monitoring.timeout = parseInt(process.env.MONITORING_TIMEOUT);
  }

  if (process.env.LOG_LEVEL) {
    config.logging!.level = process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error';
  }
  if (process.env.LOG_ENABLE_CONSOLE) {
    config.logging!.enableConsole = process.env.LOG_ENABLE_CONSOLE === 'true';
  }
  if (process.env.LOG_ENABLE_FILE) {
    config.logging!.enableFile = process.env.LOG_ENABLE_FILE === 'true';
  }

  return config;
}

/**
 * Validate configuration
 */
export function validateConfig(config: RelayerConfig): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate required fields
  if (!config.evm.privateKey || config.evm.privateKey.includes('[DEV-') || config.evm.privateKey.includes('[STAGING-') || config.evm.privateKey.includes('[PROD-')) {
    errors.push('EVM private key is required and must be set');
  }
  if (!config.stacks.contractAddress || config.stacks.contractAddress.includes('[DEV-') || config.stacks.contractAddress.includes('[STAGING-') || config.stacks.contractAddress.includes('[PROD-')) {
    errors.push('Stacks contract address is required and must be set');
  }
  if (!config.evm.stacksManagerAddress || config.evm.stacksManagerAddress.includes('[DEV-') || config.evm.stacksManagerAddress.includes('[STAGING-') || config.evm.stacksManagerAddress.includes('[PROD-')) {
    errors.push('EVM stacks manager address is required and must be set');
  }

  // Validate network consistency
  if (config.environment === 'production') {
    if (config.stacks.network !== 'mainnet') {
      errors.push('Production environment must use Stacks mainnet');
    }
    if (config.evm.network !== 'mainnet') {
      errors.push('Production environment must use EVM mainnet');
    }
  }

  // Validate monitoring settings
  if (config.monitoring.interval < 1000) {
    errors.push('Monitoring interval must be at least 1000ms');
  }
  if (config.monitoring.maxRetries < 1) {
    errors.push('Monitoring max retries must be at least 1');
  }
  if (config.monitoring.retryDelay < 100) {
    errors.push('Monitoring retry delay must be at least 100ms');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Get configuration summary (without sensitive data)
 */
export function getConfigSummary(config: RelayerConfig) {
  return {
    environment: config.environment,
    stacks: {
      network: config.stacks.network,
      apiUrl: config.stacks.apiUrl,
      contractAddress: config.stacks.contractAddress,
      feeRate: config.stacks.feeRate,
      maxRetries: config.stacks.maxRetries
    },
    evm: {
      network: config.evm.network,
      rpcUrl: config.evm.rpcUrl,
      stacksManagerAddress: config.evm.stacksManagerAddress,
      gasLimit: config.evm.gasLimit,
      maxRetries: config.evm.maxRetries,
      privateKey: config.evm.privateKey ? '***' + config.evm.privateKey.slice(-4) : 'not set'
    },
    monitoring: {
      interval: config.monitoring.interval,
      maxRetries: config.monitoring.maxRetries,
      retryDelay: config.monitoring.retryDelay,
      batchSize: config.monitoring.batchSize,
      timeout: config.monitoring.timeout
    },
    logging: config.logging
  };
}
