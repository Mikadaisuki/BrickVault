import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import 'dotenv/config';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1, // Very low runs for maximum deployment size optimization
      },
      viaIR: true, // Enable IR-based code generator for better optimization
      debug: {
        revertStrings: 'strip', // Remove revert strings to reduce contract size
      },
    },
  },
  paths: {
    sources: './src',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  networks: {
    hardhat: {
      chainId: 31337,
      allowUnlimitedContractSize: true, // Allow contracts > 24KB for testing
    },
    sepolia: {
      url: process.env.EVM_RPC_SEPOLIA || 'https://eth-sepolia.public.blastapi.io',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
      gas: 30000000, // Set explicit high gas limit for large contract deployments
      gasPrice: 'auto',
    },
    baseSepolia: {
      url: process.env.EVM_RPC_BASE_SEPOLIA || 'https://sepolia.base.org',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532,
    },
    arbitrumSepolia: {
      url: process.env.EVM_RPC_ARBITRUM_SEPOLIA || 'https://sepolia-rollup.arbitrum.io/rpc',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 421614,
    },
    optimismSepolia: {
      url: process.env.EVM_RPC_OPTIMISM_SEPOLIA || 'https://sepolia.optimism.io',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155420,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: 'USD',
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || '',
      baseSepolia: process.env.BASESCAN_API_KEY || '',
      arbitrumSepolia: process.env.ARBISCAN_API_KEY || '',
      optimismSepolia: process.env.OPTIMISM_API_KEY || '',
    },
  },
  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6',
  },
};

export default config;
