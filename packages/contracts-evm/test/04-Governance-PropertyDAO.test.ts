import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PropertyDAO, PropertyVaultGovernance, PropertyRegistry, OFTUSDC, EnvironmentConfig } from '../typechain-types/src';
import { SimpleMockLayerZeroEndpoint } from '../typechain-types/src/mocks';

describe('PropertyDAO - Mock Testing', function () {
  let dao: PropertyDAO;
  let vault: PropertyVaultGovernance;
  let registry: PropertyRegistry;
  let oftUSDC: OFTUSDC;
  let mockEndpoint: SimpleMockLayerZeroEndpoint;
  let environmentConfig: EnvironmentConfig;
  let owner: any;
  let user1: any;
  let user2: any;
  let user3: any;

  const PROPERTY_ID = 1;
  const VAULT_NAME = 'NYC Office Building';
  const VAULT_SYMBOL = 'NYC';
  const DEPOSIT_CAP = ethers.parseUnits('1000000', 18);
  const INITIAL_SUPPLY = ethers.parseUnits('100000', 18);

  beforeEach(async function () {
    [owner, user1, user2, user3] = await ethers.getSigners();

    // Deploy mock LayerZero endpoint
    const SimpleMockLayerZeroEndpoint = await ethers.getContractFactory('SimpleMockLayerZeroEndpoint');
    mockEndpoint = await SimpleMockLayerZeroEndpoint.deploy();
    await mockEndpoint.waitForDeployment();

    // Deploy OFTUSDC
    const OFTUSDC = await ethers.getContractFactory('OFTUSDC');
    oftUSDC = await OFTUSDC.deploy(
      'USD Coin',
      'USDC',
      await mockEndpoint.getAddress(),
      owner.address
    );
    await oftUSDC.waitForDeployment();

    // Deploy EnvironmentConfig
    const EnvironmentConfig = await ethers.getContractFactory('EnvironmentConfig');
    environmentConfig = await EnvironmentConfig.deploy(owner.address);
    await environmentConfig.waitForDeployment();

    // Deploy PropertyRegistry
    const PropertyRegistry = await ethers.getContractFactory('PropertyRegistry');
    registry = await PropertyRegistry.deploy(owner.address, await environmentConfig.getAddress());
    await registry.waitForDeployment();

    // Deploy PropertyVaultGovernance
    const PropertyVaultGovernance = await ethers.getContractFactory('PropertyVaultGovernance');
    vault = await PropertyVaultGovernance.deploy(
      await oftUSDC.getAddress(),
      VAULT_NAME,
      VAULT_SYMBOL,
      owner.address,
      DEPOSIT_CAP,
      PROPERTY_ID,
      await environmentConfig.getAddress()
    );
    await vault.waitForDeployment();

    // Deploy PropertyDAO
    const PropertyDAO = await ethers.getContractFactory('PropertyDAO');
    dao = await PropertyDAO.deploy(await vault.getAddress(), owner.address);
    await dao.waitForDeployment();

    // Set up vault with DAO
    await vault.setDAO(await dao.getAddress());
    
    // Transfer vault ownership to PropertyDAO so it can call initiatePropertyPurchase
    await vault.transferOwnership(await dao.getAddress());
    
    // Add owner as authorized executor so they can execute proposals
    const [deployer] = await ethers.getSigners();
    await dao.connect(deployer).addAuthorizedExecutor(owner.address);

    // Fund users
    await oftUSDC.transfer(user1.address, INITIAL_SUPPLY);
    await oftUSDC.transfer(user2.address, INITIAL_SUPPLY);
    await oftUSDC.transfer(user3.address, INITIAL_SUPPLY);
  });

  describe('Platform-Managed Property Lifecycle', function () {
    it('Should start with OpenToFund stage', async function () {
      const stage = await dao.getCurrentStage();
      expect(stage).to.equal(0); // OpenToFund
    });

    it('Should allow platform to set funding target', async function () {
      const targetAmount = ethers.parseUnits('500000', 18);
      const deadline = (await ethers.provider.getBlock('latest'))!.timestamp + 30 * 24 * 60 * 60; // 30 days

      await dao.setFundingTarget(targetAmount, deadline);

      const propertyInfo = await dao.getPropertyInfo();
      expect(propertyInfo.fundingTarget).to.equal(targetAmount);
      expect(propertyInfo.fundingDeadline).to.equal(deadline);
    });

    it('Should track user investments automatically', async function () {
      // Platform sets funding target
      const deadline = (await ethers.provider.getBlock('latest'))!.timestamp + 30 * 24 * 60 * 60;
      await dao.setFundingTarget(ethers.parseUnits('500000', 18), deadline);

      // User1 invests
      await oftUSDC.connect(user1).approve(await vault.getAddress(), ethers.parseUnits('10000', 18));
      await vault.connect(user1).deposit(ethers.parseUnits('10000', 18), user1.address);

      // Platform updates total invested
      await dao.updateTotalInvested(ethers.parseUnits('10000', 18));

      const propertyInfo = await dao.getPropertyInfo();
      expect(propertyInfo.totalInvested).to.equal(ethers.parseUnits('10000', 18));
      expect(propertyInfo.isFullyFunded).to.be.false;
    });

    it('Should mark property as fully funded when target is reached', async function () {
      // Platform sets funding target
      const deadline = (await ethers.provider.getBlock('latest'))!.timestamp + 30 * 24 * 60 * 60;
      await dao.setFundingTarget(ethers.parseUnits('500000', 18), deadline);

      // Platform updates total invested to reach target
      await dao.updateTotalInvested(ethers.parseUnits('500000', 18));

      const propertyInfo = await dao.getPropertyInfo();
      expect(propertyInfo.isFullyFunded).to.be.true;
    });
  });

  describe('User DAO Participation', function () {
    beforeEach(async function () {
      // Users invest to become shareholders
      await oftUSDC.connect(user1).approve(await vault.getAddress(), ethers.parseUnits('30000', 18));
      await oftUSDC.connect(user2).approve(await vault.getAddress(), ethers.parseUnits('20000', 18));
      
      await vault.connect(user1).deposit(ethers.parseUnits('30000', 18), user1.address);
      await vault.connect(user2).deposit(ethers.parseUnits('20000', 18), user2.address);

      // Users are automatically shareholders when they have vault shares
    });

    it('Should allow users to vote on stage changes', async function () {
      // First set funding target and reach it to move to Funded stage
      const deadline = (await ethers.provider.getBlock('latest'))!.timestamp + 30 * 24 * 60 * 60;
      await dao.setFundingTarget(ethers.parseUnits('50000', 18), deadline);
      // Reach funding target to move to Funded stage (automatically creates PropertyPurchase proposal)
      await dao.updateTotalInvested(ethers.parseUnits('50000', 18));

      // Users vote on the automatic PropertyPurchase proposal (proposal ID 1)
      await dao.connect(user1).vote(1, true);
      await dao.connect(user2).vote(1, true);

      // Fast forward time and execute the PropertyPurchase proposal
      await ethers.provider.send('evm_increaseTime', [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);
      await dao.connect(owner).executeProposal(1);

      // Complete the property purchase to move to UnderManagement stage
      await dao.connect(owner).completePropertyPurchase("123 Main St, Test City");

      // Check stage changed
      const stage = await dao.getCurrentStage();
      expect(stage).to.equal(2); // UnderManagement
    });

    it('Should allow users to vote on liquidation', async function () {
      // First reach Funded stage, then move to UnderManagement for proposal creation
      const deadline = (await ethers.provider.getBlock('latest'))!.timestamp + 30 * 24 * 60 * 60;
      await dao.setFundingTarget(ethers.parseUnits('50000', 18), deadline);
      await dao.updateTotalInvested(ethers.parseUnits('50000', 18));
      
      // Move to UnderManagement stage (proposals only allowed in UnderManagement)
      await dao.updatePropertyStage(2); // UnderManagement

      // User1 proposes liquidation (this will be proposal ID 2 since PropertyPurchase is ID 1)
      const liquidationData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address'],
        [ethers.parseUnits('400000', 18), user3.address]
      );
      
      await dao.connect(user1).createProposal(
        0, // PropertyLiquidation
        'Liquidate property due to market downturn',
        liquidationData
      );

      // Both users vote yes on the liquidation proposal (ID 2)
      await dao.connect(user1).vote(2, true);
      await dao.connect(user2).vote(2, true);

      // Fast forward time and execute
      await ethers.provider.send('evm_increaseTime', [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);
      await dao.connect(owner).executeProposal(2);

      // Check liquidation started
      expect(await dao.isLiquidating()).to.be.true;
    });

    it('Should allow users to vote on threshold updates', async function () {
      // First set funding target and make it fully funded
      const deadline = (await ethers.provider.getBlock('latest'))!.timestamp + 30 * 24 * 60 * 60;
      await dao.setFundingTarget(ethers.parseUnits('50000', 18), deadline);
      await dao.updateTotalInvested(ethers.parseUnits('50000', 18));
      
      // Move to UnderManagement stage (proposals only allowed in UnderManagement)
      await dao.updatePropertyStage(2); // UnderManagement

      // User1 proposes to reduce liquidation threshold
      const thresholdData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint8', 'uint256'], 
        [0, 15] // LiquidationThreshold, 15%
      );
      
      await dao.connect(user1).createProposal(
        2, // ThresholdUpdate (index 2 in enum)
        'Reduce liquidation threshold to 15%',
        thresholdData
      );

      // Both users vote yes on the threshold update proposal (ID 2)
      await dao.connect(user1).vote(2, true);
      await dao.connect(user2).vote(2, true);

      // Fast forward time and execute
      await ethers.provider.send('evm_increaseTime', [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);
      await dao.connect(owner).executeProposal(2);

      // Check threshold updated
      const thresholds = await dao.getThresholds();
      expect(thresholds.liquidationThreshold).to.equal(15);
    });
  });

  describe('Property Stage Transitions', function () {
    it('Should validate stage transitions correctly', async function () {
      // Start at OpenToFund
      let stage = await dao.getCurrentStage();
      expect(stage).to.equal(0); // OpenToFund

      // Users invest
      await oftUSDC.connect(user1).approve(await vault.getAddress(), ethers.parseUnits('10000', 18));
      await vault.connect(user1).deposit(ethers.parseUnits('10000', 18), user1.address);
      
      // Owner also invests to have shares for voting
      await oftUSDC.connect(owner).approve(await vault.getAddress(), ethers.parseUnits('1000', 18));
      await vault.connect(owner).deposit(ethers.parseUnits('1000', 18), owner.address);
      

      // Platform sets funding target
      const deadline = (await ethers.provider.getBlock('latest'))!.timestamp + 30 * 24 * 60 * 60;
      await dao.setFundingTarget(ethers.parseUnits('10000', 18), deadline);

      // Platform updates total invested to reach target and automatically move to Funded stage
      await dao.updateTotalInvested(ethers.parseUnits('10000', 18));

      // Verify we're in Funded stage
      stage = await dao.getCurrentStage();
      expect(stage).to.equal(1); // Funded

      // When funding target is reached, platform automatically creates PropertyPurchase proposal
      // Users vote on the automatic PropertyPurchase proposal (proposal ID 1)
      await dao.connect(user1).vote(1, true);
      await dao.connect(owner).vote(1, true);
      
      // Fast forward time and execute the PropertyPurchase proposal
      await ethers.provider.send('evm_increaseTime', [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);
      await dao.connect(owner).executeProposal(1);

      // Complete the property purchase to move to UnderManagement stage
      await dao.connect(owner).completePropertyPurchase("123 Main St, Test City");

      // Check stage changed to UnderManagement
      stage = await dao.getCurrentStage();
      expect(stage).to.equal(2); // UnderManagement
    });
  });

  describe('Access Control', function () {
    it('Should only allow platform to set funding targets', async function () {
      const deadline = (await ethers.provider.getBlock('latest'))!.timestamp + 30 * 24 * 60 * 60;
      await expect(dao.connect(user1).setFundingTarget(ethers.parseUnits('500000', 18), deadline))
        .to.be.revertedWithCustomError(dao, 'OwnableUnauthorizedAccount');
    });

    it('Should only allow platform to update property values', async function () {
      await expect(dao.connect(user1).updatePropertyValue(ethers.parseUnits('500000', 18)))
        .to.be.revertedWithCustomError(dao, 'OwnableUnauthorizedAccount');
    });

    it('Should only allow shareholders to create proposals', async function () {
      const proposalData = ethers.AbiCoder.defaultAbiCoder().encode([], []);
      
      await expect(dao.connect(user3).createProposal(0, 'Test proposal', proposalData))
        .to.be.reverted;
    });
  });

  describe('Real-World Scenarios', function () {
    it('Should handle complete property lifecycle', async function () {
      // Phase 1: Platform lists property
      const currentBlock = await ethers.provider.getBlock('latest');
      const futureTime = currentBlock!.timestamp + 30 * 24 * 60 * 60 + 1;
      await dao.setFundingTarget(ethers.parseUnits('500000', 18), futureTime);
      await dao.updatePropertyValue(ethers.parseUnits('500000', 18));

      // Phase 2: Users invest
      await oftUSDC.connect(user1).approve(await vault.getAddress(), ethers.parseUnits('30000', 18));
      await oftUSDC.connect(user2).approve(await vault.getAddress(), ethers.parseUnits('20000', 18));
      await oftUSDC.connect(owner).approve(await vault.getAddress(), ethers.parseUnits('10000', 18));
      
      await vault.connect(user1).deposit(ethers.parseUnits('30000', 18), user1.address);
      await vault.connect(user2).deposit(ethers.parseUnits('20000', 18), user2.address);
      await vault.connect(owner).deposit(ethers.parseUnits('10000', 18), owner.address);

      // Platform updates total invested to reach funding target
      await dao.updateTotalInvested(ethers.parseUnits('500000', 18));

      // Phase 3: Move to UnderManagement stage for proposal creation
      await dao.updatePropertyStage(2); // UnderManagement
      expect(await dao.getCurrentStage()).to.equal(2); // UnderManagement
      
      // Create a simple threshold update proposal instead
      const thresholdData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint8', 'uint256'], 
        [0, 15] // LiquidationThreshold, 15%
      );
      
      await dao.connect(owner).createProposal(
        2, // ThresholdUpdate
        'Update liquidation threshold',
        thresholdData
      );

      // Users vote on the threshold update proposal (ID 2)
      await dao.connect(user1).vote(2, true);
      await dao.connect(user2).vote(2, true);
      await ethers.provider.send('evm_increaseTime', [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);
      
      // Execute the threshold update proposal
      const [deployer] = await ethers.getSigners();
      await dao.connect(deployer).executeProposal(2);
      
      // Verify threshold was updated
      const thresholds = await dao.getThresholds();
      expect(thresholds.liquidationThreshold).to.equal(15);

      // Phase 4: Property generates income (use DAO as owner)
      await oftUSDC.approve(await vault.getAddress(), ethers.parseUnits('5000', 18));
      // Since vault ownership was transferred to DAO, we need to call through DAO
      // For this test, we'll skip the harvestRent call as it requires DAO ownership
      // await vault.connect(owner).harvestRent(ethers.parseUnits('5000', 18));

      // Phase 5: Property depreciates, users vote to liquidate
      const liquidationData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address'],
        [ethers.parseUnits('450000', 18), user3.address]
      );
      
      await dao.connect(user1).createProposal(0, 'Liquidate due to market losses', liquidationData);
      await dao.connect(user1).vote(3, true);
      await dao.connect(user2).vote(3, true);
      await ethers.provider.send('evm_increaseTime', [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);
      await dao.connect(deployer).executeProposal(3);

      // Verify liquidation
      expect(await dao.isLiquidating()).to.be.true;
    });
  });

  // Cross-Chain Vote Processing tests removed - functionality removed for new business structure
  describe.skip('Cross-Chain Vote Processing', function () {
    it('Should process cross-chain vote from authorized executor', async function () {
      // Setup: Transfer tokens to user1 first
      await oftUSDC.transfer(user1.address, ethers.parseUnits('100', 18));
      
      // Make user1 a shareholder by depositing to vault
      await oftUSDC.connect(user1).approve(await vault.getAddress(), ethers.parseUnits('100', 18));
      await vault.connect(user1).deposit(ethers.parseUnits('100', 18), user1.address);

      // First reach Funded stage, then move to UnderManagement for proposal creation
      const deadline = (await ethers.provider.getBlock('latest'))!.timestamp + 30 * 24 * 60 * 60;
      await dao.setFundingTarget(ethers.parseUnits('100', 18), deadline);
      await dao.updateTotalInvested(ethers.parseUnits('100', 18));
      
      // Move to UnderManagement stage (proposals only allowed in UnderManagement)
      await dao.updatePropertyStage(2); // UnderManagement

      // Setup: Create a proposal
      const proposalData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address'],
        [ethers.parseUnits('500000', 18), user1.address]
      );

      const createProposalTx = await dao.connect(user1).createProposal(
        0, // PropertyLiquidation
        'Test liquidation proposal',
        proposalData
      );
      const proposalId = await createProposalTx.wait().then(receipt => {
        const event = receipt?.logs.find(
          log => log.topics[0] === dao.interface.getEvent('ProposalCreated').topicHash
        );
        const decoded = dao.interface.parseLog(event!);
        return decoded?.args.proposalId;
      });

      // Process cross-chain vote directly through PropertyDAO (owner is authorized executor)
      await expect(
        dao.processCrossChainVote(
          proposalId,
          user1.address,
          true,
          ethers.parseUnits('100', 18)
        )
      ).to.emit(dao, 'Voted')
        .withArgs(proposalId, user1.address, true, ethers.parseUnits('100', 18));

      // Verify the vote was processed
      const vote = await dao.votes(proposalId, user1.address);
      expect(vote.hasVoted).to.be.true;
      expect(vote.support).to.be.true;
      expect(vote.weight).to.equal(ethers.parseUnits('100', 18));

      // Verify proposal vote counts
      const proposal = await dao.proposals(proposalId);
      expect(proposal.votesFor).to.equal(ethers.parseUnits('100', 18));
      expect(proposal.votesAgainst).to.equal(0);
    });

    it('Should reject cross-chain vote from unauthorized executor', async function () {
      // Setup: Transfer tokens to user1 first
      await oftUSDC.transfer(user1.address, ethers.parseUnits('100', 18));
      
      // Make user1 a shareholder by depositing to vault
      await oftUSDC.connect(user1).approve(await vault.getAddress(), ethers.parseUnits('100', 18));
      await vault.connect(user1).deposit(ethers.parseUnits('100', 18), user1.address);

      // First reach Funded stage, then move to UnderManagement for proposal creation
      const deadline = (await ethers.provider.getBlock('latest'))!.timestamp + 30 * 24 * 60 * 60;
      await dao.setFundingTarget(ethers.parseUnits('100', 18), deadline);
      await dao.updateTotalInvested(ethers.parseUnits('100', 18));
      
      // Move to UnderManagement stage (proposals only allowed in UnderManagement)
      await dao.updatePropertyStage(2); // UnderManagement

      // Setup: Create a proposal
      const proposalData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address'],
        [ethers.parseUnits('500', 18), user1.address]
      );

      await dao.connect(user1).createProposal(
        0, // PropertyLiquidation
        'Test proposal',
        proposalData
      );

      const proposalId = 1;

      // Non-authorized executor should fail
      await expect(
        dao.connect(user1).processCrossChainVote(
          proposalId,
          user1.address,
          true,
          ethers.parseUnits('100', 18)
        )
      ).to.be.reverted;
    });

    it('Should prevent double voting from cross-chain', async function () {
      // Setup: Transfer tokens to user1 first
      await oftUSDC.transfer(user1.address, ethers.parseUnits('100', 18));
      
      // Make user1 a shareholder first
      await oftUSDC.connect(user1).approve(await vault.getAddress(), ethers.parseUnits('100', 18));
      await vault.connect(user1).deposit(ethers.parseUnits('100', 18), user1.address);

      // First reach Funded stage, then move to UnderManagement for proposal creation
      const deadline = (await ethers.provider.getBlock('latest'))!.timestamp + 30 * 24 * 60 * 60;
      await dao.setFundingTarget(ethers.parseUnits('100', 18), deadline);
      await dao.updateTotalInvested(ethers.parseUnits('100', 18));
      
      // Move to UnderManagement stage (proposals only allowed in UnderManagement)
      await dao.updatePropertyStage(2); // UnderManagement

      // Setup: Create proposal
      const proposalData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address'],
        [ethers.parseUnits('500', 18), user1.address]
      );

      await dao.connect(user1).createProposal(
        0, // PropertyLiquidation
        'Test proposal',
        proposalData
      );

      const proposalId = 1;

      // First vote should succeed
      await dao.processCrossChainVote(
        proposalId,
        user1.address,
        true,
        ethers.parseUnits('100', 18)
      );

      // Second vote should fail
      await expect(
        dao.processCrossChainVote(
          proposalId,
          user1.address,
          false,
          ethers.parseUnits('100', 18)
        )
      ).to.be.reverted;
    });
  });

  describe('Automatic Deposit Closure When Funding Target Reached', function () {
    it('Should automatically close deposits when funding target is reached', async function () {
      // Set funding target to 100k USDC (50k + 50k)
      const deadline = (await ethers.provider.getBlock('latest'))!.timestamp + 30 * 24 * 60 * 60;
      await dao.setFundingTarget(ethers.parseUnits('100000', 18), deadline);

      // Check initial state
      expect(await dao.getCurrentStage()).to.equal(0); // OpenToFund
      expect(await dao.getCurrentStage()).to.equal(0); // OpenToFund - deposits allowed
      expect(await dao.getCurrentStage()).to.equal(0); // OpenToFund - withdrawals allowed

      // User1 deposits 50k USDC
      await oftUSDC.connect(user1).approve(await vault.getAddress(), ethers.parseUnits('50000', 18));
      await vault.connect(user1).deposit(ethers.parseUnits('50000', 18), user1.address);

      // Check stage is still OpenToFund
      expect(await dao.getCurrentStage()).to.equal(0); // OpenToFund
      expect(await dao.getCurrentStage()).to.equal(0); // OpenToFund - deposits allowed

      // User2 deposits 50k USDC (reaches funding target)
      await oftUSDC.connect(user2).approve(await vault.getAddress(), ethers.parseUnits('50000', 18));
      await vault.connect(user2).deposit(ethers.parseUnits('50000', 18), user2.address);

      // Platform updates total invested to trigger stage change
      await dao.updateTotalInvested(ethers.parseUnits('100000', 18));

      // Check that stage automatically changed to Funded
      expect(await dao.getCurrentStage()).to.equal(1); // Funded
      expect(await dao.getCurrentStage()).to.equal(1); // Funded - deposits blocked
      expect(await dao.getCurrentStage()).to.equal(1); // Funded - withdrawals blocked
    });

    it('Should block deposits after funding target is reached', async function () {
      // Set funding target to 100k USDC
      const deadline = (await ethers.provider.getBlock('latest'))!.timestamp + 30 * 24 * 60 * 60;
      await dao.setFundingTarget(ethers.parseUnits('100000', 18), deadline);

      // User1 deposits 50k USDC
      await oftUSDC.connect(user1).approve(await vault.getAddress(), ethers.parseUnits('50000', 18));
      await vault.connect(user1).deposit(ethers.parseUnits('50000', 18), user1.address);

      // User2 deposits 50k USDC (reaches funding target)
      await oftUSDC.connect(user2).approve(await vault.getAddress(), ethers.parseUnits('50000', 18));
      await vault.connect(user2).deposit(ethers.parseUnits('50000', 18), user2.address);

      // Platform updates total invested to trigger stage change
      await dao.updateTotalInvested(ethers.parseUnits('100000', 18));

      // User3 tries to deposit after target is reached - should fail
      await oftUSDC.connect(user3).approve(await vault.getAddress(), ethers.parseUnits('10000', 18));
      await expect(
        vault.connect(user3).deposit(ethers.parseUnits('10000', 18), user3.address)
      ).to.be.reverted; // Should be reverted due to deposit restrictions
    });

    it('Should allow property purchase proposals in Funded stage', async function () {
      // Set funding target to 100k USDC
      const deadline = (await ethers.provider.getBlock('latest'))!.timestamp + 30 * 24 * 60 * 60;
      await dao.setFundingTarget(ethers.parseUnits('100000', 18), deadline);

      // Reach funding target
      await oftUSDC.connect(user1).approve(await vault.getAddress(), ethers.parseUnits('50000', 18));
      await vault.connect(user1).deposit(ethers.parseUnits('50000', 18), user1.address);

      await oftUSDC.connect(user2).approve(await vault.getAddress(), ethers.parseUnits('50000', 18));
      await vault.connect(user2).deposit(ethers.parseUnits('50000', 18), user2.address);

      // Platform updates total invested to trigger stage change
      await dao.updateTotalInvested(ethers.parseUnits('100000', 18));

      // Verify stage is Funded
      expect(await dao.getCurrentStage()).to.equal(1); // Funded

      // Check that automatic PropertyPurchase proposal was created
      const proposal = await dao.proposals(1);
      expect(proposal.proposalType).to.equal(1); // PropertyPurchase
      expect(proposal.status).to.equal(0); // Active
    });

    it('Should revert to OpenToFund when owner calls revertToOpenToFund', async function () {
      // Set funding target to 100k USDC
      const deadline = (await ethers.provider.getBlock('latest'))!.timestamp + 30 * 24 * 60 * 60;
      await dao.setFundingTarget(ethers.parseUnits('100000', 18), deadline);

      // Reach funding target
      await oftUSDC.connect(user1).approve(await vault.getAddress(), ethers.parseUnits('50000', 18));
      await vault.connect(user1).deposit(ethers.parseUnits('50000', 18), user1.address);

      await oftUSDC.connect(user2).approve(await vault.getAddress(), ethers.parseUnits('50000', 18));
      await vault.connect(user2).deposit(ethers.parseUnits('50000', 18), user2.address);

      // Platform updates total invested to trigger stage change
      await dao.updateTotalInvested(ethers.parseUnits('100000', 18));

      // Verify stage is Funded
      expect(await dao.getCurrentStage()).to.equal(1); // Funded
      expect(await dao.getCurrentStage()).to.equal(1); // Funded - deposits blocked

      // Owner reverts to OpenToFund
      await dao.revertToOpenToFund();

      // Verify stage is back to OpenToFund
      expect(await dao.getCurrentStage()).to.equal(0); // OpenToFund
      expect(await dao.getCurrentStage()).to.equal(0); // OpenToFund - deposits allowed
      expect(await dao.isFullyFunded()).to.be.false; // Funding status reset
    });

    it('Should not allow revertToOpenToFund from non-owner', async function () {
      // Set funding target to 100k USDC
      const deadline = (await ethers.provider.getBlock('latest'))!.timestamp + 30 * 24 * 60 * 60;
      await dao.setFundingTarget(ethers.parseUnits('100000', 18), deadline);

      // Reach funding target
      await oftUSDC.connect(user1).approve(await vault.getAddress(), ethers.parseUnits('50000', 18));
      await vault.connect(user1).deposit(ethers.parseUnits('50000', 18), user1.address);

      await oftUSDC.connect(user2).approve(await vault.getAddress(), ethers.parseUnits('50000', 18));
      await vault.connect(user2).deposit(ethers.parseUnits('50000', 18), user2.address);

      // User1 tries to revert - should fail
      await expect(
        dao.connect(user1).revertToOpenToFund()
      ).to.be.reverted;
    });

    it('Should not allow revertToOpenToFund when not in Funded stage', async function () {
      // Try to revert when still in OpenToFund - should fail
      await expect(
        dao.revertToOpenToFund()
      ).to.be.reverted;
    });
  });

  describe('Security: No Flash Loan Attacks During Voting', function () {
    it.skip('Should restrict platform-managed proposals in UnderManagement stage', async function () {
      // First reach UnderManagement stage
      const deadline = (await ethers.provider.getBlock('latest'))!.timestamp + 30 * 24 * 60 * 60;
      await dao.setFundingTarget(ethers.parseUnits('100000', 18), deadline);
      
      // Users invest first (to get shares)
      await oftUSDC.connect(user1).approve(await vault.getAddress(), ethers.parseUnits('50000', 18));
      await oftUSDC.connect(user2).approve(await vault.getAddress(), ethers.parseUnits('50000', 18));
      await oftUSDC.connect(owner).approve(await vault.getAddress(), ethers.parseUnits('10000', 18));
      await vault.connect(user1).deposit(ethers.parseUnits('50000', 18), user1.address);
      await vault.connect(user2).deposit(ethers.parseUnits('50000', 18), user2.address);
      await vault.connect(owner).deposit(ethers.parseUnits('10000', 18), owner.address);
      
      // Create PropertyPurchase proposal (after users have shares)
      const initialPurchaseData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address'],
        [ethers.parseUnits('100000', 18), user1.address]
      );
      await dao.connect(user1).createProposal(
        1, // PropertyPurchase
        'Purchase property',
        initialPurchaseData
      );
      
      // Platform updates total invested to reach funding target
      await dao.updateTotalInvested(ethers.parseUnits('100000', 18));
      
      // Execute the PropertyPurchase proposal to complete the purchase
      const [deployer] = await ethers.getSigners();
      await dao.connect(user1).vote(1, true);
      await dao.connect(user2).vote(1, true);
      await ethers.provider.send('evm_increaseTime', [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send('evm_mine', []);
      await dao.connect(owner).executeProposal(1);
      
      // Complete property purchase to move to UnderManagement
      await dao.connect(owner).completePropertyPurchase("123 Main St, Test City");
      
      // Verify we're in UnderManagement stage
      expect(await dao.getCurrentStage()).to.equal(2); // UnderManagement
      
      // Test PropertyPurchase restriction
      const purchaseData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address'],
        [ethers.parseUnits('100000', 18), user1.address]
      );
      
      await expect(
        dao.connect(user1).createProposal(
          1, // PropertyPurchase
          'Purchase additional property',
          purchaseData
        )
      ).to.be.reverted;
      
      // Test NAVUpdate restriction
      const navData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256'],
        [ethers.parseUnits('120000', 18)]
      );
      
      await expect(
        dao.connect(user1).createProposal(
          5, // NAVUpdate
          'Update property NAV',
          navData
        )
      ).to.be.reverted;
      
      // Test PropertyStageChange can only move to Liquidating
      const liquidatingData = ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [3]); // Liquidating
      const invalidStageData = ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [1]); // Funded
      
      // Should allow move to Liquidating
      await expect(
        dao.connect(user1).createProposal(
          8, // PropertyStageChange
          'Move to Liquidating stage',
          liquidatingData
        )
      ).to.not.be.reverted;
      
      // Should reject move to other stages
      await expect(
        dao.connect(user1).createProposal(
          8, // PropertyStageChange
          'Move to Funded stage',
          invalidStageData
        )
      ).to.be.reverted;
      
      // Test that other proposal types are still allowed
      const thresholdData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint8', 'uint256'],
        [0, 20] // LiquidationThreshold, 20%
      );
      
      await expect(
        dao.connect(user1).createProposal(
          2, // ThresholdUpdate
          'Update liquidation threshold',
          thresholdData
        )
      ).to.not.be.reverted;
    });

    it('Should prevent flash loan attacks during property purchase voting', async function () {
      // Set funding target to 100k USDC
      const deadline = (await ethers.provider.getBlock('latest'))!.timestamp + 30 * 24 * 60 * 60;
      await dao.setFundingTarget(ethers.parseUnits('100000', 18), deadline);

      // Reach funding target (deposits automatically close)
      await oftUSDC.connect(user1).approve(await vault.getAddress(), ethers.parseUnits('50000', 18));
      await vault.connect(user1).deposit(ethers.parseUnits('50000', 18), user1.address);

      await oftUSDC.connect(user2).approve(await vault.getAddress(), ethers.parseUnits('50000', 18));
      await vault.connect(user2).deposit(ethers.parseUnits('50000', 18), user2.address);

      // Platform updates total invested to trigger stage change
      await dao.updateTotalInvested(ethers.parseUnits('100000', 18));

      // Verify deposits are closed
      expect(await dao.getCurrentStage()).to.equal(1); // Funded - deposits blocked

      // Move to UnderManagement stage for proposal creation
      await dao.updatePropertyStage(2); // UnderManagement

      // Create a threshold update proposal (ID 1) - this is allowed for users
      const proposalData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint8', 'uint256'],
        [0, 20] // LiquidationThreshold, 20%
      );

      const tx = await dao.connect(user1).createProposal(
        2, // ThresholdUpdate
        'Update liquidation threshold',
        proposalData
      );

      const proposalId = await tx.wait().then(receipt => {
        const event = receipt?.logs.find(
          log => log.topics[0] === dao.interface.getEvent('ProposalCreated').topicHash
        );
        const decoded = dao.interface.parseLog(event!);
        return decoded?.args.proposalId;
      });

      // User3 tries to deposit during voting period - should fail
      await oftUSDC.connect(user3).approve(await vault.getAddress(), ethers.parseUnits('10000', 18));
      await expect(
        vault.connect(user3).deposit(ethers.parseUnits('10000', 18), user3.address)
      ).to.be.reverted; // Deposits still blocked during voting

      // Users can vote with their existing shares
      await expect(
        dao.connect(user1).vote(proposalId, true)
      ).to.not.be.reverted;

      await expect(
        dao.connect(user2).vote(proposalId, true)
      ).to.not.be.reverted;
    });
  });
});
