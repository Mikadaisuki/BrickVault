// Contract configuration using environment variables
// This ensures contract addresses are always up-to-date after deployment

export const CONTRACT_ADDRESSES = {
  EnvironmentConfig: process.env.NEXT_PUBLIC_ENVIRONMENT_CONFIG_ADDRESS as `0x${string}`,
  MockLayerZeroEndpointA: process.env.NEXT_PUBLIC_MOCK_LAYERZERO_ENDPOINT_A_ADDRESS as `0x${string}`,
  MockLayerZeroEndpointB: process.env.NEXT_PUBLIC_MOCK_LAYERZERO_ENDPOINT_B_ADDRESS as `0x${string}`,
  MockUSDC: process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS as `0x${string}`,
  ShareOFTAdapter: process.env.NEXT_PUBLIC_SHARE_OFT_ADAPTER_ADDRESS as `0x${string}`,
  OFTUSDC: process.env.NEXT_PUBLIC_OFT_USDC_ADDRESS as `0x${string}`,
  PropertyRegistry: process.env.NEXT_PUBLIC_PROPERTY_REGISTRY_ADDRESS as `0x${string}`,
  PropertyVault: process.env.NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS as `0x${string}`,
} as const;

// Note: No demo users - any connected wallet can use the system

export const TOKEN_DECIMALS = {
  USDC: 6,
  OFTUSDC: 18,
  VAULT_SHARES: 18,
} as const;

export const NETWORK_CONFIG = {
  name: process.env.NEXT_PUBLIC_NETWORK_NAME || 'localhost',
  chainId: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '31337'),
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:8545',
} as const;

export const LAYERZERO_CONFIG = {
  // Mock endpoint IDs for testing (same as in test)
  eidA: parseInt(process.env.NEXT_PUBLIC_LAYERZERO_EID_A || '1'), // Source chain (where USDC and OFTAdapter are)
  eidB: parseInt(process.env.NEXT_PUBLIC_LAYERZERO_EID_B || '2'), // Destination chain (where OFTUSDC and PropertyVault are)
  endpointA: CONTRACT_ADDRESSES.MockLayerZeroEndpointA,
  endpointB: CONTRACT_ADDRESSES.MockLayerZeroEndpointB,
} as const;
