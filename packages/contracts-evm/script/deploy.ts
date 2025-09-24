import { ethers } from 'hardhat';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

async function main() {
  console.log('🚀 Starting BrickVault deployment...');

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log('📝 Deploying contracts with account:', deployer.address);
  console.log('💰 Account balance:', ethers.formatEther(await deployer.provider.getBalance(deployer.address)));

  // Deploy MockUSDC
  console.log('\n📦 Deploying MockUSDC...');
  const MockUSDC = await ethers.getContractFactory('MockUSDC');
  const mockUSDC = await MockUSDC.deploy();
  await mockUSDC.waitForDeployment();
  const mockUSDCAddress = await mockUSDC.getAddress();
  console.log('✅ MockUSDC deployed to:', mockUSDCAddress);

  // Deploy PropertyRegistry
  console.log('\n📦 Deploying PropertyRegistry...');
  const PropertyRegistry = await ethers.getContractFactory('PropertyRegistry');
  const registry = await PropertyRegistry.deploy(deployer.address);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log('✅ PropertyRegistry deployed to:', registryAddress);

  // Create a sample property
  console.log('\n🏠 Creating sample property...');
  
  const propertyMeta = {
    name: 'Downtown Office Building',
    city: 'New York',
    imageURL: 'https://example.com/office-building.jpg',
    valuationFreq: 30, // 30 days
    createdAt: Math.floor(Date.now() / 1000)
  };

  const riskParams = {
    depositCap: ethers.parseUnits('1000000', 6), // 1M USDC
    perUserCap: ethers.parseUnits('100000', 6), // 100K USDC per user
    kycRequired: false,
    redemptionWindow: false,
    redemptionWindowDays: 0
  };

  const fees = {
    managementFeeBps: 100, // 1%
    performanceFeeBps: 200, // 2%
    feeRecipient: deployer.address
  };

  const tx = await registry.createProperty(
    propertyMeta,
    riskParams,
    fees,
    mockUSDCAddress
  );
  const receipt = await tx.wait();
  
  // Get the property ID and vault address from events
  const event = receipt?.logs.find(log => {
    try {
      const parsed = registry.interface.parseLog(log);
      return parsed?.name === 'PropertyCreated';
    } catch {
      return false;
    }
  });
  
  if (event) {
    const parsed = registry.interface.parseLog(event);
    const propertyId = parsed?.args.propertyId;
    const vaultAddress = parsed?.args.vault;
    console.log('✅ Property created with ID:', propertyId.toString());
    console.log('✅ Property vault deployed to:', vaultAddress);

    // Mint some USDC to the vault for testing
    console.log('\n💰 Minting USDC to vault for testing...');
    const mintTx = await mockUSDC.mint(vaultAddress, ethers.parseUnits('10000', 6));
    await mintTx.wait();
    console.log('✅ Minted 10,000 USDC to vault');

    // Test vault functionality
    console.log('\n🧪 Testing vault functionality...');
    const vault = await ethers.getContractAt('PropertyVault', vaultAddress);
    
    // Check initial state
    const totalAssets = await vault.totalAssets();
    const totalSupply = await vault.totalSupply();
    const assetsPerShare = await vault.getAssetsPerShare();
    
    console.log('📊 Vault metrics:');
    console.log('  Total Assets:', ethers.formatUnits(totalAssets, 6), 'USDC');
    console.log('  Total Supply:', ethers.formatUnits(totalSupply, 6), 'shares');
    console.log('  Assets per Share:', ethers.formatUnits(assetsPerShare, 6), 'USDC');

    // Test deposit
    console.log('\n💳 Testing deposit...');
    const depositAmount = ethers.parseUnits('1000', 6);
    await mockUSDC.approve(vaultAddress, depositAmount);
    const depositTx = await vault.deposit(depositAmount, deployer.address);
    await depositTx.wait();
    
    const newTotalAssets = await vault.totalAssets();
    const newTotalSupply = await vault.totalSupply();
    const newAssetsPerShare = await vault.getAssetsPerShare();
    
    console.log('📊 After deposit:');
    console.log('  Total Assets:', ethers.formatUnits(newTotalAssets, 6), 'USDC');
    console.log('  Total Supply:', ethers.formatUnits(newTotalSupply, 6), 'shares');
    console.log('  Assets per Share:', ethers.formatUnits(newAssetsPerShare, 6), 'USDC');

    // Test harvest rent
    console.log('\n🌾 Testing rent harvest...');
    const rentAmount = ethers.parseUnits('100', 6);
    await mockUSDC.approve(vaultAddress, rentAmount);
    const harvestTx = await vault.harvestRent(rentAmount);
    await harvestTx.wait();
    
    const afterHarvestAssets = await vault.totalAssets();
    const afterHarvestAssetsPerShare = await vault.getAssetsPerShare();
    
    console.log('📊 After rent harvest:');
    console.log('  Total Assets:', ethers.formatUnits(afterHarvestAssets, 6), 'USDC');
    console.log('  Assets per Share:', ethers.formatUnits(afterHarvestAssetsPerShare, 6), 'USDC');

    // Test NAV update
    console.log('\n📈 Testing NAV update...');
    const navAmount = ethers.parseUnits('50', 6);
    await mockUSDC.approve(vaultAddress, navAmount);
    const navTx = await vault.updateNAV(navAmount);
    await navTx.wait();
    
    const afterNavAssets = await vault.totalAssets();
    const afterNavAssetsPerShare = await vault.getAssetsPerShare();
    
    console.log('📊 After NAV update:');
    console.log('  Total Assets:', ethers.formatUnits(afterNavAssets, 6), 'USDC');
    console.log('  Assets per Share:', ethers.formatUnits(afterNavAssetsPerShare, 6), 'USDC');

    // Get property metrics
    console.log('\n📊 Property metrics:');
    const metrics = await vault.getPropertyMetrics();
    console.log('  Property ID:', metrics[0].toString());
    console.log('  Total Rent Harvested:', ethers.formatUnits(metrics[1], 6), 'USDC');
    console.log('  Total NAV Changes:', ethers.formatUnits(metrics[2], 6), 'USDC');
    console.log('  Last Rent Harvest:', new Date(Number(metrics[3]) * 1000).toISOString());
    console.log('  Last NAV Update:', new Date(Number(metrics[4]) * 1000).toISOString());

    // Save deployment info
    const deploymentInfo = {
      network: await deployer.provider.getNetwork(),
      deployer: deployer.address,
      contracts: {
        MockUSDC: mockUSDCAddress,
        PropertyRegistry: registryAddress,
        PropertyVault: vaultAddress
      },
      property: {
        id: propertyId.toString(),
        vault: vaultAddress,
        meta: propertyMeta,
        risk: {
          depositCap: ethers.formatUnits(riskParams.depositCap, 6),
          perUserCap: ethers.formatUnits(riskParams.perUserCap, 6),
          kycRequired: riskParams.kycRequired,
          redemptionWindow: riskParams.redemptionWindow,
          redemptionWindowDays: riskParams.redemptionWindowDays
        },
        fees: {
          managementFeeBps: fees.managementFeeBps,
          performanceFeeBps: fees.performanceFeeBps,
          feeRecipient: fees.feeRecipient
        }
      },
      timestamp: new Date().toISOString()
    };

    // Create deployments directory if it doesn't exist
    const deploymentsDir = join(__dirname, '../../deployments');
    mkdirSync(deploymentsDir, { recursive: true });

    // Save deployment info
    const networkName = (await deployer.provider.getNetwork()).name;
    const deploymentFile = join(deploymentsDir, `${networkName}.json`);
    writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    console.log('\n💾 Deployment info saved to:', deploymentFile);

    console.log('\n🎉 Deployment completed successfully!');
    console.log('\n📋 Summary:');
    console.log('  MockUSDC:', mockUSDCAddress);
    console.log('  PropertyRegistry:', registryAddress);
    console.log('  PropertyVault:', vaultAddress);
    console.log('  Property ID:', propertyId.toString());
  } else {
    console.error('❌ Failed to find PropertyCreated event');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
