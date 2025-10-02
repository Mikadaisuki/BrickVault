// Import all ABIs
import PropertyRegistryABI from '../abis/PropertyRegistry.json';
import PropertyRegistryAnalyticsABI from '../abis/PropertyRegistryAnalytics.json';
import PropertyVaultABI from '../abis/PropertyVault.json';
import PropertyVaultGovernanceABI from '../abis/PropertyVaultGovernance.json';
import PropertyDAOABI from '../abis/PropertyDAO.json';
import PropertyDAOFactoryABI from '../abis/PropertyDAOFactory.json';
import PropertyTokenABI from '../abis/PropertyToken.json';
import VaultFactoryABI from '../abis/VaultFactory.json';
import OFTUSDCABI from '../abis/OFTUSDC.json';
import ShareOFTABI from '../abis/ShareOFT.json';
import ShareOFTAdapterABI from '../abis/ShareOFTAdapter.json';
import VaultBaseABI from '../abis/VaultBase.json';
import VaultComposerSyncABI from '../abis/VaultComposerSync.json';
import StacksCrossChainManagerABI from '../abis/StacksCrossChainManager.json';
import EnvironmentConfigABI from '../abis/EnvironmentConfig.json';
import MockUSDCABI from '../abis/MockUSDC.json';

// Export all ABIs
export const PROPERTY_REGISTRY_ABI = PropertyRegistryABI;
export const PROPERTY_REGISTRY_ANALYTICS_ABI = PropertyRegistryAnalyticsABI;
export const PROPERTY_VAULT_ABI = PropertyVaultABI;
export const PROPERTY_VAULT_GOVERNANCE_ABI = PropertyVaultGovernanceABI;
export const PROPERTY_DAO_ABI = PropertyDAOABI;
export const PROPERTY_DAO_FACTORY_ABI = PropertyDAOFactoryABI;
export const PROPERTY_TOKEN_ABI = PropertyTokenABI;
export const VAULT_FACTORY_ABI = VaultFactoryABI;
export const OFT_USDC_ABI = OFTUSDCABI;
export const SHARE_OFT_ABI = ShareOFTABI;
export const SHARE_OFT_ADAPTER_ABI = ShareOFTAdapterABI;
export const VAULT_BASE_ABI = VaultBaseABI;
export const VAULT_COMPOSER_SYNC_ABI = VaultComposerSyncABI;
export const STACKS_CROSS_CHAIN_MANAGER_ABI = StacksCrossChainManagerABI;
export const ENVIRONMENT_CONFIG_ABI = EnvironmentConfigABI;
export const MOCK_USDC_ABI = MockUSDCABI;

// Export all ABIs as a single object for convenience
export const ABIS = {
  PropertyRegistry: PROPERTY_REGISTRY_ABI,
  PropertyRegistryAnalytics: PROPERTY_REGISTRY_ANALYTICS_ABI,
  PropertyVault: PROPERTY_VAULT_ABI,
  PropertyVaultGovernance: PROPERTY_VAULT_GOVERNANCE_ABI,
  PropertyDAO: PROPERTY_DAO_ABI,
  PropertyDAOFactory: PROPERTY_DAO_FACTORY_ABI,
  PropertyToken: PROPERTY_TOKEN_ABI,
  VaultFactory: VAULT_FACTORY_ABI,
  OFTUSDC: OFT_USDC_ABI,
  ShareOFT: SHARE_OFT_ABI,
  ShareOFTAdapter: SHARE_OFT_ADAPTER_ABI,
  VaultBase: VAULT_BASE_ABI,
  VaultComposerSync: VAULT_COMPOSER_SYNC_ABI,
  StacksCrossChainManager: STACKS_CROSS_CHAIN_MANAGER_ABI,
  EnvironmentConfig: ENVIRONMENT_CONFIG_ABI,
  MockUSDC: MOCK_USDC_ABI,
} as const;

// Export types for better TypeScript support
export type ContractABI = typeof ABIS[keyof typeof ABIS];
export type ContractName = keyof typeof ABIS;
