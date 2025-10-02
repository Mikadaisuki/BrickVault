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

  // 6. Deploy VaultFactory
  console.log('\n6️⃣ Deploying VaultFactory...');
  const VaultFactory = await ethers.getContractFactory('VaultFactory');
  const vaultFactory = await VaultFactory.deploy(deployer.address);
  await vaultFactory.waitForDeployment();
  console.log('✅ VaultFactory deployed to:', await vaultFactory.getAddress());

  // 7. Deploy PropertyDAOFactory
  console.log('\n7️⃣ Deploying PropertyDAOFactory...');
  const PropertyDAOFactory = await ethers.getContractFactory('PropertyDAOFactory');
  const propertyDAOFactory = await PropertyDAOFactory.deploy();
  await propertyDAOFactory.waitForDeployment();
  console.log('✅ PropertyDAOFactory deployed to:', await propertyDAOFactory.getAddress());

  // 8. Deploy PropertyRegistry
  console.log('\n8️⃣ Deploying PropertyRegistry...');
  const PropertyRegistry = await ethers.getContractFactory('PropertyRegistry');
  const propertyRegistry = await PropertyRegistry.deploy(
    deployer.address,
    await environmentConfig.getAddress(),
    await vaultFactory.getAddress()
  );
  await propertyRegistry.waitForDeployment();
  console.log('✅ PropertyRegistry deployed to:', await propertyRegistry.getAddress());

  // 7.5. Authorize PropertyRegistry to create vaults
  console.log('\n7️⃣.5️⃣ Authorizing PropertyRegistry to create vaults...');
  await vaultFactory.connect(deployer).addAuthorizedCaller(await propertyRegistry.getAddress());
  console.log('✅ PropertyRegistry authorized');

  // 8. Create a demo property and get the vault address
  console.log('\n8️⃣ Creating demo property...');
  const VAULT_DEPOSIT_CAP = ethers.parseUnits('10000', 18); // 100K vault shares
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

  // 8.5. Deploy PropertyDAO for governance
  console.log('\n8️⃣.5️⃣ Deploying PropertyDAO...');
  const PropertyDAO = await ethers.getContractFactory('PropertyDAO');
  const propertyDAO = await PropertyDAO.deploy(
    propertyVaultAddress, // propertyVault address
    deployer.address // owner
  );
  await propertyDAO.waitForDeployment();
  console.log('✅ PropertyDAO deployed to:', await propertyDAO.getAddress());

  // 8.6. Link DAO to PropertyVault
  console.log('\n8️⃣.6️⃣ Linking DAO to PropertyVault...');
  const propertyVault = await ethers.getContractAt('PropertyVaultGovernance', propertyVaultAddress);
  await propertyVault.connect(deployer).setDAO(await propertyDAO.getAddress());
  console.log('✅ DAO linked to PropertyVault');

  // 8.7. Set funding target to trigger automatic proposal creation when reached
  console.log('\n8️⃣.7️⃣ Setting funding target...');
  const FUNDING_TARGET = ethers.parseUnits('5000', 18); // 5K OFTUSDC target
  const FUNDING_DEADLINE = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days from now
  await propertyDAO.setFundingTarget(FUNDING_TARGET, FUNDING_DEADLINE);
  console.log('✅ Funding target set to:', ethers.formatUnits(FUNDING_TARGET, 18), 'OFTUSDC');
  console.log('✅ Funding deadline:', new Date(FUNDING_DEADLINE * 1000).toLocaleString());

  // 9. Transfer USDC to users for testing
  console.log('\n9️⃣ Setting up test users with MockUSDC...');
  const userAmount = ethers.parseUnits('10000', 6); // 10K USDC per user
  await mockUSDC.transfer(user1.address, userAmount);
  await mockUSDC.transfer(user2.address, userAmount);
  
  const user1Balance = await mockUSDC.balanceOf(user1.address);
  const user2Balance = await mockUSDC.balanceOf(user2.address);
  console.log('✅ User 1 MockUSDC balance:', ethers.formatUnits(user1Balance, 6), 'USDC');
  console.log('✅ User 2 MockUSDC balance:', ethers.formatUnits(user2Balance, 6), 'USDC');

  // 10. Transfer some OFTUSDC to users for direct testing
  console.log('\n🔟 Setting up OFTUSDC for users...');
  const oftAmount = ethers.parseUnits('5000', 18); // 5K OFTUSDC per user
  await oftUSDC.transfer(user1.address, oftAmount);
  await oftUSDC.transfer(user2.address, oftAmount);
  
  const user1OFTBalance = await oftUSDC.balanceOf(user1.address);
  const user2OFTBalance = await oftUSDC.balanceOf(user2.address);
  console.log('✅ User 1 OFTUSDC balance:', ethers.formatUnits(user1OFTBalance, 18), 'OFTUSDC');
  console.log('✅ User 2 OFTUSDC balance:', ethers.formatUnits(user2OFTBalance, 18), 'OFTUSDC');

  // 11. Display deployment summary
  console.log('\n' + '='.repeat(80));
  console.log('🎉 BrickVault Property Investment Platform - Deployment Complete!');
  console.log('='.repeat(80));
  
  console.log('\n📋 CONTRACT ADDRESSES:');
  console.log('-'.repeat(80));
  console.log('Infrastructure:');
  console.log('  🔧 EnvironmentConfig:', await environmentConfig.getAddress());
  console.log('  🌐 LayerZero Endpoint A (eid ' + eidA + '):', await mockEndpointA.getAddress());
  console.log('  🌐 LayerZero Endpoint B (eid ' + eidB + '):', await mockEndpointB.getAddress());
  
  console.log('\nToken Layer:');
  console.log('  💰 MockUSDC (6 decimals):', await mockUSDC.getAddress());
  console.log('  🔗 ShareOFTAdapter:', await oftAdapter.getAddress());
  console.log('  🚀 OFTUSDC (18 decimals):', await oftUSDC.getAddress());
  
  console.log('\nProperty Layer:');
  console.log('  🏭 VaultFactory:', await vaultFactory.getAddress());
  console.log('  📊 PropertyRegistry:', await propertyRegistry.getAddress());
  console.log('  🏠 PropertyVault (PropertyVaultGovernance):', propertyVaultAddress);
  console.log('  🗳️  PropertyDAO:', await propertyDAO.getAddress());
  
  console.log('\n👥 Test Users:');
  console.log('  Platform:', deployer.address);
  console.log('  User 1:', user1.address, '(10K USDC + 5K OFTUSDC)');
  console.log('  User 2:', user2.address, '(10K USDC + 5K OFTUSDC)');
  
  console.log('\n' + '='.repeat(80));
  console.log('📖 COMPLETE INVESTMENT FLOW:');
  console.log('='.repeat(80));
  console.log('\n💰 FUNDING PHASE (OpenToFund Stage):');
  console.log('  1. Users have MockUSDC (6 decimals - like real USDC)');
  console.log('  2. Users convert MockUSDC → OFTUSDC via ShareOFTAdapter (6→18 decimals)');
  console.log('  3. Users deposit OFTUSDC to PropertyVault');
  console.log('  4. Users receive vault shares (voting power)');
  console.log('  5. When funding target reached → Auto-transition to Funded stage');
  console.log('  6. Auto-create PropertyPurchase proposal for voting');
  
  console.log('\n🗳️  VOTING PHASE (Funded Stage):');
  console.log('  1. Shareholders vote on property purchase proposal');
  console.log('  2. Voting power = vault shares (1 share = 1 vote)');
  console.log('  3. Requires 30% quorum + 51% majority');
  console.log('  4. After 7 days, execute proposal if passed');
  
  console.log('\n🏠 PURCHASE PHASE (Funded → UnderManagement):');
  console.log('  1. Execute proposal → withdraw USDC from vault');
  console.log('  2. Platform purchases real property');
  console.log('  3. Complete purchase → create PropertyToken');
  console.log('  4. Transition to UnderManagement stage');
  
  console.log('\n💵 MANAGEMENT PHASE (UnderManagement Stage):');
  console.log('  1. Platform collects rent → deposits to vault');
  console.log('  2. Investors withdraw their share of rent income');
  console.log('  3. Principal remains locked in vault');
  console.log('  4. PropertyToken minted/burned for NAV changes');
  
  console.log('\n' + '='.repeat(80));
  console.log('🚀 READY TO USE!');
  console.log('='.repeat(80));
  console.log('\nFunding Target:', ethers.formatUnits(FUNDING_TARGET, 18), 'OFTUSDC');
  console.log('Current Stage: OpenToFund (deposits enabled)');
  console.log('\n✨ Users can now invest in the property!');
  console.log('='.repeat(80));

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
      VaultFactory: await vaultFactory.getAddress(),
      PropertyRegistry: await propertyRegistry.getAddress(),
      PropertyVault: propertyVaultAddress,
      PropertyDAO: await propertyDAO.getAddress()
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
    configuration: {
      vaultDepositCap: VAULT_DEPOSIT_CAP.toString(),
      fundingTarget: FUNDING_TARGET.toString(),
      fundingDeadline: FUNDING_DEADLINE
    },
    decimals: {
      mockUSDC: 6,
      oftUSDC: 18,
      vaultShares: 18
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
# BrickVault Property Investment Platform - Local Deployment

NEXT_PUBLIC_NETWORK_NAME=localhost
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://localhost:8545

# Infrastructure Contracts
NEXT_PUBLIC_ENVIRONMENT_CONFIG_ADDRESS=${await environmentConfig.getAddress()}
NEXT_PUBLIC_MOCK_LAYERZERO_ENDPOINT_A_ADDRESS=${await mockEndpointA.getAddress()}
NEXT_PUBLIC_MOCK_LAYERZERO_ENDPOINT_B_ADDRESS=${await mockEndpointB.getAddress()}

# Token Contracts
NEXT_PUBLIC_MOCK_USDC_ADDRESS=${await mockUSDC.getAddress()}
NEXT_PUBLIC_SHARE_OFT_ADAPTER_ADDRESS=${await oftAdapter.getAddress()}
NEXT_PUBLIC_OFT_USDC_ADDRESS=${await oftUSDC.getAddress()}

# Property Platform Contracts
NEXT_PUBLIC_VAULT_FACTORY_ADDRESS=${await vaultFactory.getAddress()}
NEXT_PUBLIC_PROPERTY_DAO_FACTORY_ADDRESS=${await propertyDAOFactory.getAddress()}
NEXT_PUBLIC_PROPERTY_REGISTRY_ADDRESS=${await propertyRegistry.getAddress()}
NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS=${propertyVaultAddress}
NEXT_PUBLIC_PROPERTY_DAO_ADDRESS=${await propertyDAO.getAddress()}

# LayerZero Configuration
NEXT_PUBLIC_LAYERZERO_EID_A=1
NEXT_PUBLIC_LAYERZERO_EID_B=2

# Token Decimals
NEXT_PUBLIC_USDC_DECIMALS=6
NEXT_PUBLIC_OFT_USDC_DECIMALS=18
NEXT_PUBLIC_VAULT_SHARES_DECIMALS=18

# Property Configuration
NEXT_PUBLIC_FUNDING_TARGET=${FUNDING_TARGET.toString()}
NEXT_PUBLIC_VAULT_DEPOSIT_CAP=${VAULT_DEPOSIT_CAP.toString()}
`;

  fs.writeFileSync(frontendEnvPath, envContent);
  console.log('✅ Frontend .env.local generated:', frontendEnvPath);

  // Generate .env.example for reference
  const envExamplePath = path.join(__dirname, '../../../apps/frontend/.env.example');
  const envExampleContent = `# BrickVault Property Investment Platform
# Copy this file to .env.local and update with your deployed contract addresses

NEXT_PUBLIC_NETWORK_NAME=localhost
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://localhost:8545

# Infrastructure Contracts
NEXT_PUBLIC_ENVIRONMENT_CONFIG_ADDRESS=
NEXT_PUBLIC_MOCK_LAYERZERO_ENDPOINT_A_ADDRESS=
NEXT_PUBLIC_MOCK_LAYERZERO_ENDPOINT_B_ADDRESS=

# Token Contracts
NEXT_PUBLIC_MOCK_USDC_ADDRESS=
NEXT_PUBLIC_SHARE_OFT_ADAPTER_ADDRESS=
NEXT_PUBLIC_OFT_USDC_ADDRESS=

# Property Platform Contracts
NEXT_PUBLIC_VAULT_FACTORY_ADDRESS=
NEXT_PUBLIC_PROPERTY_DAO_FACTORY_ADDRESS=
NEXT_PUBLIC_PROPERTY_REGISTRY_ADDRESS=
NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS=
NEXT_PUBLIC_PROPERTY_DAO_ADDRESS=

# LayerZero Configuration
NEXT_PUBLIC_LAYERZERO_EID_A=1
NEXT_PUBLIC_LAYERZERO_EID_B=2

# Token Decimals
NEXT_PUBLIC_USDC_DECIMALS=6
NEXT_PUBLIC_OFT_USDC_DECIMALS=18
NEXT_PUBLIC_VAULT_SHARES_DECIMALS=18

# Property Configuration
NEXT_PUBLIC_FUNDING_TARGET=
NEXT_PUBLIC_VAULT_DEPOSIT_CAP=
`;

  fs.writeFileSync(envExamplePath, envExampleContent);
  console.log('✅ Frontend .env.example generated:', envExamplePath);

  // Generate a TypeScript config file for the frontend
  const configPath = path.join(__dirname, '../../../apps/frontend/src/config/contracts.ts');
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const configContent = `// BrickVault Contract Configuration
// Auto-generated by deployment script - DO NOT EDIT MANUALLY

export const CONTRACT_ADDRESSES = {
  // Infrastructure
  EnvironmentConfig: process.env.NEXT_PUBLIC_ENVIRONMENT_CONFIG_ADDRESS as \`0x\${string}\`,
  MockLayerZeroEndpointA: process.env.NEXT_PUBLIC_MOCK_LAYERZERO_ENDPOINT_A_ADDRESS as \`0x\${string}\`,
  MockLayerZeroEndpointB: process.env.NEXT_PUBLIC_MOCK_LAYERZERO_ENDPOINT_B_ADDRESS as \`0x\${string}\`,
  
  // Tokens
  MockUSDC: process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS as \`0x\${string}\`,
  ShareOFTAdapter: process.env.NEXT_PUBLIC_SHARE_OFT_ADAPTER_ADDRESS as \`0x\${string}\`,
  OFTUSDC: process.env.NEXT_PUBLIC_OFT_USDC_ADDRESS as \`0x\${string}\`,
  
  // Property Platform
  VaultFactory: process.env.NEXT_PUBLIC_VAULT_FACTORY_ADDRESS as \`0x\${string}\`,
  PropertyDAOFactory: process.env.NEXT_PUBLIC_PROPERTY_DAO_FACTORY_ADDRESS as \`0x\${string}\`,
  PropertyRegistry: process.env.NEXT_PUBLIC_PROPERTY_REGISTRY_ADDRESS as \`0x\${string}\`,
  PropertyVault: process.env.NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS as \`0x\${string}\`,
  PropertyDAO: process.env.NEXT_PUBLIC_PROPERTY_DAO_ADDRESS as \`0x\${string}\`,
} as const;

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
  eidA: parseInt(process.env.NEXT_PUBLIC_LAYERZERO_EID_A || '1'), // Chain A (USDC + Adapter)
  eidB: parseInt(process.env.NEXT_PUBLIC_LAYERZERO_EID_B || '2'), // Chain B (OFTUSDC + Vault)
  endpointA: CONTRACT_ADDRESSES.MockLayerZeroEndpointA,
  endpointB: CONTRACT_ADDRESSES.MockLayerZeroEndpointB,
} as const;

export const PROPERTY_CONFIG = {
  fundingTarget: process.env.NEXT_PUBLIC_FUNDING_TARGET || '0',
  vaultDepositCap: process.env.NEXT_PUBLIC_VAULT_DEPOSIT_CAP || '0',
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