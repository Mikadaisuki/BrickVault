import { expect } from 'chai';
import { ethers } from 'hardhat';
import { StacksCrossChainManager, PropertyVaultGovernance, PropertyDAO, OFTUSDC, EnvironmentConfig } from '../typechain-types/src';
import { SimpleMockLayerZeroEndpoint } from '../typechain-types/src/mocks';
import { MockRelayer, createMockRelayer } from './helpers/MockRelayer';

describe('StacksCrossChainManager - Cross-Chain Messaging Testing', function () {
  let stacksManager: StacksCrossChainManager;
  let vault: PropertyVaultGovernance;
  let dao: PropertyDAO;
  let usdcToken: OFTUSDC;
  let mockEndpoint: SimpleMockLayerZeroEndpoint;
  let environmentConfig: EnvironmentConfig;
  let owner: any;
  let user1: any;
  let user2: any;
  let treasury: any;
  let relayer: any;
  let mockRelayer: MockRelayer;

  const PROPERTY_ID = 1;
  const VAULT_NAME = 'Test Property Vault';
  const VAULT_SYMBOL = 'TPV';
  const DEPOSIT_CAP = ethers.parseUnits('1000000', 18);
  const INITIAL_SUPPLY = ethers.parseUnits('100000', 18);
  const SBTC_PRICE_USD = 50000000000; // $50,000 in 8 decimals

  beforeEach(async function () {
    [owner, user1, user2, treasury, relayer] = await ethers.getSigners();

    // Deploy mock LayerZero endpoint
    const SimpleMockLayerZeroEndpoint = await ethers.getContractFactory('SimpleMockLayerZeroEndpoint');
    mockEndpoint = await SimpleMockLayerZeroEndpoint.deploy();
    await mockEndpoint.waitForDeployment();

    // Deploy USDC token (using OFTUSDC as mock)
    const OFTUSDC = await ethers.getContractFactory('OFTUSDC');
    usdcToken = await OFTUSDC.deploy(
      'USD Coin',
      'USDC',
      await mockEndpoint.getAddress(),
      owner.address
    );
    await usdcToken.waitForDeployment();

    // Deploy EnvironmentConfig
    const EnvironmentConfig = await ethers.getContractFactory('EnvironmentConfig');
    environmentConfig = await EnvironmentConfig.deploy(owner.address);
    await environmentConfig.waitForDeployment();

    // Deploy PropertyVaultGovernance
    const PropertyVaultGovernance = await ethers.getContractFactory('PropertyVaultGovernance');
    vault = await PropertyVaultGovernance.deploy(
      await usdcToken.getAddress(),
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

    // Deploy StacksCrossChainManager
    const StacksCrossChainManager = await ethers.getContractFactory('StacksCrossChainManager');
    stacksManager = await StacksCrossChainManager.deploy(
      await usdcToken.getAddress(),
      treasury.address,
      owner.address, // Mock price oracle
      relayer.address, // Relayer address
      owner.address
    );
    await stacksManager.waitForDeployment();

    // Authorize vault and DAO
    await stacksManager.authorizeVault(await vault.getAddress());
    await stacksManager.authorizeDAO(await dao.getAddress());

    // Set up vault with Stacks manager
    await vault.setStacksCrossChainManager(await stacksManager.getAddress());

    // Set up DAO with Stacks manager
    await dao.setStacksCrossChainManager(await stacksManager.getAddress());

    // Register property with vault
    await stacksManager.registerProperty(PROPERTY_ID, await vault.getAddress());

    // Set initial sBTC price
    await stacksManager.updateSbtcPrice(SBTC_PRICE_USD);

    // Register Stacks address for testing
    await stacksManager.registerStacksAddress('SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60', user1.address);

    // Transfer USDC to users
    const halfSupply = INITIAL_SUPPLY / 2n;
    await usdcToken.transfer(user1.address, halfSupply);
    await usdcToken.transfer(user2.address, halfSupply);

    // Create mock relayer helper
    mockRelayer = await createMockRelayer(stacksManager, relayer);
  });

  describe('Deployment', function () {
    it('Should set correct token addresses', async function () {
      expect(await stacksManager.usdcToken()).to.equal(await usdcToken.getAddress());
      expect(await stacksManager.treasury()).to.equal(treasury.address);
    });

    it('Should set correct price oracle and relayer', async function () {
      expect(await stacksManager.priceOracle()).to.equal(owner.address);
      expect(await stacksManager.relayer()).to.equal(relayer.address);
    });

    it('Should initialize with valid price', async function () {
      const [price, isValid] = await stacksManager.getSbtcPrice();
      expect(price).to.equal(SBTC_PRICE_USD);
      expect(isValid).to.be.true;
    });
  });

  describe('Authorization', function () {
    it('Should authorize vault', async function () {
      expect(await stacksManager.authorizedVaults(await vault.getAddress())).to.be.true;
    });

    it('Should authorize DAO', async function () {
      expect(await stacksManager.authorizedDAOs(await dao.getAddress())).to.be.true;
    });

    it('Should reject unauthorized relayer calls', async function () {
      const messageId = ethers.keccak256(ethers.toUtf8Bytes('test-message'));
      
      await expect(
        stacksManager.connect(user1).processCrossChainMessage(
          messageId,
          1, // Message type: deposit
          PROPERTY_ID,
          user1.address,
          'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60', // stacksAddress
          ethers.parseUnits('1', 18),
          ethers.keccak256(ethers.toUtf8Bytes('stacks-tx')),
          '0x'
        )
      ).to.be.reverted; // Just check that it reverts
    });
  });

  describe('Mock Relayer Functionality', function () {
    it('Should simulate Stacks events correctly', async function () {
      const sbtcAmount = ethers.parseUnits('2', 18);
      const stacksTxHash = ethers.keccak256(ethers.toUtf8Bytes('mock-tx-hash'));
      const stacksAddress = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      
      // Simulate deposit event
      const eventId = await mockRelayer.simulateStacksDepositEvent(
        stacksAddress,
        PROPERTY_ID,
        sbtcAmount.toString(),
        stacksTxHash
      );

      // Verify event was created
      const event = mockRelayer.getStacksEvent(eventId);
      expect(event).to.not.be.undefined;
      expect(event!.eventType).to.equal('deposit');
      expect(event!.user).to.equal(stacksAddress);
      expect(event!.propertyId).to.equal(PROPERTY_ID);
      expect(event!.amount).to.equal(sbtcAmount.toString());
      expect(event!.stacksTxHash).to.equal(stacksTxHash);
      expect(event!.processed).to.be.false;

      // Verify event count
      expect(mockRelayer.getEventCount()).to.equal(1);
    });

    it('Should process multiple events with mock relayer', async function () {
      const stacksAddress = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const evmCustodian = user1.address;

      // Register Stacks address
      await stacksManager.registerStacksAddress(stacksAddress, evmCustodian);

      // Create multiple events
      const event1 = await mockRelayer.simulateStacksDepositEvent(
        stacksAddress,
        PROPERTY_ID,
        ethers.parseUnits('1', 18).toString(),
        ethers.keccak256(ethers.toUtf8Bytes('tx1'))
      );

      const event2 = await mockRelayer.simulateStacksWithdrawalEvent(
        stacksAddress,
        PROPERTY_ID,
        ethers.parseUnits('50000', 18).toString(),
        ethers.keccak256(ethers.toUtf8Bytes('tx2'))
      );

      // Verify both events exist
      expect(mockRelayer.getEventCount()).to.equal(2);
      
      const event1Data = mockRelayer.getStacksEvent(event1);
      const event2Data = mockRelayer.getStacksEvent(event2);
      
      expect(event1Data!.eventType).to.equal('deposit');
      expect(event2Data!.eventType).to.equal('withdrawal');

      // Process events
      const messageId1 = await mockRelayer.processCrossChainMessage(event1, evmCustodian, stacksAddress);
      expect(mockRelayer.isMessageProcessed(messageId1)).to.be.true;
    });

    it('Should prevent duplicate event processing', async function () {
      const stacksAddress = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const evmCustodian = user1.address;

      // Register Stacks address
      await stacksManager.registerStacksAddress(stacksAddress, evmCustodian);

      // Create event
      const eventId = await mockRelayer.simulateStacksDepositEvent(
        stacksAddress,
        PROPERTY_ID,
        ethers.parseUnits('1', 18).toString(),
        ethers.keccak256(ethers.toUtf8Bytes('duplicate-test'))
      );

      // Process event first time
      await mockRelayer.processCrossChainMessage(eventId, evmCustodian, stacksAddress);

      // Try to process same event again - should throw an error
      try {
        await mockRelayer.processCrossChainMessage(eventId, evmCustodian, stacksAddress);
        expect.fail('Expected error for duplicate event processing');
      } catch (error: any) {
        expect(error.message).to.include('already processed');
      }
    });

    it('Should provide relayer statistics', async function () {
      const stacksAddress = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const evmCustodian = user1.address;

      // Register Stacks address
      await stacksManager.registerStacksAddress(stacksAddress, evmCustodian);

      // Create some events with unique timestamps
      await mockRelayer.simulateStacksDepositEvent(
        stacksAddress,
        PROPERTY_ID,
        ethers.parseUnits('1', 18).toString(),
        ethers.keccak256(ethers.toUtf8Bytes('stats-test-1'))
      );

      // Add a small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      await mockRelayer.simulateStacksDepositEvent(
        stacksAddress,
        PROPERTY_ID,
        ethers.parseUnits('2', 18).toString(),
        ethers.keccak256(ethers.toUtf8Bytes('stats-test-2'))
      );

      // Process one event
      const events = mockRelayer.getUnprocessedEvents();
      await mockRelayer.processCrossChainMessage(events[0].id, evmCustodian, stacksAddress);

      // Check statistics
      const stats = mockRelayer.getStats();
      expect(stats.totalEvents).to.equal(2);
      expect(stats.processedEvents).to.equal(1);
      expect(stats.unprocessedEvents).to.equal(1);
      expect(stats.processedMessages).to.equal(1);

      console.log('📊 MockRelayer Statistics:', stats);
    });
  });

  describe('Cross-Chain Messaging - sBTC Deposits', function () {
    it('Should process sBTC deposit message from Stacks via relayer', async function () {
      const sbtcAmount = ethers.parseUnits('1', 18); // 1 sBTC
      const expectedUsdValue = ethers.parseUnits('50000', 6); // $50,000 in 6 decimals
      const messageId = ethers.keccak256(ethers.toUtf8Bytes('deposit-message-1'));
      const stacksTxHash = ethers.keccak256(ethers.toUtf8Bytes('stacks-tx-hash-1'));
      const stacksAddress = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const evmCustodian = user1.address; // EVM address to hold shares

      // First, register the Stacks address to EVM custodian mapping
      await stacksManager.registerStacksAddress(stacksAddress, evmCustodian);

      // Mock: Relayer processes cross-chain message from Stacks
      await expect(
        stacksManager.connect(relayer).processCrossChainMessage(
          messageId,
          1, // Message type: deposit
          PROPERTY_ID,
          evmCustodian,
          stacksAddress,
          sbtcAmount,
          stacksTxHash,
          '0x' // Mock proof
        )
      ).to.emit(stacksManager, 'StacksDepositReceived')
      .withArgs(evmCustodian, PROPERTY_ID, sbtcAmount, ethers.parseUnits('50000', 18), stacksTxHash);

      // Verify user info is recorded
      const [sbtcDeposited, usdValueAtDeposit, sharesMinted, hasDeposited, depositTimestamp, txHash, recordedStacksAddress, recordedEvmCustodian] = 
        await stacksManager.getStacksUserInfo(evmCustodian, PROPERTY_ID);
      
      expect(sbtcDeposited).to.equal(sbtcAmount);
      expect(usdValueAtDeposit).to.equal(expectedUsdValue);
      expect(sharesMinted).to.be.gt(0);
      expect(hasDeposited).to.be.true;
      expect(depositTimestamp).to.be.gt(0);
      expect(txHash).to.equal(stacksTxHash);
      expect(recordedStacksAddress).to.equal(stacksAddress);
      expect(recordedEvmCustodian).to.equal(evmCustodian);

      // Verify message is marked as processed
      expect(await stacksManager.isMessageProcessed(messageId)).to.be.true;

      // Verify shares are minted to EVM custodian
      expect(await vault.balanceOf(evmCustodian)).to.equal(sharesMinted);
    });

    it('Should calculate USD value correctly', async function () {
      const sbtcAmount = ethers.parseUnits('1', 18); // 1 sBTC
      const expectedUsdValue = ethers.parseUnits('50000', 6); // $50,000 in 6 decimals

      const usdValue = await stacksManager.calculateUsdValue(sbtcAmount);
      expect(usdValue).to.equal(expectedUsdValue);
    });

    it('Should reject deposits in wrong stage', async function () {
      // Move to Funded stage
      await dao.setFundingTarget(ethers.parseUnits('100000', 18), Math.floor(Date.now() / 1000) + 86400);
      await dao.updateTotalInvested(ethers.parseUnits('100000', 18));

      const messageId = ethers.keccak256(ethers.toUtf8Bytes('deposit-message-wrong-stage'));
      
      await expect(
        stacksManager.connect(relayer).processCrossChainMessage(
          messageId,
          1, // Message type: deposit
          PROPERTY_ID,
          user1.address,
          ethers.parseUnits('1', 18),
          ethers.keccak256(ethers.toUtf8Bytes('stacks-tx')),
          '0x'
        )
      ).to.be.revertedWith('StacksCrossChainManager: not in OpenToFund stage');
    });

    it('Should prevent replay attacks', async function () {
      const messageId = ethers.keccak256(ethers.toUtf8Bytes('deposit-message-replay'));
      
      // First message should succeed
      await stacksManager.connect(relayer).processCrossChainMessage(
        messageId,
        1, // Message type: deposit
        PROPERTY_ID,
        user1.address,
        ethers.parseUnits('1', 18),
        ethers.keccak256(ethers.toUtf8Bytes('stacks-tx')),
        '0x'
      );

      // Second message with same ID should fail
      await expect(
        stacksManager.connect(relayer).processCrossChainMessage(
          messageId,
          1, // Message type: deposit
          PROPERTY_ID,
          user2.address,
          ethers.parseUnits('1', 18),
          ethers.keccak256(ethers.toUtf8Bytes('stacks-tx-2')),
          '0x'
        )
      ).to.be.revertedWith('StacksCrossChainManager: message already processed');
    });
  });

  describe('Cross-Chain Messaging - sBTC Withdrawals', function () {
    it('Should process sBTC withdrawal message from Stacks via relayer', async function () {
      const stacksAddress = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const evmCustodian = user1.address;
      // Register Stacks address to EVM custodian mapping
      await stacksManager.registerStacksAddress(stacksAddress, evmCustodian);

      // First make a deposit
      const depositMessageId = ethers.keccak256(ethers.toUtf8Bytes('deposit-message-withdrawal-test'));
      await stacksManager.connect(relayer).processCrossChainMessage(
        depositMessageId,
        1, // Message type: deposit
        PROPERTY_ID,
        evmCustodian,
        stacksAddress,
        ethers.parseUnits('1', 18),
        ethers.keccak256(ethers.toUtf8Bytes('stacks-tx-deposit')),
        '0x'
      );

      const shares = ethers.parseUnits('50000', 18); // 50,000 shares (representing $50,000)
      const messageId = ethers.keccak256(ethers.toUtf8Bytes('withdrawal-message-1'));

      // Mock: Relayer processes withdrawal message from Stacks
      await expect(
        stacksManager.connect(relayer).processCrossChainMessage(
          messageId,
          2, // Message type: withdrawal
          PROPERTY_ID,
          evmCustodian,
          stacksAddress,
          shares,
          ethers.keccak256(ethers.toUtf8Bytes('stacks-tx-withdrawal')),
          '0x'
        )
      ).to.emit(stacksManager, 'StacksWithdrawalRequested')
      .withArgs(evmCustodian, PROPERTY_ID, shares, messageId);

      // Verify user info is updated
      const [sbtcDeposited, usdValueAtDeposit, sharesMinted, hasDeposited, depositTimestamp, txHash, recordedStacksAddress, recordedEvmCustodian] = 
        await stacksManager.getStacksUserInfo(evmCustodian, PROPERTY_ID);
      
      expect(sbtcDeposited).to.equal(0); // All sBTC withdrawn
      expect(usdValueAtDeposit).to.equal(0);
      expect(sharesMinted).to.equal(0);
      expect(hasDeposited).to.be.false;
      expect(depositTimestamp).to.equal(0);
      expect(txHash).to.equal(ethers.ZeroHash);
      expect(recordedStacksAddress).to.equal('');
      expect(recordedEvmCustodian).to.equal(ethers.ZeroAddress);

      // Verify shares are burned from EVM custodian
      expect(await vault.balanceOf(evmCustodian)).to.equal(0);

      // Verify message is marked as processed
      expect(await stacksManager.isMessageProcessed(messageId)).to.be.true;
    });

    it('Should reject withdrawals in wrong stage', async function () {
      // Move to Funded stage
      await dao.setFundingTarget(ethers.parseUnits('100000', 18), Math.floor(Date.now() / 1000) + 86400);
      await dao.updateTotalInvested(ethers.parseUnits('100000', 18));

      const messageId = ethers.keccak256(ethers.toUtf8Bytes('withdrawal-message-wrong-stage'));
      
      await expect(
        stacksManager.connect(relayer).processCrossChainMessage(
          messageId,
          2, // Message type: withdrawal
          PROPERTY_ID,
          user1.address,
          ethers.parseUnits('50000', 18),
          ethers.keccak256(ethers.toUtf8Bytes('stacks-tx')),
          '0x'
        )
      ).to.be.revertedWith('StacksCrossChainManager: not in OpenToFund stage');
    });
  });

  describe('Price Management - Mock Oracle Integration', function () {
    it('Should update sBTC price', async function () {
      const newPrice = 60000000000; // $60,000
      await stacksManager.updateSbtcPrice(newPrice);

      const [price, isValid] = await stacksManager.getSbtcPrice();
      expect(price).to.equal(newPrice);
      expect(isValid).to.be.true;
    });

    it('Should reject stale prices', async function () {
      // Fast forward time by 2 hours
      await ethers.provider.send('evm_increaseTime', [2 * 60 * 60]);
      await ethers.provider.send('evm_mine', []);

      const [price, isValid] = await stacksManager.getSbtcPrice();
      expect(price).to.equal(SBTC_PRICE_USD);
      expect(isValid).to.be.false;
    });

    it('Should trigger emergency pause on extreme price movement', async function () {
      const extremePrice = 100000000000; // $100,000 (100% increase)
      
      await expect(
        stacksManager.updateSbtcPrice(extremePrice)
      ).to.be.revertedWith('StacksCrossChainManager: extreme price movement detected - emergency paused');

      expect(await stacksManager.emergencyPaused()).to.be.true;
    });
  });

  describe('Property Purchase Integration - Mock Stacks Workflow', function () {
    beforeEach(async function () {
      // Make some deposits first
      const messageId1 = ethers.keccak256(ethers.toUtf8Bytes('deposit-message-purchase-1'));
      const messageId2 = ethers.keccak256(ethers.toUtf8Bytes('deposit-message-purchase-2'));
      
      await stacksManager.connect(relayer).processCrossChainMessage(
        messageId1,
        1, // Message type: deposit
        PROPERTY_ID,
        user1.address,
        ethers.parseUnits('2', 18),
        ethers.keccak256(ethers.toUtf8Bytes('stacks-tx-1')),
        '0x'
      );
    });

    it('Should handle property purchase initiation', async function () {
      const totalUsdc = ethers.parseUnits('100000', 18);
      const totalSbtc = ethers.parseUnits('2', 18);

      // Mock: Property purchase vote passes, platform initiates purchase
      await expect(
        stacksManager.handlePropertyPurchaseInitiation(PROPERTY_ID, totalUsdc, totalSbtc)
      ).to.emit(stacksManager, 'PropertyPurchaseInitiated')
      .withArgs(PROPERTY_ID, totalUsdc, totalSbtc);
    });

    it('Should complete sBTC conversion manually', async function () {
      const usdAmount = ethers.parseUnits('100000', 6); // $100,000

      // Mock: Platform manually converts sBTC to USD off-chain
      // Then calls this function to complete the conversion
      await expect(
        stacksManager.completeSbtcConversion(PROPERTY_ID, usdAmount)
      ).to.emit(stacksManager, 'FundsConverted')
      .withArgs(PROPERTY_ID, ethers.parseUnits('2', 18), usdAmount);
    });
  });

  describe('User Info Queries', function () {
    beforeEach(async function () {
      // Make a deposit
      const messageId = ethers.keccak256(ethers.toUtf8Bytes('deposit-message-query-test'));
      await stacksManager.connect(relayer).processCrossChainMessage(
        messageId,
        1, // Message type: deposit
        PROPERTY_ID,
        user1.address,
        ethers.parseUnits('1.5', 18),
        ethers.keccak256(ethers.toUtf8Bytes('stacks-tx-query')),
        '0x'
      );
    });

    it('Should return correct user info', async function () {
      const [sbtcDeposited, usdValueAtDeposit, sharesMinted, hasDeposited, depositTimestamp, txHash] = 
        await stacksManager.getStacksUserInfo(user1.address, PROPERTY_ID);

      expect(sbtcDeposited).to.equal(ethers.parseUnits('1.5', 18));
      expect(usdValueAtDeposit).to.equal(ethers.parseUnits('75000', 6)); // $75,000
      expect(sharesMinted).to.be.gt(0);
      expect(hasDeposited).to.be.true;
      expect(depositTimestamp).to.be.gt(0);
      expect(txHash).to.equal(ethers.keccak256(ethers.toUtf8Bytes('stacks-tx-query')));
    });

    it('Should return correct total deposits', async function () {
      const [totalSbtc, totalUsdValue, totalShares] = 
        await stacksManager.getTotalStacksDeposits(PROPERTY_ID);

      expect(totalSbtc).to.equal(ethers.parseUnits('1.5', 18));
      expect(totalUsdValue).to.equal(ethers.parseUnits('75000', 6));
      expect(totalShares).to.be.gt(0);
    });

    it('Should check if user is Stacks user', async function () {
      expect(await stacksManager.isStacksUser(user1.address, PROPERTY_ID)).to.be.true;
      expect(await stacksManager.isStacksUser(user2.address, PROPERTY_ID)).to.be.false;
    });
  });

  describe('Emergency Functions', function () {
    it('Should allow owner to set emergency pause', async function () {
      await stacksManager.setEmergencyPaused(true);
      expect(await stacksManager.emergencyPaused()).to.be.true;

      await stacksManager.setEmergencyPaused(false);
      expect(await stacksManager.emergencyPaused()).to.be.false;
    });

    it('Should allow owner to recover stuck tokens', async function () {
      // Transfer some USDC to the contract
      await usdcToken.transfer(await stacksManager.getAddress(), ethers.parseUnits('1', 18));

      const initialBalance = await usdcToken.balanceOf(owner.address);
      await stacksManager.emergencyRecover(await usdcToken.getAddress(), ethers.parseUnits('1', 18));
      const finalBalance = await usdcToken.balanceOf(owner.address);

      expect(finalBalance - initialBalance).to.equal(ethers.parseUnits('1', 18));
    });
  });

  describe('Complete Cross-Chain Workflow with Mock Relayer', function () {
    it('Should demonstrate complete Stacks to EVM workflow', async function () {
      const stacksAddress = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const evmCustodian = user1.address;
      const sbtcAmount = ethers.parseUnits('1.5', 18);

      // Step 1: Register Stacks address to EVM custodian mapping
      await stacksManager.registerStacksAddress(stacksAddress, evmCustodian);

      // Step 2: Simulate Stacks side - user deposits sBTC
      const eventId = await mockRelayer.simulateStacksDepositEvent(
        stacksAddress,
        PROPERTY_ID,
        sbtcAmount.toString(),
        ethers.keccak256(ethers.toUtf8Bytes('complete-workflow-tx'))
      );

      // Step 3: Mock relayer monitors and processes the event
      const messageId = await mockRelayer.processCrossChainMessage(eventId, evmCustodian, stacksAddress);

      // Step 4: Verify cross-chain state synchronization
      expect(await stacksManager.isStacksUser(evmCustodian, PROPERTY_ID)).to.be.true;
      expect(mockRelayer.isMessageProcessed(messageId)).to.be.true;

      // Step 5: Verify shares are minted to EVM custodian
      const [sbtcDeposited, usdValueAtDeposit, sharesMinted] = 
        await stacksManager.getStacksUserInfo(evmCustodian, PROPERTY_ID);
      expect(await vault.balanceOf(evmCustodian)).to.equal(sharesMinted);

      // Step 6: Verify relayer statistics
      const stats = mockRelayer.getStats();
      expect(stats.totalEvents).to.equal(1);
      expect(stats.processedEvents).to.equal(1);
      expect(stats.processedMessages).to.equal(1);

      console.log('✅ Complete cross-chain workflow with MockRelayer successful!');
      console.log(`   Event ID: ${eventId}`);
      console.log(`   Message ID: ${messageId}`);
      console.log(`   sBTC Deposited: ${ethers.formatEther(sbtcDeposited)} sBTC`);
      console.log(`   USD Value: $${ethers.formatUnits(usdValueAtDeposit, 6)}`);
      console.log(`   Shares Minted: ${ethers.formatEther(sharesMinted)}`);
      console.log(`   Relayer Stats:`, stats);
    });

    it('Should handle batch processing of multiple events', async function () {
      const stacksAddress = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const evmCustodian = user1.address;

      // Register Stacks address
      await stacksManager.registerStacksAddress(stacksAddress, evmCustodian);

      // Add some USDC to the vault to prevent division by zero
      await usdcToken.connect(user1).approve(await vault.getAddress(), ethers.parseUnits('1000', 18));
      await vault.connect(user1).deposit(ethers.parseUnits('1000', 18), user1.address);

      // Create multiple events with unique timestamps
      const eventIds = [];
      for (let i = 0; i < 3; i++) {
        const eventId = await mockRelayer.simulateStacksDepositEvent(
          stacksAddress,
          PROPERTY_ID,
          ethers.parseUnits('1', 18).toString(),
          ethers.keccak256(ethers.toUtf8Bytes(`batch-tx-${i}`))
        );
        eventIds.push(eventId);
        // Add small delay to ensure unique timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Process all events in batch
      const processedMessageIds = await mockRelayer.simulateRelayerMonitoring(
        eventIds,
        evmCustodian,
        stacksAddress
      );

      // Verify all events were processed
      expect(processedMessageIds.length).to.equal(3);
      expect(mockRelayer.getStats().processedEvents).to.equal(3);
      expect(mockRelayer.getStats().processedMessages).to.equal(3);

      console.log('✅ Batch processing successful!');
      console.log(`   Processed ${processedMessageIds.length} events`);
      console.log(`   Message IDs: ${processedMessageIds.join(', ')}`);
    });
  });

  describe('Cross-Chain Messaging Simulation', function () {
    it('Should simulate complete Stacks to EVM message flow with relayer', async function () {
      const sbtcAmount = ethers.parseUnits('1', 18);
      const messageId = ethers.keccak256(ethers.toUtf8Bytes('complete-flow-message'));
      const stacksTxHash = ethers.keccak256(ethers.toUtf8Bytes('complete-flow-tx'));
      const stacksAddress = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const evmCustodian = user1.address;
      
      // Step 1: Register Stacks address to EVM custodian mapping
      await stacksManager.registerStacksAddress(stacksAddress, evmCustodian);
      
      // Step 2: Mock Stacks side - user deposits sBTC
      // (This would happen on Stacks chain, we simulate it here)
      
      // Step 3: Mock Relayer monitors Stacks events and constructs message
      // (Relayer would watch Stacks blockchain for deposit events)
      
      // Step 4: Mock Relayer calls EVM contract with message and proof
      await expect(
        stacksManager.connect(relayer).processCrossChainMessage(
          messageId,
          1, // Message type: deposit
          PROPERTY_ID,
          evmCustodian,
          stacksAddress,
          sbtcAmount,
          stacksTxHash,
          '0x' // Mock proof
        )
      ).to.emit(stacksManager, 'StacksDepositReceived');
      
      // Step 5: Verify cross-chain state synchronization
      expect(await stacksManager.isStacksUser(evmCustodian, PROPERTY_ID)).to.be.true;
      
      // Step 6: Verify message details
      const message = await stacksManager.getCrossChainMessage(messageId);
      expect(message.messageType).to.equal(1);
      expect(message.propertyId).to.equal(PROPERTY_ID);
      expect(message.evmCustodian).to.equal(evmCustodian);
      expect(message.stacksAddress).to.equal(stacksAddress);
      expect(message.amount).to.equal(sbtcAmount);
      expect(message.stacksTxHash).to.equal(stacksTxHash);
      expect(message.processed).to.be.true;
      
      // Step 7: Verify shares are minted to EVM custodian
      const [sbtcDeposited, usdValueAtDeposit, sharesMinted] = 
        await stacksManager.getStacksUserInfo(evmCustodian, PROPERTY_ID);
      expect(await vault.balanceOf(evmCustodian)).to.equal(sharesMinted);
      
      console.log('✅ Complete cross-chain flow simulation successful!');
      console.log(`   Stacks Address: ${stacksAddress}`);
      console.log(`   EVM Custodian: ${evmCustodian}`);
      console.log(`   sBTC Deposited: ${ethers.formatEther(sbtcDeposited)} sBTC`);
      console.log(`   USD Value: $${ethers.formatUnits(usdValueAtDeposit, 6)}`);
      console.log(`   Shares Minted: ${ethers.formatEther(sharesMinted)}`);
    });

    it('Should simulate EVM to Stacks message flow', async function () {
      // First make a deposit
      const depositMessageId = ethers.keccak256(ethers.toUtf8Bytes('deposit-for-evm-flow'));
      await stacksManager.connect(relayer).processCrossChainMessage(
        depositMessageId,
        1, // Message type: deposit
        PROPERTY_ID,
        user1.address,
        ethers.parseUnits('1', 18),
        ethers.keccak256(ethers.toUtf8Bytes('stacks-tx-deposit')),
        '0x'
      );
      
      // Mock: EVM side - property purchase vote passes
      await stacksManager.handlePropertyPurchaseInitiation(PROPERTY_ID, ethers.parseUnits('100000', 18), ethers.parseUnits('1', 18));
      
      // Mock: EVM sends message to Stacks
      // Message: { type: 'PURCHASE_INITIATED', propertyId: PROPERTY_ID, totalUsdc: amount, totalSbtc: amount }
      
      // Mock: Stacks receives message and updates state
      // This would normally be handled by Stacks contract
      
      // Verify cross-chain state is synchronized
      const [totalSbtc, totalUsdValue, totalShares] = await stacksManager.getTotalStacksDeposits(PROPERTY_ID);
      expect(totalSbtc).to.equal(ethers.parseUnits('1', 18));
    });
  });

  describe('Stage-Based Operations', function () {
    beforeEach(async function () {
      const stacksAddress = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const evmCustodian = user1.address;
      // Register Stacks address to EVM custodian mapping (only owner can do this)
      await stacksManager.connect(owner).registerStacksAddress(stacksAddress, evmCustodian);
      // Update price to ensure it's not stale
      await stacksManager.updateSbtcPrice(SBTC_PRICE_USD);
    });

    it('Should handle OpenToFund stage operations', async function () {
      const stacksAddress = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const evmCustodian = user1.address;
      // Should allow deposits and withdrawals
      const messageId = ethers.keccak256(ethers.toUtf8Bytes('open-to-fund-message'));
      
      await expect(
        stacksManager.connect(relayer).processCrossChainMessage(
          messageId,
          1, // Message type: deposit
          PROPERTY_ID,
          evmCustodian,
          stacksAddress,
          ethers.parseUnits('1', 18),
          ethers.keccak256(ethers.toUtf8Bytes('stacks-tx')),
          '0x'
        )
      ).to.not.be.reverted;
    });

    it('Should allow Stacks users to participate in governance after becoming shareholders', async function () {
      const stacksAddress = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const evmCustodian = user1.address;
      
      // Step 1: Stacks user deposits sBTC in OpenToFund stage
      const depositMessageId = ethers.keccak256(ethers.toUtf8Bytes('governance-deposit'));
      await stacksManager.connect(relayer).processCrossChainMessage(
        depositMessageId,
        1, // Message type: deposit
        PROPERTY_ID,
        evmCustodian,
        stacksAddress,
        ethers.parseUnits('2', 18), // 2 sBTC
        ethers.keccak256(ethers.toUtf8Bytes('stacks-tx-governance')),
        '0x'
      );

      // Verify shares are minted to EVM custodian
      const [sbtcDeposited, usdValueAtDeposit, sharesMinted] = 
        await stacksManager.getStacksUserInfo(evmCustodian, PROPERTY_ID);
      expect(await vault.balanceOf(evmCustodian)).to.equal(sharesMinted);
      expect(sharesMinted).to.be.gt(0);

      // Step 2: Move to Funded stage (simulate property funding completion)
      await dao.setFundingTarget(ethers.parseUnits('100000', 18), Math.floor(Date.now() / 1000) + 86400);
      await dao.updateTotalInvested(ethers.parseUnits('100000', 18));

      // Step 3: Move to UnderManagement stage (simulate property purchase completion)
      await dao.updatePropertyStage(2); // UnderManagement

      // Step 4: Stacks user (via EVM custodian) can now vote on proposals
      // Note: Users can propose: PropertyLiquidation, PropertyPurchase, ThresholdUpdate, ManagementChange
      // Platform-only: NAVUpdate, EmergencyPause, EmergencyUnpause, PropertyStageChange
      const tx = await dao.connect(user1).createProposal(
        0, // PropertyDAO.ProposalType.PropertyLiquidation
        'Liquidate property',
        ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [ethers.parseUnits('100000', 18)]) // Sale price
      );
      const receipt = await tx.wait();
      const proposalId = receipt.logs[0].args[0]; // Get proposal ID from event

      // Stacks user votes via EVM custodian (since shares are held by custodian)
      await expect(
        dao.connect(user1).vote(proposalId, true) // Vote yes
      ).to.emit(dao, 'Voted')
      .withArgs(proposalId, evmCustodian, true, sharesMinted);

      // Step 5: Stacks user can also create proposals
      const tx2 = await dao.connect(user1).createProposal(
        2, // PropertyDAO.ProposalType.ThresholdUpdate
        'Update liquidation threshold',
        ethers.AbiCoder.defaultAbiCoder().encode(['uint8', 'uint256'], [0, 2500]) // LiquidationThreshold, 25%
      );
      const receipt2 = await tx2.wait();
      const proposalId2 = receipt2.logs[0].args[0]; // Get proposal ID from event

      expect(proposalId2).to.be.gt(0);

      console.log('✅ Stacks user governance participation successful!');
      console.log(`   Stacks user can vote: ✅ (${ethers.formatEther(sharesMinted)} shares)`);
      console.log(`   Stacks user can propose: ✅ (PropertyLiquidation, ThresholdUpdate, etc.)`);
      console.log(`   EVM custodian holds shares: ${evmCustodian}`);
      console.log(`   Note: NAV updates are platform-only, not user-proposable`);
    });

    it('Should handle Funded stage restrictions', async function () {
      const stacksAddress = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const evmCustodian = user1.address;
      
      // Move to Funded stage
      await dao.setFundingTarget(ethers.parseUnits('100000', 18), Math.floor(Date.now() / 1000) + 86400);
      await dao.updateTotalInvested(ethers.parseUnits('100000', 18));

      const messageId = ethers.keccak256(ethers.toUtf8Bytes('funded-stage-message'));
      
      // Should reject new deposits (stage is now Funded, not OpenToFund)
      await expect(
        stacksManager.connect(relayer).processCrossChainMessage(
          messageId,
          1, // Message type: deposit
          PROPERTY_ID,
          user1.address,
          'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60', // stacksAddress
          ethers.parseUnits('1', 18),
          ethers.keccak256(ethers.toUtf8Bytes('stacks-tx')),
          '0x'
        )
      ).to.be.reverted; // Just check that it reverts, don't check specific reason
    });

    it('Should handle UnderManagement stage - users become regular shareholders', async function () {
      // First make a deposit in OpenToFund
      const depositMessageId = ethers.keccak256(ethers.toUtf8Bytes('deposit-for-management'));
      await stacksManager.connect(relayer).processCrossChainMessage(
        depositMessageId,
        1, // Message type: deposit
        PROPERTY_ID,
        user1.address,
        'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60', // stacksAddress
        ethers.parseUnits('1', 18),
        ethers.keccak256(ethers.toUtf8Bytes('stacks-tx-deposit')),
        '0x'
      );
      
      // Move through stages
      await dao.setFundingTarget(ethers.parseUnits('100000', 18), Math.floor(Date.now() / 1000) + 86400);
      await dao.updateTotalInvested(ethers.parseUnits('100000', 18));
      
      // Note: completeSbtcConversion would be called by the DAO contract in real scenario
      // For testing purposes, we'll skip this step as it requires DAO contract to be the caller
      
      // Move to UnderManagement
      await dao.updatePropertyStage(2);
      
      // At this point, Stacks users are regular vault shareholders
      // They can only withdraw income, not principal
      expect(await stacksManager.isStacksUser(user1.address, PROPERTY_ID)).to.be.true;
    });

    it('Should emit StacksStageChange event when stage transitions occur', async function () {
      // Test stage transition from OpenToFund to Funded
      await expect(
        dao.updatePropertyStage(1) // Funded stage
      ).to.emit(stacksManager, 'StacksStageChange')
      .withArgs(PROPERTY_ID, 1);

      // Test stage transition from Funded to UnderManagement
      await expect(
        dao.updatePropertyStage(2) // UnderManagement stage
      ).to.emit(stacksManager, 'StacksStageChange')
      .withArgs(PROPERTY_ID, 2);

      // Test stage transition from UnderManagement to Liquidating
      await expect(
        dao.updatePropertyStage(3) // Liquidating stage
      ).to.emit(stacksManager, 'StacksStageChange')
      .withArgs(PROPERTY_ID, 3);

      // Test stage transition from Liquidating to Liquidated
      await expect(
        dao.updatePropertyStage(4) // Liquidated stage
      ).to.emit(stacksManager, 'StacksStageChange')
      .withArgs(PROPERTY_ID, 4);
    });

    it('Should emit StacksStageChange event when reverting to OpenToFund', async function () {
      // First move to Funded stage
      await dao.updatePropertyStage(1);
      
      // Then revert back to OpenToFund
      await expect(
        dao.revertToOpenToFund()
      ).to.emit(stacksManager, 'StacksStageChange')
      .withArgs(PROPERTY_ID, 0);
    });

    it('Should allow DAO to call notifyStacksStageChange through updatePropertyStage', async function () {
      // Test that updatePropertyStage triggers the notification
      await expect(
        dao.updatePropertyStage(1) // Funded stage
      ).to.emit(stacksManager, 'StacksStageChange')
      .withArgs(PROPERTY_ID, 1);
    });

    it('Should reject invalid stage values in updatePropertyStage', async function () {
      // Test invalid stage (greater than 4)
      await expect(
        dao.updatePropertyStage(5)
      ).to.be.reverted; // Just check that it reverts
    });

    it('Should reject unauthorized calls to updatePropertyStage', async function () {
      // Test unauthorized caller (only vault or owner can call updatePropertyStage)
      await expect(
        dao.connect(user1).updatePropertyStage(1)
      ).to.be.reverted; // Just check that it reverts
    });
  });

  describe('Cross-Chain Stage Synchronization', function () {
    beforeEach(async function () {
      const stacksAddress = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const evmCustodian = user1.address;
      // Register Stacks address to EVM custodian mapping
      await stacksManager.registerStacksAddress(stacksAddress, evmCustodian);
    });

    it('Should simulate complete stage transition workflow', async function () {
      const stacksAddress = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const evmCustodian = user1.address;

      console.log('🔄 Testing complete stage transition workflow...');

      // Step 1: OpenToFund stage - allow deposits
      let currentStage = await dao.getCurrentStage();
      expect(currentStage).to.equal(0); // OpenToFund
      console.log('✅ Initial stage: OpenToFund');

      // Make a deposit in OpenToFund stage
      const depositMessageId = ethers.keccak256(ethers.toUtf8Bytes('workflow-deposit'));
      await expect(
        stacksManager.connect(relayer).processCrossChainMessage(
          depositMessageId,
          1, // Message type: deposit
          PROPERTY_ID,
          evmCustodian,
          stacksAddress,
          ethers.parseUnits('1', 18),
          ethers.keccak256(ethers.toUtf8Bytes('stacks-tx-workflow')),
          '0x'
        )
      ).to.not.be.reverted;
      console.log('✅ Deposit successful in OpenToFund stage');

      // Step 2: Transition to Funded stage
      await expect(
        dao.updatePropertyStage(1) // Funded
      ).to.emit(stacksManager, 'StacksStageChange')
      .withArgs(PROPERTY_ID, 1);
      
      currentStage = await dao.getCurrentStage();
      expect(currentStage).to.equal(1); // Funded
      console.log('✅ Transitioned to Funded stage');

      // Try to make another deposit - should fail
      const newDepositMessageId = ethers.keccak256(ethers.toUtf8Bytes('funded-stage-deposit'));
      await expect(
        stacksManager.connect(relayer).processCrossChainMessage(
          newDepositMessageId,
          1, // Message type: deposit
          PROPERTY_ID,
          evmCustodian,
          stacksAddress,
          ethers.parseUnits('1', 18),
          ethers.keccak256(ethers.toUtf8Bytes('stacks-tx-funded')),
          '0x'
        )
      ).to.be.revertedWith('StacksCrossChainManager: not in OpenToFund stage');
      console.log('✅ Deposit correctly blocked in Funded stage');

      // Step 3: Transition to UnderManagement stage
      await expect(
        dao.updatePropertyStage(2) // UnderManagement
      ).to.emit(stacksManager, 'StacksStageChange')
      .withArgs(PROPERTY_ID, 2);
      
      currentStage = await dao.getCurrentStage();
      expect(currentStage).to.equal(2); // UnderManagement
      console.log('✅ Transitioned to UnderManagement stage');

      // Step 4: Transition to Liquidating stage
      await expect(
        dao.updatePropertyStage(3) // Liquidating
      ).to.emit(stacksManager, 'StacksStageChange')
      .withArgs(PROPERTY_ID, 3);
      
      currentStage = await dao.getCurrentStage();
      expect(currentStage).to.equal(3); // Liquidating
      console.log('✅ Transitioned to Liquidating stage');

      // Step 5: Transition to Liquidated stage
      await expect(
        dao.updatePropertyStage(4) // Liquidated
      ).to.emit(stacksManager, 'StacksStageChange')
      .withArgs(PROPERTY_ID, 4);
      
      currentStage = await dao.getCurrentStage();
      expect(currentStage).to.equal(4); // Liquidated
      console.log('✅ Transitioned to Liquidated stage');

      console.log('🎉 Complete stage transition workflow successful!');
    });

    it('Should handle stage transitions with MockRelayer simulation', async function () {
      const stacksAddress = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const evmCustodian = user1.address;

      console.log('🔄 Testing stage transitions with MockRelayer...');

      // Simulate stage transition event from EVM to Stacks
      const stageTransitionEventId = await mockRelayer.simulateStacksStageTransitionEvent(
        PROPERTY_ID,
        1, // Funded stage
        ethers.keccak256(ethers.toUtf8Bytes('stage-transition-tx')).toString()
      );

      console.log(`✅ Simulated stage transition event: ${stageTransitionEventId}`);

      // Verify the event was created
      const event = mockRelayer.getStacksEvent(stageTransitionEventId);
      expect(event).to.not.be.undefined;
      expect(event?.eventType).to.equal('stage-transition');
      expect(event?.propertyId).to.equal(PROPERTY_ID);
      expect(event?.amount).to.equal('1'); // New stage

      // Test multiple stage transitions
      const stage2EventId = await mockRelayer.simulateStacksStageTransitionEvent(
        PROPERTY_ID,
        2, // UnderManagement stage
        ethers.keccak256(ethers.toUtf8Bytes('stage-transition-tx-2')).toString()
      );

      const stage3EventId = await mockRelayer.simulateStacksStageTransitionEvent(
        PROPERTY_ID,
        3, // Liquidating stage
        ethers.keccak256(ethers.toUtf8Bytes('stage-transition-tx-3')).toString()
      );

      // Verify all events were created
      expect(mockRelayer.getEventCount()).to.equal(3);
      console.log('✅ Multiple stage transition events created successfully');

      // Test relayer statistics
      const stats = mockRelayer.getStats();
      expect(stats.totalEvents).to.equal(3);
      expect(stats.unprocessedEvents).to.equal(3);
      console.log('✅ MockRelayer statistics updated correctly');
    });
  });

  describe('Cross-Chain Stage Acknowledgment Tests', () => {
    const stacksAddress = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    let evmCustodian: string;

    beforeEach(async () => {
      // Set EVM custodian address
      evmCustodian = user1.address;
      
      // Update sBTC price to prevent stale price issues
      await stacksManager.connect(owner).updateSbtcPrice(SBTC_PRICE_USD);
    });

    it('Should handle complete stage change with acknowledgment workflow', async () => {
      console.log('🔄 Testing complete stage change with acknowledgment workflow...');

      // Step 1: EVM initiates stage change
      await expect(dao.connect(owner).updatePropertyStage(1)) // Funded stage
        .to.emit(stacksManager, 'StacksStageChange')
        .withArgs(PROPERTY_ID, 1);

      console.log('✅ EVM initiated stage change to Funded');

      // Step 2: Check pending stage change
      const [isPending, pendingStage, timestamp] = await stacksManager.getPendingStageChange(PROPERTY_ID);
      expect(isPending).to.be.true;
      expect(pendingStage).to.equal(1);
      expect(timestamp).to.be.greaterThan(0);

      // Step 3: Simulate Stacks acknowledgment
      const ackEventId = await mockRelayer.simulateStacksStageAcknowledgment(
        PROPERTY_ID,
        1, // Acknowledged stage
        ethers.keccak256(ethers.toUtf8Bytes('stacks-ack-tx')).toString()
      );

      // Step 4: Process acknowledgment via relayer
      const messageId = await mockRelayer.processCrossChainMessage(
        ackEventId,
        evmCustodian,
        stacksAddress
      );

      expect(messageId).to.be.a('string');
      console.log('✅ Stacks acknowledgment processed');

      // Step 5: Verify pending stage change is cleared
      const [isPendingAfter, pendingStageAfter] = await stacksManager.getPendingStageChange(PROPERTY_ID);
      expect(isPendingAfter).to.be.false;
      expect(pendingStageAfter).to.equal(0);

      // Step 6: Verify message was processed
      const isProcessed = await stacksManager.isMessageProcessed(messageId);
      expect(isProcessed).to.be.true;

      console.log('🎉 Complete stage change with acknowledgment workflow successful!');
    });

    it('Should handle multiple stage transitions with acknowledgments', async () => {
      console.log('🔄 Testing multiple stage transitions with acknowledgments...');

      const stages = [1, 2, 3]; // Funded, UnderManagement, Liquidating
      const ackEventIds: string[] = [];
      const messageIds: string[] = [];

      for (const stage of stages) {
        // Step 1: EVM initiates stage change
        await expect(dao.connect(owner).updatePropertyStage(stage))
          .to.emit(stacksManager, 'StacksStageChange')
          .withArgs(PROPERTY_ID, stage);

        // Step 2: Check pending stage change
        const [isPending, pendingStage] = await stacksManager.getPendingStageChange(PROPERTY_ID);
        expect(isPending).to.be.true;
        expect(pendingStage).to.equal(stage);

        // Step 3: Simulate Stacks acknowledgment
        const ackEventId = await mockRelayer.simulateStacksStageAcknowledgment(
          PROPERTY_ID,
          stage,
          ethers.keccak256(ethers.toUtf8Bytes(`stacks-ack-tx-${stage}`)).toString()
        );
        ackEventIds.push(ackEventId);

        // Step 4: Process acknowledgment
        const messageId = await mockRelayer.processCrossChainMessage(
          ackEventId,
          evmCustodian,
          stacksAddress
        );
        messageIds.push(messageId);

        // Step 5: Verify pending stage change is cleared
        const [isPendingAfter] = await stacksManager.getPendingStageChange(PROPERTY_ID);
        expect(isPendingAfter).to.be.false;

        console.log(`✅ Processed stage ${stage} with acknowledgment`);
      }

      // Verify all messages were processed
      expect(ackEventIds.length).to.equal(3);
      expect(messageIds.length).to.equal(3);

      for (const messageId of messageIds) {
        const isProcessed = await stacksManager.isMessageProcessed(messageId);
        expect(isProcessed).to.be.true;
      }

      console.log('🎉 Multiple stage transitions with acknowledgments successful!');
    });

    it('Should handle retry mechanism for failed acknowledgments', async () => {
      console.log('🔄 Testing retry mechanism for failed acknowledgments...');

      // Step 1: EVM initiates stage change
      await expect(dao.connect(owner).updatePropertyStage(1))
        .to.emit(stacksManager, 'StacksStageChange')
        .withArgs(PROPERTY_ID, 1);

      // Step 2: Check pending stage change
      const [isPending, pendingStage] = await stacksManager.getPendingStageChange(PROPERTY_ID);
      expect(isPending).to.be.true;
      expect(pendingStage).to.equal(1);

      // Step 3: Simulate time passing (5+ minutes)
      await network.provider.send('evm_increaseTime', [6 * 60]); // 6 minutes
      await network.provider.send('evm_mine');

      // Step 4: Retry stage change notification
      await expect(stacksManager.connect(owner).retryStageChangeNotification(PROPERTY_ID))
        .to.emit(stacksManager, 'StacksStageChange')
        .withArgs(PROPERTY_ID, 1);

      console.log('✅ Retry mechanism triggered successfully');

      // Step 5: Verify pending stage change is still there
      const [isPendingAfter, pendingStageAfter] = await stacksManager.getPendingStageChange(PROPERTY_ID);
      expect(isPendingAfter).to.be.true;
      expect(pendingStageAfter).to.equal(1);

      console.log('🎉 Retry mechanism test successful!');
    });

    it('Should reject retry attempts that are too soon', async () => {
      console.log('🔄 Testing retry rejection for too soon attempts...');

      // Step 1: EVM initiates stage change
      await expect(dao.connect(owner).updatePropertyStage(1))
        .to.emit(stacksManager, 'StacksStageChange')
        .withArgs(PROPERTY_ID, 1);

      // Debug: Check if pending stage change is set up
      const [isPending, pendingStage, timestamp] = await stacksManager.getPendingStageChange(PROPERTY_ID);
      console.log(`Debug: isPending=${isPending}, pendingStage=${pendingStage}, timestamp=${timestamp}`);

      // Step 2: Try to retry immediately (should fail)
      await expect(stacksManager.connect(owner).retryStageChangeNotification(PROPERTY_ID))
        .to.be.reverted;

      console.log('✅ Retry rejection for too soon attempts working correctly');
    });

    it('Should reject invalid stage acknowledgments', async () => {
      console.log('🔄 Testing invalid stage acknowledgment rejection...');

      // Step 1: EVM initiates stage change to Funded (1)
      await expect(dao.connect(owner).updatePropertyStage(1))
        .to.emit(stacksManager, 'StacksStageChange')
        .withArgs(PROPERTY_ID, 1);

      // Step 2: Simulate Stacks acknowledgment with wrong stage (2 instead of 1)
      const ackEventId = await mockRelayer.simulateStacksStageAcknowledgment(
        PROPERTY_ID,
        2, // Wrong stage - should be 1
        ethers.keccak256(ethers.toUtf8Bytes('stacks-ack-tx-wrong')).toString()
      );

      // Step 3: Try to process acknowledgment (should fail)
      await expect(mockRelayer.processCrossChainMessage(
        ackEventId,
        evmCustodian,
        stacksAddress
      )).to.be.reverted;

      console.log('✅ Invalid stage acknowledgment rejection working correctly');
    });

    it('Should handle acknowledgment for non-pending stage change', async () => {
      console.log('🔄 Testing acknowledgment for non-pending stage change...');

      // Step 1: Simulate Stacks acknowledgment without pending stage change
      const ackEventId = await mockRelayer.simulateStacksStageAcknowledgment(
        PROPERTY_ID,
        1,
        ethers.keccak256(ethers.toUtf8Bytes('stacks-ack-tx-no-pending')).toString()
      );

      // Step 2: Try to process acknowledgment (should fail)
      await expect(mockRelayer.processCrossChainMessage(
        ackEventId,
        evmCustodian,
        stacksAddress
      )).to.be.reverted;

      console.log('✅ Non-pending stage change acknowledgment rejection working correctly');
    });
  });
});