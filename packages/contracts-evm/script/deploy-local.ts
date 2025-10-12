import { ethers } from 'hardhat';
import { Options } from '@layerzerolabs/lz-v2-utilities';

async function main() {
  console.log('🚀 Starting BrickVault Property Investment Platform Deployment...\n');
  console.log('='.repeat(80));
  console.log('📋 DEPLOYMENT ARCHITECTURE');
  console.log('='.repeat(80));
  console.log('');
  console.log('🎯 UNIFIED ADAPTER ARCHITECTURE:');
  console.log('  ✅ Hub Chain: MockUSDC → USDCOFTAdapter → OFTUSDC → PropertyVault');
  console.log('  ✅ Spoke Chain: MockUSDC → USDCOFTAdapter → Bridge → OFTUSDC on Hub');
  console.log('  ✅ Same USDCOFTAdapter contract on ALL chains');
  console.log('  ✅ All vault shares stay on hub chain');
  console.log('  ✅ Users vote/harvest/redeem on hub only');
  console.log('  ✅ Users can redeem USDC to ANY chain via adapter');
  console.log('');
  console.log('💡 Benefits:');
  console.log('  • Perfect consistency: Same contract, same flow everywhere');
  console.log('  • Perfect fungibility: All OFTUSDC backed by locked USDC');
  console.log('  • Flexible redemption: Withdraw to any chain with adapter');
  console.log('  • Shared liquidity: One unified USDC pool across all chains');
  console.log('');
  console.log('='.repeat(80));
  console.log('\n');

  // Get signers
  // @ts-expect-error - Hardhat type augmentation
  const signers = await ethers.getSigners();
  const [deployer, user1, user2] = signers;
  console.log('📋 Deployer:', deployer.address);
  console.log('👤 User 1 (Hub User):', user1.address);
  console.log('👤 User 2 (Spoke User):', user2.address);
  console.log('💰 Deployer Balance:', ethers.formatEther(await deployer.provider.getBalance(deployer.address)), 'ETH\n');

  // 1. Deploy EnvironmentConfig
  console.log('1️⃣ Deploying EnvironmentConfig...');
  const EnvironmentConfig = await ethers.getContractFactory('EnvironmentConfig');
  const environmentConfig = await EnvironmentConfig.deploy(deployer.address);
  await environmentConfig.waitForDeployment();
  console.log('✅ EnvironmentConfig deployed to:', await environmentConfig.getAddress());

  // 2. Deploy Mock LayerZero Endpoints V2 (two separate chains)
  console.log('\n2️⃣ Deploying Mock LayerZero Endpoints V2...');
  const SPOKE_EID = 2; // Spoke chain (Arbitrum/Optimism - where users have USDC)
  const HUB_EID = 1;   // Hub chain (Sepolia - where PropertyVault lives)
  
  const EndpointV2Mock = await ethers.getContractFactory('EndpointV2Mock');
  
  // Hub endpoint (where PropertyVault and OFTUSDC live)
  const hubEndpoint = await EndpointV2Mock.deploy(HUB_EID);
  await hubEndpoint.waitForDeployment();
  console.log('✅ Hub Endpoint (EID', HUB_EID, ') deployed to:', await hubEndpoint.getAddress());
  
  // Spoke endpoint (where users have USDC)
  const spokeEndpoint = await EndpointV2Mock.deploy(SPOKE_EID);
  await spokeEndpoint.waitForDeployment();
  console.log('✅ Spoke Endpoint (EID', SPOKE_EID, ') deployed to:', await spokeEndpoint.getAddress());

  // 3. Deploy MockUSDC on HUB chain (simulates USDC for hub users)
  console.log('\n3️⃣ Deploying MockUSDC on HUB...');
  const MockUSDC = await ethers.getContractFactory('MockUSDC');
  const mockUSDCHub = await MockUSDC.deploy(
    'USD Coin (Hub)',
    'USDC',
    6, // USDC has 6 decimals
    deployer.address
  );
  await mockUSDCHub.waitForDeployment();
  console.log('✅ MockUSDC (Hub) deployed to:', await mockUSDCHub.getAddress());

  // 3.5. Deploy MockUSDC on SPOKE chain (simulates USDC for spoke users)
  console.log('\n3️⃣.5️⃣ Deploying MockUSDC on SPOKE...');
  const mockUSDCSpoke = await MockUSDC.deploy(
    'USD Coin (Spoke)',
    'USDC',
    6,
    deployer.address
  );
  await mockUSDCSpoke.waitForDeployment();
  console.log('✅ MockUSDC (Spoke) deployed to:', await mockUSDCSpoke.getAddress());

  // 4. Deploy OFTUSDC on HUB (the token that PropertyVault accepts)
  console.log('\n4️⃣ Deploying OFTUSDC on HUB...');
  const OFTUSDC = await ethers.getContractFactory('OFTUSDC');
  const oftUSDC = await OFTUSDC.deploy(
    'OFT USDC',
    'OFTUSDC',
    await hubEndpoint.getAddress(),
    deployer.address
  );
  await oftUSDC.waitForDeployment();
  console.log('✅ OFTUSDC deployed to:', await oftUSDC.getAddress());
  console.log('📊 OFTUSDC total supply:', ethers.formatUnits(await oftUSDC.totalSupply(), 18), 'OFTUSDC');
  console.log('   📝 This is the unified OFT token on hub chain');

  // 5. Deploy USDCOFTAdapter on HUB (unified architecture - same contract as spoke)
  console.log('\n5️⃣ Deploying USDCOFTAdapter on HUB...');
  const USDCOFTAdapter = await ethers.getContractFactory('USDCOFTAdapter');
  const usdcOFTAdapterHub = await USDCOFTAdapter.deploy(
    await mockUSDCHub.getAddress(),
    await hubEndpoint.getAddress(),
    deployer.address
  );
  await usdcOFTAdapterHub.waitForDeployment();
  console.log('✅ USDCOFTAdapter (Hub) deployed to:', await usdcOFTAdapterHub.getAddress());
  console.log('   📝 For hub users: same-chain USDC wrapping');

  // 6. Deploy USDCOFTAdapter on SPOKE (same contract, different chain)
  console.log('\n6️⃣ Deploying USDCOFTAdapter on SPOKE...');
  const usdcOFTAdapterSpoke = await USDCOFTAdapter.deploy(
    await mockUSDCSpoke.getAddress(),
    await spokeEndpoint.getAddress(),
    deployer.address
  );
  await usdcOFTAdapterSpoke.waitForDeployment();
  console.log('✅ USDCOFTAdapter (Spoke) deployed to:', await usdcOFTAdapterSpoke.getAddress());
  console.log('   📝 For spoke users: cross-chain USDC bridging');

  // 6.5. Configure LayerZero endpoints for cross-chain communication
  console.log('\n6️⃣.5️⃣ Configuring LayerZero endpoints...');
  
  // Hub endpoint routing (messages originating from hub)
  await hubEndpoint.setDestLzEndpoint(await oftUSDC.getAddress(), await hubEndpoint.getAddress());
  await hubEndpoint.setDestLzEndpoint(await usdcOFTAdapterHub.getAddress(), await hubEndpoint.getAddress());
  await hubEndpoint.setDestLzEndpoint(await usdcOFTAdapterSpoke.getAddress(), await spokeEndpoint.getAddress()); // 🔧 CRITICAL: Route hub → spoke adapter
  console.log('✅ Hub endpoint routing configured');
  
  // Spoke endpoint routing (messages originating from spoke)
  await spokeEndpoint.setDestLzEndpoint(await oftUSDC.getAddress(), await hubEndpoint.getAddress());
  await spokeEndpoint.setDestLzEndpoint(await usdcOFTAdapterSpoke.getAddress(), await spokeEndpoint.getAddress());
  console.log('✅ Spoke endpoint routing configured');

  // 6.6. Set peers for unified adapter architecture
  console.log('\n6️⃣.6️⃣ Setting up peer relationships...');
  
  // Hub Adapter ↔ Hub OFTUSDC (same-chain wrapping)
  await usdcOFTAdapterHub.connect(deployer).setPeer(HUB_EID, ethers.zeroPadValue(await oftUSDC.getAddress(), 32));
  await oftUSDC.connect(deployer).setPeer(HUB_EID, ethers.zeroPadValue(await usdcOFTAdapterHub.getAddress(), 32));
  console.log('✅ Hub: Adapter ↔ OFTUSDC (same-chain)');
  
  // Spoke Adapter ↔ Hub OFTUSDC (cross-chain bridging)
  await usdcOFTAdapterSpoke.connect(deployer).setPeer(HUB_EID, ethers.zeroPadValue(await oftUSDC.getAddress(), 32));
  await oftUSDC.connect(deployer).setPeer(SPOKE_EID, ethers.zeroPadValue(await usdcOFTAdapterSpoke.getAddress(), 32));
  console.log('✅ Spoke Adapter ↔ Hub OFTUSDC (cross-chain)');
  console.log('   📝 Unified architecture: Same contract, different chains!');

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
  const FUNDING_TARGET = ethers.parseUnits('10000', 18); // 5K OFTUSDC target
  const FUNDING_DEADLINE = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days from now
  await propertyDAO.setFundingTarget(FUNDING_TARGET, FUNDING_DEADLINE);
  console.log('✅ Funding target set to:', ethers.formatUnits(FUNDING_TARGET, 18), 'OFTUSDC');
  console.log('✅ Funding deadline:', new Date(FUNDING_DEADLINE * 1000).toLocaleString());

  // 9. Transfer USDC to users for testing
  console.log('\n9️⃣ Setting up test users with MockUSDC...');
  const userAmount = ethers.parseUnits('10000', 6); // 10K USDC per user
  
  // Hub users get hub USDC
  await mockUSDCHub.transfer(user1.address, userAmount);
  console.log('✅ User 1 (Hub) MockUSDC balance:', ethers.formatUnits(userAmount, 6), 'USDC');
  
  // Spoke users get spoke USDC
  await mockUSDCSpoke.transfer(user2.address, userAmount);
  console.log('✅ User 2 (Spoke) MockUSDC balance:', ethers.formatUnits(userAmount, 6), 'USDC');

  // 10. Deploy StacksCrossChainManager for Stacks integration
  console.log('\n🔟 Deploying StacksCrossChainManager...');
  const StacksCrossChainManager = await ethers.getContractFactory('StacksCrossChainManager');
  const stacksManager = await StacksCrossChainManager.deploy(
    await oftUSDC.getAddress(), // OFTUSDC token
    deployer.address, // price oracle (deployer for testing)
    deployer.address, // relayer (deployer for testing)
    deployer.address  // owner
  );
  await stacksManager.waitForDeployment();
  console.log('✅ StacksCrossChainManager deployed to:', await stacksManager.getAddress());

  // 10.1 Set initial sBTC price (e.g., $95,000 with 8 decimals)
  console.log('\n🔟.1️⃣ Setting initial sBTC price...');
  const initialPrice = ethers.parseUnits('95000', 8); // $95,000
  await stacksManager.updateSbtcPrice(initialPrice);
  console.log('✅ Initial sBTC price set to: $95,000');

  // 10.2 Fund the StacksCrossChainManager liquidity pool
  console.log('\n🔟.2️⃣ Funding StacksCrossChainManager liquidity pool...');
  // First, hub user wraps USDC to OFTUSDC via adapter
  const poolFundAmount = ethers.parseUnits('100000', 6); // 100K USDC
  const poolFundAmountOFT = ethers.parseUnits('100000', 18); // 100K OFTUSDC (18 decimals)
  
  // Approve adapter to spend USDC
  await mockUSDCHub.connect(deployer).approve(await usdcOFTAdapterHub.getAddress(), poolFundAmount);
  
  // Encode proper LayerZero V2 options using the official utility
  const options = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString();
  
  // Convert USDC to OFTUSDC via adapter (same-chain wrapping on hub)
  const sendParam = {
    dstEid: HUB_EID,
    to: ethers.zeroPadValue(deployer.address, 32),
    amountLD: poolFundAmount,
    minAmountLD: poolFundAmount,
    extraOptions: options,
    composeMsg: '0x',
    oftCmd: '0x'
  };
  
  const [nativeFee] = await usdcOFTAdapterHub.quoteSend(sendParam, false);
  await usdcOFTAdapterHub.connect(deployer).send(sendParam, { nativeFee, lzTokenFee: 0 }, deployer.address, { value: nativeFee });
  console.log('✅ Converted 100K USDC → OFTUSDC via adapter');
  
  // Fund the liquidity pool
  await oftUSDC.connect(deployer).approve(await stacksManager.getAddress(), poolFundAmountOFT);
  await stacksManager.connect(deployer).fundLiquidityPool(poolFundAmountOFT);
  console.log('✅ Funded liquidity pool with 100K OFTUSDC (backed by locked USDC)');
  
  const poolBalance = await stacksManager.getPoolBalance();
  console.log('✅ Pool balance:', ethers.formatUnits(poolBalance, 18), 'OFTUSDC');

  // Verify OFTUSDC lockbox model with liquidity pool
  console.log('\n1️⃣1️⃣ Verifying OFTUSDC lockbox model...');
  const totalSupply = await oftUSDC.totalSupply();
  console.log('✅ OFTUSDC total supply:', ethers.formatUnits(totalSupply, 18), 'OFTUSDC');
  console.log('   📝 Lockbox model: All OFTUSDC is backed by locked USDC in adapter');
  console.log('   📝 Hub/Spoke users: USDCOFTAdapter.send() to convert USDC → OFTUSDC');
  console.log('   📝 Stacks users: Receive OFTUSDC from liquidity pool (backed by locked USDC)');

  // 11. Display deployment summary
  console.log('\n' + '='.repeat(80));
  console.log('🎉 BrickVault Property Investment Platform - Deployment Complete!');
  console.log('='.repeat(80));
  
  console.log('\n📋 CONTRACT ADDRESSES:');
  console.log('-'.repeat(80));
  console.log('Infrastructure:');
  console.log('  🔧 EnvironmentConfig:', await environmentConfig.getAddress());
  console.log('  🌐 Hub Endpoint (EID ' + HUB_EID + '):', await hubEndpoint.getAddress());
  console.log('  🌐 Spoke Endpoint (EID ' + SPOKE_EID + '):', await spokeEndpoint.getAddress());
  
  console.log('\nToken Layer (Unified Adapter Architecture):');
  console.log('  💰 MockUSDC (Hub - 6 decimals):', await mockUSDCHub.getAddress());
  console.log('  💰 MockUSDC (Spoke - 6 decimals):', await mockUSDCSpoke.getAddress());
  console.log('  🌉 USDCOFTAdapter (Hub):', await usdcOFTAdapterHub.getAddress());
  console.log('  🌉 USDCOFTAdapter (Spoke):', await usdcOFTAdapterSpoke.getAddress());
  console.log('  🚀 OFTUSDC (Hub - 18 decimals):', await oftUSDC.getAddress());
  console.log('     📝 Same adapter contract on all chains!');
  
  console.log('\nProperty Layer (All on Hub):');
  console.log('  🏭 VaultFactory:', await vaultFactory.getAddress());
  console.log('  📊 PropertyRegistry:', await propertyRegistry.getAddress());
  console.log('  🏠 PropertyVault:', propertyVaultAddress);
  console.log('  🗳️  PropertyDAO:', await propertyDAO.getAddress());
  
  console.log('\nCross-Chain Layer:');
  console.log('  🌉 StacksCrossChainManager:', await stacksManager.getAddress());
  console.log('  💱 sBTC Price: $95,000');
  console.log('  🔑 Relayer:', deployer.address);
  
  console.log('\n👥 Test Users:');
  console.log('  Platform:', deployer.address);
  console.log('  User 1 (Hub):', user1.address, '(10K Hub USDC)');
  console.log('  User 2 (Spoke):', user2.address, '(10K Spoke USDC)');
  
  console.log('\n' + '='.repeat(80));
  console.log('📖 COMPLETE INVESTMENT FLOW (UNIFIED ADAPTER):');
  console.log('='.repeat(80));
  console.log('\n💰 FUNDING PHASE (OpenToFund Stage):');
  console.log('');
  console.log('Hub Chain Users (User 1) - Same-Chain Wrapping:');
  console.log('  1. Have MockUSDC on hub (6 decimals)');
  console.log('  2. Approve USDCOFTAdapter (Hub)');
  console.log('  3. Call USDCOFTAdapter.send(HUB_EID, user, amount)');
  console.log('     → Adapter locks USDC, sends LayerZero message to OFTUSDC');
  console.log('     → OFTUSDC mints tokens to user (18 decimals)');
  console.log('  4. Receive OFTUSDC on hub - pays small LayerZero fee');
  console.log('  5. Deposit OFTUSDC to PropertyVault');
  console.log('  6. Receive vault shares (voting power)');
  console.log('');
  console.log('Spoke Chain Users (User 2) - Cross-Chain Bridging:');
  console.log('  1. Have MockUSDC on spoke (6 decimals)');
  console.log('  2. Approve USDCOFTAdapter (Spoke)');
  console.log('  3. Call USDCOFTAdapter.send(HUB_EID, user, amount)');
  console.log('     → Adapter locks USDC, bridges to hub via LayerZero');
  console.log('     → OFTUSDC mints tokens on hub (18 decimals)');
  console.log('  4. Receive OFTUSDC on hub - pays LayerZero fee');
  console.log('  5. Deposit OFTUSDC to PropertyVault on hub');
  console.log('  6. Receive vault shares (voting power) on hub');
  console.log('');
  console.log('Stacks Chain Users - sBTC Deposits via Liquidity Pool:');
  console.log('  1. Have sBTC on Stacks chain');
  console.log('  2. Deposit sBTC to brick-vault-gateway contract on Stacks');
  console.log('  3. Relayer processes deposit → calls StacksCrossChainManager');
  console.log('     → Converts sBTC to USD value using price oracle');
  console.log('     → Transfers OFTUSDC from liquidity pool (backed by locked USDC)');
  console.log('  4. Receive backed OFTUSDC on hub (custodial EVM address)');
  console.log('  5. Deposit OFTUSDC to PropertyVault on hub');
  console.log('  6. Receive vault shares (voting power) on hub');
  console.log('  💡 Pool is funded with OFTUSDC that came from locked USDC via adapter');
  console.log('  💡 All OFTUSDC is fully backed - no unbacked minting!');
  console.log('');
  console.log('💡 Key Benefits of Unified Adapter:');
  console.log('  ✅ Same contract on all chains (hub + spoke)');
  console.log('  ✅ Same flow everywhere: approve → send(EID) → receive OFT');
  console.log('  ✅ Users can redeem to ANY chain (not just hub)');
  console.log('  ✅ Perfect fungibility across all chains');
  console.log('');
  console.log('Auto-Transition:');
  console.log('  • When funding target reached → Auto-transition to Funded stage');
  console.log('  • Auto-create PropertyPurchase proposal for voting');
  
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
  console.log('\n📝 ARCHITECTURE NOTES:');
  console.log('   ✅ Unified Adapter: Same USDCOFTAdapter on all chains');
  console.log('   ✅ Hub users: adapter.send(HUB_EID) - same chain wrapping');
  console.log('   ✅ Spoke users: adapter.send(HUB_EID) - cross-chain bridging');
  console.log('   ✅ Redemption: Users can withdraw USDC to ANY chain');
  console.log('   ✅ All shares stay on hub (voting/harvest/management)');
  console.log('='.repeat(80));

  // Save deployment info to a JSON file for frontend
  const deploymentInfo = {
    network: 'localhost',
    chainId: 31337,
    contracts: {
      EnvironmentConfig: await environmentConfig.getAddress(),
      HubEndpoint: await hubEndpoint.getAddress(),
      SpokeEndpoint: await spokeEndpoint.getAddress(),
      MockUSDCHub: await mockUSDCHub.getAddress(),
      MockUSDCSpoke: await mockUSDCSpoke.getAddress(),
      USDCOFTAdapterHub: await usdcOFTAdapterHub.getAddress(),
      USDCOFTAdapterSpoke: await usdcOFTAdapterSpoke.getAddress(),
      OFTUSDC: await oftUSDC.getAddress(),
      VaultFactory: await vaultFactory.getAddress(),
      PropertyRegistry: await propertyRegistry.getAddress(),
      PropertyVault: propertyVaultAddress,
      PropertyDAO: await propertyDAO.getAddress(),
      StacksCrossChainManager: await stacksManager.getAddress()
    },
    layerzero: {
      hubEID: HUB_EID,
      spokeEID: SPOKE_EID
    },
    users: {
      deployer: deployer.address,
      user1: user1.address + ' (Hub)',
      user2: user2.address + ' (Spoke)'
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
NEXT_PUBLIC_HUB_ENDPOINT_ADDRESS=${await hubEndpoint.getAddress()}
NEXT_PUBLIC_SPOKE_ENDPOINT_ADDRESS=${await spokeEndpoint.getAddress()}

# Token Contracts (Unified Adapter Architecture)
NEXT_PUBLIC_MOCK_USDC_HUB_ADDRESS=${await mockUSDCHub.getAddress()}
NEXT_PUBLIC_MOCK_USDC_SPOKE_ADDRESS=${await mockUSDCSpoke.getAddress()}
NEXT_PUBLIC_USDC_OFT_ADAPTER_HUB_ADDRESS=${await usdcOFTAdapterHub.getAddress()}
NEXT_PUBLIC_USDC_OFT_ADAPTER_SPOKE_ADDRESS=${await usdcOFTAdapterSpoke.getAddress()}
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
NEXT_PUBLIC_LAYERZERO_HUB_EID=${HUB_EID}
NEXT_PUBLIC_LAYERZERO_SPOKE_EID=${SPOKE_EID}

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
NEXT_PUBLIC_HUB_ENDPOINT_ADDRESS=
NEXT_PUBLIC_SPOKE_ENDPOINT_ADDRESS=

# Token Contracts (Unified Adapter Architecture)
NEXT_PUBLIC_MOCK_USDC_HUB_ADDRESS=
NEXT_PUBLIC_MOCK_USDC_SPOKE_ADDRESS=
NEXT_PUBLIC_USDC_OFT_ADAPTER_HUB_ADDRESS=
NEXT_PUBLIC_USDC_OFT_ADAPTER_SPOKE_ADDRESS=
NEXT_PUBLIC_OFT_USDC_ADDRESS=

# Property Platform Contracts
NEXT_PUBLIC_VAULT_FACTORY_ADDRESS=
NEXT_PUBLIC_PROPERTY_DAO_FACTORY_ADDRESS=
NEXT_PUBLIC_PROPERTY_REGISTRY_ADDRESS=
NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS=
NEXT_PUBLIC_PROPERTY_DAO_ADDRESS=

# Cross-Chain Contracts
NEXT_PUBLIC_STACKS_CROSS_CHAIN_MANAGER_ADDRESS=

# LayerZero Configuration
NEXT_PUBLIC_LAYERZERO_HUB_EID=1
NEXT_PUBLIC_LAYERZERO_SPOKE_EID=2

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
  HubEndpoint: process.env.NEXT_PUBLIC_HUB_ENDPOINT_ADDRESS as \`0x\${string}\`,
  SpokeEndpoint: process.env.NEXT_PUBLIC_SPOKE_ENDPOINT_ADDRESS as \`0x\${string}\`,
  
  // Tokens (Unified Adapter Architecture)
  MockUSDCHub: process.env.NEXT_PUBLIC_MOCK_USDC_HUB_ADDRESS as \`0x\${string}\`,
  MockUSDCSpoke: process.env.NEXT_PUBLIC_MOCK_USDC_SPOKE_ADDRESS as \`0x\${string}\`,
  USDCOFTAdapterHub: process.env.NEXT_PUBLIC_USDC_OFT_ADAPTER_HUB_ADDRESS as \`0x\${string}\`,
  USDCOFTAdapterSpoke: process.env.NEXT_PUBLIC_USDC_OFT_ADAPTER_SPOKE_ADDRESS as \`0x\${string}\`,
  OFTUSDC: process.env.NEXT_PUBLIC_OFT_USDC_ADDRESS as \`0x\${string}\`,
  
  // Property Platform
  VaultFactory: process.env.NEXT_PUBLIC_VAULT_FACTORY_ADDRESS as \`0x\${string}\`,
  PropertyDAOFactory: process.env.NEXT_PUBLIC_PROPERTY_DAO_FACTORY_ADDRESS as \`0x\${string}\`,
  PropertyRegistry: process.env.NEXT_PUBLIC_PROPERTY_REGISTRY_ADDRESS as \`0x\${string}\`,
  PropertyVault: process.env.NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS as \`0x\${string}\`,
  PropertyDAO: process.env.NEXT_PUBLIC_PROPERTY_DAO_ADDRESS as \`0x\${string}\`,
  
  // Cross-Chain
  StacksCrossChainManager: process.env.NEXT_PUBLIC_STACKS_CROSS_CHAIN_MANAGER_ADDRESS as \`0x\${string}\`,
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
  hubEID: parseInt(process.env.NEXT_PUBLIC_LAYERZERO_HUB_EID || '1'), // Hub chain (Sepolia - PropertyVault)
  spokeEID: parseInt(process.env.NEXT_PUBLIC_LAYERZERO_SPOKE_EID || '2'), // Spoke chain (Arbitrum/Optimism)
  hubEndpoint: CONTRACT_ADDRESSES.HubEndpoint,
  spokeEndpoint: CONTRACT_ADDRESSES.SpokeEndpoint,
} as const;

export const PROPERTY_CONFIG = {
  fundingTarget: process.env.NEXT_PUBLIC_FUNDING_TARGET || '0',
  vaultDepositCap: process.env.NEXT_PUBLIC_VAULT_DEPOSIT_CAP || '0',
} as const;
`;

  fs.writeFileSync(configPath, configContent);
  console.log('✅ Frontend contract config generated:', configPath);

  // Generate relayer .env file
  console.log('\n🔗 Generating relayer environment file...');
  
  // Get deployer private key from hardhat config
  const deployerPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // First Hardhat account
  
  const relayerEnvPath = path.join(__dirname, '../../../apps/relayer/.env');
  const relayerEnvContent = `# Auto-generated by deployment script - ${new Date().toISOString()}
# BrickVault Cross-Chain Relayer - Local Development

# ============================================
# Environment
# ============================================
NODE_ENV=development

# ============================================
# Stacks Configuration
# ============================================
STACKS_NETWORK=testnet
STACKS_API_URL=http://localhost:3999
STACKS_CONTRACT_ADDRESS=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.brick-vault-gateway
STACKS_PRIVATE_KEY=753b7cc01a1a2e86221266a154af739463fce51219d97e4f856cd7200c3bd2a601
STACKS_FEE_RATE=0.000001
STACKS_MAX_RETRIES=3

# ============================================
# EVM Configuration (Auto-configured from deployment)
# ============================================
EVM_NETWORK=sepolia

# Using WebSocket for real-time event monitoring (recommended)
# For HTTP polling, use: http://localhost:8545
EVM_RPC_URL=ws://localhost:8545

EVM_STACKS_MANAGER_ADDRESS=${await stacksManager.getAddress()}

# Relayer private key (Hardhat account #0)
EVM_PRIVATE_KEY=${deployerPrivateKey}
EVM_GAS_LIMIT=800000
EVM_MAX_RETRIES=3

# ============================================
# Monitoring Configuration
# ============================================
MONITORING_INTERVAL=2000
MONITORING_MAX_RETRIES=3
MONITORING_RETRY_DELAY=1000
MONITORING_BATCH_SIZE=10
MONITORING_TIMEOUT=30000

# ============================================
# Logging
# ============================================
LOG_LEVEL=debug
LOG_ENABLE_CONSOLE=true
LOG_ENABLE_FILE=false
`;

  fs.writeFileSync(relayerEnvPath, relayerEnvContent);
  console.log('✅ Relayer .env generated:', relayerEnvPath);
  console.log('   📍 StacksCrossChainManager:', await stacksManager.getAddress());
  console.log('   🔑 Relayer Address:', deployer.address);
  console.log('   ⚠️  Update STACKS_CONTRACT_ADDRESS after deploying Stacks contract!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });