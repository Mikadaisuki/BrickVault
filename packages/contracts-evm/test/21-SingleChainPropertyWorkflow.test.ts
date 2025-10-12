import { expect } from 'chai';
import { ethers } from 'hardhat';
import { 
  EnvironmentConfig, 
  VaultFactory, 
  PropertyRegistry, 
  PropertyVaultGovernance,
  PropertyDAO,
  PropertyToken,
  StacksCrossChainManager,
  OFTUSDC,
  USDCOFTAdapter
} from '../typechain-types';
import { MockUSDC } from '../typechain-types/src/mocks';
import { time } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { Options } from '@layerzerolabs/lz-v2-utilities';

describe('Property Workflow Test (Unified Adapter Architecture)', function () {
  let environmentConfig: EnvironmentConfig;
  let vaultFactory: VaultFactory;
  let propertyRegistry: PropertyRegistry;
  let mockUSDC: MockUSDC;
  let oftUSDC: OFTUSDC; // The actual OFT token
  let usdcOFTAdapter: USDCOFTAdapter; // For all users (hub + spoke)
  let propertyVault: PropertyVaultGovernance;
  let propertyDAO: PropertyDAO;
  let propertyToken: PropertyToken;
  let stacksCrossChainManager: StacksCrossChainManager;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let deployer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let platformOwner: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let investor1: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let investor2: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let investor3: any;
  
  const PROPERTY_NAME = 'Downtown Office Building';
  const USDC_DECIMALS = 6; // MockUSDC has 6 decimals (like real USDC)
  const OFT_DECIMALS = 18; // Adapter OFT tokens have 18 decimals
  const DEPOSIT_CAP = ethers.parseUnits('100000', 18); // 100K OFT cap
  const FUNDING_TARGET = ethers.parseUnits('100000', 18); // 100K OFT target
  const INVESTOR1_AMOUNT_USDC = ethers.parseUnits('40000', USDC_DECIMALS); // 40K USDC
  const INVESTOR2_AMOUNT_USDC = ethers.parseUnits('40000', USDC_DECIMALS); // 40K USDC
  const INVESTOR3_AMOUNT_USDC = ethers.parseUnits('20000', USDC_DECIMALS); // 20K USDC
  const RENT_AMOUNT_USDC = ethers.parseUnits('5000', USDC_DECIMALS); // 5K rent (USDC)
  const EID = 1; // Single hub chain endpoint ID

  beforeEach(async function () {
    // @ts-expect-error - Hardhat type augmentation
    [deployer, platformOwner, investor1, investor2, investor3] = await ethers.getSigners();

    // 1. Deploy EnvironmentConfig
    console.log('\n📋 Step 1: Deploying EnvironmentConfig...');
    const EnvironmentConfig = await ethers.getContractFactory('EnvironmentConfig');
    environmentConfig = await EnvironmentConfig.deploy(platformOwner.address);
    await environmentConfig.waitForDeployment();
    console.log('✅ EnvironmentConfig deployed:', await environmentConfig.getAddress());

    // 2. Deploy Mock LayerZero Endpoint (single endpoint for hub chain)
    console.log('\n📋 Step 2: Deploying Mock LayerZero Endpoint...');
    const eid = EID; // Single hub chain
    const MockLayerZeroEndpointV2 = await ethers.getContractFactory('EndpointV2Mock');
    const mockEndpoint = await MockLayerZeroEndpointV2.deploy(eid);
    await mockEndpoint.waitForDeployment();
    console.log('✅ Mock Endpoint deployed:', await mockEndpoint.getAddress());
    console.log('   📝 Single chain - no cross-chain messaging needed');

    // 3. Deploy MockUSDC (simulates real USDC - 6 decimals)
    console.log('\n📋 Step 3: Deploying MockUSDC...');
    const MockUSDC = await ethers.getContractFactory('MockUSDC');
    mockUSDC = await MockUSDC.deploy(
      'USD Coin',
      'USDC',
      USDC_DECIMALS,
      platformOwner.address
    );
    await mockUSDC.waitForDeployment();
    console.log('✅ MockUSDC deployed:', await mockUSDC.getAddress());
    console.log('   📝 ERC20 token - 6 decimals (like real USDC)');

    // 4. Deploy OFTUSDC (the actual OFT token that vault accepts)
    console.log('\n📋 Step 4: Deploying OFTUSDC...');
    const OFTUSDC = await ethers.getContractFactory('OFTUSDC');
    oftUSDC = await OFTUSDC.deploy(
      'OFT USDC',
      'OFTUSDC',
      await mockEndpoint.getAddress(),
      platformOwner.address
    );
    await oftUSDC.waitForDeployment();
    console.log('✅ OFTUSDC deployed:', await oftUSDC.getAddress());
    console.log('   📝 OFT token - 18 decimals (PropertyVault accepts this)');

    // 5. Deploy USDCOFTAdapter (for hub chain users - unified architecture)
    console.log('\n📋 Step 5: Deploying USDCOFTAdapter on hub...');
    const USDCOFTAdapter = await ethers.getContractFactory('USDCOFTAdapter');
    const adapterContract = await USDCOFTAdapter.deploy(
      await mockUSDC.getAddress(),
      await mockEndpoint.getAddress(),
      platformOwner.address
    );
    await adapterContract.waitForDeployment();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    usdcOFTAdapter = adapterContract as any;
    console.log('✅ USDCOFTAdapter deployed:', await usdcOFTAdapter.getAddress());
    console.log('   📝 Unified adapter - same contract for hub and spoke chains');

    // 5.5. Set peer: Adapter ↔ OFTUSDC (for same-chain operations)
    console.log('\n📋 Step 5.5: Configuring adapter peer to OFTUSDC...');
    await usdcOFTAdapter.connect(platformOwner).setPeer(EID, ethers.zeroPadValue(await oftUSDC.getAddress(), 32));
    await oftUSDC.connect(platformOwner).setPeer(EID, ethers.zeroPadValue(await usdcOFTAdapter.getAddress(), 32));
    console.log('✅ Peer configured: Adapter ↔ OFTUSDC (same chain)');
    
    // 5.6. Configure endpoint routing
    await mockEndpoint.setDestLzEndpoint(await oftUSDC.getAddress(), await mockEndpoint.getAddress());
    await mockEndpoint.setDestLzEndpoint(await usdcOFTAdapter.getAddress(), await mockEndpoint.getAddress());
    console.log('✅ Endpoint routing configured');

    // 7. Mint MockUSDC to investors
    await mockUSDC.connect(platformOwner).mint(investor1.address, INVESTOR1_AMOUNT_USDC);
    await mockUSDC.connect(platformOwner).mint(investor2.address, INVESTOR2_AMOUNT_USDC);
    await mockUSDC.connect(platformOwner).mint(investor3.address, INVESTOR3_AMOUNT_USDC);
    console.log('✅ Investor 1 MockUSDC:', ethers.formatUnits(await mockUSDC.balanceOf(investor1.address), USDC_DECIMALS));
    console.log('✅ Investor 2 MockUSDC:', ethers.formatUnits(await mockUSDC.balanceOf(investor2.address), USDC_DECIMALS));
    console.log('✅ Investor 3 MockUSDC:', ethers.formatUnits(await mockUSDC.balanceOf(investor3.address), USDC_DECIMALS));

    // 8. Deploy VaultFactory
    console.log('\n📋 Step 8: Deploying VaultFactory...');
    const VaultFactory = await ethers.getContractFactory('VaultFactory');
    vaultFactory = await VaultFactory.deploy(platformOwner.address);
    await vaultFactory.waitForDeployment();
    console.log('✅ VaultFactory deployed:', await vaultFactory.getAddress());

    // 9. Deploy PropertyRegistry
    console.log('\n📋 Step 9: Deploying PropertyRegistry...');
    const PropertyRegistry = await ethers.getContractFactory('PropertyRegistry');
    propertyRegistry = await PropertyRegistry.deploy(
      platformOwner.address,
      await environmentConfig.getAddress(),
      await vaultFactory.getAddress()
    );
    await propertyRegistry.waitForDeployment();
    console.log('✅ PropertyRegistry deployed:', await propertyRegistry.getAddress());

    // 10. Authorize PropertyRegistry to create vaults
    console.log('\n📋 Step 10: Authorizing PropertyRegistry...');
    await vaultFactory.connect(platformOwner).addAuthorizedCaller(await propertyRegistry.getAddress());
    console.log('✅ PropertyRegistry authorized to create vaults');

    // 11. Deploy StacksCrossChainManager
    console.log('\n📋 Step 11: Deploying StacksCrossChainManager...');
    const StacksCrossChainManager = await ethers.getContractFactory('StacksCrossChainManager');
    stacksCrossChainManager = await StacksCrossChainManager.deploy(
      await oftUSDC.getAddress(), // Uses OFTUSDC
      platformOwner.address, // Mock price oracle
      platformOwner.address, // Mock relayer
      platformOwner.address  // Owner
    );
    await stacksCrossChainManager.waitForDeployment();
    console.log('✅ StacksCrossChainManager deployed:', await stacksCrossChainManager.getAddress());

    console.log('\n✅ Setup complete - Ready for testing!');
    console.log('   📝 Unified Adapter Architecture (No ShareOFT needed!):');
    console.log('   📝   MockUSDC (6 dec) → USDCOFTAdapter.send(EID) → OFTUSDC (18 dec) → PropertyVault');
    console.log('   📝   Same USDCOFTAdapter contract used on all chains');
    console.log('   📝   All shares stay on hub (voting, harvest, redeem)');
    console.log('   📝   Users can redeem USDC to ANY chain via adapter');
  });

  it('🎯 Single-Chain Flow: Funding → Voting → Purchase → Management', async function () {
    console.log('\n' + '='.repeat(80));
    console.log('🏠 SINGLE-CHAIN PROPERTY WORKFLOW TEST (HUB CHAIN)');
    console.log('🎯 Architecture: MockUSDC → USDCOFTAdapter → OFTUSDC → Vault');
    console.log('='.repeat(80));

    // ============================================================================
    // PHASE 1: PROPERTY CREATION
    // ============================================================================
    console.log('\n📍 PHASE 1: PROPERTY CREATION');
    console.log('-'.repeat(80));

    console.log('Creating property via PropertyRegistry...');
    const createTx = await propertyRegistry.connect(platformOwner).createProperty(
      PROPERTY_NAME,
      DEPOSIT_CAP,
      await oftUSDC.getAddress() // Vault accepts OFTUSDC
    );
    const receipt = await createTx.wait();
    
    // Get vault address from event
    const propertyCreatedEvent = receipt?.logs.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (log: any) => log.fragment?.name === 'PropertyCreated'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vaultAddress = (propertyCreatedEvent as any)?.args?.vault;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propertyId = (propertyCreatedEvent as any)?.args?.propertyId;
    
    console.log('✅ Property ID:', propertyId);
    console.log('✅ Vault Address:', vaultAddress);

    propertyVault = await ethers.getContractAt('PropertyVaultGovernance', vaultAddress);
    
    // Verify vault is PropertyVaultGovernance
    const vaultPropertyId = await propertyVault.propertyId();
    expect(vaultPropertyId).to.equal(propertyId);
    console.log('✅ Vault confirmed as PropertyVaultGovernance with propertyId:', vaultPropertyId);

    // ============================================================================
    // PHASE 2: DAO SETUP
    // ============================================================================
    console.log('\n📍 PHASE 2: DAO SETUP');
    console.log('-'.repeat(80));

    console.log('Deploying PropertyDAO...');
    const PropertyDAO = await ethers.getContractFactory('PropertyDAO');
    propertyDAO = await PropertyDAO.deploy(
      vaultAddress,
      platformOwner.address
    );
    await propertyDAO.waitForDeployment();
    console.log('✅ PropertyDAO deployed:', await propertyDAO.getAddress());

    // Link DAO to Vault
    console.log('Linking DAO to Vault...');
    await propertyVault.connect(platformOwner).setDAO(await propertyDAO.getAddress());
    console.log('✅ DAO linked to Vault');

    // Set funding target
    console.log('Setting funding target...');
    const fundingDeadline = (await time.latest()) + 30 * 24 * 60 * 60; // 30 days
    await propertyDAO.connect(platformOwner).setFundingTarget(FUNDING_TARGET, fundingDeadline);
    console.log('✅ Funding target set:', ethers.formatUnits(FUNDING_TARGET, 18), 'OFTUSDC');

    // Check initial stage
    const initialStage = await propertyDAO.getCurrentStage();
    expect(initialStage).to.equal(0); // OpenToFund
    console.log('✅ Current stage: OpenToFund (0)');

    // ============================================================================
    // PHASE 3: FUNDING STAGE (MockUSDC → Gateway → OFTUSDC → Vault)
    // ============================================================================
    console.log('\n📍 PHASE 3: FUNDING STAGE (OpenToFund)');
    console.log('-'.repeat(80));
    console.log('🎯 Hub Chain Flow: MockUSDC → USDCOFTAdapter.send(EID) → OFTUSDC → Deposit to Vault');

    // Helper: Convert MockUSDC to OFTUSDC using USDCOFTAdapter (unified architecture)
    const convertUSDCToOFT = async (investor: any, usdcAmount: bigint) => {
      console.log('   Converting MockUSDC to OFTUSDC via adapter.send(EID)...');
      
      // Approve adapter to spend MockUSDC
      await mockUSDC.connect(investor).approve(await usdcOFTAdapter.getAddress(), usdcAmount);
      
      // Send to same chain (wraps USDC → OFTUSDC)
      const options = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString();
      const sendParam = {
        dstEid: EID,
        to: ethers.zeroPadValue(investor.address, 32),
        amountLD: usdcAmount,
        minAmountLD: usdcAmount,
        extraOptions: options,
        composeMsg: '0x',
        oftCmd: '0x'
      };
      const feeQuote = await usdcOFTAdapter.quoteSend(sendParam, false);
      const fee = { nativeFee: feeQuote.nativeFee, lzTokenFee: feeQuote.lzTokenFee };
      
      await usdcOFTAdapter.connect(investor).send(sendParam, fee, investor.address, { value: fee.nativeFee });
      
      // OFT amount is scaled from 6 to 18 decimals
      const oftAmount = usdcAmount * BigInt(10 ** 12);
      console.log('   ✅ OFTUSDC tokens received:', ethers.formatUnits(oftAmount, 18));
      return oftAmount;
    };

    // Investor 1: Convert USDC → OFTUSDC → Deposit to Vault
    console.log('\n👤 Investor 1:');
    console.log('   Starting MockUSDC:', ethers.formatUnits(await mockUSDC.balanceOf(investor1.address), USDC_DECIMALS));
    const investor1OFTAmount = await convertUSDCToOFT(investor1, INVESTOR1_AMOUNT_USDC);
    console.log('   Depositing OFTUSDC to vault...');
    await oftUSDC.connect(investor1).approve(vaultAddress, investor1OFTAmount);
    await propertyVault.connect(investor1).deposit(investor1OFTAmount, investor1.address);
    const investor1Shares = await propertyVault.balanceOf(investor1.address);
    console.log('   ✅ Vault shares:', ethers.formatUnits(investor1Shares, 18));

    // Investor 2: Convert USDC → OFTUSDC → Deposit to Vault
    console.log('\n👤 Investor 2:');
    console.log('   Starting MockUSDC:', ethers.formatUnits(await mockUSDC.balanceOf(investor2.address), USDC_DECIMALS));
    const investor2OFTAmount = await convertUSDCToOFT(investor2, INVESTOR2_AMOUNT_USDC);
    console.log('   Depositing OFTUSDC to vault...');
    await oftUSDC.connect(investor2).approve(vaultAddress, investor2OFTAmount);
    await propertyVault.connect(investor2).deposit(investor2OFTAmount, investor2.address);
    const investor2Shares = await propertyVault.balanceOf(investor2.address);
    console.log('   ✅ Vault shares:', ethers.formatUnits(investor2Shares, 18));

    // Investor 3: Convert USDC → OFTUSDC → Deposit (completes funding)
    console.log('\n👤 Investor 3 (will complete funding):');
    console.log('   Starting MockUSDC:', ethers.formatUnits(await mockUSDC.balanceOf(investor3.address), USDC_DECIMALS));
    const investor3OFTAmount = await convertUSDCToOFT(investor3, INVESTOR3_AMOUNT_USDC);
    console.log('   Depositing OFTUSDC to vault (will trigger auto-transition to Funded)...');
    await oftUSDC.connect(investor3).approve(vaultAddress, investor3OFTAmount);
    await propertyVault.connect(investor3).deposit(investor3OFTAmount, investor3.address);
    const investor3Shares = await propertyVault.balanceOf(investor3.address);
    console.log('   ✅ Vault shares:', ethers.formatUnits(investor3Shares, 18));

    // Check stage after funding complete
    const fundedStage = await propertyDAO.getCurrentStage();
    expect(fundedStage).to.equal(1); // Funded
    console.log('✅ Stage auto-transitioned to: Funded (1)');

    const propertyInfo = await propertyDAO.getPropertyInfo();
    console.log('✅ Total invested:', ethers.formatUnits(propertyInfo.totalInvested, 18), 'OFT tokens');
    console.log('✅ Is fully funded:', propertyInfo.isFullyFunded);

    // ============================================================================
    // PHASE 4: VOTING ON PROPERTY PURCHASE
    // ============================================================================
    console.log('\n📍 PHASE 4: VOTING ON PROPERTY PURCHASE');
    console.log('-'.repeat(80));

    // Check for auto-created proposal
    const proposalCount = await propertyDAO.proposalCount();
    console.log('📋 Proposal count:', proposalCount);
    expect(proposalCount).to.be.greaterThan(0);

    const proposal = await propertyDAO.getProposal(1);
    console.log('✅ Auto-created proposal found:');
    console.log('   - ID:', proposal.id);
    console.log('   - Type:', proposal.proposalType, '(PropertyPurchase)');
    console.log('   - Description:', proposal.description);
    console.log('   - Status:', proposal.status, '(Active)');

    // Investors vote
    console.log('\n🗳️  Voting phase...');
    
    const investor1Power = await propertyDAO.getVotingPower(investor1.address);
    const investor2Power = await propertyDAO.getVotingPower(investor2.address);
    const investor3Power = await propertyDAO.getVotingPower(investor3.address);
    
    console.log('👤 Investor 1 votes YES (Power:', ethers.formatUnits(investor1Power, 18), 'shares)');
    await propertyDAO.connect(investor1).vote(1, true);
    
    console.log('👤 Investor 2 votes YES (Power:', ethers.formatUnits(investor2Power, 18), 'shares)');
    await propertyDAO.connect(investor2).vote(1, true);
    
    console.log('👤 Investor 3 votes YES (Power:', ethers.formatUnits(investor3Power, 18), 'shares)');
    await propertyDAO.connect(investor3).vote(1, true);

    const proposalAfterVoting = await propertyDAO.getProposal(1);
    console.log('\n📊 Proposal Status After Voting:');
    console.log('   - Votes For:', ethers.formatUnits(proposalAfterVoting.votesFor, 18));
    console.log('   - Votes Against:', ethers.formatUnits(proposalAfterVoting.votesAgainst, 18));

    // Fast forward time past voting period
    console.log('\n⏭️  Fast forwarding past voting period (7 days)...');
    await time.increase(7 * 24 * 60 * 60 + 1);
    
    const canExecute = await propertyDAO.canExecute(1);
    console.log('✅ Can execute after deadline:', canExecute);
    expect(canExecute).to.be.true;

    // ============================================================================
    // PHASE 5: EXECUTE PROPERTY PURCHASE
    // ============================================================================
    console.log('\n📍 PHASE 5: EXECUTE PROPERTY PURCHASE');
    console.log('-'.repeat(80));

    const vaultBalanceBefore = await oftUSDC.balanceOf(vaultAddress);
    console.log('Vault OFTUSDC balance before:', ethers.formatUnits(vaultBalanceBefore, 18));

    console.log('Executing proposal...');
    await propertyDAO.connect(platformOwner).executeProposal(1);
    console.log('✅ Proposal executed');

    const vaultBalanceAfter = await oftUSDC.balanceOf(vaultAddress);
    console.log('Vault OFTUSDC balance after:', ethers.formatUnits(vaultBalanceAfter, 18));
    expect(vaultBalanceAfter).to.be.lessThan(vaultBalanceBefore);

    // Complete property purchase
    console.log('\n🏠 Completing property purchase...');
    const propertyAddress = '100 Market Street, San Francisco, CA';
    await propertyDAO.connect(platformOwner).completePropertyPurchase(propertyAddress);
    console.log('✅ Property purchased at:', propertyAddress);

    // Check stage
    const stageAfterPurchase = await propertyDAO.getCurrentStage();
    expect(stageAfterPurchase).to.equal(2); // UnderManagement
    console.log('✅ Stage transitioned to: UnderManagement (2)');

    // Check PropertyToken created
    const propertyTokenAddress = await propertyVault.getPropertyToken();
    expect(propertyTokenAddress).to.not.equal(ethers.ZeroAddress);
    console.log('✅ PropertyToken created:', propertyTokenAddress);

    propertyToken = await ethers.getContractAt('PropertyToken', propertyTokenAddress);
    const tokenSupply = await propertyToken.totalSupply();
    console.log('✅ PropertyToken initial supply:', ethers.formatUnits(tokenSupply, 18));

    // ============================================================================
    // PHASE 6: RENT COLLECTION (MockUSDC → Gateway → OFTUSDC → Vault)
    // ============================================================================
    console.log('\n📍 PHASE 6: RENT COLLECTION');
    console.log('-'.repeat(80));
    console.log('🎯 Flow: Platform receives MockUSDC → Convert via Gateway → Harvest rent');

    // Mint MockUSDC rent to platform
    console.log('💰 Platform collecting rent (MockUSDC)...');
    await mockUSDC.connect(platformOwner).mint(platformOwner.address, RENT_AMOUNT_USDC);
    console.log('✅ Platform has MockUSDC:', ethers.formatUnits(RENT_AMOUNT_USDC, USDC_DECIMALS));
    
    // Convert to OFTUSDC via gateway
    console.log('   Converting MockUSDC to OFTUSDC via gateway...');
    const rentOFTAmount = await convertUSDCToOFT(platformOwner, RENT_AMOUNT_USDC);
    
    // Harvest rent
    await oftUSDC.connect(platformOwner).approve(vaultAddress, rentOFTAmount);
    await propertyVault.connect(platformOwner).harvestRent(rentOFTAmount);
    console.log('✅ Rent harvested:', ethers.formatUnits(rentOFTAmount, 18), 'OFTUSDC');

    const totalRentHarvested = await propertyVault.totalRentHarvested();
    console.log('✅ Total rent harvested:', ethers.formatUnits(totalRentHarvested, 18), 'OFTUSDC');

    // ============================================================================
    // PHASE 7: INCOME WITHDRAWALS
    // ============================================================================
    console.log('\n📍 PHASE 7: INCOME WITHDRAWALS');
    console.log('-'.repeat(80));

    // Calculate investor 1's share of income
    const totalShares = await propertyVault.totalSupply();
    const investor1ShareOfIncome = (rentOFTAmount * investor1Shares) / totalShares;
    
    console.log('\n👤 Investor 1 withdrawing income...');
    console.log('   - Investor 1 shares:', ethers.formatUnits(investor1Shares, 18));
    console.log('   - Total shares:', ethers.formatUnits(totalShares, 18));
    console.log('   - Expected share of income:', ethers.formatUnits(investor1ShareOfIncome, 18), 'OFT tokens');

    const maxWithdrawable = await propertyVault.getMaxWithdrawable(investor1.address);
    console.log('   - Max withdrawable:', ethers.formatUnits(maxWithdrawable, 18), 'OFTUSDC');

    const investor1OFTBefore = await oftUSDC.balanceOf(investor1.address);
    const investor1SharesBefore = await propertyVault.balanceOf(investor1.address);
    
    await propertyVault.connect(investor1).withdraw(maxWithdrawable, investor1.address, investor1.address);
    
    const investor1OFTAfter = await oftUSDC.balanceOf(investor1.address);
    const investor1SharesAfter = await propertyVault.balanceOf(investor1.address);
    
    console.log('✅ Investor 1 withdrew:', ethers.formatUnits(investor1OFTAfter - investor1OFTBefore, 18), 'OFTUSDC');
    console.log('✅ Shares before:', ethers.formatUnits(investor1SharesBefore, 18));
    console.log('✅ Shares after:', ethers.formatUnits(investor1SharesAfter, 18));
    console.log('✅ Shares preserved:', investor1SharesBefore.toString() === investor1SharesAfter.toString());

    // Verify principal is locked
    expect(investor1SharesBefore).to.equal(investor1SharesAfter);
    console.log('✅ Principal correctly locked - shares not burned during income withdrawal');

    // ============================================================================
    // PHASE 8: SUMMARY
    // ============================================================================
    console.log('\n' + '='.repeat(80));
    console.log('📊 SINGLE-CHAIN WORKFLOW SUMMARY');
    console.log('='.repeat(80));

    console.log('\n🏠 Property Information:');
    console.log('   - Name:', PROPERTY_NAME);
    console.log('   - Address:', propertyAddress);
    console.log('   - Stage:', await propertyDAO.getCurrentStage(), '(UnderManagement)');
    console.log('   - Total Invested:', ethers.formatUnits(propertyInfo.totalInvested, 18), 'OFT tokens');

    console.log('\n💰 Financial Summary:');
    console.log('   - Total Rent Collected:', ethers.formatUnits(totalRentHarvested, 18), 'OFTUSDC');
    console.log('   - Investor 1 Income Withdrawn:', ethers.formatUnits(investor1OFTAfter - investor1OFTBefore, 18), 'OFTUSDC');

    console.log('\n🎯 Architecture Benefits:');
    console.log('   ✅ Unified Adapter: Same USDCOFTAdapter on all chains');
    console.log('   ✅ Perfect fungibility: All OFTUSDC backed by locked USDC');
    console.log('   ✅ Simulates real USDC (6 decimals) to OFTUSDC (18 decimals) conversion');
    console.log('   ✅ Users can redeem to ANY chain with adapter');
    console.log('   ✅ Shared liquidity pool across all chains');

    console.log('\n✅ SINGLE-CHAIN WORKFLOW TEST PASSED! 🎉');
    console.log('='.repeat(80));
  });

  it('💰 Test MockUSDC → Adapter → OFTUSDC Conversion and Investment', async function () {
    console.log('\n' + '='.repeat(80));
    console.log('💰 MOCKUSDC → ADAPTER → OFTUSDC CONVERSION TEST');
    console.log('='.repeat(80));

    // Create property and setup
    console.log('\n📋 Setting up property...');
    const createTx = await propertyRegistry.connect(platformOwner).createProperty(
      'Test Property for Gateway Conversion',
      DEPOSIT_CAP,
      await oftUSDC.getAddress()
    );
    const receipt = await createTx.wait();
    
    const propertyCreatedEvent = receipt?.logs.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (log: any) => log.fragment?.name === 'PropertyCreated'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vaultAddress = (propertyCreatedEvent as any)?.args?.vault;
    
    const testVault = await ethers.getContractAt('PropertyVaultGovernance', vaultAddress);

    // Test: User converts MockUSDC via adapter and invests
    console.log('\n📍 TEST: Hub User Flow - Receive USDC → Adapter → OFTUSDC → Deposit');
    console.log('-'.repeat(60));

    const usdcMintAmount = ethers.parseUnits('10000', USDC_DECIMALS);
    
    console.log('1️⃣ Mint MockUSDC to investor...');
    await mockUSDC.connect(platformOwner).mint(investor1.address, usdcMintAmount);
    const usdcBalance = await mockUSDC.balanceOf(investor1.address);
    console.log('   ✅ Minted:', ethers.formatUnits(usdcBalance, USDC_DECIMALS), 'USDC');

    console.log('\n2️⃣ Convert USDC via adapter.send(EID) (hub chain)...');
    const options = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString();
    await mockUSDC.connect(investor1).approve(await usdcOFTAdapter.getAddress(), usdcMintAmount);
    const sendParam = {
      dstEid: EID,
      to: ethers.zeroPadValue(investor1.address, 32),
      amountLD: usdcMintAmount,
      minAmountLD: usdcMintAmount,
      extraOptions: options,
      composeMsg: '0x',
      oftCmd: '0x'
    };
    const feeQuote = await usdcOFTAdapter.quoteSend(sendParam, false);
    const fee = { nativeFee: feeQuote.nativeFee, lzTokenFee: feeQuote.lzTokenFee };
    await usdcOFTAdapter.connect(investor1).send(sendParam, fee, investor1.address, { value: fee.nativeFee });
    
    const oftAmount = usdcMintAmount * BigInt(10 ** 12); // Scaled to 18 decimals
    const oftBalance = await oftUSDC.balanceOf(investor1.address);
    console.log('   ✅ OFTUSDC balance:', ethers.formatUnits(oftBalance, 18));
    expect(oftBalance).to.equal(oftAmount);

    console.log('\n3️⃣ Approve vault...');
    await oftUSDC.connect(investor1).approve(vaultAddress, oftAmount);
    const allowance = await oftUSDC.allowance(investor1.address, vaultAddress);
    console.log('   ✅ Approved:', ethers.formatUnits(allowance, 18), 'OFTUSDC');

    console.log('\n4️⃣ Deposit OFTUSDC to vault...');
    await testVault.connect(investor1).deposit(oftAmount, investor1.address);
    const shares = await testVault.balanceOf(investor1.address);
    console.log('   ✅ Shares received:', ethers.formatUnits(shares, 18));
    expect(shares).to.be.greaterThan(0);

    console.log('\n✅ Complete MockUSDC → Adapter → OFTUSDC → Vault flow tested!');
    console.log('='.repeat(80));
  });

  it('🔄 Test Multiple Rent Periods (Single-Chain)', async function () {
    console.log('\n' + '='.repeat(80));
    console.log('🔄 MULTIPLE RENT PERIODS TEST (Single-Chain)');
    console.log('='.repeat(80));

    // Setup property and complete funding
    console.log('\n📋 Setting up property...');
    const createTx = await propertyRegistry.connect(platformOwner).createProperty(
      'Test Property for Multiple Periods',
      DEPOSIT_CAP,
      await oftUSDC.getAddress()
    );
    const receipt = await createTx.wait();
    
    const propertyCreatedEvent = receipt?.logs.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (log: any) => log.fragment?.name === 'PropertyCreated'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vaultAddress = (propertyCreatedEvent as any)?.args?.vault;
    
    const testVault = await ethers.getContractAt('PropertyVaultGovernance', vaultAddress);
    
    // Deploy DAO and complete setup
    const PropertyDAO = await ethers.getContractFactory('PropertyDAO');
    const testDAO = await PropertyDAO.deploy(vaultAddress, platformOwner.address);
    await testDAO.waitForDeployment();
    await testVault.connect(platformOwner).setDAO(await testDAO.getAddress());
    
    const fundingDeadline = (await time.latest()) + 30 * 24 * 60 * 60;
    await testDAO.connect(platformOwner).setFundingTarget(FUNDING_TARGET, fundingDeadline);
    
    // Fund property (convert USDC via gateway)
    const fundingUSDCAmount = ethers.parseUnits('100000', USDC_DECIMALS);
    await mockUSDC.connect(platformOwner).mint(investor1.address, fundingUSDCAmount);
    
    // Convert via adapter
    const options = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString();
    await mockUSDC.connect(investor1).approve(await usdcOFTAdapter.getAddress(), fundingUSDCAmount);
    const fundingSendParam = {
      dstEid: EID,
      to: ethers.zeroPadValue(investor1.address, 32),
      amountLD: fundingUSDCAmount,
      minAmountLD: fundingUSDCAmount,
      extraOptions: options,
      composeMsg: '0x',
      oftCmd: '0x'
    };
    const fundingFeeQuote = await usdcOFTAdapter.quoteSend(fundingSendParam, false);
    const fundingFee = { nativeFee: fundingFeeQuote.nativeFee, lzTokenFee: fundingFeeQuote.lzTokenFee };
    await usdcOFTAdapter.connect(investor1).send(fundingSendParam, fundingFee, investor1.address, { value: fundingFee.nativeFee });
    
    const fundingOFTAmount = fundingUSDCAmount * BigInt(10 ** 12);
    await oftUSDC.connect(investor1).approve(vaultAddress, fundingOFTAmount);
    await testVault.connect(investor1).deposit(fundingOFTAmount, investor1.address);
    
    // Execute purchase proposal
    await testDAO.connect(investor1).vote(1, true);
    await time.increase(7 * 24 * 60 * 60 + 1);
    await testDAO.connect(platformOwner).executeProposal(1);
    await testDAO.connect(platformOwner).completePropertyPurchase('Test Address');
    
    console.log('✅ Property setup complete');

    // ============================================================================
    // PERIOD 1: First Rent Harvest
    // ============================================================================
    console.log('\n📍 PERIOD 1: First Rent Harvest');
    console.log('-'.repeat(60));

    const rent1USDC = ethers.parseUnits('5000', USDC_DECIMALS);
    await mockUSDC.connect(platformOwner).mint(platformOwner.address, rent1USDC);
    
    // Convert via adapter
    await mockUSDC.connect(platformOwner).approve(await usdcOFTAdapter.getAddress(), rent1USDC);
    const rent1SendParam = {
      dstEid: EID,
      to: ethers.zeroPadValue(platformOwner.address, 32),
      amountLD: rent1USDC,
      minAmountLD: rent1USDC,
      extraOptions: options,
      composeMsg: '0x',
      oftCmd: '0x'
    };
    const rent1FeeQuote = await usdcOFTAdapter.quoteSend(rent1SendParam, false);
    const rent1Fee = { nativeFee: rent1FeeQuote.nativeFee, lzTokenFee: rent1FeeQuote.lzTokenFee };
    await usdcOFTAdapter.connect(platformOwner).send(rent1SendParam, rent1Fee, platformOwner.address, { value: rent1Fee.nativeFee });
    
    const rent1OFT = rent1USDC * BigInt(10 ** 12);
    await oftUSDC.connect(platformOwner).approve(vaultAddress, rent1OFT);
    await testVault.connect(platformOwner).harvestRent(rent1OFT);
    
    console.log('✅ Period 1 rent harvested:', ethers.formatUnits(rent1OFT, 18), 'OFTUSDC');
    
    const period1 = await testVault.currentPeriod();
    console.log('✅ Current period:', period1);

    // Withdraw Period 1 income
    const maxWithdrawable1 = await testVault.getMaxWithdrawable(investor1.address);
    console.log('👤 Max withdrawable (Period 1):', ethers.formatUnits(maxWithdrawable1, 18), 'OFT');
    
    await testVault.connect(investor1).withdraw(maxWithdrawable1, investor1.address, investor1.address);
    console.log('✅ Withdrawn successfully');
    
    const maxAfter1 = await testVault.getMaxWithdrawable(investor1.address);
    expect(maxAfter1).to.equal(0);
    console.log('✅ Max withdrawable after Period 1:', ethers.formatUnits(maxAfter1, 18));

    // ============================================================================
    // PERIOD 2: Second Rent Harvest
    // ============================================================================
    console.log('\n📍 PERIOD 2: Second Rent Harvest');
    console.log('-'.repeat(60));

    const rent2USDC = ethers.parseUnits('6000', USDC_DECIMALS);
    await mockUSDC.connect(platformOwner).mint(platformOwner.address, rent2USDC);
    
    // Convert via adapter
    await mockUSDC.connect(platformOwner).approve(await usdcOFTAdapter.getAddress(), rent2USDC);
    const rent2SendParam = {
      dstEid: EID,
      to: ethers.zeroPadValue(platformOwner.address, 32),
      amountLD: rent2USDC,
      minAmountLD: rent2USDC,
      extraOptions: options,
      composeMsg: '0x',
      oftCmd: '0x'
    };
    const rent2FeeQuote = await usdcOFTAdapter.quoteSend(rent2SendParam, false);
    const rent2Fee = { nativeFee: rent2FeeQuote.nativeFee, lzTokenFee: rent2FeeQuote.lzTokenFee };
    await usdcOFTAdapter.connect(platformOwner).send(rent2SendParam, rent2Fee, platformOwner.address, { value: rent2Fee.nativeFee });
    
    const rent2OFT = rent2USDC * BigInt(10 ** 12);
    await oftUSDC.connect(platformOwner).approve(vaultAddress, rent2OFT);
    await testVault.connect(platformOwner).harvestRent(rent2OFT);
    
    console.log('✅ Period 2 rent harvested:', ethers.formatUnits(rent2OFT, 18), 'OFTUSDC');
    
    const period2 = await testVault.currentPeriod();
    console.log('✅ Current period:', period2);
    expect(period2).to.equal(period1 + BigInt(1));

    const maxWithdrawable2 = await testVault.getMaxWithdrawable(investor1.address);
    console.log('👤 Max withdrawable (Period 2):', ethers.formatUnits(maxWithdrawable2, 18), 'OFT');
    expect(maxWithdrawable2).to.be.greaterThan(0);
    console.log('✅ New period income available!');

    console.log('\n✅ MULTIPLE RENT PERIODS TEST PASSED! 🎉');
    console.log('='.repeat(80));
  });

  it('🌉 Test Cross-Chain: Spoke User → Bridge → Hub Vault Investment', async function () {
    console.log('\n' + '='.repeat(80));
    console.log('🌉 CROSS-CHAIN PROPERTY INVESTMENT TEST');
    console.log('🎯 Spoke Chain User → USDCOFTAdapter → Bridge → OFTUSDC on Hub → Vault');
    console.log('='.repeat(80));

    // ============================================================================
    // PHASE 1: SETUP TWO CHAINS (HUB + SPOKE)
    // ============================================================================
    console.log('\n📍 PHASE 1: SETUP TWO CHAINS');
    console.log('-'.repeat(80));

    const HUB_EID = 1;
    const SPOKE_EID = 2;

    // Deploy mock endpoints for hub and spoke
    console.log('🔗 Deploying mock endpoints...');
    const MockLayerZeroEndpointV2 = await ethers.getContractFactory('EndpointV2Mock');
    const hubEndpoint = await MockLayerZeroEndpointV2.deploy(HUB_EID);
    await hubEndpoint.waitForDeployment();
    console.log('✅ Hub Endpoint (EID 1):', await hubEndpoint.getAddress());

    const spokeEndpoint = await MockLayerZeroEndpointV2.deploy(SPOKE_EID);
    await spokeEndpoint.waitForDeployment();
    console.log('✅ Spoke Endpoint (EID 2):', await spokeEndpoint.getAddress());

    // Deploy MockUSDC on spoke chain
    console.log('\n💵 Deploying MockUSDC on Spoke Chain...');
    const MockUSDC = await ethers.getContractFactory('MockUSDC');
    const spokeUSDC = await MockUSDC.deploy(
      'USD Coin (Spoke)',
      'USDC',
      USDC_DECIMALS,
      platformOwner.address
    );
    await spokeUSDC.waitForDeployment();
    console.log('✅ Spoke USDC deployed:', await spokeUSDC.getAddress());

    // Deploy OFTUSDC on hub chain
    console.log('\n🏦 Deploying OFTUSDC on Hub Chain...');
    const OFTUSDC = await ethers.getContractFactory('OFTUSDC');
    const hubOFTUSDC = await OFTUSDC.deploy(
      'OFT USDC (Hub)',
      'OFTUSDC',
      await hubEndpoint.getAddress(),
      platformOwner.address
    );
    await hubOFTUSDC.waitForDeployment();
    console.log('✅ Hub OFTUSDC deployed:', await hubOFTUSDC.getAddress());

    // Deploy USDCOFTAdapter on spoke chain
    console.log('\n🌉 Deploying USDCOFTAdapter on Spoke Chain...');
    const USDCOFTAdapter = await ethers.getContractFactory('USDCOFTAdapter');
    const spokeAdapter = await USDCOFTAdapter.deploy(
      await spokeUSDC.getAddress(),
      await spokeEndpoint.getAddress(),
      platformOwner.address
    );
    await spokeAdapter.waitForDeployment();
    console.log('✅ Spoke Adapter deployed:', await spokeAdapter.getAddress());
    console.log('   📝 This wraps spoke USDC for cross-chain transfer');

    // ============================================================================
    // PHASE 2: CONFIGURE LAYERZERO PEERS
    // ============================================================================
    console.log('\n📍 PHASE 2: CONFIGURE LAYERZERO PEERS');
    console.log('-'.repeat(80));

    // Set peer: Spoke Adapter → Hub OFTUSDC
    console.log('🔗 Configuring peers for cross-chain communication...');
    const hubOFTUSDCBytes32 = ethers.zeroPadValue(await hubOFTUSDC.getAddress(), 32);
    const spokeAdapterBytes32 = ethers.zeroPadValue(await spokeAdapter.getAddress(), 32);

    await spokeAdapter.connect(platformOwner).setPeer(HUB_EID, hubOFTUSDCBytes32);
    console.log('✅ Spoke Adapter → Hub OFTUSDC peer configured');

    await hubOFTUSDC.connect(platformOwner).setPeer(SPOKE_EID, spokeAdapterBytes32);
    console.log('✅ Hub OFTUSDC → Spoke Adapter peer configured');

    // Configure mock endpoints to route messages
    await spokeEndpoint.setDestLzEndpoint(await hubOFTUSDC.getAddress(), await hubEndpoint.getAddress());
    await hubEndpoint.setDestLzEndpoint(await spokeAdapter.getAddress(), await spokeEndpoint.getAddress());
    console.log('✅ Mock endpoint routing configured');

    // ============================================================================
    // PHASE 3: CREATE PROPERTY VAULT ON HUB
    // ============================================================================
    console.log('\n📍 PHASE 3: CREATE PROPERTY VAULT ON HUB');
    console.log('-'.repeat(80));

    console.log('Creating property on hub chain...');
    const createTx = await propertyRegistry.connect(platformOwner).createProperty(
      'Cross-Chain Test Property',
      DEPOSIT_CAP,
      await hubOFTUSDC.getAddress() // Vault accepts hub OFTUSDC
    );
    const receipt = await createTx.wait();
    
    const propertyCreatedEvent = receipt?.logs.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (log: any) => log.fragment?.name === 'PropertyCreated'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vaultAddress = (propertyCreatedEvent as any)?.args?.vault;
    
    console.log('✅ Property Vault created on hub:', vaultAddress);
    const crossChainVault = await ethers.getContractAt('PropertyVaultGovernance', vaultAddress);

    // ============================================================================
    // PHASE 4: SPOKE USER BRIDGES USDC TO HUB
    // ============================================================================
    console.log('\n📍 PHASE 4: SPOKE USER BRIDGES USDC TO HUB');
    console.log('-'.repeat(80));
    console.log('🎯 Flow: Spoke USDC → Adapter → LayerZero → Hub OFTUSDC');

    // Mint USDC to investor on spoke chain
    const spokeInvestAmount = ethers.parseUnits('50000', USDC_DECIMALS);
    await spokeUSDC.connect(platformOwner).mint(investor1.address, spokeInvestAmount);
    console.log('\n👤 Investor 1 on Spoke Chain:');
    console.log('   💰 USDC Balance:', ethers.formatUnits(spokeInvestAmount, USDC_DECIMALS), 'USDC');

    // Approve adapter to spend USDC
    console.log('\n🔐 Approving adapter to spend USDC...');
    await spokeUSDC.connect(investor1).approve(await spokeAdapter.getAddress(), spokeInvestAmount);
    console.log('   ✅ Approved');

    // Prepare LayerZero V2 options
    console.log('\n🌉 Bridging USDC from spoke to hub...');
    const options = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString();
    
    const sendParam = {
      dstEid: HUB_EID, // Destination = Hub chain (EID 1)
      to: ethers.zeroPadValue(investor1.address, 32), // Recipient on hub
      amountLD: spokeInvestAmount, // Amount in USDC decimals (6)
      minAmountLD: spokeInvestAmount, // Min amount (no slippage)
      extraOptions: options,
      composeMsg: '0x',
      oftCmd: '0x'
    };

    // Quote the cross-chain fee
    const feeQuoteResult = await spokeAdapter.quoteSend(sendParam, false);
    const feeQuote = { 
      nativeFee: feeQuoteResult.nativeFee, 
      lzTokenFee: feeQuoteResult.lzTokenFee 
    };
    console.log('   💸 LayerZero Fee:', ethers.formatEther(feeQuote.nativeFee), 'ETH');

    // Send USDC cross-chain via adapter
    const balanceBefore = await hubOFTUSDC.balanceOf(investor1.address);
    console.log('   📊 Hub OFTUSDC balance before:', ethers.formatUnits(balanceBefore, 18));

    await spokeAdapter.connect(investor1).send(
      sendParam,
      feeQuote,
      investor1.address,
      { value: feeQuote.nativeFee }
    );

    const balanceAfter = await hubOFTUSDC.balanceOf(investor1.address);
    const expectedOFTAmount = spokeInvestAmount * BigInt(10 ** 12); // Scale from 6 to 18 decimals
    console.log('   ✅ Hub OFTUSDC balance after:', ethers.formatUnits(balanceAfter, 18));
    console.log('   ✅ Amount bridged:', ethers.formatUnits(balanceAfter - balanceBefore, 18), 'OFTUSDC');
    
    expect(balanceAfter - balanceBefore).to.equal(expectedOFTAmount);

    // ============================================================================
    // PHASE 5: INVEST IN VAULT ON HUB
    // ============================================================================
    console.log('\n📍 PHASE 5: INVEST IN VAULT ON HUB');
    console.log('-'.repeat(80));

    console.log('👤 Investor 1 depositing bridged OFTUSDC to vault...');
    const investAmount = balanceAfter - balanceBefore;

    // Approve vault
    await hubOFTUSDC.connect(investor1).approve(vaultAddress, investAmount);
    console.log('   ✅ Vault approved');

    // Deposit to vault
    await crossChainVault.connect(investor1).deposit(investAmount, investor1.address);
    const shares = await crossChainVault.balanceOf(investor1.address);
    console.log('   ✅ Vault shares received:', ethers.formatUnits(shares, 18));

    expect(shares).to.be.greaterThan(0);

    // ============================================================================
    // PHASE 6: SUMMARY
    // ============================================================================
    console.log('\n' + '='.repeat(80));
    console.log('📊 CROSS-CHAIN WORKFLOW SUMMARY');
    console.log('='.repeat(80));

    console.log('\n🌉 Cross-Chain Flow Completed:');
    console.log('   1️⃣  Spoke Chain: User has', ethers.formatUnits(spokeInvestAmount, USDC_DECIMALS), 'USDC');
    console.log('   2️⃣  Spoke Chain: User approves & sends to USDCOFTAdapter');
    console.log('   3️⃣  LayerZero: Bridges tokens cross-chain');
    console.log('   4️⃣  Hub Chain: User receives', ethers.formatUnits(investAmount, 18), 'OFTUSDC');
    console.log('   5️⃣  Hub Chain: User deposits to PropertyVault');
    console.log('   6️⃣  Hub Chain: User receives', ethers.formatUnits(shares, 18), 'vault shares');

    console.log('\n🎯 Architecture Validated:');
    console.log('   ✅ USDCOFTAdapter wraps spoke chain USDC');
    console.log('   ✅ LayerZero bridges tokens to hub OFTUSDC');
    console.log('   ✅ Hub vault accepts bridged OFTUSDC');
    console.log('   ✅ Spoke users can invest in hub properties seamlessly');
    console.log('   ✅ Decimal conversion handled (6 dec USDC → 18 dec OFTUSDC)');

    console.log('\n💡 Unified Architecture:');
    console.log('   Hub Users: USDC → USDCOFTAdapter.send(HUB_EID) → OFTUSDC (same chain)');
    console.log('   Spoke Users: USDC → USDCOFTAdapter.send(HUB_EID) → OFTUSDC (cross-chain)');
    console.log('   ✅ Same contract, same flow, perfect consistency!');

    console.log('\n✅ CROSS-CHAIN WORKFLOW TEST PASSED! 🎉');
    console.log('='.repeat(80));
  });

  it('🔄 Test Complete Round-Trip: USDC → Adapter → OFTUSDC → Vault → Redeem → Adapter → USDC', async function () {
    console.log('\n' + '='.repeat(80));
    console.log('🔄 COMPLETE ROUND-TRIP TEST (Hub User)');
    console.log('🎯 USDC → Adapter → OFTUSDC → Vault → Redeem → OFTUSDC → Adapter → USDC');
    console.log('='.repeat(80));

    // ============================================================================
    // PHASE 1: SETUP PROPERTY
    // ============================================================================
    console.log('\n📍 PHASE 1: SETUP PROPERTY');
    console.log('-'.repeat(80));

    const createTx = await propertyRegistry.connect(platformOwner).createProperty(
      'Round-Trip Test Property',
      DEPOSIT_CAP,
      await oftUSDC.getAddress()
    );
    const receipt = await createTx.wait();
    
    const propertyCreatedEvent = receipt?.logs.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (log: any) => log.fragment?.name === 'PropertyCreated'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vaultAddress = (propertyCreatedEvent as any)?.args?.vault;
    
    const testVault = await ethers.getContractAt('PropertyVaultGovernance', vaultAddress);
    console.log('✅ Property Vault created:', vaultAddress);

    // ============================================================================
    // PHASE 2: FORWARD FLOW (USDC → OFTUSDC → Vault Shares)
    // ============================================================================
    console.log('\n📍 PHASE 2: FORWARD FLOW (USDC → OFTUSDC → Vault Shares)');
    console.log('-'.repeat(80));

    const usdcAmount = ethers.parseUnits('10000', USDC_DECIMALS);
    
    console.log('1️⃣ User starts with MockUSDC...');
    const usdcBalanceBefore = await mockUSDC.balanceOf(investor1.address);
    await mockUSDC.connect(platformOwner).mint(investor1.address, usdcAmount);
    const initialUSDCBalance = await mockUSDC.balanceOf(investor1.address);
    console.log('   ✅ User USDC balance:', ethers.formatUnits(initialUSDCBalance, USDC_DECIMALS), 'USDC');
    console.log('   📝 Test amount:', ethers.formatUnits(usdcAmount, USDC_DECIMALS), 'USDC');

    console.log('\n2️⃣ Convert USDC → OFTUSDC via Adapter...');
    const options = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString();
    await mockUSDC.connect(investor1).approve(await usdcOFTAdapter.getAddress(), usdcAmount);
    const wrapSendParam = {
      dstEid: EID,
      to: ethers.zeroPadValue(investor1.address, 32),
      amountLD: usdcAmount,
      minAmountLD: usdcAmount,
      extraOptions: options,
      composeMsg: '0x',
      oftCmd: '0x'
    };
    const wrapFeeQuote = await usdcOFTAdapter.quoteSend(wrapSendParam, false);
    const wrapFee = { nativeFee: wrapFeeQuote.nativeFee, lzTokenFee: wrapFeeQuote.lzTokenFee };
    await usdcOFTAdapter.connect(investor1).send(wrapSendParam, wrapFee, investor1.address, { value: wrapFee.nativeFee });
    
    const oftAmount = usdcAmount * BigInt(10 ** 12);
    const oftBalance = await oftUSDC.balanceOf(investor1.address);
    console.log('   ✅ User OFTUSDC balance:', ethers.formatUnits(oftBalance, 18), 'OFTUSDC');
    expect(oftBalance).to.equal(oftAmount);

    const usdcAfterSwap = await mockUSDC.balanceOf(investor1.address);
    console.log('   ✅ User USDC balance after swap:', ethers.formatUnits(usdcAfterSwap, USDC_DECIMALS), 'USDC');
    expect(usdcAfterSwap).to.equal(usdcBalanceBefore); // Should be same as before we minted test amount

    console.log('\n3️⃣ Deposit OFTUSDC to vault...');
    await oftUSDC.connect(investor1).approve(vaultAddress, oftAmount);
    await testVault.connect(investor1).deposit(oftAmount, investor1.address);
    
    const shares = await testVault.balanceOf(investor1.address);
    console.log('   ✅ User vault shares:', ethers.formatUnits(shares, 18));
    expect(shares).to.be.greaterThan(0);

    // Check balances after deposit
    const usdcAfterDeposit = await mockUSDC.balanceOf(investor1.address);
    const oftAfterDeposit = await oftUSDC.balanceOf(investor1.address);
    console.log('\n📊 Balances after deposit:');
    console.log('   - USDC:', ethers.formatUnits(usdcAfterDeposit, USDC_DECIMALS));
    console.log('   - OFTUSDC:', ethers.formatUnits(oftAfterDeposit, 18));
    console.log('   - Vault Shares:', ethers.formatUnits(shares, 18));
    expect(usdcAfterDeposit).to.equal(usdcBalanceBefore); // Back to original balance
    expect(oftAfterDeposit).to.equal(0);

    // ============================================================================
    // PHASE 3: REVERSE FLOW (Redeem Shares → OFTUSDC → USDC)
    // ============================================================================
    console.log('\n📍 PHASE 3: REVERSE FLOW (Redeem Shares → OFTUSDC → USDC)');
    console.log('-'.repeat(80));

    console.log('4️⃣ Redeem vault shares → get OFTUSDC back...');
    const sharesToRedeem = shares; // Redeem all shares
    await testVault.connect(investor1).redeem(sharesToRedeem, investor1.address, investor1.address);
    
    const oftAfterRedeem = await oftUSDC.balanceOf(investor1.address);
    const sharesAfterRedeem = await testVault.balanceOf(investor1.address);
    console.log('   ✅ User OFTUSDC balance:', ethers.formatUnits(oftAfterRedeem, 18), 'OFTUSDC');
    console.log('   ✅ User vault shares:', ethers.formatUnits(sharesAfterRedeem, 18));
    expect(oftAfterRedeem).to.equal(oftAmount); // Should get back original OFTUSDC amount
    expect(sharesAfterRedeem).to.equal(0); // All shares burned

    console.log('\n5️⃣ Convert OFTUSDC → USDC via Adapter (reverse swap)...');
    
    // Send OFTUSDC back to adapter (same chain) to unwrap
    const unwrapSendParam = {
      dstEid: EID,
      to: ethers.zeroPadValue(investor1.address, 32),
      amountLD: oftAmount,
      minAmountLD: oftAmount,
      extraOptions: options,
      composeMsg: '0x',
      oftCmd: '0x'
    };
    const unwrapFeeQuote = await oftUSDC.quoteSend(unwrapSendParam, false);
    const unwrapFee = { nativeFee: unwrapFeeQuote.nativeFee, lzTokenFee: unwrapFeeQuote.lzTokenFee };
    
    await oftUSDC.connect(investor1).send(unwrapSendParam, unwrapFee, investor1.address, { value: unwrapFee.nativeFee });
    
    const finalUSDCBalance = await mockUSDC.balanceOf(investor1.address);
    const finalOFTBalance = await oftUSDC.balanceOf(investor1.address);
    console.log('   ✅ User USDC balance:', ethers.formatUnits(finalUSDCBalance, USDC_DECIMALS), 'USDC');
    console.log('   ✅ User OFTUSDC balance:', ethers.formatUnits(finalOFTBalance, 18), 'OFTUSDC');
    
    expect(finalUSDCBalance).to.equal(initialUSDCBalance); // Should get back to starting balance
    expect(finalOFTBalance).to.equal(0); // All OFTUSDC burned/transferred

    // ============================================================================
    // PHASE 4: SUMMARY
    // ============================================================================
    console.log('\n' + '='.repeat(80));
    console.log('📊 ROUND-TRIP SUMMARY');
    console.log('='.repeat(80));

    console.log('\n🔄 Complete Cycle:');
    console.log('   Start: ', ethers.formatUnits(initialUSDCBalance, USDC_DECIMALS), 'USDC');
    console.log('     ↓ Adapter.send(EID) - locks USDC, OFTUSDC mints');
    console.log('   Mid 1:', ethers.formatUnits(oftAmount, 18), 'OFTUSDC');
    console.log('     ↓ Vault.deposit()');
    console.log('   Mid 2:', ethers.formatUnits(shares, 18), 'Vault Shares');
    console.log('     ↓ Vault.redeem()');
    console.log('   Mid 3:', ethers.formatUnits(oftAmount, 18), 'OFTUSDC');
    console.log('     ↓ OFTUSDC.send(EID) - burns OFTUSDC, unlocks USDC');
    console.log('   End:  ', ethers.formatUnits(finalUSDCBalance, USDC_DECIMALS), 'USDC');

    console.log('\n✅ Validation:');
    console.log('   Starting USDC:', ethers.formatUnits(initialUSDCBalance, USDC_DECIMALS));
    console.log('   Ending USDC:  ', ethers.formatUnits(finalUSDCBalance, USDC_DECIMALS));
    console.log('   Match:', initialUSDCBalance.toString() === finalUSDCBalance.toString() ? '✅ YES' : '❌ NO');
    console.log('   Net Change:', ethers.formatUnits(finalUSDCBalance - initialUSDCBalance, USDC_DECIMALS), 'USDC');

    console.log('\n🎯 Tested Flows:');
    console.log('   ✅ USDCOFTAdapter.send(EID) - USDC → OFTUSDC (same chain)');
    console.log('   ✅ PropertyVault.deposit() - OFTUSDC → Shares');
    console.log('   ✅ PropertyVault.redeem() - Shares → OFTUSDC');
    console.log('   ✅ OFTUSDC.send(EID) - OFTUSDC → USDC (same chain unwrap)');
    console.log('   ✅ Unified adapter architecture works for hub users');

    console.log('\n✅ COMPLETE ROUND-TRIP TEST PASSED! 🎉');
    console.log('='.repeat(80));
  });

  it('🌍 Test Cross-Chain Round-Trip: Spoke USDC → Hub Vault → Redeem → Spoke USDC', async function () {
    console.log('\n' + '='.repeat(80));
    console.log('🌍 CROSS-CHAIN ROUND-TRIP TEST (Spoke User)');
    console.log('🎯 Spoke USDC → Bridge → Hub OFTUSDC → Vault → Redeem → Bridge → Spoke USDC');
    console.log('='.repeat(80));

    // ============================================================================
    // PHASE 1: SETUP TWO CHAINS
    // ============================================================================
    console.log('\n📍 PHASE 1: SETUP TWO CHAINS');
    console.log('-'.repeat(80));

    const HUB_EID = 1;
    const SPOKE_EID = 2;

    // Deploy endpoints
    const MockLayerZeroEndpointV2 = await ethers.getContractFactory('EndpointV2Mock');
    const hubEndpoint = await MockLayerZeroEndpointV2.deploy(HUB_EID);
    await hubEndpoint.waitForDeployment();
    
    const spokeEndpoint = await MockLayerZeroEndpointV2.deploy(SPOKE_EID);
    await spokeEndpoint.waitForDeployment();
    console.log('✅ Hub & Spoke endpoints deployed');

    // Deploy MockUSDC on spoke
    const MockUSDC = await ethers.getContractFactory('MockUSDC');
    const spokeUSDC = await MockUSDC.deploy('USDC (Spoke)', 'USDC', USDC_DECIMALS, platformOwner.address);
    await spokeUSDC.waitForDeployment();
    console.log('✅ Spoke USDC deployed');

    // Deploy OFTUSDC on hub
    const OFTUSDC = await ethers.getContractFactory('OFTUSDC');
    const hubOFTUSDC = await OFTUSDC.deploy('OFTUSDC (Hub)', 'OFTUSDC', await hubEndpoint.getAddress(), platformOwner.address);
    await hubOFTUSDC.waitForDeployment();
    console.log('✅ Hub OFTUSDC deployed');

    // Deploy USDCOFTAdapter on spoke
    const USDCOFTAdapter = await ethers.getContractFactory('USDCOFTAdapter');
    const spokeAdapter = await USDCOFTAdapter.deploy(
      await spokeUSDC.getAddress(),
      await spokeEndpoint.getAddress(),
      platformOwner.address
    );
    await spokeAdapter.waitForDeployment();
    console.log('✅ Spoke Adapter deployed');

    // Configure peers and endpoints
    await spokeAdapter.connect(platformOwner).setPeer(HUB_EID, ethers.zeroPadValue(await hubOFTUSDC.getAddress(), 32));
    await hubOFTUSDC.connect(platformOwner).setPeer(SPOKE_EID, ethers.zeroPadValue(await spokeAdapter.getAddress(), 32));
    await spokeEndpoint.setDestLzEndpoint(await hubOFTUSDC.getAddress(), await hubEndpoint.getAddress());
    await hubEndpoint.setDestLzEndpoint(await spokeAdapter.getAddress(), await spokeEndpoint.getAddress());
    console.log('✅ LayerZero peers configured');

    // Create property vault on hub
    const createTx = await propertyRegistry.connect(platformOwner).createProperty(
      'Cross-Chain Round-Trip Property',
      DEPOSIT_CAP,
      await hubOFTUSDC.getAddress()
    );
    const receipt = await createTx.wait();
    const propertyCreatedEvent = receipt?.logs.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (log: any) => log.fragment?.name === 'PropertyCreated'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vaultAddress = (propertyCreatedEvent as any)?.args?.vault;
    const testVault = await ethers.getContractAt('PropertyVaultGovernance', vaultAddress);
    console.log('✅ Property Vault created on hub:', vaultAddress);

    // ============================================================================
    // PHASE 2: FORWARD FLOW (Spoke USDC → Hub Vault Shares)
    // ============================================================================
    console.log('\n📍 PHASE 2: FORWARD FLOW (Spoke USDC → Hub Vault Shares)');
    console.log('-'.repeat(80));

    const spokeUSDCAmount = ethers.parseUnits('20000', USDC_DECIMALS);
    
    console.log('1️⃣ User starts with USDC on spoke chain...');
    await spokeUSDC.connect(platformOwner).mint(investor1.address, spokeUSDCAmount);
    const initialSpokeUSDC = await spokeUSDC.balanceOf(investor1.address);
    console.log('   ✅ Spoke USDC balance:', ethers.formatUnits(initialSpokeUSDC, USDC_DECIMALS), 'USDC');

    console.log('\n2️⃣ Bridge USDC from spoke to hub...');
    const options = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString();
    
    await spokeUSDC.connect(investor1).approve(await spokeAdapter.getAddress(), spokeUSDCAmount);
    
    const sendParam = {
      dstEid: HUB_EID,
      to: ethers.zeroPadValue(investor1.address, 32),
      amountLD: spokeUSDCAmount,
      minAmountLD: spokeUSDCAmount,
      extraOptions: options,
      composeMsg: '0x',
      oftCmd: '0x'
    };
    
    const feeQuoteResult = await spokeAdapter.quoteSend(sendParam, false);
    const feeQuote = { nativeFee: feeQuoteResult.nativeFee, lzTokenFee: feeQuoteResult.lzTokenFee };
    
    await spokeAdapter.connect(investor1).send(sendParam, feeQuote, investor1.address, { value: feeQuote.nativeFee });
    
    const hubOFTBalance = await hubOFTUSDC.balanceOf(investor1.address);
    const expectedOFT = spokeUSDCAmount * BigInt(10 ** 12);
    console.log('   ✅ Hub OFTUSDC balance:', ethers.formatUnits(hubOFTBalance, 18), 'OFTUSDC');
    expect(hubOFTBalance).to.equal(expectedOFT);

    console.log('\n3️⃣ Deposit OFTUSDC to vault on hub...');
    await hubOFTUSDC.connect(investor1).approve(vaultAddress, hubOFTBalance);
    await testVault.connect(investor1).deposit(hubOFTBalance, investor1.address);
    
    const shares = await testVault.balanceOf(investor1.address);
    console.log('   ✅ Vault shares on hub:', ethers.formatUnits(shares, 18));

    // ============================================================================
    // PHASE 3: REVERSE FLOW (Redeem on Hub → Bridge OFTUSDC back to Spoke → USDC)
    // ============================================================================
    console.log('\n📍 PHASE 3: REVERSE FLOW (Redeem on Hub → Bridge to Spoke → USDC)');
    console.log('-'.repeat(80));

    console.log('4️⃣ Redeem shares on hub → get OFTUSDC...');
    await testVault.connect(investor1).redeem(shares, investor1.address, investor1.address);
    
    const oftAfterRedeem = await hubOFTUSDC.balanceOf(investor1.address);
    console.log('   ✅ Hub OFTUSDC balance:', ethers.formatUnits(oftAfterRedeem, 18), 'OFTUSDC');
    expect(oftAfterRedeem).to.equal(expectedOFT);

    console.log('\n5️⃣ Bridge OFTUSDC from hub back to spoke...');
    const returnSendParam = {
      dstEid: SPOKE_EID, // Back to spoke chain
      to: ethers.zeroPadValue(investor1.address, 32),
      amountLD: oftAfterRedeem, // OFTUSDC amount (18 decimals)
      minAmountLD: oftAfterRedeem,
      extraOptions: options,
      composeMsg: '0x',
      oftCmd: '0x'
    };
    
    const returnFeeQuoteResult = await hubOFTUSDC.quoteSend(returnSendParam, false);
    const returnFeeQuote = { nativeFee: returnFeeQuoteResult.nativeFee, lzTokenFee: returnFeeQuoteResult.lzTokenFee };
    
    await hubOFTUSDC.connect(investor1).send(
      returnSendParam,
      returnFeeQuote,
      investor1.address,
      { value: returnFeeQuote.nativeFee }
    );
    
    // IMPORTANT: USDCOFTAdapter is a LOCKBOX
    // When OFTUSDC is bridged back to spoke:
    //   - Hub OFTUSDC is BURNED
    //   - Spoke USDC is UNLOCKED from adapter
    //   - User receives actual USDC (not OFT tokens)
    
    const finalSpokeUSDC = await spokeUSDC.balanceOf(investor1.address);
    console.log('   ✅ Spoke USDC balance:', ethers.formatUnits(finalSpokeUSDC, USDC_DECIMALS), 'USDC');
    
    // User should have original USDC back
    expect(finalSpokeUSDC).to.equal(initialSpokeUSDC);
    
    console.log('\n6️⃣ User received actual USDC back on spoke! ✅');
    console.log('   📝 Lockbox model: Hub OFTUSDC burned → Spoke USDC unlocked');
    console.log('   📝 User has native USDC on spoke chain (not OFT wrapper)');

    // ============================================================================
    // PHASE 4: SUMMARY
    // ============================================================================
    console.log('\n' + '='.repeat(80));
    console.log('📊 CROSS-CHAIN ROUND-TRIP SUMMARY');
    console.log('='.repeat(80));

    console.log('\n🌍 Complete Cross-Chain Cycle:');
    console.log('   Start:  ', ethers.formatUnits(initialSpokeUSDC, USDC_DECIMALS), 'USDC on Spoke');
    console.log('     ↓ USDCOFTAdapter.send() (locks USDC, mints OFTUSDC on hub)');
    console.log('   Mid 1: ', ethers.formatUnits(expectedOFT, 18), 'OFTUSDC on Hub');
    console.log('     ↓ PropertyVault.deposit()');
    console.log('   Mid 2: ', ethers.formatUnits(shares, 18), 'Vault Shares on Hub');
    console.log('     ↓ PropertyVault.redeem()');
    console.log('   Mid 3: ', ethers.formatUnits(expectedOFT, 18), 'OFTUSDC on Hub');
    console.log('     ↓ OFTUSDC.send() (burns OFTUSDC, unlocks USDC on spoke)');
    console.log('   End:   ', ethers.formatUnits(finalSpokeUSDC, USDC_DECIMALS), 'USDC on Spoke ✅');

    console.log('\n🎯 Architecture Validated:');
    console.log('   ✅ Spoke → Hub: USDCOFTAdapter bridges USDC to OFTUSDC (lockbox)');
    console.log('   ✅ Hub: Deposit OFTUSDC → Vault Shares');
    console.log('   ✅ Hub: Redeem Shares → OFTUSDC');
    console.log('   ✅ Hub → Spoke: OFTUSDC bridges back, unlocks original USDC');
    console.log('   ✅ User gets ACTUAL USDC back on origin spoke chain (not OFT wrapper)');

    console.log('\n💡 Key Points:');
    console.log('   • User invested 20,000 USDC from Arbitrum (spoke)');
    console.log('   • Vault on Sepolia (hub)');
    console.log('   • User redeems and gets 20,000 USDC back on Arbitrum (spoke)');
    console.log('   • Complete round-trip on origin chain!');
    console.log('   • Lockbox model: Burns OFTUSDC on hub → Unlocks USDC on spoke');
    console.log('   ✅ User receives native USDC, not wrapped tokens');

    console.log('\n✅ CROSS-CHAIN ROUND-TRIP TEST PASSED! 🎉');
    console.log('='.repeat(80));
  });

  it('🔄 Test Hub User with USDCOFTAdapter (Unified Architecture)', async function () {
    console.log('\n' + '='.repeat(80));
    console.log('🔄 HUB USER WITH USDCOFTADAPTER TEST');
    console.log('🎯 Testing same-chain USDC wrapping via adapter (no cross-chain)');
    console.log('='.repeat(80));

    // ============================================================================
    // PHASE 1: SETUP ADAPTER ON HUB (SINGLE CHAIN)
    // ============================================================================
    console.log('\n📍 PHASE 1: SETUP ADAPTER ON HUB (SINGLE CHAIN)');
    console.log('-'.repeat(80));

    const HUB_EID = 1; // Only one chain for this test

    // Deploy ONE endpoint (hub only)
    const MockLayerZeroEndpointV2 = await ethers.getContractFactory('EndpointV2Mock');
    const hubEndpoint = await MockLayerZeroEndpointV2.deploy(HUB_EID);
    await hubEndpoint.waitForDeployment();
    console.log('✅ Hub Endpoint (EID 1) deployed:', await hubEndpoint.getAddress());
    console.log('   📝 Single endpoint - same-chain test only');

    // Deploy MockUSDC on HUB
    const MockUSDC = await ethers.getContractFactory('MockUSDC');
    const hubUSDC = await MockUSDC.deploy('USDC (Hub)', 'USDC', USDC_DECIMALS, platformOwner.address);
    await hubUSDC.waitForDeployment();
    console.log('✅ Hub USDC deployed');

    // Deploy OFTUSDC on HUB (the OFT token)
    const OFTUSDC = await ethers.getContractFactory('OFTUSDC');
    const hubOFTUSDC = await OFTUSDC.deploy(
      'OFTUSDC',
      'OFTUSDC',
      await hubEndpoint.getAddress(),
      platformOwner.address
    );
    await hubOFTUSDC.waitForDeployment();
    console.log('✅ Hub OFTUSDC deployed:', await hubOFTUSDC.getAddress());

    // Deploy USDCOFTAdapter on HUB
    const USDCOFTAdapter = await ethers.getContractFactory('USDCOFTAdapter');
    const hubAdapterContract = await USDCOFTAdapter.deploy(
      await hubUSDC.getAddress(),
      await hubEndpoint.getAddress(),
      platformOwner.address
    );
    await hubAdapterContract.waitForDeployment();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hubAdapter: any = hubAdapterContract;
    console.log('✅ Hub Adapter deployed:', await hubAdapter.getAddress());

    // Set peer: Adapter → OFTUSDC (for same-chain operations)
    await hubAdapter.connect(platformOwner).setPeer(HUB_EID, ethers.zeroPadValue(await hubOFTUSDC.getAddress(), 32));
    await hubOFTUSDC.connect(platformOwner).setPeer(HUB_EID, ethers.zeroPadValue(await hubAdapter.getAddress(), 32));
    console.log('✅ Peer configured: Hub Adapter ↔ Hub OFTUSDC (same chain)');
    
    // Configure endpoint routing
    await hubEndpoint.setDestLzEndpoint(await hubOFTUSDC.getAddress(), await hubEndpoint.getAddress());
    await hubEndpoint.setDestLzEndpoint(await hubAdapter.getAddress(), await hubEndpoint.getAddress());
    console.log('✅ Endpoint routing configured');

    // Create property vault (accepts OFTUSDC, not adapter)
    const createTx = await propertyRegistry.connect(platformOwner).createProperty(
      'Unified Adapter Test Property',
      DEPOSIT_CAP,
      await hubOFTUSDC.getAddress() // Vault accepts OFTUSDC
    );
    const receipt = await createTx.wait();
    const propertyCreatedEvent = receipt?.logs.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (log: any) => log.fragment?.name === 'PropertyCreated'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vaultAddress = (propertyCreatedEvent as any)?.args?.vault;
    const testVault = await ethers.getContractAt('PropertyVaultGovernance', vaultAddress);
    console.log('✅ Property Vault created:', vaultAddress);

    // ============================================================================
    // PHASE 2: HUB USER - SAME CHAIN OPERATIONS
    // ============================================================================
    console.log('\n📍 PHASE 2: HUB USER - SAME CHAIN OPERATIONS');
    console.log('-'.repeat(80));

    const hubUSDCAmount = ethers.parseUnits('10000', USDC_DECIMALS);
    
    console.log('1️⃣ Hub user has USDC on hub...');
    await hubUSDC.connect(platformOwner).mint(investor1.address, hubUSDCAmount);
    console.log('   ✅ Hub USDC balance:', ethers.formatUnits(hubUSDCAmount, USDC_DECIMALS));

    console.log('\n2️⃣ Hub user converts USDC via adapter.send(HUB_EID)...');
    await hubUSDC.connect(investor1).approve(await hubAdapter.getAddress(), hubUSDCAmount);
    console.log('   ✅ Approved adapter to spend USDC');
    
    // Check peer configuration
    const peerBytes = await hubAdapter.peers(HUB_EID);
    console.log('   📝 Hub adapter peer for EID 1:', peerBytes);
    console.log('   📝 Expected:', ethers.zeroPadValue(await hubAdapter.getAddress(), 32));
    
    const options = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString();
    const hubSendParam = {
      dstEid: HUB_EID, // Same chain!
      to: ethers.zeroPadValue(investor1.address, 32),
      amountLD: hubUSDCAmount,
      minAmountLD: hubUSDCAmount,
      extraOptions: options,
      composeMsg: '0x',
      oftCmd: '0x'
    };
    
    console.log('   📝 Calling quoteSend...');
    try {
      const hubFeeQuote = await hubAdapter.quoteSend(hubSendParam, false);
      const hubFee = { nativeFee: hubFeeQuote.nativeFee, lzTokenFee: hubFeeQuote.lzTokenFee };
      console.log('   ✅ Fee quoted:', ethers.formatEther(hubFee.nativeFee), 'ETH');
      
      console.log('   📝 Calling send...');
      await hubAdapter.connect(investor1).send(hubSendParam, hubFee, investor1.address, { value: hubFee.nativeFee });
      console.log('   ✅ Send completed');
    } catch (error: any) {
      console.log('   ❌ Error:', error.message);
      throw error;
    }
    
    // Check OFTUSDC balance (adapter sent message to OFTUSDC which minted)
    const oftBalance = await hubOFTUSDC.balanceOf(investor1.address);
    const expectedOFT = hubUSDCAmount * BigInt(10 ** 12);
    console.log('   ✅ User OFTUSDC balance:', ethers.formatUnits(oftBalance, 18));
    expect(oftBalance).to.equal(expectedOFT);

    console.log('\n3️⃣ Deposit OFTUSDC to vault...');
    await hubOFTUSDC.connect(investor1).approve(vaultAddress, oftBalance);
    await testVault.connect(investor1).deposit(oftBalance, investor1.address);
    
    const shares = await testVault.balanceOf(investor1.address);
    console.log('   ✅ Vault shares:', ethers.formatUnits(shares, 18));

    console.log('\n4️⃣ Redeem from vault...');
    await testVault.connect(investor1).redeem(shares, investor1.address, investor1.address);
    
    const oftAfterRedeem = await hubOFTUSDC.balanceOf(investor1.address);
    console.log('   ✅ OFTUSDC balance after redeem:', ethers.formatUnits(oftAfterRedeem, 18));
    expect(oftAfterRedeem).to.equal(expectedOFT);

    console.log('\n5️⃣ Unwrap OFTUSDC back to USDC (via adapter send to same chain)...');
    
    // User sends OFTUSDC to adapter on same chain to unwrap
    const unwrapParam = {
      dstEid: HUB_EID, // Same chain - unwrap back to USDC
      to: ethers.zeroPadValue(investor1.address, 32),
      amountLD: oftAfterRedeem,
      minAmountLD: oftAfterRedeem,
      extraOptions: options,
      composeMsg: '0x',
      oftCmd: '0x'
    };
    
    const unwrapFeeQuote = await hubOFTUSDC.quoteSend(unwrapParam, false);
    const unwrapFee = { nativeFee: unwrapFeeQuote.nativeFee, lzTokenFee: unwrapFeeQuote.lzTokenFee };
    
    await hubOFTUSDC.connect(investor1).send(unwrapParam, unwrapFee, investor1.address, { value: unwrapFee.nativeFee });
    
    const finalHubUSDC = await hubUSDC.balanceOf(investor1.address);
    const finalOFT = await hubOFTUSDC.balanceOf(investor1.address);
    
    console.log('   ✅ Hub USDC balance:', ethers.formatUnits(finalHubUSDC, USDC_DECIMALS), 'USDC');
    console.log('   ✅ OFTUSDC balance:', ethers.formatUnits(finalOFT, 18));
    
    // User should get original USDC back
    expect(finalHubUSDC).to.equal(hubUSDCAmount);
    expect(finalOFT).to.equal(0);

    // ============================================================================
    // PHASE 3: SUMMARY
    // ============================================================================
    console.log('\n' + '='.repeat(80));
    console.log('📊 UNIFIED ADAPTER ARCHITECTURE SUMMARY');
    console.log('='.repeat(80));

    console.log('\n🎯 What We Tested:');
    console.log('   ✅ Hub: USDCOFTAdapter + OFTUSDC (instead of USDCGateway)');
    console.log('   ✅ Adapter.send(HUB_EID) locks USDC, OFTUSDC mints tokens');
    console.log('   ✅ User deposits OFTUSDC to vault');
    console.log('   ✅ User redeems shares → gets OFTUSDC back');
    console.log('   ✅ OFTUSDC.send(HUB_EID) burns OFT, adapter unlocks USDC');
    console.log('   ✅ Complete round-trip using unified adapter architecture');

    console.log('\n🔄 Complete Flow (Unified Adapter on Hub):');
    console.log('   Start:  10,000 USDC on Hub');
    console.log('     ↓ HubAdapter.send(HUB_EID) → locks USDC, message to OFTUSDC');
    console.log('   Mid 1:  10,000 OFTUSDC minted to user');
    console.log('     ↓ Vault.deposit()');
    console.log('   Mid 2:  10,000 Vault Shares');
    console.log('     ↓ Vault.redeem()');
    console.log('   Mid 3:  10,000 OFTUSDC back to user');
    console.log('     ↓ OFTUSDC.send(HUB_EID) → burns OFTUSDC, message to adapter');
    console.log('   End:    10,000 USDC unlocked from adapter ✅');

    console.log('\n💡 Unified Adapter Benefits:');
    console.log('   ✅ Same contract on ALL chains (hub + spoke)');
    console.log('   ✅ Users can redeem to ANY chain with adapter');
    console.log('   ✅ Perfect fungibility across chains');
    console.log('   ✅ Shared liquidity pool');
    console.log('   ✅ Simpler architecture (no gateway needed)');
    console.log('   ⚠️  Small LayerZero fee for same-chain wrap/unwrap');

    console.log('\n🎯 Trade-offs:');
    console.log('   Cost: ~0.003 ETH LayerZero fee for same-chain operations');
    console.log('   Benefit: Users can redeem to ANY chain, not just hub');
    console.log('   Result: Worth it for consistency and flexibility!');

    console.log('\n✅ UNIFIED ADAPTER ARCHITECTURE TEST PASSED! 🎉');
    console.log('='.repeat(80));
  });

  it('🌐 Test Flexible Unwrap: User Chooses Destination Chain for OFTUSDC → USDC', async function () {
    console.log('\n' + '='.repeat(80));
    console.log('🌐 FLEXIBLE UNWRAP DESTINATION TEST');
    console.log('🎯 User deposits on Spoke → Can unwrap to ANY chain with adapter');
    console.log('='.repeat(80));

    // ============================================================================
    // PHASE 1: SETUP THREE CHAINS (HUB + 2 SPOKES)
    // ============================================================================
    console.log('\n📍 PHASE 1: SETUP THREE CHAINS');
    console.log('-'.repeat(80));

    const HUB_EID = 1;
    const SPOKE_A_EID = 2;
    const SPOKE_B_EID = 3;

    // Deploy endpoints for all three chains
    console.log('🔗 Deploying mock endpoints for 3 chains...');
    const MockLayerZeroEndpointV2 = await ethers.getContractFactory('EndpointV2Mock');
    const hubEndpoint = await MockLayerZeroEndpointV2.deploy(HUB_EID);
    await hubEndpoint.waitForDeployment();
    
    const spokeAEndpoint = await MockLayerZeroEndpointV2.deploy(SPOKE_A_EID);
    await spokeAEndpoint.waitForDeployment();
    
    const spokeBEndpoint = await MockLayerZeroEndpointV2.deploy(SPOKE_B_EID);
    await spokeBEndpoint.waitForDeployment();
    
    console.log('✅ Hub Endpoint (EID 1):', await hubEndpoint.getAddress());
    console.log('✅ Spoke A Endpoint (EID 2):', await spokeAEndpoint.getAddress());
    console.log('✅ Spoke B Endpoint (EID 3):', await spokeBEndpoint.getAddress());

    // Deploy MockUSDC on all chains
    console.log('\n💵 Deploying MockUSDC on all chains...');
    const MockUSDC = await ethers.getContractFactory('MockUSDC');
    
    const hubUSDC = await MockUSDC.deploy('USDC (Hub)', 'USDC', USDC_DECIMALS, platformOwner.address);
    await hubUSDC.waitForDeployment();
    
    const spokeAUSDC = await MockUSDC.deploy('USDC (Spoke A)', 'USDC', USDC_DECIMALS, platformOwner.address);
    await spokeAUSDC.waitForDeployment();
    
    const spokeBUSDC = await MockUSDC.deploy('USDC (Spoke B)', 'USDC', USDC_DECIMALS, platformOwner.address);
    await spokeBUSDC.waitForDeployment();
    
    console.log('✅ Hub USDC deployed');
    console.log('✅ Spoke A USDC deployed');
    console.log('✅ Spoke B USDC deployed');

    // Deploy OFTUSDC on hub
    console.log('\n🏦 Deploying OFTUSDC on Hub...');
    const OFTUSDC = await ethers.getContractFactory('OFTUSDC');
    const hubOFTUSDC = await OFTUSDC.deploy('OFTUSDC', 'OFTUSDC', await hubEndpoint.getAddress(), platformOwner.address);
    await hubOFTUSDC.waitForDeployment();
    console.log('✅ Hub OFTUSDC deployed:', await hubOFTUSDC.getAddress());

    // Deploy USDCOFTAdapter on all chains
    console.log('\n🌉 Deploying USDCOFTAdapter on all chains...');
    const USDCOFTAdapter = await ethers.getContractFactory('USDCOFTAdapter');
    
    const hubAdapter = await USDCOFTAdapter.deploy(await hubUSDC.getAddress(), await hubEndpoint.getAddress(), platformOwner.address);
    await hubAdapter.waitForDeployment();
    
    const spokeAAdapter = await USDCOFTAdapter.deploy(await spokeAUSDC.getAddress(), await spokeAEndpoint.getAddress(), platformOwner.address);
    await spokeAAdapter.waitForDeployment();
    
    const spokeBAdapter = await USDCOFTAdapter.deploy(await spokeBUSDC.getAddress(), await spokeBEndpoint.getAddress(), platformOwner.address);
    await spokeBAdapter.waitForDeployment();
    
    console.log('✅ Hub Adapter deployed:', await hubAdapter.getAddress());
    console.log('✅ Spoke A Adapter deployed:', await spokeAAdapter.getAddress());
    console.log('✅ Spoke B Adapter deployed:', await spokeBAdapter.getAddress());

    // ============================================================================
    // PHASE 2: CONFIGURE LAYERZERO PEERS (ALL COMBINATIONS)
    // ============================================================================
    console.log('\n📍 PHASE 2: CONFIGURE LAYERZERO PEERS');
    console.log('-'.repeat(80));

    const hubOFTBytes32 = ethers.zeroPadValue(await hubOFTUSDC.getAddress(), 32);
    const hubAdapterBytes32 = ethers.zeroPadValue(await hubAdapter.getAddress(), 32);
    const spokeAAdapterBytes32 = ethers.zeroPadValue(await spokeAAdapter.getAddress(), 32);
    const spokeBAdapterBytes32 = ethers.zeroPadValue(await spokeBAdapter.getAddress(), 32);

    // Hub Adapter ↔ Hub OFTUSDC
    await hubAdapter.connect(platformOwner).setPeer(HUB_EID, hubOFTBytes32);
    await hubOFTUSDC.connect(platformOwner).setPeer(HUB_EID, hubAdapterBytes32);
    console.log('✅ Hub Adapter ↔ Hub OFTUSDC');

    // Spoke A Adapter ↔ Hub OFTUSDC
    await spokeAAdapter.connect(platformOwner).setPeer(HUB_EID, hubOFTBytes32);
    await hubOFTUSDC.connect(platformOwner).setPeer(SPOKE_A_EID, spokeAAdapterBytes32);
    console.log('✅ Spoke A Adapter ↔ Hub OFTUSDC');

    // Spoke B Adapter ↔ Hub OFTUSDC
    await spokeBAdapter.connect(platformOwner).setPeer(HUB_EID, hubOFTBytes32);
    await hubOFTUSDC.connect(platformOwner).setPeer(SPOKE_B_EID, spokeBAdapterBytes32);
    console.log('✅ Spoke B Adapter ↔ Hub OFTUSDC');

    // Configure endpoint routing
    await hubEndpoint.setDestLzEndpoint(await spokeAAdapter.getAddress(), await spokeAEndpoint.getAddress());
    await hubEndpoint.setDestLzEndpoint(await spokeBAdapter.getAddress(), await spokeBEndpoint.getAddress());
    await spokeAEndpoint.setDestLzEndpoint(await hubOFTUSDC.getAddress(), await hubEndpoint.getAddress());
    await spokeBEndpoint.setDestLzEndpoint(await hubOFTUSDC.getAddress(), await hubEndpoint.getAddress());
    await hubEndpoint.setDestLzEndpoint(await hubOFTUSDC.getAddress(), await hubEndpoint.getAddress());
    await hubEndpoint.setDestLzEndpoint(await hubAdapter.getAddress(), await hubEndpoint.getAddress());
    console.log('✅ All endpoint routing configured');

    // ============================================================================
    // PHASE 3: USER DEPOSITS ON SPOKE A
    // ============================================================================
    console.log('\n📍 PHASE 3: USER DEPOSITS ON SPOKE A');
    console.log('-'.repeat(80));

    const depositAmount = ethers.parseUnits('10000', USDC_DECIMALS);
    
    console.log('1️⃣ User has USDC on Spoke A...');
    await spokeAUSDC.connect(platformOwner).mint(investor1.address, depositAmount);
    const initialSpokeAUSDC = await spokeAUSDC.balanceOf(investor1.address);
    console.log('   ✅ Spoke A USDC:', ethers.formatUnits(initialSpokeAUSDC, USDC_DECIMALS));

    console.log('\n2️⃣ Bridge from Spoke A to Hub...');
    const options = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString();
    
    await spokeAUSDC.connect(investor1).approve(await spokeAAdapter.getAddress(), depositAmount);
    const sendParam = {
      dstEid: HUB_EID,
      to: ethers.zeroPadValue(investor1.address, 32),
      amountLD: depositAmount,
      minAmountLD: depositAmount,
      extraOptions: options,
      composeMsg: '0x',
      oftCmd: '0x'
    };
    
    const feeQuote = await spokeAAdapter.quoteSend(sendParam, false);
    const fee = { nativeFee: feeQuote.nativeFee, lzTokenFee: feeQuote.lzTokenFee };
    await spokeAAdapter.connect(investor1).send(sendParam, fee, investor1.address, { value: fee.nativeFee });
    
    const hubOFTBalance = await hubOFTUSDC.balanceOf(investor1.address);
    const expectedOFT = depositAmount * BigInt(10 ** 12);
    console.log('   ✅ Hub OFTUSDC received:', ethers.formatUnits(hubOFTBalance, 18));
    expect(hubOFTBalance).to.equal(expectedOFT);

    // ============================================================================
    // PHASE 4: TEST UNWRAP OPTION 1 - Back to Spoke A (Origin)
    // ============================================================================
    console.log('\n📍 PHASE 4: OPTION 1 - Unwrap to Spoke A (Origin Chain)');
    console.log('-'.repeat(80));

    // User sends part of OFTUSDC back to Spoke A (use exact USDC amount to avoid rounding)
    const unwrapToSpokeAUSDC = depositAmount / BigInt(3); // 1/3 in USDC decimals
    const unwrapToSpokeA = unwrapToSpokeAUSDC * BigInt(10 ** 12); // Scale to OFTUSDC
    
    console.log('📤 Sending', ethers.formatUnits(unwrapToSpokeA, 18), 'OFTUSDC to Spoke A...');
    const unwrapASendParam = {
      dstEid: SPOKE_A_EID, // Back to origin
      to: ethers.zeroPadValue(investor1.address, 32),
      amountLD: unwrapToSpokeA,
      minAmountLD: unwrapToSpokeA * BigInt(99) / BigInt(100), // 1% slippage tolerance
      extraOptions: options,
      composeMsg: '0x',
      oftCmd: '0x'
    };
    
    const unwrapAFee = await hubOFTUSDC.quoteSend(unwrapASendParam, false);
    await hubOFTUSDC.connect(investor1).send(
      unwrapASendParam,
      { nativeFee: unwrapAFee.nativeFee, lzTokenFee: unwrapAFee.lzTokenFee },
      investor1.address,
      { value: unwrapAFee.nativeFee }
    );
    
    const spokeABalance = await spokeAUSDC.balanceOf(investor1.address);
    const expectedSpokeAUSDC = unwrapToSpokeAUSDC; // Already in USDC decimals
    console.log('✅ Spoke A USDC received:', ethers.formatUnits(spokeABalance, USDC_DECIMALS));
    expect(spokeABalance).to.equal(expectedSpokeAUSDC);

    // ============================================================================
    // PHASE 5: SETUP LIQUIDITY ON SPOKE B (Required for unwrapping!)
    // ============================================================================
    console.log('\n📍 PHASE 5: SETUP LIQUIDITY ON SPOKE B');
    console.log('-'.repeat(80));
    console.log('💡 Lockbox Model: Each adapter needs USDC locked to unlock!');

    // Someone needs to deposit on Spoke B first to create liquidity
    const spokeBLiquidityUSDC = ethers.parseUnits('5000', USDC_DECIMALS);
    
    console.log('   Pre-funding Spoke B adapter with liquidity...');
    await spokeBUSDC.connect(platformOwner).mint(investor2.address, spokeBLiquidityUSDC);
    await spokeBUSDC.connect(investor2).approve(await spokeBAdapter.getAddress(), spokeBLiquidityUSDC);
    
    // Investor2 deposits on Spoke B (creates liquidity in Spoke B adapter)
    const spokeBLiqSendParam = {
      dstEid: HUB_EID,
      to: ethers.zeroPadValue(investor2.address, 32),
      amountLD: spokeBLiquidityUSDC,
      minAmountLD: spokeBLiquidityUSDC,
      extraOptions: options,
      composeMsg: '0x',
      oftCmd: '0x'
    };
    const spokeBLiqFee = await spokeBAdapter.quoteSend(spokeBLiqSendParam, false);
    await spokeBAdapter.connect(investor2).send(
      spokeBLiqSendParam,
      { nativeFee: spokeBLiqFee.nativeFee, lzTokenFee: spokeBLiqFee.lzTokenFee },
      investor2.address,
      { value: spokeBLiqFee.nativeFee }
    );
    
    console.log('   ✅ Spoke B adapter now has liquidity:', ethers.formatUnits(spokeBLiquidityUSDC, USDC_DECIMALS), 'USDC');

    // ============================================================================
    // PHASE 6: TEST UNWRAP OPTION 2 - To Spoke B (Different Chain!)
    // ============================================================================
    console.log('\n📍 PHASE 6: OPTION 2 - Unwrap to Spoke B (DIFFERENT Chain!)');
    console.log('-'.repeat(80));

    // Now user can unwrap to Spoke B because it has liquidity!
    const unwrapToSpokeBUSDC = depositAmount / BigInt(3); // 1/3 in USDC decimals
    const unwrapToSpokeB = unwrapToSpokeBUSDC * BigInt(10 ** 12); // Scale to OFTUSDC
    
    console.log('📤 Sending', ethers.formatUnits(unwrapToSpokeB, 18), 'OFTUSDC to Spoke B...');
    const unwrapBSendParam = {
      dstEid: SPOKE_B_EID, // Different chain!
      to: ethers.zeroPadValue(investor1.address, 32),
      amountLD: unwrapToSpokeB,
      minAmountLD: unwrapToSpokeB * BigInt(99) / BigInt(100), // 1% slippage tolerance
      extraOptions: options,
      composeMsg: '0x',
      oftCmd: '0x'
    };
    
    const unwrapBFee = await hubOFTUSDC.quoteSend(unwrapBSendParam, false);
    await hubOFTUSDC.connect(investor1).send(
      unwrapBSendParam,
      { nativeFee: unwrapBFee.nativeFee, lzTokenFee: unwrapBFee.lzTokenFee },
      investor1.address,
      { value: unwrapBFee.nativeFee }
    );
    
    const spokeBBalance = await spokeBUSDC.balanceOf(investor1.address);
    const expectedSpokeBUSDC = unwrapToSpokeBUSDC; // Already in USDC decimals
    console.log('✅ Spoke B USDC received:', ethers.formatUnits(spokeBBalance, USDC_DECIMALS));
    expect(spokeBBalance).to.equal(expectedSpokeBUSDC);

    // ============================================================================
    // PHASE 7: SETUP LIQUIDITY ON HUB (Required for unwrapping!)
    // ============================================================================
    console.log('\n📍 PHASE 7: SETUP LIQUIDITY ON HUB');
    console.log('-'.repeat(80));

    // Pre-fund Hub adapter with liquidity
    const hubLiquidityUSDC = ethers.parseUnits('5000', USDC_DECIMALS);
    
    console.log('   Pre-funding Hub adapter with liquidity...');
    await hubUSDC.connect(platformOwner).mint(investor3.address, hubLiquidityUSDC);
    await hubUSDC.connect(investor3).approve(await hubAdapter.getAddress(), hubLiquidityUSDC);
    
    const hubLiqSendParam = {
      dstEid: HUB_EID,
      to: ethers.zeroPadValue(investor3.address, 32),
      amountLD: hubLiquidityUSDC,
      minAmountLD: hubLiquidityUSDC,
      extraOptions: options,
      composeMsg: '0x',
      oftCmd: '0x'
    };
    const hubLiqFee = await hubAdapter.quoteSend(hubLiqSendParam, false);
    await hubAdapter.connect(investor3).send(
      hubLiqSendParam,
      { nativeFee: hubLiqFee.nativeFee, lzTokenFee: hubLiqFee.lzTokenFee },
      investor3.address,
      { value: hubLiqFee.nativeFee }
    );
    
    console.log('   ✅ Hub adapter now has liquidity:', ethers.formatUnits(hubLiquidityUSDC, USDC_DECIMALS), 'USDC');

    // ============================================================================
    // PHASE 8: TEST UNWRAP OPTION 3 - To Hub (Different from origin!)
    // ============================================================================
    console.log('\n📍 PHASE 8: OPTION 3 - Unwrap to Hub (OFTUSDC native chain)');
    console.log('-'.repeat(80));

    // User sends remaining OFTUSDC to Hub adapter
    const remainingOFT = await hubOFTUSDC.balanceOf(investor1.address);
    
    console.log('📤 Sending', ethers.formatUnits(remainingOFT, 18), 'OFTUSDC to Hub...');
    const unwrapHubSendParam = {
      dstEid: HUB_EID, // To hub itself
      to: ethers.zeroPadValue(investor1.address, 32),
      amountLD: remainingOFT,
      minAmountLD: remainingOFT * BigInt(99) / BigInt(100), // 1% slippage tolerance
      extraOptions: options,
      composeMsg: '0x',
      oftCmd: '0x'
    };
    
    const unwrapHubFee = await hubOFTUSDC.quoteSend(unwrapHubSendParam, false);
    await hubOFTUSDC.connect(investor1).send(
      unwrapHubSendParam,
      { nativeFee: unwrapHubFee.nativeFee, lzTokenFee: unwrapHubFee.lzTokenFee },
      investor1.address,
      { value: unwrapHubFee.nativeFee }
    );
    
    const hubBalance = await hubUSDC.balanceOf(investor1.address);
    console.log('✅ Hub USDC received:', ethers.formatUnits(hubBalance, USDC_DECIMALS));
    // Expect approximately the remaining USDC (within slippage tolerance)
    expect(hubBalance).to.be.greaterThan(0);

    // ============================================================================
    // PHASE 9: VERIFY BALANCES ACROSS ALL CHAINS
    // ============================================================================
    console.log('\n📍 PHASE 9: VERIFY BALANCES ACROSS ALL CHAINS');
    console.log('-'.repeat(80));

    const finalSpokeAUSDC = await spokeAUSDC.balanceOf(investor1.address);
    const finalSpokeBUSDC = await spokeBUSDC.balanceOf(investor1.address);
    const finalHubUSDC = await hubUSDC.balanceOf(investor1.address);
    const finalOFTUSDC = await hubOFTUSDC.balanceOf(investor1.address);

    console.log('📊 Final Balances Across All Chains:');
    console.log('   - Spoke A USDC:', ethers.formatUnits(finalSpokeAUSDC, USDC_DECIMALS));
    console.log('   - Spoke B USDC:', ethers.formatUnits(finalSpokeBUSDC, USDC_DECIMALS));
    console.log('   - Hub USDC:', ethers.formatUnits(finalHubUSDC, USDC_DECIMALS));
    console.log('   - Hub OFTUSDC:', ethers.formatUnits(finalOFTUSDC, 18), '(should be 0)');

    // Verify total approximately equals original deposit (within tolerance)
    const totalUSDCReceived = (finalSpokeAUSDC + finalSpokeBUSDC + finalHubUSDC) * BigInt(10 ** 12); // Scale to 18 for comparison
    console.log('\n✅ Total USDC across all chains:', ethers.formatUnits(totalUSDCReceived, 18));
    console.log('✅ Original deposit (OFTUSDC):', ethers.formatUnits(expectedOFT, 18));
    console.log('✅ Original deposit (USDC):', ethers.formatUnits(depositAmount, USDC_DECIMALS));
    console.log('✅ Total USDC received:', ethers.formatUnits(finalSpokeAUSDC + finalSpokeBUSDC + finalHubUSDC, USDC_DECIMALS));
    console.log('✅ Match:', (finalSpokeAUSDC + finalSpokeBUSDC + finalHubUSDC) === depositAmount ? '✅ EXACT' : '≈ Close (due to slippage)');
    
    // Verify total is close to original (within 1% tolerance)
    const tolerance = depositAmount / BigInt(100); // 1% tolerance
    expect(finalSpokeAUSDC + finalSpokeBUSDC + finalHubUSDC).to.be.greaterThan(depositAmount - tolerance);
    expect(finalSpokeAUSDC + finalSpokeBUSDC + finalHubUSDC).to.be.lessThanOrEqual(depositAmount);
    expect(finalOFTUSDC).to.equal(0);

    // ============================================================================
    // PHASE 10: SUMMARY
    // ============================================================================
    console.log('\n' + '='.repeat(80));
    console.log('📊 FLEXIBLE UNWRAP SUMMARY');
    console.log('='.repeat(80));

    console.log('\n🌐 What We Proved:');
    console.log('   ✅ User deposited on Spoke A (10,000 USDC)');
    console.log('   ✅ Got OFTUSDC on Hub (universal token)');
    console.log('   ✅ User chose to unwrap to 3 different chains:');
    console.log('      → 1/3 to Spoke A (origin chain) ✅');
    console.log('      → 1/3 to Spoke B (different spoke chain) ✅');
    console.log('      → 1/3 to Hub (OFTUSDC native chain) ✅');
    console.log('   ✅ All unwraps successful - total matches original deposit!');

    console.log('\n💡 Architecture Flexibility (WITH Lockbox Model):');
    console.log('   ✅ Users can unwrap to ANY chain with a USDCOFTAdapter');
    console.log('   ✅ NOT limited to origin chain or hub chain');
    console.log('   ⚠️  Each chain needs liquidity (someone must have deposited there)');
    console.log('   ✅ Perfect fungibility: OFTUSDC is universal across all chains');
    console.log('   ✅ Each adapter acts as a lockbox for its chain\'s USDC');
    console.log('   ✅ Lockbox = locked USDC on chain A unlocks when OFTUSDC sent there');

    console.log('\n🔒 Lockbox Model Benefits:');
    console.log('   ✅ No trust required - OFTUSDC fully backed by locked USDC');
    console.log('   ✅ No bridge risk - each chain manages its own USDC');
    console.log('   ✅ Organic liquidity - grows with usage on each chain');
    console.log('   ⚠️  Requires initial liquidity on destination chains');

    console.log('\n🎯 Real-World Use Cases:');
    console.log('   • User deposits on Arbitrum (Spoke A)');
    console.log('   • Invests in properties (gets OFTUSDC on hub)');
    console.log('   • Redeems investment (gets OFTUSDC back)');
    console.log('   • Can choose to withdraw USDC to:');
    console.log('     - Arbitrum (origin) ← if they still use that chain ✅');
    console.log('     - Optimism (Spoke B) ← if they moved to a new chain ✅');
    console.log('     - Sepolia (Hub) ← if they want it on the main chain ✅');
    console.log('   • Flexibility = User can receive USDC on ANY supported chain!');

    console.log('\n✅ FLEXIBLE UNWRAP DESTINATION TEST PASSED! 🎉');
    console.log('   💡 This is a KEY BENEFIT of the Unified Adapter Architecture!');
    console.log('='.repeat(80));
  });
});


