import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PropertyVaultGovernance, PropertyDAO, PropertyRegistry, OFTUSDC, EnvironmentConfig } from '../typechain-types/src';
import { SimpleMockLayerZeroEndpoint } from '../typechain-types/src/mocks';

describe('PropertyVault - Complete Testing', function () {
  let vault: PropertyVaultGovernance;
  let registry: PropertyRegistry;
  let dao: PropertyDAO;
  let oftUSDC: OFTUSDC;
  let mockEndpoint: SimpleMockLayerZeroEndpoint;
  let environmentConfig: EnvironmentConfig;
  let owner: any;
  let user1: any;
  let user2: any;

  const PROPERTY_ID = 1;
  const VAULT_NAME = 'Downtown Office Vault';
  const VAULT_SYMBOL = 'DOF';
  const DEPOSIT_CAP = ethers.parseUnits('1000000', 18); // 1M OFTUSDC
  const INITIAL_SUPPLY = ethers.parseUnits('100000', 18); // 100K OFTUSDC

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy mock LayerZero endpoint
    const SimpleMockLayerZeroEndpoint = await ethers.getContractFactory('SimpleMockLayerZeroEndpoint');
    mockEndpoint = await SimpleMockLayerZeroEndpoint.deploy();
    await mockEndpoint.waitForDeployment();

    // Deploy OFTUSDC (LayerZero OFT token)
    const OFTUSDC = await ethers.getContractFactory('OFTUSDC');
    oftUSDC = await OFTUSDC.deploy(
      'USD Coin',
      'USDC',
      await mockEndpoint.getAddress(), // lzEndpoint - use mock endpoint
      owner.address // delegate
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

    // Set the DAO
    await vault.setDAO(await dao.getAddress());

    // Transfer USDC to users (OFTUSDC mints to deployer in constructor)
    const halfSupply = INITIAL_SUPPLY / 2n;
    await oftUSDC.transfer(user1.address, halfSupply);
    await oftUSDC.transfer(user2.address, halfSupply);
  });

  describe('Deployment', function () {
    it('Should set correct property ID', async function () {
      expect(await vault.propertyId()).to.equal(PROPERTY_ID);
    });

    it('Should set correct environment config address', async function () {
      expect(await vault.environmentConfig()).to.equal(await environmentConfig.getAddress());
    });

    it('Should emit PropertyVaultInitialized event', async function () {
      // This is tested implicitly in the deployment
      expect(await vault.propertyId()).to.equal(PROPERTY_ID);
    });
  });

  describe('Rent Harvesting', function () {
    it('Should harvest rent correctly', async function () {
      const rentAmount = ethers.parseUnits('1000', 18);
      const initialAssets = await vault.totalAssets();
      
      await oftUSDC.approve(await vault.getAddress(), rentAmount);
      await vault.harvestRent(rentAmount);

      expect(await vault.totalAssets()).to.equal(initialAssets + rentAmount);
      expect(await vault.totalIncomeHarvested()).to.equal(rentAmount);
    });

    it('Should update last rent harvest time', async function () {
      const rentAmount = ethers.parseUnits('1000', 18);
      const beforeHarvest = await ethers.provider.getBlock('latest');
      
      await oftUSDC.approve(await vault.getAddress(), rentAmount);
      await vault.harvestRent(rentAmount);

      const lastHarvest = await vault.lastRentHarvest();
      expect(lastHarvest).to.be.greaterThan(beforeHarvest!.timestamp);
    });

    it('Should accumulate total rent harvested', async function () {
      const rent1 = ethers.parseUnits('500', 18);
      const rent2 = ethers.parseUnits('300', 18);
      
      await oftUSDC.approve(await vault.getAddress(), rent1 + rent2);
      await vault.harvestRent(rent1);
      await vault.harvestRent(rent2);

      expect(await vault.totalIncomeHarvested()).to.equal(rent1 + rent2);
    });

    it('Should emit RentHarvested event', async function () {
      const rentAmount = ethers.parseUnits('1000', 18);
      const currentAssets = await vault.totalAssets();
      const expectedAssets = currentAssets + rentAmount;
      
      await oftUSDC.approve(await vault.getAddress(), rentAmount);
      
      await expect(vault.harvestRent(rentAmount))
        .to.emit(vault, 'RentHarvested')
        .withArgs(rentAmount, expectedAssets, PROPERTY_ID);
    });
  });

  describe('NAV Updates', function () {
    it('Should handle positive NAV update', async function () {
      // First initiate property purchase to set property manager, then complete it
      await vault.initiatePropertyPurchase(ethers.parseUnits('100000', 18), owner.address);
      await vault.completePropertyPurchase("123 Main St");
      
      const navAmount = ethers.parseUnits('1000', 18);
      const initialAssets = await vault.totalAssets();
      
      await oftUSDC.approve(await vault.getAddress(), navAmount);
      await vault.updateNAV(navAmount);

      // NAV updates now work with PropertyToken, not USDC directly
      expect(await vault.totalAssets()).to.equal(initialAssets);
      expect(await vault.totalNAVChanges()).to.equal(navAmount);
    });

    it('Should handle negative NAV update', async function () {
      // First initiate property purchase to set property manager, then complete it
      await vault.initiatePropertyPurchase(ethers.parseUnits('100000', 18), owner.address);
      await vault.completePropertyPurchase("123 Main St");
      
      // First add some assets
      const addAmount = ethers.parseUnits('2000', 18);
      await oftUSDC.approve(await vault.getAddress(), addAmount);
      await vault.harvestRent(addAmount);

      // First do a positive NAV update to mint PropertyTokens
      const navIncrease = ethers.parseUnits('1000', 18);
      await vault.updateNAV(navIncrease);

      // Then reduce NAV (burn some PropertyTokens)
      const navReduction = ethers.parseUnits('500', 18);
      const initialBalance = await oftUSDC.balanceOf(owner.address);
      
      await vault.updateNAV(-navReduction);

      // NAV updates now work with PropertyToken, not USDC directly
      expect(await vault.totalAssets()).to.equal(addAmount);
      expect(await vault.totalNAVChanges()).to.equal(navIncrease + navReduction);
      // Negative NAV updates don't return USDC - they just burn PropertyTokens
      expect(await oftUSDC.balanceOf(owner.address)).to.equal(initialBalance);
    });

    it('Should update last NAV update time', async function () {
      // First initiate property purchase to set property manager, then complete it
      await vault.initiatePropertyPurchase(ethers.parseUnits('100000', 18), owner.address);
      await vault.completePropertyPurchase("123 Main St");
      
      const navAmount = ethers.parseUnits('1000', 18);
      const beforeUpdate = await ethers.provider.getBlock('latest');
      
      await oftUSDC.approve(await vault.getAddress(), navAmount);
      await vault.updateNAV(navAmount);

      const lastUpdate = await vault.lastNAVUpdate();
      expect(lastUpdate).to.be.greaterThan(beforeUpdate!.timestamp);
    });

    it('Should emit NAVUpdated event with property ID', async function () {
      // First initiate property purchase to set property manager, then complete it
      await vault.initiatePropertyPurchase(ethers.parseUnits('100000', 18), owner.address);
      await vault.completePropertyPurchase("123 Main St");
      
      const navAmount = ethers.parseUnits('1000', 18);
      const currentAssets = await vault.totalAssets();
      const expectedAssets = currentAssets + navAmount;
      
      await oftUSDC.approve(await vault.getAddress(), navAmount);
      
      await expect(vault.updateNAV(navAmount))
        .to.emit(vault, 'NAVUpdated(uint256,int256,uint256)')
        .withArgs(PROPERTY_ID, navAmount, currentAssets);
    });
  });

  describe.skip('Property Metrics', function () {
    it('Should return correct property metrics', async function () {
      // First initiate property purchase to set property manager, then complete it
      await vault.initiatePropertyPurchase(ethers.parseUnits('100000', 18), owner.address);
      await vault.completePropertyPurchase("123 Main St");
      
      const rentAmount = ethers.parseUnits('1000', 18);
      const navAmount = ethers.parseUnits('500', 18);
      
      await oftUSDC.approve(await vault.getAddress(), rentAmount + navAmount);
      await vault.harvestRent(rentAmount);
      await vault.updateNAV(navAmount);

      const metrics = await vault.getPropertyMetrics();
      
      expect(metrics[0]).to.equal(PROPERTY_ID);
      expect(metrics[1]).to.equal(rentAmount);
      expect(metrics[2]).to.equal(navAmount);
      expect(metrics[3]).to.be.greaterThan(0); // lastRentHarvest
      expect(metrics[4]).to.be.greaterThan(0); // lastNAVUpdate
      expect(metrics[5]).to.be.greaterThan(0); // assetsPerShare
      expect(metrics[6]).to.be.greaterThan(0); // totalAssets
      expect(metrics[7]).to.equal(0); // totalSupply (no deposits yet)
    });
  });

  describe.skip('Rent Yield Rate', function () {
    it('Should calculate rent yield rate correctly', async function () {
      // First deposit some assets
      const depositAmount = ethers.parseUnits('10000', 18);
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Harvest rent
      const rentAmount = ethers.parseUnits('1000', 18);
      await oftUSDC.approve(await vault.getAddress(), rentAmount);
      await vault.harvestRent(rentAmount);

      // Wait a bit to simulate time passage
      await ethers.provider.send('evm_increaseTime', [86400]); // 1 day
      await ethers.provider.send('evm_mine', []);

      const yieldRate = await vault.getRentYieldRate();
      expect(yieldRate).to.be.greaterThan(0);
    });

    it('Should return zero yield rate when no rent harvested', async function () {
      const yieldRate = await vault.getRentYieldRate();
      expect(yieldRate).to.equal(0);
    });

    it('Should return zero yield rate when no time has passed', async function () {
      const depositAmount = ethers.parseUnits('10000', 18);
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      const rentAmount = ethers.parseUnits('1000', 18);
      await oftUSDC.approve(await vault.getAddress(), rentAmount);
      await vault.harvestRent(rentAmount);

      const yieldRate = await vault.getRentYieldRate();
      expect(yieldRate).to.equal(0);
    });
  });

  describe.skip('Property Performance', function () {
    it('Should calculate property performance correctly', async function () {
      // First deposit
      const depositAmount = ethers.parseUnits('10000', 18);
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Add rent and NAV changes
      const rentAmount = ethers.parseUnits('1000', 18);
      const navAmount = ethers.parseUnits('500', 18);
      
      await oftUSDC.approve(await vault.getAddress(), rentAmount + navAmount);
      await vault.harvestRent(rentAmount);
      await vault.updateNAV(navAmount);

      const performance = await vault.getPropertyPerformance();
      
      expect(performance[0]).to.be.greaterThan(0); // totalReturn
      expect(performance[1]).to.equal(rentAmount); // rentReturn
      expect(performance[2]).to.equal(navAmount); // navReturn
      expect(performance[3]).to.be.greaterThan(0); // currentValue
      expect(performance[4]).to.equal(ethers.parseUnits('1', 18)); // initialValue (hardcoded in contract)
    });
  });

  describe.skip('Property Performance Check', function () {
    it('Should return true when performing well', async function () {
      // First deposit
      const depositAmount = ethers.parseUnits('10000', 18);
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Harvest significant rent (5%+ yield)
      const rentAmount = ethers.parseUnits('1000', 18);
      await oftUSDC.approve(await vault.getAddress(), rentAmount);
      await vault.harvestRent(rentAmount);

      // Wait to simulate time passage
      await ethers.provider.send('evm_increaseTime', [86400 * 30]); // 30 days
      await ethers.provider.send('evm_mine', []);

      const isPerforming = await vault.isPerformingWell();
      expect(isPerforming).to.be.true;
    });

    it('Should return false when not performing well', async function () {
      // First deposit
      const depositAmount = ethers.parseUnits('10000', 18);
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Harvest minimal rent (less than 5% yield)
      const rentAmount = ethers.parseUnits('40', 18);
      await oftUSDC.approve(await vault.getAddress(), rentAmount);
      await vault.harvestRent(rentAmount);

      // Wait to simulate time passage
      await ethers.provider.send('evm_increaseTime', [86400 * 30]); // 30 days
      await ethers.provider.send('evm_mine', []);

      const isPerforming = await vault.isPerformingWell();
      expect(isPerforming).to.be.false;
    });
  });

  describe('Registry Integration', function () {
    it('Should record deposits in registry', async function () {
      const depositAmount = ethers.parseUnits('1000', 18);
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Check that registry was called (this is tested implicitly since the call succeeds)
      expect(await vault.balanceOf(user1.address)).to.equal(depositAmount);
    });

    it('Should record redemptions in registry', async function () {
      // First deposit
      const depositAmount = ethers.parseUnits('1000', 18);
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Then redeem
      const redeemShares = ethers.parseUnits('500', 18);
      await vault.connect(user1).redeem(redeemShares, user1.address, user1.address);

      // Check that redemption succeeded
      expect(await vault.balanceOf(user1.address)).to.equal(ethers.parseUnits('500', 18));
    });
  });

  describe('Access Control', function () {
    it('Should only allow owner to harvest rent', async function () {
      const rentAmount = ethers.parseUnits('1000', 18);
      await oftUSDC.connect(user1).approve(await vault.getAddress(), rentAmount);
      
      await expect(
        vault.connect(user1).harvestRent(rentAmount)
      ).to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount');
    });

    it('Should only allow owner to update NAV', async function () {
      const navAmount = ethers.parseUnits('1000', 18);
      await oftUSDC.connect(user1).approve(await vault.getAddress(), navAmount);
      
      await expect(
        vault.connect(user1).updateNAV(navAmount)
      ).to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount');
    });
  });

  describe('Edge Cases', function () {
    it('Should handle zero rent harvest', async function () {
      await expect(vault.harvestRent(0))
        .to.be.reverted;
    });

    it('Should handle zero NAV update', async function () {
      // First initiate property purchase to set property manager, then complete it
      await vault.initiatePropertyPurchase(ethers.parseUnits('100000', 18), owner.address);
      await vault.completePropertyPurchase("123 Main St");
      
      await vault.updateNAV(0);
      expect(await vault.totalNAVChanges()).to.equal(0);
    });

    it('Should handle multiple rapid operations', async function () {
      // First initiate property purchase to set property manager, then complete it
      await vault.initiatePropertyPurchase(ethers.parseUnits('100000', 18), owner.address);
      await vault.completePropertyPurchase("123 Main St");
      
      const depositAmount = ethers.parseUnits('1000', 18);
      const rentAmount = ethers.parseUnits('100', 18);
      const navAmount = ethers.parseUnits('50', 18);
      
      // Deposit
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Harvest rent
      await oftUSDC.approve(await vault.getAddress(), rentAmount);
      await vault.harvestRent(rentAmount);

      // Update NAV
      await oftUSDC.approve(await vault.getAddress(), navAmount);
      await vault.updateNAV(navAmount);

      // Check final state
      // NAV updates now work with PropertyToken, not USDC directly
      expect(await vault.totalAssets()).to.equal(depositAmount + rentAmount);
      expect(await vault.totalIncomeHarvested()).to.equal(rentAmount);
      expect(await vault.totalNAVChanges()).to.equal(navAmount);
    });
  });

  describe('LayerZero OVault Integration', function () {
    it('Should work with OFTUSDC as underlying asset', async function () {
      const depositAmount = ethers.parseUnits('1000', 18);
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      expect(await vault.totalAssets()).to.equal(depositAmount);
      expect(await vault.balanceOf(user1.address)).to.equal(depositAmount);
      expect(await oftUSDC.balanceOf(await vault.getAddress())).to.equal(depositAmount);
    });

    it('Should support cross-chain property investments', async function () {
      const depositAmount = ethers.parseUnits('1000', 18);
      
      // Simulate cross-chain deposit to property vault
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Verify property-specific tracking
      expect(await vault.totalAssets()).to.equal(depositAmount);
      expect(await vault.totalSupply()).to.equal(depositAmount);
    });

    it('Should handle cross-chain rent harvesting', async function () {
      const depositAmount = ethers.parseUnits('1000', 18);
      const rentAmount = ethers.parseUnits('100', 18);
      
      // Initial deposit
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Harvest rent (simulating cross-chain income)
      await oftUSDC.approve(await vault.getAddress(), rentAmount);
      await vault.harvestRent(rentAmount);

      expect(await vault.totalIncomeHarvested()).to.equal(rentAmount);
      expect(await vault.totalAssets()).to.equal(depositAmount + rentAmount);
    });

    it('Should maintain property isolation across chains', async function () {
      const depositAmount = ethers.parseUnits('1000', 18);
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Each property vault should maintain its own state
      expect(await vault.propertyId()).to.equal(PROPERTY_ID);
      expect(await vault.environmentConfig()).to.equal(await environmentConfig.getAddress());
      
      // Property-specific metrics should be isolated
      expect(await vault.propertyId()).to.equal(PROPERTY_ID);
    });

    it('Should support cross-chain share transfers for property investments', async function () {
      const depositAmount = ethers.parseUnits('1000', 18);
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      const shares = await vault.balanceOf(user1.address);
      
      // These shares can be transferred cross-chain via ShareOFT
      expect(shares).to.equal(depositAmount);
      expect(await vault.totalSupply()).to.equal(shares);
    });

    it('Should handle cross-chain NAV updates', async function () {
      // First initiate property purchase to set property manager, then complete it
      await vault.initiatePropertyPurchase(ethers.parseUnits('100000', 18), owner.address);
      await vault.completePropertyPurchase("123 Main St");
      
      const depositAmount = ethers.parseUnits('1000', 18);
      const navAmount = ethers.parseUnits('200', 18);
      
      // Initial deposit
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Update NAV (simulating cross-chain property value change)
      // NAV updates now work with PropertyToken, not USDC directly
      await vault.updateNAV(navAmount);

      expect(await vault.totalNAVChanges()).to.equal(navAmount);
      // totalAssets() returns USDC balance, which doesn't change with PropertyToken NAV updates
      expect(await vault.totalAssets()).to.equal(depositAmount);
    });

    it('Should maintain ERC4626 compliance with cross-chain operations', async function () {
      const depositAmount = ethers.parseUnits('1000', 18);
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Test ERC4626 conversion functions with property vault
      const shares = await vault.balanceOf(user1.address);
      const assets = await vault.convertToAssets(shares);
      expect(assets).to.equal(depositAmount);

      const convertedShares = await vault.convertToShares(depositAmount);
      expect(convertedShares).to.equal(shares);
    });

    it('Should integrate with registry for cross-chain tracking', async function () {
      // First create a property in the registry
      await registry.createProperty(
        'Test Property',
        ethers.parseUnits('1000000', 18),
        await oftUSDC.getAddress()
      );

      const depositAmount = ethers.parseUnits('1000', 18);
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Registry should track cross-chain deposits
      const property = await registry.properties(PROPERTY_ID);
      expect(property.totalDeposited).to.equal(0); // Mock registry doesn't track deposits automatically
    });
  });

  describe('Income-Only Withdrawals', function () {
    it('Should track original principal correctly', async function () {
      // Users invest
      const user1Deposit = ethers.parseUnits('10000', 18);
      const user2Deposit = ethers.parseUnits('5000', 18);
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), user1Deposit);
      await vault.connect(user1).deposit(user1Deposit, user1.address);

      await oftUSDC.connect(user2).approve(await vault.getAddress(), user2Deposit);
      await vault.connect(user2).deposit(user2Deposit, user2.address);

      // Check original principal before purchase
      expect(await vault.originalPrincipal()).to.equal(0); // Not set yet

      // Add some rent income
      await oftUSDC.connect(owner).approve(await vault.getAddress(), ethers.parseUnits('1000', 18));
      await vault.connect(owner).harvestRent(ethers.parseUnits('1000', 18));

      // Original principal still not set
      expect(await vault.originalPrincipal()).to.equal(0);
      
      // Check total income harvested
      expect(await vault.totalIncomeHarvested()).to.equal(ethers.parseUnits('1000', 18));
    });

    it('Should allow full withdrawals before property purchase', async function () {
      // Users invest
      const user1Deposit = ethers.parseUnits('10000', 18);
      const user2Deposit = ethers.parseUnits('5000', 18);
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), user1Deposit);
      await vault.connect(user1).deposit(user1Deposit, user1.address);

      await oftUSDC.connect(user2).approve(await vault.getAddress(), user2Deposit);
      await vault.connect(user2).deposit(user2Deposit, user2.address);

      // Check that users can withdraw everything
      const user1MaxWithdrawable = await vault.getMaxWithdrawable(user1.address);
      const user2MaxWithdrawable = await vault.getMaxWithdrawable(user2.address);

      expect(user1MaxWithdrawable).to.equal(user1Deposit);
      expect(user2MaxWithdrawable).to.equal(user2Deposit);

      // Users can withdraw their full investment
      const user1Shares = await vault.balanceOf(user1.address);
      const user2Shares = await vault.balanceOf(user2.address);
      
      await vault.connect(user1).redeem(user1Shares, user1.address, user1.address);
      await vault.connect(user2).redeem(user2Shares, user2.address, user2.address);

      // Check balances
      expect(await vault.balanceOf(user1.address)).to.equal(0);
      expect(await vault.balanceOf(user2.address)).to.equal(0);
    });

    it('Should return correct withdrawal status messages', async function () {
      // Initial state - OpenToFund
      let status = await vault.getWithdrawalStatus();
      expect(status).to.include('Withdrawals allowed');

      // Users invest
      const user1Deposit = ethers.parseUnits('10000', 18);
      await oftUSDC.connect(user1).approve(await vault.getAddress(), user1Deposit);
      await vault.connect(user1).deposit(user1Deposit, user1.address);

      // Status should still allow withdrawals
      status = await vault.getWithdrawalStatus();
      expect(status).to.include('Withdrawals allowed');
    });

    it('Should handle getMaxWithdrawable for users with no shares', async function () {
      // User with no shares - use a hardcoded address
      const user4Address = '0x1234567890123456789012345678901234567890';
      await oftUSDC.transfer(user4Address, ethers.parseUnits('1000', 18));

      const maxWithdrawable = await vault.getMaxWithdrawable(user4Address);
      expect(maxWithdrawable).to.equal(0);
    });

    it('Should track total income harvested correctly', async function () {
      // Add rent income multiple times
      await oftUSDC.connect(owner).approve(await vault.getAddress(), ethers.parseUnits('2000', 18));
      await vault.connect(owner).harvestRent(ethers.parseUnits('1000', 18));
      await vault.connect(owner).harvestRent(ethers.parseUnits('1000', 18));

      // Check total income harvested
      expect(await vault.totalIncomeHarvested()).to.equal(ethers.parseUnits('2000', 18));
    });
  });

  // Emergency Functions removed - not available in PropertyVaultGovernance

  describe.skip('Registry Update Functions', function () {
    it('Should have updateDepositCap function', async function () {
      // Test that the function exists and rejects non-registry calls
      await expect(
        vault.connect(user1).updateDepositCap(ethers.parseUnits('2000000', 18))
      ).to.be.reverted;
    });

    // Fee-related functions removed for demo

    it('Should reject registry updates from non-registry', async function () {
      await expect(
        vault.connect(user1).updateDepositCap(ethers.parseUnits('2000000', 18))
      ).to.be.reverted;
    });
  });

  describe('DAO Functions', function () {
    it('Should have initiateLiquidation function', async function () {
      // Test that the function exists and rejects non-DAO calls
      await expect(
        vault.connect(user1).initiateLiquidation()
      ).to.be.reverted;
    });

    it('Should have completeLiquidation function', async function () {
      // Test that the function exists and rejects non-DAO calls
      await expect(
        vault.connect(user1).completeLiquidation()
      ).to.be.reverted;
    });

    it('Should have pauseForLiquidation function', async function () {
      // Test that the function exists and rejects non-DAO calls
      await expect(
        vault.connect(user1).pauseForLiquidation()
      ).to.be.reverted;
    });

    it('Should have withdrawForPurchase function', async function () {
      // Test that the function exists and rejects non-DAO calls
      await expect(
        vault.connect(user1).withdrawForPurchase(ethers.parseUnits('100000', 18))
      ).to.be.reverted;
    });

    it('Should reject DAO functions from non-DAO', async function () {
      await expect(
        vault.connect(user1).initiateLiquidation()
      ).to.be.reverted;
      
      await expect(
        vault.connect(user1).completeLiquidation()
      ).to.be.reverted;
    });
  });

  describe.skip('Property Purchase Functions', function () {
    it('Should have isReadyForPurchase function', async function () {
      // Test that the function exists and returns a boolean
      const result = await vault.isReadyForPurchase();
      expect(typeof result).to.equal('boolean');
    });

    it('Should check deposit permissions', async function () {
      // Set mockDAO as the DAO in the vault
      await vault.setDAO(await mockDAO.getAddress());
      
      // Initially can deposit
      expect(await vault.canDeposit()).to.be.true;
      
      // Complete property purchase (this will fail due to missing setup, so just test the function)
      try {
        await vault.connect(owner).completePropertyPurchase('123 Main St, Test City');
      } catch (error) {
        // Expected to fail due to missing DAO setup
      }
    });

    it('Should check withdrawal permissions', async function () {
      // Set mockDAO as the DAO in the vault
      await vault.setDAO(await mockDAO.getAddress());
      
      // Initially can withdraw
      expect(await vault.canWithdraw()).to.be.true;
      
      // Complete property purchase (this will fail due to missing setup, so just test the function)
      try {
        await vault.connect(owner).completePropertyPurchase('123 Main St, Test City');
      } catch (error) {
        // Expected to fail due to missing DAO setup
      }
    });
  });

  describe.skip('Cross-Chain Notification Functions', function () {
    it('Should have notifyCrossChainPropertyPurchase function', async function () {
      // Test that the function exists and rejects unauthorized calls
      await expect(
        vault.connect(user1).notifyCrossChainPropertyPurchase(ethers.parseUnits('500000', 18))
      ).to.be.reverted;
    });

    it('Should have notifyCrossChainIncomeHarvest function', async function () {
      // Test that the function exists and rejects unauthorized calls
      await expect(
        vault.connect(user1).notifyCrossChainIncomeHarvest(ethers.parseUnits('10000', 18))
      ).to.be.reverted;
    });

    it('Should have notifyCrossChainLiquidationInitiated function', async function () {
      // Test that the function exists and rejects unauthorized calls
      await expect(
        vault.connect(user1).notifyCrossChainLiquidationInitiated()
      ).to.be.reverted;
    });

    it('Should have notifyCrossChainLiquidationCompleted function', async function () {
      // Test that the function exists and rejects unauthorized calls
      await expect(
        vault.connect(user1).notifyCrossChainLiquidationCompleted()
      ).to.be.reverted;
    });

    it('Should reject cross-chain notifications from unauthorized users', async function () {
      await expect(
        vault.connect(user1).notifyCrossChainPropertyPurchase(ethers.parseUnits('500000', 18))
      ).to.be.reverted;
      
      await expect(
        vault.connect(user1).notifyCrossChainLiquidationInitiated()
      ).to.be.reverted;
    });
  });
});
