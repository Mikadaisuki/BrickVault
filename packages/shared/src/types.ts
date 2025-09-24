// Property and Vault Types
export interface PropertyMeta {
  name: string;
  city: string;
  imageURL: string;
  valuationFreq: number; // How often NAV is updated (in days)
  createdAt: number;
}

export interface RiskParams {
  depositCap: string; // BigInt as string
  perUserCap: string; // BigInt as string
  kycRequired: boolean;
  redemptionWindow: boolean;
  redemptionWindowDays: number;
}

export interface Fees {
  managementFeeBps: number;
  performanceFeeBps: number;
  feeRecipient: string;
}

export interface Property {
  vault: string;
  meta: PropertyMeta;
  risk: RiskParams;
  fees: Fees;
  status: PropertyStatus;
  paused: boolean;
  totalDeposited: string; // BigInt as string
  totalUsers: number;
}

export enum PropertyStatus {
  Inactive = 0,
  Active = 1,
  Paused = 2,
  Closing = 3,
  Archived = 4
}

// Vault Types
export interface VaultMetrics {
  totalAssets: string;
  totalSupply: string;
  assetsPerShare: string;
  utilization: number;
  highWaterMark: string;
}

export interface PropertyMetrics {
  propertyId: number;
  totalRentHarvested: string;
  totalNAVChanges: string;
  lastRentHarvest: number;
  lastNAVUpdate: number;
  currentAssetsPerShare: string;
  totalAssets: string;
  totalSupply: string;
}

export interface PropertyPerformance {
  totalReturn: string;
  rentReturn: string;
  navReturn: string;
  currentValue: string;
  initialValue: string;
}

// Network Types
export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface DeploymentInfo {
  network: NetworkConfig;
  deployer: string;
  contracts: {
    MockUSDC: string;
    PropertyRegistry: string;
    PropertyVault: string;
  };
  property: {
    id: string;
    vault: string;
    meta: PropertyMeta;
    risk: RiskParams;
    fees: Fees;
  };
  timestamp: string;
}

// Event Types
export interface DepositIntent {
  propertyId: number;
  user: string;
  amount: string;
  destEvmAddr: string;
  nonce: number;
  timestamp: number;
}

export interface RedeemIntent {
  propertyId: number;
  user: string;
  shares: string;
  payoutMode: PayoutMode;
  nonce: number;
  timestamp: number;
}

export enum PayoutMode {
  EVM = 0,
  BTC = 1
}

// Relayer Types
export interface RelayerConfig {
  evmRpcUrls: Record<string, string>;
  stacksRpcUrl: string;
  relayerPrivateKey: string;
  confirmations: {
    evm: number;
    stacks: number;
  };
  slippageBps: number;
  payoutModeDefault: PayoutMode;
}

export interface RelayerJob {
  id: string;
  type: 'deposit' | 'redeem';
  propertyId: number;
  user: string;
  amount: string;
  nonce: number;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  evmTxHash?: string;
  stacksTxHash?: string;
  error?: string;
}

export enum JobStatus {
  Pending = 'pending',
  Executing = 'executing',
  Completed = 'completed',
  Failed = 'failed',
  Refunded = 'refunded'
}

// UI Types
export interface PropertyCard {
  id: number;
  name: string;
  city: string;
  imageURL: string;
  status: PropertyStatus;
  depositCap: string;
  totalDeposited: string;
  assetsPerShare: string;
  utilization: number;
  rentYieldRate: number;
  isPerforming: boolean;
}

export interface UserPosition {
  propertyId: number;
  shares: string;
  assetsPerShare: string;
  estimatedValue: string;
  estimatedValueBTC: string;
  accruedSinceDeposit: string;
}

export interface DepositFormData {
  propertyId: number;
  amount: string;
  destEvmAddr: string;
  payoutMode: PayoutMode;
}

export interface RedeemFormData {
  propertyId: number;
  shares: string;
  payoutMode: PayoutMode;
  minReceived?: string;
}

// Error Types
export class VaultError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'VaultError';
  }
}

export class RelayerError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'RelayerError';
  }
}

// Constants
export const MAX_FEE_BPS = 1000; // 10%
export const DEFAULT_MANAGEMENT_FEE_BPS = 100; // 1%
export const DEFAULT_PERFORMANCE_FEE_BPS = 200; // 2%
export const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%

export const CHAIN_IDS = {
  SEPOLIA: 11155111,
  BASE_SEPOLIA: 84532,
  STACKS_TESTNET: 2147483648
} as const;

export const NETWORKS: Record<string, NetworkConfig> = {
  sepolia: {
    chainId: CHAIN_IDS.SEPOLIA,
    name: 'Sepolia',
    rpcUrl: 'https://sepolia.infura.io/v3/YOUR_KEY',
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    }
  },
  'base-sepolia': {
    chainId: CHAIN_IDS.BASE_SEPOLIA,
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    explorerUrl: 'https://sepolia.basescan.org',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    }
  },
  'stacks-testnet': {
    chainId: CHAIN_IDS.STACKS_TESTNET,
    name: 'Stacks Testnet',
    rpcUrl: 'https://stacks-node-api.testnet.stacks.co',
    explorerUrl: 'https://explorer.stacks.co',
    nativeCurrency: {
      name: 'Stacks Token',
      symbol: 'STX',
      decimals: 6
    }
  }
};
