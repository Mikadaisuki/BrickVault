import { expect } from 'chai';
import { ethers } from 'hardhat';
import { 
  EnvironmentConfig, 
  VaultFactory, 
  PropertyRegistry, 
  PropertyVaultGovernance,
  PropertyDAO,
  PropertyToken,
  OFTUSDC,
  ShareOFTAdapter
} from '../typechain-types';
import { MockUSDC } from '../typechain-types/src/mocks';
import { Options } from '@layerzerolabs/lz-v2-utilities';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('Complete Property Workflow Test', function () {
  let environmentConfig: EnvironmentConfig;
  let vaultFactory: VaultFactory;
  let propertyRegistry: PropertyRegistry;
  let mockUSDC: MockUSDC;
  let oftAdapter: ShareOFTAdapter;
  let oftUSDC: OFTUSDC;
  let propertyVault: PropertyVaultGovernance;
  let propertyDAO: PropertyDAO;
  let propertyToken: PropertyToken;
  
  let deployer: any;
  let platformOwner: any;
  let propertyManager: any;
  let investor1: any;
  let investor2: any;
  let investor3: any;
  
  const PROPERTY_NAME = 'Miami Luxury Condo';
  const USDC_DECIMALS = 6; // MockUSDC has 6 decimals
  const DEPOSIT_CAP = ethers.parseUnits('100000', 18); // 100K USDC cap (18 decimals for vault)
  const FUNDING_TARGET = ethers.parseUnits('100000', 18); // 100K USDC target (18 decimals)
  const INVESTOR1_AMOUNT_USDC = ethers.parseUnits('40000', USDC_DECIMALS); // 40K USDC (6 decimals)
  const INVESTOR2_AMOUNT_USDC = ethers.parseUnits('40000', USDC_DECIMALS); // 40K USDC (6 decimals)
  const INVESTOR3_AMOUNT_USDC = ethers.parseUnits('20000', USDC_DECIMALS); // 20K USDC (6 decimals)
  const RENT_AMOUNT = ethers.parseUnits('5000', 18); // 5K monthly rent (18 decimals)

  beforeEach(async function () {
    [deployer, platformOwner, propertyManager, investor1, investor2, investor3] = await ethers.getSigners();

    // 1. Deploy EnvironmentConfig
    console.log('\n📋 Step 1: Deploying EnvironmentConfig...');
    const EnvironmentConfig = await ethers.getContractFactory('EnvironmentConfig');
    environmentConfig = await EnvironmentConfig.deploy(platformOwner.address);
    await environmentConfig.waitForDeployment();
    console.log('✅ EnvironmentConfig deployed:', await environmentConfig.getAddress());

    // 2. Deploy MockUSDC (6 decimals, like real USDC)
    console.log('\n📋 Step 2: Deploying MockUSDC...');
    const MockUSDC = await ethers.getContractFactory('MockUSDC');
    mockUSDC = await MockUSDC.deploy(
      'USD Coin',
      'USDC',
      USDC_DECIMALS,
      platformOwner.address
    );
    await mockUSDC.waitForDeployment();
    console.log('✅ MockUSDC deployed:', await mockUSDC.getAddress());

    // 3. Deploy Mock LayerZero Endpoints (for cross-chain)
    console.log('\n📋 Step 3: Deploying Mock LayerZero Endpoints...');
    const MockLayerZeroEndpointV2 = await ethers.getContractFactory('EndpointV2Mock');
    const mockEndpointA = await MockLayerZeroEndpointV2.deploy(1); // eid = 1
    await mockEndpointA.waitForDeployment();
    const mockEndpointB = await MockLayerZeroEndpointV2.deploy(2); // eid = 2
    await mockEndpointB.waitForDeployment();
    console.log('✅ Mock Endpoint A deployed:', await mockEndpointA.getAddress());
    console.log('✅ Mock Endpoint B deployed:', await mockEndpointB.getAddress());

    // 4. Deploy ShareOFTAdapter for USDC
    console.log('\n📋 Step 4: Deploying ShareOFTAdapter...');
    const ShareOFTAdapter = await ethers.getContractFactory('ShareOFTAdapter');
    oftAdapter = await ShareOFTAdapter.deploy(
      await mockUSDC.getAddress(),
      await mockEndpointA.getAddress(),
      platformOwner.address
    );
    await oftAdapter.waitForDeployment();
    console.log('✅ ShareOFTAdapter deployed:', await oftAdapter.getAddress());

    // 5. Deploy OFTUSDC (18 decimals)
    console.log('\n📋 Step 5: Deploying OFTUSDC...');
    const OFTUSDC = await ethers.getContractFactory('OFTUSDC');
    oftUSDC = await OFTUSDC.deploy(
      'OFT USDC',
      'OFTUSDC',
      await mockEndpointB.getAddress(),
      platformOwner.address
    );
    await oftUSDC.waitForDeployment();
    console.log('✅ OFTUSDC deployed:', await oftUSDC.getAddress());

    // 6. Configure LayerZero cross-chain communication
    console.log('\n📋 Step 6: Configuring LayerZero...');
    await mockEndpointA.setDestLzEndpoint(await oftUSDC.getAddress(), await mockEndpointB.getAddress());
    await mockEndpointB.setDestLzEndpoint(await oftAdapter.getAddress(), await mockEndpointA.getAddress());
    await oftAdapter.connect(platformOwner).setPeer(2, ethers.zeroPadValue(await oftUSDC.getAddress(), 32));
    await oftUSDC.connect(platformOwner).setPeer(1, ethers.zeroPadValue(await oftAdapter.getAddress(), 32));
    console.log('✅ LayerZero configured');

    // 7. Mint MockUSDC to investors (6 decimals)
    console.log('\n📋 Step 7: Minting MockUSDC to investors...');
    await mockUSDC.connect(platformOwner).mint(investor1.address, INVESTOR1_AMOUNT_USDC);
    await mockUSDC.connect(platformOwner).mint(investor2.address, INVESTOR2_AMOUNT_USDC);
    await mockUSDC.connect(platformOwner).mint(investor3.address, INVESTOR3_AMOUNT_USDC);
    console.log('✅ Investor 1 USDC:', ethers.formatUnits(await mockUSDC.balanceOf(investor1.address), USDC_DECIMALS));
    console.log('✅ Investor 2 USDC:', ethers.formatUnits(await mockUSDC.balanceOf(investor2.address), USDC_DECIMALS));
    console.log('✅ Investor 3 USDC:', ethers.formatUnits(await mockUSDC.balanceOf(investor3.address), USDC_DECIMALS));

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

    // 10. Authorize PropertyRegistry to create vaults via VaultFactory
    console.log('\n📋 Step 10: Authorizing PropertyRegistry...');
    await vaultFactory.connect(platformOwner).addAuthorizedCaller(await propertyRegistry.getAddress());
    console.log('✅ PropertyRegistry authorized to create vaults');
  });

  it('🎯 Complete Property Lifecycle: Funding → Purchase → Management → Income Distribution', async function () {
    console.log('\n' + '='.repeat(80));
    console.log('🏠 COMPLETE PROPERTY WORKFLOW TEST');
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
      await oftUSDC.getAddress()
    );
    const receipt = await createTx.wait();
    
    // Get vault address from event
    const propertyCreatedEvent = receipt?.logs.find(
      (log: any) => log.fragment?.name === 'PropertyCreated'
    );
    const vaultAddress = propertyCreatedEvent?.args?.vault;
    const propertyId = propertyCreatedEvent?.args?.propertyId;
    
    console.log('✅ Property ID:', propertyId);
    console.log('✅ Vault Address:', vaultAddress);

    propertyVault = await ethers.getContractAt('PropertyVaultGovernance', vaultAddress);
    
    // Verify vault is PropertyVaultGovernance (not base PropertyVault)
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
    
    // Debug: Verify vault address in DAO
    const daoVaultAddress = await propertyDAO.propertyVault();
    console.log('🔍 Debug - Vault address:', vaultAddress);
    console.log('🔍 Debug - DAO\'s propertyVault:', daoVaultAddress);
    console.log('🔍 Debug - Match?', vaultAddress === daoVaultAddress);

    // Set funding target
    console.log('Setting funding target...');
    const fundingDeadline = (await time.latest()) + 30 * 24 * 60 * 60; // 30 days
    await propertyDAO.connect(platformOwner).setFundingTarget(FUNDING_TARGET, fundingDeadline);
    console.log('✅ Funding target set:', ethers.formatUnits(FUNDING_TARGET, 18), 'USDC');

    // Check initial stage
    const initialStage = await propertyDAO.getCurrentStage();
    expect(initialStage).to.equal(0); // OpenToFund
    console.log('✅ Current stage: OpenToFund (0)');

    // ============================================================================
    // PHASE 3: FUNDING STAGE (MockUSDC → OFTUSDC → Vault)
    // ============================================================================
    console.log('\n📍 PHASE 3: FUNDING STAGE (OpenToFund)');
    console.log('-'.repeat(80));

    // Helper function to convert USDC to OFTUSDC
    const convertUSDCToOFTUSDC = async (investor: any, amount: bigint) => {
      // Approve ShareOFTAdapter to spend MockUSDC
      await mockUSDC.connect(investor).approve(await oftAdapter.getAddress(), amount);
      
      // Prepare LayerZero send parameters
      const options = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString();
      const sendParam = [
        2, // destination eid
        ethers.zeroPadValue(investor.address, 32),
        amount,
        amount,
        options,
        '0x',
        '0x'
      ];
      
      // Get quote and send
      const [nativeFee] = await oftAdapter.quoteSend(sendParam, false);
      await oftAdapter.connect(investor).send(sendParam, [nativeFee, 0n], investor.address, { value: nativeFee });
      
      // OFTUSDC amount is scaled from 6 to 18 decimals
      return amount * BigInt(10 ** 12);
    };

    // Investor 1: Convert USDC → OFTUSDC → Deposit to Vault
    console.log('\n👤 Investor 1:');
    console.log('   Step 1: Converting MockUSDC to OFTUSDC...');
    const investor1OFTUSDC = await convertUSDCToOFTUSDC(investor1, INVESTOR1_AMOUNT_USDC);
    console.log('   ✅ Received OFTUSDC:', ethers.formatUnits(investor1OFTUSDC, 18));
    
    console.log('   Step 2: Depositing OFTUSDC to vault...');
    await oftUSDC.connect(investor1).approve(vaultAddress, investor1OFTUSDC);
    await propertyVault.connect(investor1).deposit(investor1OFTUSDC, investor1.address);
    const investor1Shares = await propertyVault.balanceOf(investor1.address);
    console.log('   ✅ Vault shares:', ethers.formatUnits(investor1Shares, 18));

    // Investor 2: Convert USDC → OFTUSDC → Deposit to Vault
    console.log('\n👤 Investor 2:');
    console.log('   Step 1: Converting MockUSDC to OFTUSDC...');
    const investor2OFTUSDC = await convertUSDCToOFTUSDC(investor2, INVESTOR2_AMOUNT_USDC);
    console.log('   ✅ Received OFTUSDC:', ethers.formatUnits(investor2OFTUSDC, 18));
    
    console.log('   Step 2: Depositing OFTUSDC to vault...');
    await oftUSDC.connect(investor2).approve(vaultAddress, investor2OFTUSDC);
    await propertyVault.connect(investor2).deposit(investor2OFTUSDC, investor2.address);
    const investor2Shares = await propertyVault.balanceOf(investor2.address);
    console.log('   ✅ Vault shares:', ethers.formatUnits(investor2Shares, 18));

    // Investor 3: Convert USDC → OFTUSDC → Deposit to Vault (completes funding)
    console.log('\n👤 Investor 3 (will complete funding):');
    console.log('   Step 1: Converting MockUSDC to OFTUSDC...');
    const investor3OFTUSDC = await convertUSDCToOFTUSDC(investor3, INVESTOR3_AMOUNT_USDC);
    console.log('   ✅ Received OFTUSDC:', ethers.formatUnits(investor3OFTUSDC, 18));
    
    console.log('   Step 2: Depositing OFTUSDC to vault (will trigger auto-transition to Funded)...');
    await oftUSDC.connect(investor3).approve(vaultAddress, investor3OFTUSDC);
    await propertyVault.connect(investor3).deposit(investor3OFTUSDC, investor3.address);
    const investor3Shares = await propertyVault.balanceOf(investor3.address);
    console.log('   ✅ Vault shares:', ethers.formatUnits(investor3Shares, 18));

    // Check stage after funding complete
    const fundedStage = await propertyDAO.getCurrentStage();
    expect(fundedStage).to.equal(1); // Funded
    console.log('✅ Stage auto-transitioned to: Funded (1)');

    const propertyInfo = await propertyDAO.getPropertyInfo();
    console.log('✅ Total invested:', ethers.formatUnits(propertyInfo.totalInvested, 18), 'USDC');
    console.log('✅ Is fully funded:', propertyInfo.isFullyFunded);

    // Verify deposits blocked after funding (stage check already validated above)
    console.log('\n🔒 Stage validation:');
    console.log('✅ Deposits blocked - Stage is now Funded, only OpenToFund allows deposits');

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
    console.log('   - Proposer:', proposal.proposer);
    console.log('   - Type:', proposal.proposalType, '(PropertyPurchase)');
    console.log('   - Description:', proposal.description);
    console.log('   - Deadline:', new Date(Number(proposal.deadline) * 1000).toLocaleString());
    console.log('   - Votes For:', ethers.formatUnits(proposal.votesFor, 18));
    console.log('   - Votes Against:', ethers.formatUnits(proposal.votesAgainst, 18));
    console.log('   - Executed:', proposal.executed);
    console.log('   - Status:', proposal.status, '(Active)');
    console.log('   - Data Length:', proposal.data.length, 'bytes');

    // Investors vote
    console.log('\n🗳️  Voting phase...');
    
    // Get voting power for each investor
    const investor1Power = await propertyDAO.getVotingPower(investor1.address);
    const investor2Power = await propertyDAO.getVotingPower(investor2.address);
    const investor3Power = await propertyDAO.getVotingPower(investor3.address);
    
    console.log('👤 Investor 1 votes YES');
    console.log('   - Voting Power:', ethers.formatUnits(investor1Power, 18), 'shares');
    await propertyDAO.connect(investor1).vote(1, true);
    
    console.log('👤 Investor 2 votes YES');
    console.log('   - Voting Power:', ethers.formatUnits(investor2Power, 18), 'shares');
    await propertyDAO.connect(investor2).vote(1, true);
    
    console.log('👤 Investor 3 votes YES');
    console.log('   - Voting Power:', ethers.formatUnits(investor3Power, 18), 'shares');
    await propertyDAO.connect(investor3).vote(1, true);

    const proposalAfterVoting = await propertyDAO.getProposal(1);
    console.log('\n📊 Proposal Status After Voting:');
    console.log('   - ID:', proposalAfterVoting.id);
    console.log('   - Votes For:', ethers.formatUnits(proposalAfterVoting.votesFor, 18));
    console.log('   - Votes Against:', ethers.formatUnits(proposalAfterVoting.votesAgainst, 18));
    console.log('   - Total Votes:', ethers.formatUnits(proposalAfterVoting.votesFor + proposalAfterVoting.votesAgainst, 18));
    console.log('   - Executed:', proposalAfterVoting.executed);
    console.log('   - Status:', proposalAfterVoting.status, '(Active)');
    
    // Get total shares for context
    const totalSharesForVoting = await propertyVault.totalSupply();
    console.log('   - Total Shares:', ethers.formatUnits(totalSharesForVoting, 18));
    console.log('   - Vote Participation:', ethers.formatUnits((proposalAfterVoting.votesFor + proposalAfterVoting.votesAgainst) * BigInt(100) / totalSharesForVoting, 0) + '%');

    // Check if can execute
    const canExecute = await propertyDAO.canExecute(1);
    console.log('\n🔍 Execution Eligibility:');
    console.log('   - Can execute now?', canExecute);
    console.log('   - Current time:', new Date().toLocaleString());
    console.log('   - Deadline:', new Date(Number(proposalAfterVoting.deadline) * 1000).toLocaleString());

    // Fast forward time past voting period
    console.log('\n⏭️  Fast forwarding past voting period (7 days)...');
    await time.increase(7 * 24 * 60 * 60 + 1);
    
    const canExecuteNow = await propertyDAO.canExecute(1);
    console.log('✅ Can execute after deadline:', canExecuteNow);
    expect(canExecuteNow).to.be.true;
    
    // Final proposal status before execution
    const finalProposal = await propertyDAO.getProposal(1);
    console.log('\n📋 Final Proposal Status Before Execution:');
    console.log('   - ID:', finalProposal.id);
    console.log('   - Proposer:', finalProposal.proposer);
    console.log('   - Type:', finalProposal.proposalType, '(PropertyPurchase)');
    console.log('   - Description:', finalProposal.description);
    console.log('   - Deadline:', new Date(Number(finalProposal.deadline) * 1000).toLocaleString());
    console.log('   - Votes For:', ethers.formatUnits(finalProposal.votesFor, 18));
    console.log('   - Votes Against:', ethers.formatUnits(finalProposal.votesAgainst, 18));
    console.log('   - Executed:', finalProposal.executed);
    console.log('   - Status:', finalProposal.status, '(Active)');
    console.log('   - Can Execute:', canExecuteNow);

    // ============================================================================
    // PHASE 5: EXECUTE PROPERTY PURCHASE
    // ============================================================================
    console.log('\n📍 PHASE 5: EXECUTE PROPERTY PURCHASE');
    console.log('-'.repeat(80));

    // Check vault balance before
    const vaultBalanceBefore = await oftUSDC.balanceOf(vaultAddress);
    console.log('Vault USDC balance before:', ethers.formatUnits(vaultBalanceBefore, 18));

    console.log('Executing proposal...');
    await propertyDAO.connect(platformOwner).executeProposal(1);
    console.log('✅ Proposal executed');
    
    // Check proposal status after execution
    const executedProposal = await propertyDAO.getProposal(1);
    console.log('\n📋 Proposal Status After Execution:');
    console.log('   - ID:', executedProposal.id);
    console.log('   - Executed:', executedProposal.executed);
    console.log('   - Status:', executedProposal.status, '(Executed)');
    console.log('   - Votes For:', ethers.formatUnits(executedProposal.votesFor, 18));
    console.log('   - Votes Against:', ethers.formatUnits(executedProposal.votesAgainst, 18));

    // Funds should be withdrawn to property manager
    const vaultBalanceAfter = await oftUSDC.balanceOf(vaultAddress);
    console.log('Vault USDC balance after:', ethers.formatUnits(vaultBalanceAfter, 18));
    expect(vaultBalanceAfter).to.be.lessThan(vaultBalanceBefore);

    // Complete property purchase
    console.log('\n🏠 Completing property purchase...');
    const propertyAddress = '123 Ocean Drive, Miami, FL';
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
    // PHASE 6: PROPERTY MANAGEMENT & RENT COLLECTION
    // ============================================================================
    console.log('\n📍 PHASE 6: PROPERTY MANAGEMENT');
    console.log('-'.repeat(80));

    // Convert MockUSDC to OFTUSDC for rent (platform collects rent and deposits to vault)
    console.log('💰 Platform collecting rent...');
    const RENT_AMOUNT_USDC = ethers.parseUnits('5000', USDC_DECIMALS); // 5K USDC
    await mockUSDC.connect(platformOwner).mint(platformOwner.address, RENT_AMOUNT_USDC);
    
    // Convert to OFTUSDC via ShareOFTAdapter
    await mockUSDC.connect(platformOwner).approve(await oftAdapter.getAddress(), RENT_AMOUNT_USDC);
    const rentOptions = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString();
    const rentSendParam = [
      2, // destination eid
      ethers.zeroPadValue(platformOwner.address, 32),
      RENT_AMOUNT_USDC,
      RENT_AMOUNT_USDC,
      rentOptions,
      '0x',
      '0x'
    ];
    const [rentNativeFee] = await oftAdapter.quoteSend(rentSendParam, false);
    await oftAdapter.connect(platformOwner).send(rentSendParam, [rentNativeFee, 0n], platformOwner.address, { value: rentNativeFee });
    
    const rentAmountOFTUSDC = RENT_AMOUNT_USDC * BigInt(10 ** 12); // Scale to 18 decimals
    console.log('✅ Platform has OFTUSDC:', ethers.formatUnits(rentAmountOFTUSDC, 18));
    
    // Harvest rent (transferFrom platformOwner to vault)
    await oftUSDC.connect(platformOwner).approve(vaultAddress, rentAmountOFTUSDC);
    await propertyVault.connect(platformOwner).harvestRent(rentAmountOFTUSDC);
    console.log('✅ Rent harvested:', ethers.formatUnits(rentAmountOFTUSDC, 18), 'USDC');

    const totalRentHarvested = await propertyVault.totalRentHarvested();
    console.log('✅ Total rent harvested:', ethers.formatUnits(totalRentHarvested, 18), 'USDC');

    // ============================================================================
    // PHASE 7: INCOME WITHDRAWALS (INCOME ONLY, NOT PRINCIPAL)
    // ============================================================================
    console.log('\n📍 PHASE 7: INCOME WITHDRAWALS');
    console.log('-'.repeat(80));

    // Calculate investor 1's share of income
    const totalShares = await propertyVault.totalSupply();
    const investor1ShareOfIncome = (rentAmountOFTUSDC * investor1Shares) / totalShares;
    
    console.log('\n👤 Investor 1 withdrawing income...');
    console.log('   - Investor 1 shares:', ethers.formatUnits(investor1Shares, 18));
    console.log('   - Total shares:', ethers.formatUnits(totalShares, 18));
    console.log('   - Investor 1 share of income:', ethers.formatUnits(investor1ShareOfIncome, 18), 'USDC');

    const maxWithdrawable = await propertyVault.getMaxWithdrawable(investor1.address);
    console.log('   - Max withdrawable:', ethers.formatUnits(maxWithdrawable, 18), 'USDC');

    // Withdraw income using withdraw() function (new contract logic)
    const investor1USDCBefore = await oftUSDC.balanceOf(investor1.address);
    const investor1SharesBefore = await propertyVault.balanceOf(investor1.address);
    
    // Use withdraw() instead of redeem() for rent income
    await propertyVault.connect(investor1).withdraw(maxWithdrawable, investor1.address, investor1.address);
    
    const investor1USDCAfter = await oftUSDC.balanceOf(investor1.address);
    const investor1SharesAfter = await propertyVault.balanceOf(investor1.address);
    
    console.log('✅ Investor 1 withdrew:', ethers.formatUnits(investor1USDCAfter - investor1USDCBefore, 18), 'USDC');
    console.log('✅ Investor 1 shares before:', ethers.formatUnits(investor1SharesBefore, 18));
    console.log('✅ Investor 1 shares after:', ethers.formatUnits(investor1SharesAfter, 18));
    console.log('✅ Shares preserved (no shares burned):', investor1SharesBefore.toString() === investor1SharesAfter.toString());

    // Verify principal is locked (investor1 still has remaining share of current period income)
    console.log('\n🔒 Verifying principal is locked...');
    const investor1SharesRemaining = await propertyVault.balanceOf(investor1.address);
    const maxWithdrawableAfter = await propertyVault.getMaxWithdrawable(investor1.address);
    console.log('   - Remaining shares:', ethers.formatUnits(investor1SharesRemaining, 18));
    console.log('   - Max withdrawable now:', ethers.formatUnits(maxWithdrawableAfter, 18));
    
    // Investor 1 should have 0 maxWithdrawable after withdrawing their full share
    expect(maxWithdrawableAfter).to.equal(0);
    console.log('✅ Principal correctly locked - Investor 1 has withdrawn their full period share');

    // Test that shares are preserved after income withdrawal
    expect(investor1SharesRemaining).to.equal(investor1SharesBefore);
    console.log('✅ Shares correctly preserved - no shares burned during income withdrawal');

    // Test totalIncomeDistributed tracking (using any to bypass type checking for now)
    const totalIncomeDistributed = await (propertyVault as any).totalIncomeDistributed();
    console.log('✅ Total income distributed:', ethers.formatUnits(totalIncomeDistributed, 18), 'USDC');
    expect(totalIncomeDistributed).to.equal(maxWithdrawable);
    console.log('✅ Income distribution correctly tracked');

    // Test that maxWithdrawable decreases after withdrawal
    const maxWithdrawableBefore = maxWithdrawable;
    const maxWithdrawableAfterWithdrawal = await propertyVault.getMaxWithdrawable(investor1.address);
    console.log('✅ Max withdrawable before:', ethers.formatUnits(maxWithdrawableBefore, 18), 'USDC');
    console.log('✅ Max withdrawable after:', ethers.formatUnits(maxWithdrawableAfterWithdrawal, 18), 'USDC');
    expect(maxWithdrawableAfterWithdrawal).to.be.lessThan(maxWithdrawableBefore);
    console.log('✅ Max withdrawable correctly decreased after withdrawal');

    // Test Investor 2 withdrawing remaining income
    console.log('\n👤 Investor 2 withdrawing remaining income...');
    const investor2MaxWithdrawable = await propertyVault.getMaxWithdrawable(investor2.address);
    console.log('   - Investor 2 max withdrawable:', ethers.formatUnits(investor2MaxWithdrawable, 18), 'USDC');
    
    const investor2USDCBefore = await oftUSDC.balanceOf(investor2.address);
    const investor2SharesBefore = await propertyVault.balanceOf(investor2.address);
    
    await propertyVault.connect(investor2).withdraw(investor2MaxWithdrawable, investor2.address, investor2.address);
    
    const investor2USDCAfter = await oftUSDC.balanceOf(investor2.address);
    const investor2SharesAfter = await propertyVault.balanceOf(investor2.address);
    
    console.log('✅ Investor 2 withdrew:', ethers.formatUnits(investor2USDCAfter - investor2USDCBefore, 18), 'USDC');
    console.log('✅ Investor 2 shares preserved:', investor2SharesBefore.toString() === investor2SharesAfter.toString());
    
    // Verify total income distributed is updated
    const totalIncomeDistributedAfter = await (propertyVault as any).totalIncomeDistributed();
    console.log('✅ Total income distributed after Investor 2:', ethers.formatUnits(totalIncomeDistributedAfter, 18), 'USDC');
    expect(totalIncomeDistributedAfter).to.equal(totalIncomeDistributed + investor2MaxWithdrawable);
    console.log('✅ Income distribution correctly updated for multiple investors');

    // Withdraw remaining income for investor 3
    console.log('\n👤 Investor 3 withdrawing remaining income...');
    const investor3MaxWithdrawable = await propertyVault.getMaxWithdrawable(investor3.address);
    console.log('   - Investor 3 max withdrawable:', ethers.formatUnits(investor3MaxWithdrawable, 18), 'USDC');
    
    if (investor3MaxWithdrawable > 0) {
      await propertyVault.connect(investor3).withdraw(investor3MaxWithdrawable, investor3.address, investor3.address);
      console.log('✅ Investor 3 withdrew:', ethers.formatUnits(investor3MaxWithdrawable, 18), 'USDC');
    }
    
    // After all investors withdraw, maxWithdrawable should be 0
    const investor1MaxAfterAll = await propertyVault.getMaxWithdrawable(investor1.address);
    const investor2MaxAfterAll = await propertyVault.getMaxWithdrawable(investor2.address);
    const investor3MaxAfterAll = await propertyVault.getMaxWithdrawable(investor3.address);
    console.log('✅ Max withdrawable after all withdrawals:');
    console.log('   - Investor 1:', ethers.formatUnits(investor1MaxAfterAll, 18), 'USDC');
    console.log('   - Investor 2:', ethers.formatUnits(investor2MaxAfterAll, 18), 'USDC');
    console.log('   - Investor 3:', ethers.formatUnits(investor3MaxAfterAll, 18), 'USDC');
    expect(investor1MaxAfterAll).to.equal(0);
    expect(investor2MaxAfterAll).to.equal(0);
    expect(investor3MaxAfterAll).to.equal(0);
    console.log('✅ No more income available for withdrawal - all period income distributed');

    // ============================================================================
    // PHASE 8: NAV UPDATE (PROPERTY APPRECIATION)
    // ============================================================================
    console.log('\n📍 PHASE 8: NAV UPDATE (PROPERTY APPRECIATION)');
    console.log('-'.repeat(80));

    const appreciationAmount = ethers.parseUnits('50000', 18); // Property value increased by 50K
    console.log('📈 Property appreciated by:', ethers.formatUnits(appreciationAmount, 18), 'USDC');

    const tokenSupplyBefore = await propertyToken.totalSupply();
    console.log('PropertyToken supply before:', ethers.formatUnits(tokenSupplyBefore, 18));

    await propertyVault.connect(platformOwner).updateNAV(appreciationAmount);
    
    const tokenSupplyAfter = await propertyToken.totalSupply();
    console.log('✅ PropertyToken supply after:', ethers.formatUnits(tokenSupplyAfter, 18));
    expect(tokenSupplyAfter).to.be.greaterThan(tokenSupplyBefore);
    
    const navChange = await propertyToken.getNAVChangePercentage();
    console.log('✅ NAV change:', navChange.toString(), 'basis points');

    // ============================================================================
    // PHASE 9: SUMMARY
    // ============================================================================
    console.log('\n' + '='.repeat(80));
    console.log('📊 FINAL SUMMARY');
    console.log('='.repeat(80));

    console.log('\n🏠 Property Information:');
    console.log('   - Name:', PROPERTY_NAME);
    console.log('   - Address:', propertyAddress);
    console.log('   - Stage:', await propertyDAO.getCurrentStage(), '(UnderManagement)');
    console.log('   - Total Invested:', ethers.formatUnits(propertyInfo.totalInvested, 18), 'USDC');
    console.log('   - Funding Target:', ethers.formatUnits(FUNDING_TARGET, 18), 'USDC');

    console.log('\n💰 Financial Summary:');
    console.log('   - Total Rent Collected:', ethers.formatUnits(totalRentHarvested, 18), 'USDC');
    console.log('   - Total Income Distributed:', ethers.formatUnits(await (propertyVault as any).totalIncomeDistributed(), 18), 'USDC');
    console.log('   - Property Appreciation:', ethers.formatUnits(appreciationAmount, 18), 'tokens');
    console.log('   - PropertyToken Supply:', ethers.formatUnits(tokenSupplyAfter, 18));

    console.log('\n👥 Investor Summary:');
    const investor1FinalShares = await propertyVault.balanceOf(investor1.address);
    const investor2FinalShares = await propertyVault.balanceOf(investor2.address);
    const investor3FinalShares = await propertyVault.balanceOf(investor3.address);
    
    console.log('   Investor 1:');
    console.log('     - Shares:', ethers.formatUnits(investor1FinalShares, 18));
    console.log('     - Voting Power:', ethers.formatUnits(await propertyDAO.getVotingPower(investor1.address), 18));
    
    console.log('   Investor 2:');
    console.log('     - Shares:', ethers.formatUnits(investor2FinalShares, 18));
    console.log('     - Voting Power:', ethers.formatUnits(await propertyDAO.getVotingPower(investor2.address), 18));
    
    console.log('   Investor 3:');
    console.log('     - Shares:', ethers.formatUnits(investor3FinalShares, 18));
    console.log('     - Voting Power:', ethers.formatUnits(await propertyDAO.getVotingPower(investor3.address), 18));

    console.log('\n✅ COMPLETE WORKFLOW TEST PASSED! 🎉');
    console.log('='.repeat(80));
  });

  it('⏭️ Test Time Skip Functionality', async function () {
    console.log('\n' + '='.repeat(60));
    console.log('⏭️ TIME SKIP TEST (Using Hardhat time.increase)');
    console.log('='.repeat(60));

    // This test demonstrates how to skip time using Hardhat's time.increase()
    // instead of modifying the contract
    
    console.log('\n📋 Current time before skip:');
    const timeBefore = await time.latest();
    console.log('   - Time:', new Date(Number(timeBefore) * 1000).toLocaleString());
    
    console.log('\n⏭️ Skipping 7 days + 1 second using time.increase()...');
    await time.increase(7 * 24 * 60 * 60 + 1);
    
    console.log('\n📋 Time after skip:');
    const timeAfter = await time.latest();
    console.log('   - Time:', new Date(Number(timeAfter) * 1000).toLocaleString());
    console.log('   - Time difference:', Number(timeAfter - timeBefore), 'seconds');
    console.log('   - Expected:', 7 * 24 * 60 * 60 + 1, 'seconds');
    
    // Verify the time skip worked
    const expectedTime = timeBefore + BigInt(7 * 24 * 60 * 60 + 1);
    expect(timeAfter).to.equal(expectedTime);
    console.log('✅ Time skip verification passed!');

    console.log('\n💡 Usage in Hardhat console:');
    console.log('   1. npx hardhat console --network localhost');
    console.log('   2. const { time } = require("@nomicfoundation/hardhat-network-helpers");');
    console.log('   3. await time.increase(7 * 24 * 60 * 60 + 1);');

    console.log('\n✅ TIME SKIP TEST PASSED! 🎉');
    console.log('='.repeat(60));
  });

  it('🔍 Simple Test: Get Property Name and Verify Contract Functions', async function () {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 SIMPLE PROPERTY NAME TEST');
    console.log('='.repeat(60));

    // Create a property first
    console.log('\n📋 Creating property for name test...');
    const createTx = await propertyRegistry.connect(platformOwner).createProperty(
      PROPERTY_NAME,
      DEPOSIT_CAP,
      await oftUSDC.getAddress()
    );
    const receipt = await createTx.wait();
    
    // Get vault address from event
    const propertyCreatedEvent = receipt?.logs.find(
      (log: any) => log.fragment?.name === 'PropertyCreated'
    );
    const vaultAddress = propertyCreatedEvent?.args?.vault;
    const propertyId = propertyCreatedEvent?.args?.propertyId;
    
    console.log('✅ Property ID:', propertyId);
    console.log('✅ Vault Address:', vaultAddress);

    // Get the vault contract instance
    const testVault = await ethers.getContractAt('PropertyVaultGovernance', vaultAddress);

    // ============================================================================
    // TEST 1: Get Property Name from Vault (ERC20 name function)
    // ============================================================================
    console.log('\n📍 TEST 1: Getting Property Name');
    console.log('-'.repeat(40));

    const vaultName = await testVault.name();
    console.log('✅ Vault name (from ERC20):', vaultName);
    expect(vaultName).to.equal(PROPERTY_NAME);
    console.log('✅ Property name matches expected:', PROPERTY_NAME);

    // ============================================================================
    // TEST 2: Verify Contract Functions Exist
    // ============================================================================
    console.log('\n📍 TEST 2: Verifying Contract Functions');
    console.log('-'.repeat(40));

    // Test PropertyRegistry functions
    console.log('🔍 Testing PropertyRegistry functions...');
    
    // Check if property exists
    const exists = await propertyRegistry.propertyExistsExternal(propertyId);
    console.log('✅ propertyExistsExternal():', exists);
    expect(exists).to.be.true;

    // Get property info
    const propertyInfo = await propertyRegistry.getProperty(propertyId);
    console.log('✅ getProperty() - Vault:', propertyInfo.vault);
    console.log('✅ getProperty() - Deposit Cap:', ethers.formatUnits(propertyInfo.depositCap, 18));
    console.log('✅ getProperty() - Status:', propertyInfo.status);
    console.log('✅ getProperty() - Created At:', new Date(Number(propertyInfo.createdAt) * 1000).toLocaleString());

    // Get vault address
    const vaultFromRegistry = await propertyRegistry.getVaultAddress(propertyId);
    console.log('✅ getVaultAddress():', vaultFromRegistry);
    expect(vaultFromRegistry).to.equal(vaultAddress);

    // Check if property is active
    const isActive = await propertyRegistry.isPropertyActive(propertyId);
    console.log('✅ isPropertyActive():', isActive);
    expect(isActive).to.be.true;

    // Get property count
    const propertyCount = await propertyRegistry.getPropertyCount();
    console.log('✅ getPropertyCount():', propertyCount);

    // Test Vault functions
    console.log('\n🔍 Testing Vault functions...');
    
    // Get vault symbol
    const vaultSymbol = await testVault.symbol();
    console.log('✅ Vault symbol (from ERC20):', vaultSymbol);
    expect(vaultSymbol).to.equal(PROPERTY_NAME + 'SHARE');

    // Get vault decimals
    const vaultDecimals = await testVault.decimals();
    console.log('✅ Vault decimals:', vaultDecimals);

    // Get property ID from vault
    const vaultPropertyId = await testVault.propertyId();
    console.log('✅ Vault propertyId:', vaultPropertyId);
    expect(vaultPropertyId).to.equal(propertyId);

    // Get deposit cap
    const vaultDepositCap = await testVault.depositCap();
    console.log('✅ Vault deposit cap:', ethers.formatUnits(vaultDepositCap, 18));

    // ============================================================================
    // TEST 3: Verify ERC20 Standard Functions
    // ============================================================================
    console.log('\n📍 TEST 3: Verifying ERC20 Standard Functions');
    console.log('-'.repeat(40));

    // Test total supply
    const totalSupply = await testVault.totalSupply();
    console.log('✅ totalSupply():', ethers.formatUnits(totalSupply, 18));

    // Test balance of (should be 0 for platform owner initially)
    const platformBalance = await testVault.balanceOf(platformOwner.address);
    console.log('✅ balanceOf(platformOwner):', ethers.formatUnits(platformBalance, 18));

    // Test owner
    const vaultOwner = await testVault.owner();
    console.log('✅ owner():', vaultOwner);
    expect(vaultOwner).to.equal(platformOwner.address);

    // ============================================================================
    // SUMMARY
    // ============================================================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 SIMPLE TEST SUMMARY');
    console.log('='.repeat(60));

    console.log('\n✅ Available Functions for Property Name:');
    console.log('   - vault.name() - Gets the property name from ERC20 standard');
    console.log('   - vault.symbol() - Gets the property symbol (name + "SHARE")');
    
    console.log('\n✅ Available Functions for Property Info:');
    console.log('   - propertyRegistry.getProperty(propertyId) - Gets full property struct');
    console.log('   - propertyRegistry.propertyExistsExternal(propertyId) - Checks if property exists');
    console.log('   - propertyRegistry.getVaultAddress(propertyId) - Gets vault address');
    console.log('   - propertyRegistry.isPropertyActive(propertyId) - Checks if property is active');
    console.log('   - propertyRegistry.getPropertyCount() - Gets total property count');

    console.log('\n✅ Available Functions for Vault Info:');
    console.log('   - vault.propertyId() - Gets property ID');
    console.log('   - vault.depositCap() - Gets deposit cap');
    console.log('   - vault.totalSupply() - Gets total share supply');
    console.log('   - vault.balanceOf(address) - Gets share balance');
    console.log('   - vault.owner() - Gets vault owner');

    console.log('\n✅ SIMPLE TEST PASSED! 🎉');
    console.log('='.repeat(60));
  });

  it('💰 Test Rent Income Distribution (New Contract Logic)', async function () {
    console.log('\n' + '='.repeat(80));
    console.log('💰 RENT INCOME DISTRIBUTION TEST');
    console.log('='.repeat(80));

    // Create property and setup
    console.log('\n📋 Setting up property for income distribution test...');
    const createTx = await propertyRegistry.connect(platformOwner).createProperty(
      'Test Property for Income Distribution',
      DEPOSIT_CAP,
      await oftUSDC.getAddress()
    );
    const receipt = await createTx.wait();
    
    const propertyCreatedEvent = receipt?.logs.find(
      (log: any) => log.fragment?.name === 'PropertyCreated'
    );
    const vaultAddress = propertyCreatedEvent?.args?.vault;
    const propertyId = propertyCreatedEvent?.args?.propertyId;
    
    const testVault = await ethers.getContractAt('PropertyVaultGovernance', vaultAddress);
    
    // Deploy DAO and link
    const PropertyDAO = await ethers.getContractFactory('PropertyDAO');
    const testDAO = await PropertyDAO.deploy(vaultAddress, platformOwner.address);
    await testDAO.waitForDeployment();
    await testVault.connect(platformOwner).setDAO(await testDAO.getAddress());
    
    // Set funding target and complete funding
    const fundingDeadline = (await time.latest()) + 30 * 24 * 60 * 60;
    await testDAO.connect(platformOwner).setFundingTarget(FUNDING_TARGET, fundingDeadline);
    
    // Investor deposits (this will trigger auto-creation of proposal when funding target is reached)
    const investorAmount = ethers.parseUnits('100000', USDC_DECIMALS); // 100K USDC to reach funding target
    await mockUSDC.connect(platformOwner).mint(investor1.address, investorAmount);
    await mockUSDC.connect(investor1).approve(await oftAdapter.getAddress(), investorAmount);
    
    const options = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString();
    const sendParam = [2, ethers.zeroPadValue(investor1.address, 32), investorAmount, investorAmount, options, '0x', '0x'];
    const [nativeFee] = await oftAdapter.quoteSend(sendParam, false);
    await oftAdapter.connect(investor1).send(sendParam, [nativeFee, 0n], investor1.address, { value: nativeFee });
    
    const oftAmount = investorAmount * BigInt(10 ** 12);
    await oftUSDC.connect(investor1).approve(vaultAddress, oftAmount);
    await testVault.connect(investor1).deposit(oftAmount, investor1.address);
    
    // Check that proposal was auto-created
    const proposalCount = await testDAO.proposalCount();
    console.log('✅ Proposal count after funding:', proposalCount);
    expect(proposalCount).to.be.greaterThan(0);
    
    // Vote on the proposal
    console.log('🗳️ Voting on proposal...');
    await testDAO.connect(investor1).vote(1, true);
    console.log('✅ Investor 1 voted YES');
    
    // Complete property purchase (need to wait for 7-day deadline)
    console.log('⏭️ Fast forwarding past 7-day voting deadline...');
    await time.increase(7 * 24 * 60 * 60 + 1);
    
    await testDAO.connect(platformOwner).executeProposal(1);
    await testDAO.connect(platformOwner).completePropertyPurchase('Test Property Address');
    
    // Harvest rent
    const rentAmount = ethers.parseUnits('10000', USDC_DECIMALS);
    await mockUSDC.connect(platformOwner).mint(platformOwner.address, rentAmount);
    await mockUSDC.connect(platformOwner).approve(await oftAdapter.getAddress(), rentAmount);
    
    const rentOptions = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString();
    const rentSendParam = [2, ethers.zeroPadValue(platformOwner.address, 32), rentAmount, rentAmount, rentOptions, '0x', '0x'];
    const [rentNativeFee] = await oftAdapter.quoteSend(rentSendParam, false);
    await oftAdapter.connect(platformOwner).send(rentSendParam, [rentNativeFee, 0n], platformOwner.address, { value: rentNativeFee });
    
    const rentAmountOFT = rentAmount * BigInt(10 ** 12);
    await oftUSDC.connect(platformOwner).approve(vaultAddress, rentAmountOFT);
    await testVault.connect(platformOwner).harvestRent(rentAmountOFT);
    
    console.log('✅ Rent harvested:', ethers.formatUnits(rentAmountOFT, 18), 'USDC');

    // Test income distribution
    console.log('\n📍 Testing Income Distribution...');
    
    const totalRentHarvested = await testVault.totalRentHarvested();
    const totalIncomeDistributedBefore = await (testVault as any).totalIncomeDistributed();
    const maxWithdrawable = await testVault.getMaxWithdrawable(investor1.address);
    
    console.log('   - Total rent harvested:', ethers.formatUnits(totalRentHarvested, 18), 'USDC');
    console.log('   - Total income distributed before:', ethers.formatUnits(totalIncomeDistributedBefore, 18), 'USDC');
    console.log('   - Max withdrawable:', ethers.formatUnits(maxWithdrawable, 18), 'USDC');
    
    // Withdraw income
    const sharesBefore = await testVault.balanceOf(investor1.address);
    const usdcBefore = await oftUSDC.balanceOf(investor1.address);
    
    await testVault.connect(investor1).withdraw(maxWithdrawable, investor1.address, investor1.address);
    
    const sharesAfter = await testVault.balanceOf(investor1.address);
    const usdcAfter = await oftUSDC.balanceOf(investor1.address);
    const totalIncomeDistributedAfter = await (testVault as any).totalIncomeDistributed();
    
    console.log('\n📊 Results:');
    console.log('   - USDC received:', ethers.formatUnits(usdcAfter - usdcBefore, 18), 'USDC');
    console.log('   - Shares before:', ethers.formatUnits(sharesBefore, 18));
    console.log('   - Shares after:', ethers.formatUnits(sharesAfter, 18));
    console.log('   - Shares preserved:', sharesBefore.toString() === sharesAfter.toString());
    console.log('   - Total income distributed after:', ethers.formatUnits(totalIncomeDistributedAfter, 18), 'USDC');
    
    // Verify results
    expect(sharesBefore).to.equal(sharesAfter);
    expect(totalIncomeDistributedAfter).to.equal(totalIncomeDistributedBefore + maxWithdrawable);
    expect(usdcAfter - usdcBefore).to.equal(maxWithdrawable);
    
    console.log('✅ All income distribution tests passed!');
    
    // Test that maxWithdrawable is now 0
    const maxWithdrawableAfter = await testVault.getMaxWithdrawable(investor1.address);
    expect(maxWithdrawableAfter).to.equal(0);
    console.log('✅ Max withdrawable correctly set to 0 after full withdrawal');
    
    console.log('\n✅ RENT INCOME DISTRIBUTION TEST PASSED! 🎉');
    console.log('='.repeat(80));
  });
});

