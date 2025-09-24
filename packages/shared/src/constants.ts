import { CHAIN_IDS, NETWORKS } from './types';

// Contract Addresses (will be populated during deployment)
export const CONTRACT_ADDRESSES = {
  sepolia: {
    MockUSDC: '',
    PropertyRegistry: '',
    PropertyVault: ''
  },
  'base-sepolia': {
    MockUSDC: '',
    PropertyRegistry: '',
    PropertyVault: ''
  },
  'stacks-testnet': {
    Gateway: '',
    sSHARE: ''
  }
};

// Default Configuration
export const DEFAULT_CONFIG = {
  DEPOSIT_CAP: '1000000000000', // 1M USDC (6 decimals)
  PER_USER_CAP: '100000000000', // 100K USDC (6 decimals)
  MANAGEMENT_FEE_BPS: 100, // 1%
  PERFORMANCE_FEE_BPS: 200, // 2%
  SLIPPAGE_BPS: 50, // 0.5%
  CONFIRMATIONS: {
    EVM: 2,
    STACKS: 6
  }
};

// Gas Limits
export const GAS_LIMITS = {
  DEPOSIT: 200000,
  REDEEM: 150000,
  HARVEST: 100000,
  UPDATE_NAV: 100000,
  CREATE_PROPERTY: 3000000
};

// Time Constants
export const TIME_CONSTANTS = {
  BLOCK_TIME_EVM: 12, // seconds
  BLOCK_TIME_STACKS: 600, // 10 minutes
  FINALITY_WAIT_EVM: 2, // blocks
  FINALITY_WAIT_STACKS: 6, // blocks
  RENT_HARVEST_INTERVAL: 86400, // 1 day in seconds
  NAV_UPDATE_INTERVAL: 2592000 // 30 days in seconds
};

// Error Codes
export const ERROR_CODES = {
  VAULT_PAUSED: 'VAULT_PAUSED',
  DEPOSIT_CAP_EXCEEDED: 'DEPOSIT_CAP_EXCEEDED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INSUFFICIENT_ALLOWANCE: 'INSUFFICIENT_ALLOWANCE',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  PROPERTY_NOT_FOUND: 'PROPERTY_NOT_FOUND',
  PROPERTY_PAUSED: 'PROPERTY_PAUSED',
  RELAYER_ERROR: 'RELAYER_ERROR',
  SLIPPAGE_EXCEEDED: 'SLIPPAGE_EXCEEDED'
};

// Event Signatures
export const EVENT_SIGNATURES = {
  DEPOSIT_INTENT: 'DepositIntent(uint32,address,uint256,address,uint256)',
  REDEEM_INTENT: 'RedeemIntent(uint32,address,uint256,uint8,uint256)',
  PROPERTY_CREATED: 'PropertyCreated(uint32,address,string,string,uint256)',
  RENT_HARVESTED: 'RentHarvested(uint256,uint256,uint32)',
  NAV_UPDATED: 'NAVUpdated(uint32,int256,uint256)'
};

// API Endpoints
export const API_ENDPOINTS = {
  STACKS_NODE: 'https://stacks-node-api.testnet.stacks.co',
  STACKS_EXPLORER: 'https://explorer.stacks.co',
  ETHEREUM_EXPLORER: 'https://sepolia.etherscan.io',
  BASE_EXPLORER: 'https://sepolia.basescan.org'
};

// UI Constants
export const UI_CONSTANTS = {
  DECIMALS: {
    USDC: 6,
    SHARES: 18,
    PERCENTAGE: 2
  },
  REFRESH_INTERVAL: 30000, // 30 seconds
  MAX_RETRIES: 3,
  TOAST_DURATION: 5000 // 5 seconds
};

// Validation Constants
export const VALIDATION = {
  MIN_DEPOSIT: '1000000', // 1 USDC (6 decimals)
  MAX_DEPOSIT: '1000000000000', // 1M USDC (6 decimals)
  MIN_SHARES: '1000000000000000', // 0.001 shares (18 decimals)
  MAX_SLIPPAGE_BPS: 1000, // 10%
  MIN_SLIPPAGE_BPS: 1 // 0.01%
};

// Feature Flags
export const FEATURE_FLAGS = {
  ENABLE_BTC_PAYOUT: true,
  ENABLE_REDEMPTION_WINDOWS: false,
  ENABLE_KYC: false,
  ENABLE_FEES: true,
  ENABLE_NAV_UPDATES: true,
  ENABLE_RENT_HARVEST: true
};

// Export all constants
export {
  CHAIN_IDS,
  NETWORKS
};
