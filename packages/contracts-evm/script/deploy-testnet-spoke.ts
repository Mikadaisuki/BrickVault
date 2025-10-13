import { ethers } from 'hardhat';

async function main() {
  console.log('🚀 Starting BrickVault Spoke Chain Deployment (BNB Testnet)...\n');
  console.log('='.repeat(80));
  console.log('📋 SPOKE CHAIN DEPLOYMENT - BNB TESTNET');
  console.log('='.repeat(80));
  console.log('');
  console.log('🎯 SPOKE CHAIN DEPLOYMENT (BNB TESTNET):');
  console.log('  ✅ Spoke Chain: BNB Testnet (97)');
  console.log('  ✅ Flow: MockUSDC → USDCOFTAdapter (Spoke)');
  console.log('  ✅ Lockbox Model: USDC locked in spoke adapter');
  console.log('  ✅ Real LayerZero V2 endpoint');
  console.log('  📝 Hub chain (Sepolia) must be deployed first');
  console.log('');
  console.log('💡 Architecture:');
  console.log('  • Spoke users wrap local USDC → OFTUSDC on hub');
  console.log('  • Spoke users unwrap OFTUSDC → local USDC');
  console.log('  • All OFTUSDC minted/burned on hub chain');
  console.log('  • Spoke adapter holds locked USDC (lockbox)');
  console.log('');
  console.log('='.repeat(80));
  console.log('\n');

  // ============================================================================
  // PREFLIGHT CHECKS
  // ============================================================================
  console.log('🔍 Running preflight checks...\n');

  // Check 1: Private key is set
  if (!process.env.PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not found in environment variables');
    console.log('   Please set PRIVATE_KEY in .env file');
    process.exit(1);
  }
  console.log('✅ Private key configured');

  // Check 2: Get deployer and verify network
  // @ts-expect-error - Hardhat type augmentation
  const [deployer] = await ethers.getSigners();
  console.log('✅ Deployer address:', deployer.address);

  // Check 3: Verify network
  const network = await deployer.provider.getNetwork();
  if (network.chainId !== 97n) {
    console.error('❌ Wrong network! Expected BNB Testnet (97), got:', network.chainId.toString());
    console.log('   Run with: npx hardhat run script/deploy-testnet-spoke.ts --network bnbTestnet');
    process.exit(1);
  }
  console.log('✅ Network confirmed: BNB Testnet (97)');

  // Check 4: Check deployer balance
  const balance = await deployer.provider.getBalance(deployer.address);
  const balanceEth = ethers.formatEther(balance);
  console.log('✅ Deployer balance:', balanceEth, 'tBNB');

  // Minimum recommended balance for deployment (0.1 BNB)
  const minBalance = ethers.parseEther('0.1');
  if (balance < minBalance) {
    console.warn('⚠️  WARNING: Low balance! Deployment may fail.');
    console.log('   Current:', balanceEth, 'tBNB');
    console.log('   Recommended: At least 0.1 tBNB');
    console.log('   Get testnet BNB from: https://testnet.bnbchain.org/faucet-smart');
    console.log('\n   Continue anyway? Deployment will proceed in 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  // Check 5: Verify RPC connection
  try {
    const blockNumber = await deployer.provider.getBlockNumber();
    console.log('✅ RPC connection healthy (block:', blockNumber, ')');
  } catch (error) {
    console.error('❌ RPC connection failed:', error);
    console.log('   Check EVM_RPC_BNB_TESTNET in .env file');
    process.exit(1);
  }

  // Check 6: Verify hub deployment exists
  console.log('\n🔍 Checking hub deployment...');
  const fs = require('fs');
  const path = require('path');
  const hubDeploymentPath = path.join(__dirname, '../deployments/sepolia.json');
  
  if (!fs.existsSync(hubDeploymentPath)) {
    console.error('❌ Hub deployment not found!');
    console.log('   Please deploy hub chain first: npm run deploy:testnet');
    console.log('   Expected file:', hubDeploymentPath);
    process.exit(1);
  }
  
  const hubDeployment = JSON.parse(fs.readFileSync(hubDeploymentPath, 'utf8'));
  const OFTUSDC_HUB_ADDRESS = hubDeployment.contracts.OFTUSDC;
  const HUB_ENDPOINT = hubDeployment.contracts.SepoliaEndpoint;
  
  if (!OFTUSDC_HUB_ADDRESS || !HUB_ENDPOINT) {
    console.error('❌ Invalid hub deployment! Missing OFTUSDC or endpoint address');
    process.exit(1);
  }
  
  console.log('✅ Hub deployment found:');
  console.log('   OFTUSDC (Hub):', OFTUSDC_HUB_ADDRESS);
  console.log('   Hub Endpoint:', HUB_ENDPOINT);

  console.log('\n' + '='.repeat(80));
  console.log('✅ ALL PREFLIGHT CHECKS PASSED');
  console.log('='.repeat(80));
  console.log('\n📋 Deployer:', deployer.address);
  console.log('💰 Deployer Balance:', balanceEth, 'tBNB\n');

  // LayerZero V2 Configuration
  // Reference: https://docs.layerzero.network/v2/developers/evm/technical-reference/deployed-contracts
  const SEPOLIA_EID = 40161;  // Hub Chain (Sepolia)
  const BNB_TESTNET_EID = 40102;  // Spoke Chain (BNB Testnet)
  
  // LayerZero V2 Endpoint Address for BNB Testnet
  // Verify from: https://docs.layerzero.network/v2/developers/evm/technical-reference/deployed-contracts
  const BNB_TESTNET_ENDPOINT = '0x6EDCE65403992e310A62460808c4b910D972f10f'; // BNB Testnet EndpointV2
  
  console.log('🌐 LayerZero V2 Configuration:');
  console.log('  Hub EID:', SEPOLIA_EID, '(Sepolia)');
  console.log('  Spoke EID:', BNB_TESTNET_EID, '(BNB Testnet)');
  console.log('  Spoke Endpoint:', BNB_TESTNET_ENDPOINT);
  console.log('');

  // 1. Deploy MockUSDC on BNB Testnet (Spoke)
  console.log('1️⃣ Deploying MockUSDC on BNB Testnet (Spoke)...');
  const MockUSDC = await ethers.getContractFactory('MockUSDC');
  const mockUSDCSpoke = await MockUSDC.deploy(
    'USD Coin (BNB Testnet)',
    'USDC',
    6, // USDC has 6 decimals
    deployer.address
  );
  await mockUSDCSpoke.waitForDeployment();
  const BNB_TESTNET_USDC = await mockUSDCSpoke.getAddress();
  console.log('✅ MockUSDC deployed on BNB Testnet:', BNB_TESTNET_USDC);
  console.log('   📝 Deployer has minting rights - unlimited USDC for testing!');
  
  // Note: If you prefer to use real USDC on BNB Testnet (if available):
  // const BNB_TESTNET_USDC = '0x...'; // Real USDC address on BNB Testnet

  // 2. Deploy USDCOFTAdapter on BNB Testnet (Spoke)
  console.log('\n2️⃣ Deploying USDCOFTAdapter on BNB Testnet (Spoke)...');
  const USDCOFTAdapter = await ethers.getContractFactory('USDCOFTAdapter');
  const usdcOFTAdapterSpoke = await USDCOFTAdapter.deploy(
    BNB_TESTNET_USDC, // MockUSDC on BNB Testnet
    BNB_TESTNET_ENDPOINT, // Real LayerZero endpoint
    deployer.address
  );
  await usdcOFTAdapterSpoke.waitForDeployment();
  console.log('✅ USDCOFTAdapter (Spoke) deployed to:', await usdcOFTAdapterSpoke.getAddress());
  console.log('   📝 Lockbox: This adapter will hold locked USDC for spoke users');

  // 3. Configure Spoke Adapter → Hub OFTUSDC peer relationship
  console.log('\n3️⃣ Setting up cross-chain peer relationship...');
  console.log('   Spoke Adapter → Hub OFTUSDC');
  await usdcOFTAdapterSpoke.connect(deployer).setPeer(
    SEPOLIA_EID, 
    ethers.zeroPadValue(OFTUSDC_HUB_ADDRESS, 32)
  );
  console.log('✅ Spoke Adapter peer configured for hub chain');

  // 4. Mint initial USDC for testing
  console.log('\n4️⃣ Minting MockUSDC for testing...');
  const initialMintAmount = ethers.parseUnits('1000000', 6); // 1M USDC for testing
  await mockUSDCSpoke.mint(deployer.address, initialMintAmount);
  const deployerBalance = await mockUSDCSpoke.balanceOf(deployer.address);
  console.log('✅ Minted', ethers.formatUnits(deployerBalance, 6), 'USDC to deployer');
  console.log('   📝 Deployer has minting rights - can mint unlimited USDC for testing');

  // 5. Optional: Fund spoke adapter with USDC for unwrapping
  console.log('\n5️⃣ Optionally funding spoke adapter with USDC for unwrapping...');
  console.log('   📝 Skipped - can be done manually later');
  console.log('   📝 Users who wrap on spoke need liquidity for unwrapping back to spoke');
  console.log('   📝 To fund: mint USDC and transfer to adapter address');

  // Display deployment summary
  console.log('\n' + '='.repeat(80));
  console.log('🎉 BNB Testnet Spoke Chain Deployment Complete!');
  console.log('='.repeat(80));
  
  console.log('\n📋 DEPLOYED CONTRACT ADDRESSES (BNB TESTNET):');
  console.log('-'.repeat(80));
  console.log('Spoke Chain:');
  console.log('  💰 MockUSDC (Spoke - 6 decimals):', BNB_TESTNET_USDC);
  console.log('     📝 Deployer can mint unlimited USDC for testing');
  console.log('  🌉 USDCOFTAdapter (Spoke):', await usdcOFTAdapterSpoke.getAddress());
  console.log('  🌐 LayerZero Endpoint:', BNB_TESTNET_ENDPOINT);
  
  console.log('\nHub Chain (Already Deployed):');
  console.log('  🚀 OFTUSDC (Hub):', OFTUSDC_HUB_ADDRESS);
  console.log('  🌐 LayerZero Endpoint:', HUB_ENDPOINT);
  
  console.log('\n' + '='.repeat(80));
  console.log('🔗 CROSS-CHAIN CONFIGURATION STATUS:');
  console.log('='.repeat(80));
  console.log('\n✅ Spoke → Hub Peer:');
  console.log('   Spoke Adapter (' + BNB_TESTNET_EID + ') → Hub OFTUSDC (' + SEPOLIA_EID + ')');
  console.log('   Status: Configured ✅');
  
  console.log('\n⚠️  Hub → Spoke Peer (MANUAL STEP REQUIRED):');
  console.log('   You must configure the hub chain to recognize this spoke adapter!');
  console.log('   Run on Sepolia (Hub Chain):');
  console.log('   ');
  console.log('   1. Connect to Sepolia network');
  console.log('   2. Call OFTUSDC.setPeer(' + BNB_TESTNET_EID + ', "' + ethers.zeroPadValue(await usdcOFTAdapterSpoke.getAddress(), 32) + '")');
  console.log('   ');
  console.log('   📝 Or use Etherscan on Sepolia:');
  console.log('   https://sepolia.etherscan.io/address/' + OFTUSDC_HUB_ADDRESS + '#writeContract');
  console.log('   ');
  console.log('   Function: setPeer');
  console.log('   _eid: ' + BNB_TESTNET_EID);
  console.log('   _peer: ' + ethers.zeroPadValue(await usdcOFTAdapterSpoke.getAddress(), 32));
  console.log('');

  console.log('='.repeat(80));
  console.log('📖 BNB TESTNET SPOKE CHAIN FLOW:');
  console.log('='.repeat(80));
  console.log('\n💰 Spoke Chain Users (BNB Testnet):');
  console.log('  1. Get testnet BNB from faucet (for gas)');
  console.log('  2. Mint MockUSDC using deployer account:');
  console.log('     → mockUSDC.mint(userAddress, amount)');
  console.log('  3. Approve spoke adapter to spend USDC');
  console.log('  4. Call spokeAdapter.send(SEPOLIA_EID, user, amount)');
  console.log('     → Adapter locks USDC, OFTUSDC mints on hub');
  console.log('  5. Receive OFTUSDC on Sepolia (18 decimals)');
  console.log('  6. Invest OFTUSDC in PropertyVault on Sepolia');
  console.log('  7. Later: Unwrap OFTUSDC → USDC back to BNB Testnet');
  console.log('');
  console.log('📝 Note: Configure hub to spoke peer before cross-chain operations!');
  console.log('');

  // Save deployment info to JSON
  const deploymentInfo = {
    network: 'bnbTestnet',
    chainId: 97,
    contracts: {
      BNBTestnetEndpoint: BNB_TESTNET_ENDPOINT,
      MockUSDCSpoke: BNB_TESTNET_USDC,
      USDCOFTAdapterSpoke: await usdcOFTAdapterSpoke.getAddress()
    },
    hub: {
      network: 'sepolia',
      chainId: 11155111,
      oftUSDCAddress: OFTUSDC_HUB_ADDRESS,
      endpoint: HUB_ENDPOINT
    },
    layerzero: {
      hubEID: SEPOLIA_EID,
      spokeEID: BNB_TESTNET_EID,
      hubEndpoint: HUB_ENDPOINT,
      spokeEndpoint: BNB_TESTNET_ENDPOINT
    },
    peerConfiguration: {
      spoke: {
        configured: true,
        peer: OFTUSDC_HUB_ADDRESS,
        note: 'Spoke Adapter → Hub OFTUSDC configured'
      },
      hub: {
        configured: false,
        requiredAction: 'Call OFTUSDC.setPeer(' + BNB_TESTNET_EID + ', spokeAdapterBytes32) on Sepolia',
        spokeAdapterAddress: await usdcOFTAdapterSpoke.getAddress(),
        spokeAdapterBytes32: ethers.zeroPadValue(await usdcOFTAdapterSpoke.getAddress(), 32),
        note: 'MANUAL STEP: Configure on Sepolia using Etherscan or script'
      }
    },
    decimals: {
      usdc: 6,
      oftusdc: 18
    },
    deploymentTime: new Date().toISOString(),
    deployer: deployer.address
  };

  const deploymentPath = path.join(__dirname, '../deployments/bnbTestnet.json');
  
  // Ensure deployments directory exists
  const deploymentsDir = path.dirname(deploymentPath);
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log('\n💾 Deployment info saved to:', deploymentPath);

  // Update frontend environment file
  console.log('\n🌐 Updating frontend environment file...');
  
  const frontendEnvPath = path.join(__dirname, '../../../apps/frontend/.env.sepolia');
  
  // Read existing hub deployment env
  let existingEnv = '';
  if (fs.existsSync(frontendEnvPath)) {
    existingEnv = fs.readFileSync(frontendEnvPath, 'utf8');
  }
  
  // Update spoke-related values
  const updatedEnv = existingEnv
    .replace(/NEXT_PUBLIC_SPOKE_RPC_URL=.*/g, `NEXT_PUBLIC_SPOKE_RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545`)
    .replace(/NEXT_PUBLIC_SPOKE_ENDPOINT_ADDRESS=.*/g, `NEXT_PUBLIC_SPOKE_ENDPOINT_ADDRESS=${BNB_TESTNET_ENDPOINT}`)
    .replace(/NEXT_PUBLIC_MOCK_USDC_SPOKE_ADDRESS=.*/g, `NEXT_PUBLIC_MOCK_USDC_SPOKE_ADDRESS=${BNB_TESTNET_USDC}`)
    .replace(/NEXT_PUBLIC_USDC_OFT_ADAPTER_SPOKE_ADDRESS=.*/g, `NEXT_PUBLIC_USDC_OFT_ADAPTER_SPOKE_ADDRESS=${await usdcOFTAdapterSpoke.getAddress()}`)
    .replace(/NEXT_PUBLIC_LAYERZERO_SPOKE_EID=.*/g, `NEXT_PUBLIC_LAYERZERO_SPOKE_EID=${BNB_TESTNET_EID}`);
  
  fs.writeFileSync(frontendEnvPath, updatedEnv);
  console.log('✅ Frontend .env.sepolia updated with spoke addresses');

  console.log('\n' + '='.repeat(80));
  console.log('✅ BNB TESTNET SPOKE DEPLOYMENT COMPLETE!');
  console.log('='.repeat(80));
  console.log('\n🚨 CRITICAL: MANUAL CONFIGURATION REQUIRED ON HUB CHAIN');
  console.log('='.repeat(80));
  console.log('\n⚠️  You MUST configure the hub chain peer before cross-chain operations work!');
  console.log('\n📝 Run this on Sepolia (via Hardhat console or Etherscan):');
  console.log('');
  console.log('// Using Hardhat console on Sepolia:');
  console.log('const oftusdc = await ethers.getContractAt("OFTUSDC", "' + OFTUSDC_HUB_ADDRESS + '")');
  console.log('await oftusdc.setPeer(' + BNB_TESTNET_EID + ', "' + ethers.zeroPadValue(await usdcOFTAdapterSpoke.getAddress(), 32) + '")');
  console.log('');
  console.log('// Or use Etherscan Write Contract:');
  console.log('URL: https://sepolia.etherscan.io/address/' + OFTUSDC_HUB_ADDRESS + '#writeContract');
  console.log('Function: setPeer');
  console.log('  _eid (uint32): ' + BNB_TESTNET_EID);
  console.log('  _peer (bytes32): ' + ethers.zeroPadValue(await usdcOFTAdapterSpoke.getAddress(), 32));
  console.log('');
  console.log('='.repeat(80));
  console.log('\n🚀 AFTER CONFIGURING HUB PEER:');
  console.log('='.repeat(80));
  console.log('');
  console.log('1. ✅ Spoke users can wrap USDC → OFTUSDC (cross-chain to hub)');
  console.log('2. ✅ Hub users can unwrap OFTUSDC → USDC (cross-chain to spoke)');
  console.log('3. ✅ Full cross-chain USDC flow enabled');
  console.log('4. Mint USDC to test users on BNB Testnet:');
  console.log('   → Use Etherscan write function on MockUSDC contract');
  console.log('   → Call mint(userAddress, amount) with 6 decimals');
  console.log('5. Test cross-chain wrapping flow');
  console.log('6. Update frontend to support BNB Testnet network');
  console.log('');
  console.log('🔗 Useful Links:');
  console.log('  • BNB Testnet Faucet: https://testnet.bnbchain.org/faucet-smart');
  console.log('  • LayerZero Scan: https://testnet.layerzeroscan.com/');
  console.log('  • BNB Testnet Explorer: https://testnet.bscscan.com/');
  console.log('  • Sepolia Etherscan: https://sepolia.etherscan.io/');
  console.log('');
  console.log('='.repeat(80));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ BNB Testnet spoke deployment failed:', error);
    process.exit(1);
  });

