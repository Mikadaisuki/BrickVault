import { ethers } from 'hardhat';

async function main() {
  console.log('🚀 Starting BrickVault Testnet Deployment (Sepolia Hub Chain)...\n');
  console.log('='.repeat(80));
  console.log('📋 TESTNET DEPLOYMENT ARCHITECTURE');
  console.log('='.repeat(80));
  console.log('');
  console.log('🎯 HUB CHAIN DEPLOYMENT (SEPOLIA):');
  console.log('  ✅ Hub Chain: Sepolia (11155111)');
  console.log('  ✅ Flow: MockUSDC → USDCOFTAdapter → OFTUSDC → PropertyVault');
  console.log('  ✅ Lockbox Model: OFTUSDC backed by locked USDC');
  console.log('  ✅ Real LayerZero V2 endpoint');
  console.log('  📝 Spoke chains deployed separately (when needed)');
  console.log('');
  console.log('💡 Benefits:');
  console.log('  • Perfect consistency: Same contract, same flow everywhere');
  console.log('  • Perfect fungibility: All OFTUSDC backed by locked USDC');
  console.log('  • Flexible redemption: Withdraw to any chain with adapter');
  console.log('  • Real cross-chain testing with LayerZero V2');
  console.log('');
  console.log('='.repeat(80));
  console.log('\n');

  // Get deployer
  // @ts-expect-error - Hardhat type augmentation
  const [deployer] = await ethers.getSigners();
  console.log('📋 Deployer:', deployer.address);
  console.log('💰 Deployer Balance:', ethers.formatEther(await deployer.provider.getBalance(deployer.address)), 'ETH\n');

  // LayerZero V2 Configuration (Hub Chain Only)
  // Reference: https://docs.layerzero.network/v2/developers/evm/technical-reference/deployed-contracts
  const SEPOLIA_EID = 40161;  // Sepolia Hub Chain
  
  // LayerZero V2 Endpoint Address for Sepolia
  // Verify from: https://docs.layerzero.network/v2/developers/evm/technical-reference/deployed-contracts
  const SEPOLIA_ENDPOINT = '0x6EDCE65403992e310A62460808c4b910D972f10f'; // Sepolia EndpointV2
  
  console.log('🌐 LayerZero V2 Configuration (Hub Chain):');
  console.log('  Hub EID:', SEPOLIA_EID, '(Sepolia)');
  console.log('  Sepolia Endpoint:', SEPOLIA_ENDPOINT);
  console.log('  📝 Spoke chain deployment is separate (when needed)');
  console.log('');

  // 1. Deploy EnvironmentConfig on Sepolia (Hub)
  console.log('1️⃣ Deploying EnvironmentConfig on Sepolia...');
  const EnvironmentConfig = await ethers.getContractFactory('EnvironmentConfig');
  const environmentConfig = await EnvironmentConfig.deploy(deployer.address);
  await environmentConfig.waitForDeployment();
  console.log('✅ EnvironmentConfig deployed to:', await environmentConfig.getAddress());

  // 2. Deploy MockUSDC on Sepolia (Hub) - for unlimited testing
  console.log('\n2️⃣ Deploying MockUSDC on Sepolia (Hub)...');
  const MockUSDC = await ethers.getContractFactory('MockUSDC');
  const mockUSDCHub = await MockUSDC.deploy(
    'USD Coin (Sepolia)',
    'USDC',
    6, // USDC has 6 decimals
    deployer.address
  );
  await mockUSDCHub.waitForDeployment();
  const SEPOLIA_USDC = await mockUSDCHub.getAddress();
  console.log('✅ MockUSDC deployed on Sepolia:', SEPOLIA_USDC);
  console.log('   📝 Deployer has minting rights - unlimited USDC for testing!');
  
  // Note: If you prefer to use real Circle USDC on Sepolia:
  // const SEPOLIA_USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
  // Get from: https://faucet.circle.com/

  // 3. Deploy OFTUSDC on Sepolia (Hub) - the unified OFT token
  console.log('\n3️⃣ Deploying OFTUSDC on Sepolia (Hub)...');
  const OFTUSDC = await ethers.getContractFactory('OFTUSDC');
  const oftUSDC = await OFTUSDC.deploy(
    'OFT USDC',
    'OFTUSDC',
    SEPOLIA_ENDPOINT, // Real LayerZero endpoint
    deployer.address
  );
  await oftUSDC.waitForDeployment();
  console.log('✅ OFTUSDC deployed to:', await oftUSDC.getAddress());
  console.log('📊 OFTUSDC total supply:', ethers.formatUnits(await oftUSDC.totalSupply(), 18), 'OFTUSDC');
  console.log('   📝 Lockbox model: OFTUSDC starts with 0 supply');

  // 4. Deploy USDCOFTAdapter on Sepolia (Hub)
  console.log('\n4️⃣ Deploying USDCOFTAdapter on Sepolia (Hub)...');
  const USDCOFTAdapter = await ethers.getContractFactory('USDCOFTAdapter');
  const usdcOFTAdapterHub = await USDCOFTAdapter.deploy(
    SEPOLIA_USDC, // Circle USDC or MockUSDC
    SEPOLIA_ENDPOINT, // Real LayerZero endpoint
    deployer.address
  );
  await usdcOFTAdapterHub.waitForDeployment();
  console.log('✅ USDCOFTAdapter (Hub) deployed to:', await usdcOFTAdapterHub.getAddress());
  console.log('   📝 For Sepolia users: same-chain USDC wrapping');

  // 5. Configure Hub Adapter ↔ Hub OFTUSDC peer relationship
  console.log('\n5️⃣ Setting up peer relationship on hub...');
  await usdcOFTAdapterHub.connect(deployer).setPeer(SEPOLIA_EID, ethers.zeroPadValue(await oftUSDC.getAddress(), 32));
  await oftUSDC.connect(deployer).setPeer(SEPOLIA_EID, ethers.zeroPadValue(await usdcOFTAdapterHub.getAddress(), 32));
  console.log('✅ Hub: Adapter ↔ OFTUSDC (same-chain)');

  // 6. Deploy VaultFactory on Sepolia
  console.log('\n6️⃣ Deploying VaultFactory on Sepolia...');
  const VaultFactory = await ethers.getContractFactory('VaultFactory');
  const vaultFactory = await VaultFactory.deploy(deployer.address);
  await vaultFactory.waitForDeployment();
  console.log('✅ VaultFactory deployed to:', await vaultFactory.getAddress());

  // 7. Deploy PropertyDAOFactory on Sepolia
  console.log('\n7️⃣ Deploying PropertyDAOFactory on Sepolia...');
  const PropertyDAOFactory = await ethers.getContractFactory('PropertyDAOFactory');
  const propertyDAOFactory = await PropertyDAOFactory.deploy();
  await propertyDAOFactory.waitForDeployment();
  console.log('✅ PropertyDAOFactory deployed to:', await propertyDAOFactory.getAddress());

  // 8. Deploy PropertyRegistry on Sepolia
  console.log('\n8️⃣ Deploying PropertyRegistry on Sepolia...');
  const PropertyRegistry = await ethers.getContractFactory('PropertyRegistry');
  const propertyRegistry = await PropertyRegistry.deploy(
    deployer.address,
    await environmentConfig.getAddress(),
    await vaultFactory.getAddress()
  );
  await propertyRegistry.waitForDeployment();
  console.log('✅ PropertyRegistry deployed to:', await propertyRegistry.getAddress());

  // 8.5. Authorize PropertyRegistry to create vaults
  console.log('\n8️⃣.5️⃣ Authorizing PropertyRegistry to create vaults...');
  await vaultFactory.connect(deployer).addAuthorizedCaller(await propertyRegistry.getAddress());
  console.log('✅ PropertyRegistry authorized');

  // 9. Create a demo property and get the vault address
  console.log('\n9️⃣ Creating demo property on Sepolia...');
  const VAULT_DEPOSIT_CAP = ethers.parseUnits('100000', 18); // 100K OFTUSDC cap
  const createPropertyTx = await propertyRegistry.createProperty(
    'Sepolia Test Property - Cross-Chain USDC',
    VAULT_DEPOSIT_CAP,
    await oftUSDC.getAddress() // underlying asset is OFTUSDC
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

  // 10. Deploy PropertyDAO for governance
  console.log('\n🔟 Deploying PropertyDAO on Sepolia...');
  const PropertyDAO = await ethers.getContractFactory('PropertyDAO');
  const propertyDAO = await PropertyDAO.deploy(
    propertyVaultAddress,
    deployer.address
  );
  await propertyDAO.waitForDeployment();
  console.log('✅ PropertyDAO deployed to:', await propertyDAO.getAddress());

  // 10.5. Link DAO to PropertyVault
  console.log('\n🔟.5️⃣ Linking DAO to PropertyVault...');
  const propertyVault = await ethers.getContractAt('PropertyVaultGovernance', propertyVaultAddress);
  await propertyVault.connect(deployer).setDAO(await propertyDAO.getAddress());
  console.log('✅ DAO linked to PropertyVault');

  // 10.6. Set funding target
  console.log('\n🔟.6️⃣ Setting funding target...');
  const FUNDING_TARGET = ethers.parseUnits('50000', 18); // 50K OFTUSDC target
  const FUNDING_DEADLINE = Math.floor(Date.now() / 1000) + (60 * 24 * 60 * 60); // 60 days
  await propertyDAO.setFundingTarget(FUNDING_TARGET, FUNDING_DEADLINE);
  console.log('✅ Funding target set to:', ethers.formatUnits(FUNDING_TARGET, 18), 'OFTUSDC');
  console.log('✅ Funding deadline:', new Date(FUNDING_DEADLINE * 1000).toLocaleString());

  // 11. Deploy StacksCrossChainManager for Stacks integration
  console.log('\n1️⃣1️⃣ Deploying StacksCrossChainManager on Sepolia...');
  const StacksCrossChainManager = await ethers.getContractFactory('StacksCrossChainManager');
  const stacksManager = await StacksCrossChainManager.deploy(
    await oftUSDC.getAddress(), // OFTUSDC token
    deployer.address, // price oracle (deployer for testing)
    deployer.address, // relayer (deployer for testing)
    deployer.address  // owner
  );
  await stacksManager.waitForDeployment();
  console.log('✅ StacksCrossChainManager deployed to:', await stacksManager.getAddress());

  // 11.1 Set initial sBTC price
  console.log('\n1️⃣1️⃣.1️⃣ Setting initial sBTC price...');
  const initialPrice = ethers.parseUnits('95000', 8); // $95,000
  await stacksManager.updateSbtcPrice(initialPrice);
  console.log('✅ Initial sBTC price set to: $95,000');

  // 11.2 Authorize StacksCrossChainManager as OFTUSDC minter
  console.log('\n1️⃣1️⃣.2️⃣ Authorizing StacksCrossChainManager as OFTUSDC minter...');
  await oftUSDC.addAuthorizedMinter(await stacksManager.getAddress());
  console.log('✅ StacksCrossChainManager authorized to mint OFTUSDC');

  // Verify OFTUSDC lockbox model
  console.log('\n1️⃣2️⃣ Verifying OFTUSDC lockbox model...');
  const totalSupply = await oftUSDC.totalSupply();
  console.log('✅ OFTUSDC total supply:', ethers.formatUnits(totalSupply, 18), 'OFTUSDC');
  console.log('   📝 Lockbox model: OFTUSDC is only minted when USDC is locked in adapter');

  // 13. Mint MockUSDC to deployer for testing
  console.log('\n1️⃣3️⃣ Minting MockUSDC for testing...');
  const mintAmount = ethers.parseUnits('1000000', 6); // 1M USDC for testing
  await mockUSDCHub.mint(deployer.address, mintAmount);
  const deployerBalance = await mockUSDCHub.balanceOf(deployer.address);
  console.log('✅ Deployer MockUSDC balance:', ethers.formatUnits(deployerBalance, 6), 'USDC');
  console.log('   📝 Use deployer account to mint USDC to test users as needed');

  // Display deployment summary
  console.log('\n' + '='.repeat(80));
  console.log('🎉 BrickVault Testnet Deployment Complete!');
  console.log('='.repeat(80));
  
  console.log('\n📋 DEPLOYED CONTRACT ADDRESSES (SEPOLIA):');
  console.log('-'.repeat(80));
  console.log('Infrastructure:');
  console.log('  🔧 EnvironmentConfig:', await environmentConfig.getAddress());
  console.log('  🌐 LayerZero Endpoint:', SEPOLIA_ENDPOINT);
  
  console.log('\nToken Layer (Unified Adapter):');
  console.log('  💰 MockUSDC (Sepolia - 6 decimals):', SEPOLIA_USDC);
  console.log('     📝 Deployer can mint unlimited USDC for testing');
  console.log('  🌉 USDCOFTAdapter (Hub):', await usdcOFTAdapterHub.getAddress());
  console.log('  🚀 OFTUSDC (Hub - 18 decimals):', await oftUSDC.getAddress());
  
  console.log('\nProperty Layer (All on Sepolia):');
  console.log('  🏭 VaultFactory:', await vaultFactory.getAddress());
  console.log('  📊 PropertyRegistry:', await propertyRegistry.getAddress());
  console.log('  🏠 PropertyVault:', propertyVaultAddress);
  console.log('  🗳️  PropertyDAO:', await propertyDAO.getAddress());
  
  console.log('\nCross-Chain Layer:');
  console.log('  🌉 StacksCrossChainManager:', await stacksManager.getAddress());
  console.log('  💱 sBTC Price: $95,000');
  console.log('  🔑 Relayer:', deployer.address);
  
  console.log('\n' + '='.repeat(80));
  console.log('📖 SEPOLIA TESTNET FLOW:');
  console.log('='.repeat(80));
  console.log('\n💰 Hub Chain Users (Sepolia):');
  console.log('  1. Get Sepolia ETH from faucet (for gas)');
  console.log('  2. Mint MockUSDC using deployer account:');
  console.log('     → mockUSDC.mint(userAddress, amount)');
  console.log('  3. Approve USDCOFTAdapter to spend USDC');
  console.log('  4. Call USDCOFTAdapter.send(SEPOLIA_EID, user, amount)');
  console.log('     → Adapter locks USDC, OFTUSDC mints on same chain');
  console.log('  5. Receive OFTUSDC (18 decimals)');
  console.log('  6. Deposit OFTUSDC to PropertyVault');
  console.log('  7. Receive vault shares (voting power)');
  console.log('');
  console.log('📝 Note: Spoke chain deployment (Arbitrum Sepolia) is separate.');
  console.log('   See TESTNET_DEPLOYMENT.md for spoke chain deployment guide.');
  console.log('');
  console.log('='.repeat(80));
  console.log('🚀 NEXT STEPS:');
  console.log('='.repeat(80));
  console.log('');
  console.log('1. ✅ Deployer has 1M MockUSDC - ready to mint more anytime!');
  console.log('2. Mint USDC to test users:');
  console.log('   → Use Etherscan write function on MockUSDC contract');
  console.log('   → Call mint(userAddress, amount) with 6 decimals');
  console.log('   → Example: mint(0x123..., 10000000000) = 10,000 USDC');
  console.log('3. Test hub chain flow on Sepolia');
  console.log('4. Deploy spoke adapter on Arbitrum Sepolia (optional)');
  console.log('5. Update frontend .env.local with deployed addresses');
  console.log('6. Configure Stacks relayer for testnet');
  console.log('');
  console.log('💡 Minting USDC (Deployer Only):');
  console.log('   mockUSDC.mint(userAddress, amount)');
  console.log('   • amount = USDC value × 10^6 (6 decimals)');
  console.log('   • Example: 1000 USDC = 1000000000 (1000 × 10^6)');
  console.log('');
  console.log('='.repeat(80));

  // Save deployment info to a JSON file
  const deploymentInfo = {
    network: 'sepolia',
    chainId: 11155111,
    contracts: {
      EnvironmentConfig: await environmentConfig.getAddress(),
      SepoliaEndpoint: SEPOLIA_ENDPOINT,
      MockUSDCHub: SEPOLIA_USDC,
      USDCOFTAdapterHub: await usdcOFTAdapterHub.getAddress(),
      OFTUSDC: await oftUSDC.getAddress(),
      VaultFactory: await vaultFactory.getAddress(),
      PropertyDAOFactory: await propertyDAOFactory.getAddress(),
      PropertyRegistry: await propertyRegistry.getAddress(),
      PropertyVault: propertyVaultAddress,
      PropertyDAO: await propertyDAO.getAddress(),
      StacksCrossChainManager: await stacksManager.getAddress()
    },
    minting: {
      mockUSDCDeployer: deployer.address,
      note: 'Use mockUSDC.mint(address, amount) to mint USDC to test users'
    },
    layerzero: {
      hubEID: SEPOLIA_EID,
      hubEndpoint: SEPOLIA_ENDPOINT,
      note: 'Spoke chain deployment is separate - see TESTNET_DEPLOYMENT.md'
    },
    configuration: {
      vaultDepositCap: VAULT_DEPOSIT_CAP.toString(),
      fundingTarget: FUNDING_TARGET.toString(),
      fundingDeadline: FUNDING_DEADLINE
    },
    decimals: {
      usdc: 6,
      oftUSDC: 18,
      vaultShares: 18
    },
    deploymentTime: new Date().toISOString(),
    deployer: deployer.address
  };

  const fs = require('fs');
  const path = require('path');
  const deploymentPath = path.join(__dirname, '../deployments/sepolia.json');
  
  // Ensure deployments directory exists
  const deploymentsDir = path.dirname(deploymentPath);
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log('\n💾 Deployment info saved to:', deploymentPath);

  // Generate frontend environment file for testnet
  console.log('\n🌐 Generating frontend environment file for Sepolia...');
  
  const frontendEnvPath = path.join(__dirname, '../../../apps/frontend/.env.sepolia');
  const envContent = `# Auto-generated by testnet deployment script - ${new Date().toISOString()}
# BrickVault Property Investment Platform - Sepolia Testnet Deployment

NEXT_PUBLIC_NETWORK_NAME=sepolia
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com

# Infrastructure Contracts
NEXT_PUBLIC_ENVIRONMENT_CONFIG_ADDRESS=${await environmentConfig.getAddress()}
NEXT_PUBLIC_HUB_ENDPOINT_ADDRESS=${SEPOLIA_ENDPOINT}
NEXT_PUBLIC_SPOKE_ENDPOINT_ADDRESS=

# Token Contracts (Unified Adapter Architecture - Hub Only)
NEXT_PUBLIC_MOCK_USDC_HUB_ADDRESS=${SEPOLIA_USDC}
NEXT_PUBLIC_MOCK_USDC_SPOKE_ADDRESS=
NEXT_PUBLIC_USDC_OFT_ADAPTER_HUB_ADDRESS=${await usdcOFTAdapterHub.getAddress()}
NEXT_PUBLIC_USDC_OFT_ADAPTER_SPOKE_ADDRESS=
NEXT_PUBLIC_OFT_USDC_ADDRESS=${await oftUSDC.getAddress()}

# Property Platform Contracts
NEXT_PUBLIC_VAULT_FACTORY_ADDRESS=${await vaultFactory.getAddress()}
NEXT_PUBLIC_PROPERTY_DAO_FACTORY_ADDRESS=${await propertyDAOFactory.getAddress()}
NEXT_PUBLIC_PROPERTY_REGISTRY_ADDRESS=${await propertyRegistry.getAddress()}
NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS=${propertyVaultAddress}
NEXT_PUBLIC_PROPERTY_DAO_ADDRESS=${await propertyDAO.getAddress()}

# Cross-Chain Contracts
NEXT_PUBLIC_STACKS_CROSS_CHAIN_MANAGER_ADDRESS=${await stacksManager.getAddress()}

# LayerZero Configuration
NEXT_PUBLIC_LAYERZERO_HUB_EID=${SEPOLIA_EID}
NEXT_PUBLIC_LAYERZERO_SPOKE_EID=

# Token Decimals
NEXT_PUBLIC_USDC_DECIMALS=6
NEXT_PUBLIC_OFT_USDC_DECIMALS=18
NEXT_PUBLIC_VAULT_SHARES_DECIMALS=18

# Property Configuration
NEXT_PUBLIC_FUNDING_TARGET=${FUNDING_TARGET.toString()}
NEXT_PUBLIC_VAULT_DEPOSIT_CAP=${VAULT_DEPOSIT_CAP.toString()}
`;

  fs.writeFileSync(frontendEnvPath, envContent);
  console.log('✅ Frontend .env.sepolia generated:', frontendEnvPath);

  // Generate relayer .env file for testnet
  console.log('\n🔗 Generating relayer environment file for testnet...');
  
  const relayerEnvPath = path.join(__dirname, '../../../apps/relayer/config/sepolia.env');
  const relayerEnvContent = `# Auto-generated by testnet deployment script - ${new Date().toISOString()}
# BrickVault Cross-Chain Relayer - Sepolia Testnet

# ============================================
# Environment
# ============================================
NODE_ENV=production

# ============================================
# Stacks Configuration (Testnet)
# ============================================
STACKS_NETWORK=testnet
STACKS_API_URL=https://api.testnet.hiro.so
STACKS_CONTRACT_ADDRESS=# Update after deploying Stacks contract on testnet
STACKS_PRIVATE_KEY=# Your Stacks testnet private key
STACKS_FEE_RATE=0.000001
STACKS_MAX_RETRIES=3

# ============================================
# EVM Configuration (Sepolia)
# ============================================
EVM_NETWORK=sepolia
EVM_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
EVM_STACKS_MANAGER_ADDRESS=${await stacksManager.getAddress()}

# Relayer private key (DO NOT COMMIT THIS - USE .env.local)
EVM_PRIVATE_KEY=# Your Sepolia testnet private key
EVM_GAS_LIMIT=800000
EVM_MAX_RETRIES=3

# ============================================
# Monitoring Configuration
# ============================================
MONITORING_INTERVAL=5000
MONITORING_MAX_RETRIES=3
MONITORING_RETRY_DELAY=2000
MONITORING_BATCH_SIZE=10
MONITORING_TIMEOUT=60000

# ============================================
# Logging
# ============================================
LOG_LEVEL=info
LOG_ENABLE_CONSOLE=true
LOG_ENABLE_FILE=true
`;

  const relayerConfigDir = path.dirname(relayerEnvPath);
  if (!fs.existsSync(relayerConfigDir)) {
    fs.mkdirSync(relayerConfigDir, { recursive: true });
  }
  
  fs.writeFileSync(relayerEnvPath, relayerEnvContent);
  console.log('✅ Relayer sepolia.env generated:', relayerEnvPath);
  console.log('   📍 StacksCrossChainManager:', await stacksManager.getAddress());
  console.log('   🔑 Update EVM_PRIVATE_KEY and STACKS_PRIVATE_KEY before running relayer!');

  console.log('\n' + '='.repeat(80));
  console.log('✅ SEPOLIA TESTNET DEPLOYMENT COMPLETE!');
  console.log('='.repeat(80));
  console.log('\n📝 IMPORTANT NOTES:');
  console.log('  1. Fund deployer with Sepolia ETH for gas');
  console.log('  2. Get USDC from Circle faucet: https://faucet.circle.com/');
  console.log('  3. Update frontend .env with addresses from .env.sepolia');
  console.log('  4. Deploy spoke adapter on Arbitrum Sepolia if needed');
  console.log('  5. Configure relayer with private keys (DO NOT COMMIT!)');
  console.log('  6. Deploy Stacks contract on testnet and update relayer config');
  console.log('');
  console.log('🔗 Useful Links:');
  console.log('  • Sepolia ETH Faucet: https://faucets.chain.link/sepolia');
  console.log('  • Circle USDC Faucet: https://faucet.circle.com/');
  console.log('  • LayerZero Scan: https://testnet.layerzeroscan.com/');
  console.log('  • Sepolia Etherscan: https://sepolia.etherscan.io/');
  console.log('');
  console.log('='.repeat(80));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Testnet deployment failed:', error);
    process.exit(1);
  });

