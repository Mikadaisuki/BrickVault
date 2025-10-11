import { ethers } from 'hardhat';

/**
 * Helper script to mint MockUSDC to test users on Sepolia testnet
 * 
 * Usage:
 *   npx hardhat run script/mint-usdc-testnet.ts --network sepolia
 * 
 * Update USER_ADDRESS and AMOUNT below before running
 */

async function main() {
  console.log('💰 Minting MockUSDC to test user on Sepolia...\n');

  // ============================================================================
  // CONFIGURATION - UPDATE THESE VALUES
  // ============================================================================
  
  // MockUSDC contract address (from deployments/sepolia.json)
  const MOCK_USDC_ADDRESS = process.env.MOCK_USDC_ADDRESS || 'UPDATE_WITH_DEPLOYED_ADDRESS';
  
  // User address to mint USDC to
  const USER_ADDRESS = process.env.USER_ADDRESS || 'UPDATE_WITH_USER_ADDRESS';
  
  // Amount of USDC to mint (in USDC, not wei)
  const USDC_AMOUNT = process.env.USDC_AMOUNT || '10000'; // Default: 10,000 USDC
  
  // ============================================================================

  const [deployer] = await ethers.getSigners();
  console.log('🔑 Deployer:', deployer.address);
  console.log('💰 Deployer ETH Balance:', ethers.formatEther(await deployer.provider.getBalance(deployer.address)), 'ETH\n');

  // Validate inputs
  if (!ethers.isAddress(MOCK_USDC_ADDRESS) || MOCK_USDC_ADDRESS === 'UPDATE_WITH_DEPLOYED_ADDRESS') {
    console.error('❌ Error: Invalid MOCK_USDC_ADDRESS');
    console.log('   Please set MOCK_USDC_ADDRESS in this script or as environment variable');
    console.log('   Get address from: deployments/sepolia.json');
    process.exit(1);
  }

  if (!ethers.isAddress(USER_ADDRESS) || USER_ADDRESS === 'UPDATE_WITH_USER_ADDRESS') {
    console.error('❌ Error: Invalid USER_ADDRESS');
    console.log('   Please set USER_ADDRESS in this script or as environment variable');
    process.exit(1);
  }

  // Connect to MockUSDC contract
  console.log('📋 Minting Details:');
  console.log('  MockUSDC Address:', MOCK_USDC_ADDRESS);
  console.log('  User Address:', USER_ADDRESS);
  console.log('  Amount:', USDC_AMOUNT, 'USDC\n');

  const mockUSDC = await ethers.getContractAt('MockUSDC', MOCK_USDC_ADDRESS);

  // Check deployer is the minter
  try {
    const owner = await mockUSDC.owner();
    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
      console.error('❌ Error: Deployer is not the owner of MockUSDC');
      console.log('   Owner:', owner);
      console.log('   Deployer:', deployer.address);
      process.exit(1);
    }
    console.log('✅ Deployer verified as MockUSDC owner');
  } catch (error) {
    console.warn('⚠️  Could not verify ownership, proceeding anyway...');
  }

  // Calculate amount with decimals
  const amount = ethers.parseUnits(USDC_AMOUNT, 6); // USDC has 6 decimals
  console.log('   Amount in wei:', amount.toString(), '\n');

  // Check user's balance before minting
  try {
    const balanceBefore = await mockUSDC.balanceOf(USER_ADDRESS);
    console.log('📊 User balance before:', ethers.formatUnits(balanceBefore, 6), 'USDC');
  } catch (error) {
    // Continue even if balance check fails
  }

  // Mint USDC
  console.log('🔨 Minting MockUSDC...');
  const tx = await mockUSDC.mint(USER_ADDRESS, amount);
  console.log('   Transaction hash:', tx.hash);
  
  console.log('⏳ Waiting for confirmation...');
  const receipt = await tx.wait();
  console.log('✅ Transaction confirmed in block:', receipt?.blockNumber);

  // Check user's balance after minting
  const balanceAfter = await mockUSDC.balanceOf(USER_ADDRESS);
  console.log('📊 User balance after:', ethers.formatUnits(balanceAfter, 6), 'USDC');
  
  console.log('\n' + '='.repeat(80));
  console.log('🎉 MockUSDC Minting Successful!');
  console.log('='.repeat(80));
  console.log('\n📝 Summary:');
  console.log('  User:', USER_ADDRESS);
  console.log('  Amount Minted:', USDC_AMOUNT, 'USDC');
  console.log('  Current Balance:', ethers.formatUnits(balanceAfter, 6), 'USDC');
  console.log('  Transaction:', `https://sepolia.etherscan.io/tx/${tx.hash}`);
  console.log('\n✨ User can now use MockUSDC to invest in properties!');
  console.log('='.repeat(80));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Minting failed:', error);
    process.exit(1);
  });

