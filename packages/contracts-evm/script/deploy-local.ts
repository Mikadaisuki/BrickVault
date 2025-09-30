import { ethers } from 'hardhat';

async function main() {
  console.log('🚀 Starting Cross-Chain USDC Demo Deployment...\n');

  // Get signers
  // @ts-expect-error - Hardhat type augmentation
  const signers = await ethers.getSigners();
  const [deployer, user1, user2] = signers;
  console.log('📋 Deployer:', deployer.address);
  console.log('👤 User 1:', user1.address);
  console.log('👤 User 2:', user2.address);
  console.log('💰 Deployer Balance:', ethers.formatEther(await deployer.provider.getBalance(deployer.address)), 'ETH\n');

  // 1. Deploy EnvironmentConfig
  console.log('1️⃣ Deploying EnvironmentConfig...');
  const EnvironmentConfig = await ethers.getContractFactory('EnvironmentConfig');
  const environmentConfig = await EnvironmentConfig.deploy(deployer.address);
  await environmentConfig.waitForDeployment();
  console.log('✅ EnvironmentConfig deployed to:', await environmentConfig.getAddress());

  // 2. Deploy Mock LayerZero Endpoints V2 (two separate chains)
  console.log('\n2️⃣ Deploying Mock LayerZero Endpoints V2...');
  const eidA = 1; // Source chain (where USDC and OFTAdapter are)
  const eidB = 2; // Destination chain (where OFTUSDC and PropertyVault are)
  
  const EndpointV2Mock = await ethers.getContractFactory('EndpointV2Mock');
  const mockEndpointA = await EndpointV2Mock.deploy(eidA);
  await mockEndpointA.waitForDeployment();
  console.log('✅ Mock LayerZero Endpoint A (eid:', eidA, ') deployed to:', await mockEndpointA.getAddress());
  
  const mockEndpointB = await EndpointV2Mock.deploy(eidB);
  await mockEndpointB.waitForDeployment();
  console.log('✅ Mock LayerZero Endpoint B (eid:', eidB, ') deployed to:', await mockEndpointB.getAddress());

  // 3. Deploy MockUSDC (canonical ERC20)
  console.log('\n3️⃣ Deploying MockUSDC...');
  const MockUSDC = await ethers.getContractFactory('MockUSDC');
  const mockUSDC = await MockUSDC.deploy(
    'USD Coin',
    'USDC',
    6, // USDC has 6 decimals
    deployer.address
  );
  await mockUSDC.waitForDeployment();
  console.log('✅ MockUSDC deployed to:', await mockUSDC.getAddress());
  console.log('📊 MockUSDC total supply:', ethers.formatUnits(await mockUSDC.totalSupply(), 6), 'USDC');

  // 4. Deploy ShareOFTAdapter for USDC (on chain A)
  console.log('\n4️⃣ Deploying ShareOFTAdapter (Chain A)...');
  const ShareOFTAdapter = await ethers.getContractFactory('ShareOFTAdapter');
  const oftAdapter = await ShareOFTAdapter.deploy(
    await mockUSDC.getAddress(),
    await mockEndpointA.getAddress(),
    deployer.address
  );
  await oftAdapter.waitForDeployment();
  console.log('✅ ShareOFTAdapter deployed to:', await oftAdapter.getAddress());

  // 5. Deploy OFTUSDC (the actual token that vault will accept) (on chain B)
  console.log('\n5️⃣ Deploying OFTUSDC (Chain B)...');
  const OFTUSDC = await ethers.getContractFactory('OFTUSDC');
  const oftUSDC = await OFTUSDC.deploy(
    'USD Coin OFT',
    'USDC',
    await mockEndpointB.getAddress(),
    deployer.address
  );
  await oftUSDC.waitForDeployment();
  console.log('✅ OFTUSDC deployed to:', await oftUSDC.getAddress());
  console.log('📊 OFTUSDC total supply:', ethers.formatUnits(await oftUSDC.totalSupply(), 18), 'OFTUSDC');

  // 5.5. Configure LayerZero endpoints for cross-chain communication
  console.log('\n5️⃣.5️⃣ Configuring LayerZero endpoints...');
  await mockEndpointA.setDestLzEndpoint(await oftUSDC.getAddress(), await mockEndpointB.getAddress());
  await mockEndpointB.setDestLzEndpoint(await oftAdapter.getAddress(), await mockEndpointA.getAddress());
  console.log('✅ LayerZero endpoints configured');

  // 5.6. Set peers for cross-chain communication
  console.log('\n5️⃣.6️⃣ Setting up peer relationships...');
  await oftAdapter.connect(deployer).setPeer(eidB, ethers.zeroPadValue(await oftUSDC.getAddress(), 32));
  await oftUSDC.connect(deployer).setPeer(eidA, ethers.zeroPadValue(await oftAdapter.getAddress(), 32));
  console.log('✅ Peer relationships established');

  // 6. Deploy PropertyRegistry
  console.log('\n6️⃣ Deploying PropertyRegistry...');
  const PropertyRegistry = await ethers.getContractFactory('PropertyRegistry');
  const propertyRegistry = await PropertyRegistry.deploy(
    deployer.address,
    await environmentConfig.getAddress()
  );
  await propertyRegistry.waitForDeployment();
  console.log('✅ PropertyRegistry deployed to:', await propertyRegistry.getAddress());

  // 7. Create a demo property and get the vault address
  console.log('\n7️⃣ Creating demo property...');
  const VAULT_DEPOSIT_CAP = ethers.parseUnits('1000000', 18); // 1M vault shares
  const createPropertyTx = await propertyRegistry.createProperty(
    'Demo Property - Cross-Chain USDC',
    VAULT_DEPOSIT_CAP,
    await oftUSDC.getAddress() // underlying asset should be OFTUSDC
  );
  const receipt = await createPropertyTx.wait();
  
  // Extract vault address from event
  const propertyCreatedEvent = receipt?.logs.find(
    log => log.topics[0] === propertyRegistry.interface.getEvent('PropertyCreated').topicHash
  );
  
  let propertyVaultAddress = '';
  if (propertyCreatedEvent) {
    const decoded = propertyRegistry.interface.parseLog(propertyCreatedEvent);
    propertyVaultAddress = decoded?.args.vault;
    console.log('✅ Demo property created with vault at:', propertyVaultAddress);
  }

  // 8. Transfer USDC to users for testing
  console.log('\n8️⃣ Setting up test users...');
  const userAmount = ethers.parseUnits('10000', 6); // 10K USDC per user
  await mockUSDC.transfer(user1.address, userAmount);
  await mockUSDC.transfer(user2.address, userAmount);
  
  const user1Balance = await mockUSDC.balanceOf(user1.address);
  const user2Balance = await mockUSDC.balanceOf(user2.address);
  console.log('✅ User 1 USDC balance:', ethers.formatUnits(user1Balance, 6), 'USDC');
  console.log('✅ User 2 USDC balance:', ethers.formatUnits(user2Balance, 6), 'USDC');

  // 9. Transfer some OFTUSDC to users for direct testing
  console.log('\n9️⃣ Setting up OFTUSDC for users...');
  const oftAmount = ethers.parseUnits('5000', 18); // 5K OFTUSDC per user
  await oftUSDC.transfer(user1.address, oftAmount);
  await oftUSDC.transfer(user2.address, oftAmount);
  
  const user1OFTBalance = await oftUSDC.balanceOf(user1.address);
  const user2OFTBalance = await oftUSDC.balanceOf(user2.address);
  console.log('✅ User 1 OFTUSDC balance:', ethers.formatUnits(user1OFTBalance, 18), 'OFTUSDC');
  console.log('✅ User 2 OFTUSDC balance:', ethers.formatUnits(user2OFTBalance, 18), 'OFTUSDC');

  // 10. Display deployment summary
  console.log('\n🎉 Cross-Chain USDC Demo Deployment Complete!');
  console.log('=' .repeat(60));
  console.log('📋 DEPLOYMENT SUMMARY:');
  console.log('=' .repeat(60));
  console.log('🔧 EnvironmentConfig:', await environmentConfig.getAddress());
  console.log('🌐 Mock LayerZero Endpoint A (eid', eidA + '):', await mockEndpointA.getAddress());
  console.log('🌐 Mock LayerZero Endpoint B (eid', eidB + '):', await mockEndpointB.getAddress());
  console.log('💰 MockUSDC:', await mockUSDC.getAddress());
  console.log('🔗 ShareOFTAdapter:', await oftAdapter.getAddress());
  console.log('🚀 OFTUSDC:', await oftUSDC.getAddress());
  console.log('📊 PropertyRegistry:', await propertyRegistry.getAddress());
  console.log('🏠 PropertyVault:', propertyVaultAddress);
  console.log('=' .repeat(60));
  
  console.log('\n🎯 DEMO FLOW:');
  console.log('1. User approves MockUSDC to ShareOFTAdapter');
  console.log('2. User deposits MockUSDC to get OFTUSDC (via ShareOFTAdapter)');
  console.log('3. User approves OFTUSDC to PropertyVault');
  console.log('4. User deposits OFTUSDC to PropertyVault to get vault shares');
  console.log('5. User can withdraw vault shares back to OFTUSDC');
  
  console.log('\n💡 NEXT STEPS:');
  console.log('- Update frontend with these contract addresses');
  console.log('- Implement USDC → OFTUSDC conversion interface');
  console.log('- Implement OFTUSDC → PropertyVault deposit interface');
  console.log('- Test the complete cross-chain flow!');

  // Save deployment info to a JSON file for frontend
  const deploymentInfo = {
    network: 'localhost',
    chainId: 31337,
    contracts: {
      EnvironmentConfig: await environmentConfig.getAddress(),
      MockLayerZeroEndpointA: await mockEndpointA.getAddress(),
      MockLayerZeroEndpointB: await mockEndpointB.getAddress(),
      MockUSDC: await mockUSDC.getAddress(),
      ShareOFTAdapter: await oftAdapter.getAddress(),
      OFTUSDC: await oftUSDC.getAddress(),
      PropertyRegistry: await propertyRegistry.getAddress(),
      PropertyVault: propertyVaultAddress
    },
    layerzero: {
      eidA: eidA,
      eidB: eidB
    },
    users: {
      deployer: deployer.address,
      user1: user1.address,
      user2: user2.address
    },
    deploymentTime: new Date().toISOString()
  };

  const fs = require('fs');
  const path = require('path');
  const deploymentPath = path.join(__dirname, '../deployments/localhost.json');
  
  // Ensure deployments directory exists
  const deploymentsDir = path.dirname(deploymentPath);
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log('\n💾 Deployment info saved to:', deploymentPath);

  // Generate frontend environment files
  console.log('\n🌐 Generating frontend environment files...');
  
  // Generate .env.local for frontend
  const frontendEnvPath = path.join(__dirname, '../../../apps/frontend/.env.local');
  const envContent = `# Auto-generated by deployment script - ${new Date().toISOString()}
# Cross-Chain USDC Demo Contract Addresses

NEXT_PUBLIC_NETWORK_NAME=localhost
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://localhost:8545

# Contract Addresses
NEXT_PUBLIC_ENVIRONMENT_CONFIG_ADDRESS=${await environmentConfig.getAddress()}
NEXT_PUBLIC_MOCK_LAYERZERO_ENDPOINT_A_ADDRESS=${await mockEndpointA.getAddress()}
NEXT_PUBLIC_MOCK_LAYERZERO_ENDPOINT_B_ADDRESS=${await mockEndpointB.getAddress()}
NEXT_PUBLIC_MOCK_USDC_ADDRESS=${await mockUSDC.getAddress()}
NEXT_PUBLIC_SHARE_OFT_ADAPTER_ADDRESS=${await oftAdapter.getAddress()}
NEXT_PUBLIC_OFT_USDC_ADDRESS=${await oftUSDC.getAddress()}
NEXT_PUBLIC_PROPERTY_REGISTRY_ADDRESS=${await propertyRegistry.getAddress()}
NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS=${propertyVaultAddress}

# LayerZero Configuration
NEXT_PUBLIC_LAYERZERO_EID_A=1
NEXT_PUBLIC_LAYERZERO_EID_B=2

# Token Decimals
NEXT_PUBLIC_USDC_DECIMALS=6
NEXT_PUBLIC_OFT_USDC_DECIMALS=18
NEXT_PUBLIC_VAULT_SHARES_DECIMALS=18
`;

  fs.writeFileSync(frontendEnvPath, envContent);
  console.log('✅ Frontend .env.local generated:', frontendEnvPath);

  // Generate .env.example for reference
  const envExamplePath = path.join(__dirname, '../../../apps/frontend/.env.example');
  const envExampleContent = `# Cross-Chain USDC Demo Environment Variables
# Copy this file to .env.local and update with your deployed contract addresses

NEXT_PUBLIC_NETWORK_NAME=localhost
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://localhost:8545

# Contract Addresses
NEXT_PUBLIC_ENVIRONMENT_CONFIG_ADDRESS=
NEXT_PUBLIC_MOCK_LAYERZERO_ENDPOINT_A_ADDRESS=
NEXT_PUBLIC_MOCK_LAYERZERO_ENDPOINT_B_ADDRESS=
NEXT_PUBLIC_MOCK_USDC_ADDRESS=
NEXT_PUBLIC_SHARE_OFT_ADAPTER_ADDRESS=
NEXT_PUBLIC_OFT_USDC_ADDRESS=
NEXT_PUBLIC_PROPERTY_REGISTRY_ADDRESS=
NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS=

# LayerZero Configuration
NEXT_PUBLIC_LAYERZERO_EID_A=1
NEXT_PUBLIC_LAYERZERO_EID_B=2

# Token Decimals
NEXT_PUBLIC_USDC_DECIMALS=6
NEXT_PUBLIC_OFT_USDC_DECIMALS=18
NEXT_PUBLIC_VAULT_SHARES_DECIMALS=18
`;

  fs.writeFileSync(envExamplePath, envExampleContent);
  console.log('✅ Frontend .env.example generated:', envExamplePath);

  // Generate a TypeScript config file for the frontend
  const configPath = path.join(__dirname, '../../../apps/frontend/src/config/contracts.ts');
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const configContent = `// Contract configuration using environment variables
// This ensures contract addresses are always up-to-date after deployment

export const CONTRACT_ADDRESSES = {
  EnvironmentConfig: process.env.NEXT_PUBLIC_ENVIRONMENT_CONFIG_ADDRESS as \`0x\${string}\`,
  MockLayerZeroEndpointA: process.env.NEXT_PUBLIC_MOCK_LAYERZERO_ENDPOINT_A_ADDRESS as \`0x\${string}\`,
  MockLayerZeroEndpointB: process.env.NEXT_PUBLIC_MOCK_LAYERZERO_ENDPOINT_B_ADDRESS as \`0x\${string}\`,
  MockUSDC: process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS as \`0x\${string}\`,
  ShareOFTAdapter: process.env.NEXT_PUBLIC_SHARE_OFT_ADAPTER_ADDRESS as \`0x\${string}\`,
  OFTUSDC: process.env.NEXT_PUBLIC_OFT_USDC_ADDRESS as \`0x\${string}\`,
  PropertyRegistry: process.env.NEXT_PUBLIC_PROPERTY_REGISTRY_ADDRESS as \`0x\${string}\`,
  PropertyVault: process.env.NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS as \`0x\${string}\`,
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
`;

  fs.writeFileSync(configPath, configContent);
  console.log('✅ Frontend contract config generated:', configPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });