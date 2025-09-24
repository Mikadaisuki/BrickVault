import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PropertyVaultGovernance, PropertyDAO, OFTUSDC, EnvironmentConfig } from '../typechain-types/src';
import { SimpleMockLayerZeroEndpoint } from '../typechain-types/src/mocks';

describe('PropertyVault - Income-Only Withdrawals (Minimal)', function () {
  let vault: PropertyVaultGovernance;
  let oftUSDC: OFTUSDC;
  let mockEndpoint: SimpleMockLayerZeroEndpoint;
  let dao: PropertyDAO;
  let environmentConfig: EnvironmentConfig;
  let owner: any;
  let user1: any;
  let user2: any;

  const PROPERTY_ID = 1;
  const VAULT_NAME = 'Test Property Vault';
  const VAULT_SYMBOL = 'TPV';
  const DEPOSIT_CAP = ethers.parseUnits('1000000', 18);
  const INITIAL_SUPPLY = ethers.parseUnits('100000', 18);

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

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
    const quarterSupply = INITIAL_SUPPLY / 4n;
    await oftUSDC.transfer(user1.address, quarterSupply);
    await oftUSDC.transfer(user2.address, quarterSupply);
    // Keep some for owner operations
  });

  describe('Income Tracking', function () {
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

    it('Should track total income harvested correctly', async function () {
      // Add rent income multiple times
      await oftUSDC.connect(owner).approve(await vault.getAddress(), ethers.parseUnits('2000', 18));
      await vault.connect(owner).harvestRent(ethers.parseUnits('1000', 18));
      await vault.connect(owner).harvestRent(ethers.parseUnits('1000', 18));

      // Check total income harvested
      expect(await vault.totalIncomeHarvested()).to.equal(ethers.parseUnits('2000', 18));
    });

    it('Should handle getMaxWithdrawable for users with no shares', async function () {
      // User with no shares - use a different address
      const user4Address = '0x1234567890123456789012345678901234567890';
      await oftUSDC.transfer(user4Address, ethers.parseUnits('1000', 18));

      const maxWithdrawable = await vault.getMaxWithdrawable(user4Address);
      expect(maxWithdrawable).to.equal(0);
    });

    it('Should return correct withdrawal status messages', async function () {
      // Initial state - no DAO set
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

    it('Should set original principal when property purchase is initiated', async function () {
      // Users invest
      const user1Deposit = ethers.parseUnits('10000', 18);
      const user2Deposit = ethers.parseUnits('5000', 18);
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), user1Deposit);
      await vault.connect(user1).deposit(user1Deposit, user1.address);

      await oftUSDC.connect(user2).approve(await vault.getAddress(), user2Deposit);
      await vault.connect(user2).deposit(user2Deposit, user2.address);

      // Initiate property purchase (simulate DAO call)
      const propertyManagerAddress = '0x1234567890123456789012345678901234567890';
      const purchasePrice = ethers.parseUnits('15000', 18);
      
      await vault.initiatePropertyPurchase(purchasePrice, propertyManagerAddress);

      // Check original principal is tracked
      expect(await vault.originalPrincipal()).to.equal(ethers.parseUnits('15000', 18));
      expect(await vault.propertyPurchasePrice()).to.equal(purchasePrice);
      expect(await vault.propertyManager()).to.equal(propertyManagerAddress);
    });

    it('Should enforce income-only withdrawals after property purchase', async function () {
      // Users invest
      const user1Deposit = ethers.parseUnits('10000', 18);
      const user2Deposit = ethers.parseUnits('5000', 18);
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), user1Deposit);
      await vault.connect(user1).deposit(user1Deposit, user1.address);

      await oftUSDC.connect(user2).approve(await vault.getAddress(), user2Deposit);
      await vault.connect(user2).deposit(user2Deposit, user2.address);

      // Set up DAO to be in Funded stage first
      await dao.updatePropertyStage(1); // Funded stage

      // Initiate and complete property purchase
      const propertyManagerAddress = '0x1234567890123456789012345678901234567890';
      const purchasePrice = ethers.parseUnits('15000', 18);
      
      await vault.initiatePropertyPurchase(purchasePrice, propertyManagerAddress);
      await vault.completePropertyPurchase('123 Main St, Test City');
      
      // Update DAO stage to UnderManagement to allow income withdrawals
      await dao.updatePropertyStage(2); // UnderManagement stage

      // Add rent income
      await oftUSDC.connect(owner).approve(await vault.getAddress(), ethers.parseUnits('2000', 18));
      await vault.connect(owner).harvestRent(ethers.parseUnits('2000', 18));

      // Check user shares after purchase
      const user1Shares = await vault.balanceOf(user1.address);
      const user2Shares = await vault.balanceOf(user2.address);
      const totalShares = await vault.totalSupply();

      console.log('User1 shares:', user1Shares.toString());
      console.log('User2 shares:', user2Shares.toString());
      console.log('Total shares:', totalShares.toString());
      console.log('Total income harvested:', (await vault.totalIncomeHarvested()).toString());

      // Check max withdrawable for each user (income only)
      const user1MaxWithdrawable = await vault.getMaxWithdrawable(user1.address);
      const user2MaxWithdrawable = await vault.getMaxWithdrawable(user2.address);

      console.log('User1 max withdrawable:', user1MaxWithdrawable.toString());
      console.log('User2 max withdrawable:', user2MaxWithdrawable.toString());

      // User1 has 10000/15000 = 66.67% of shares, so 66.67% of income
      // User2 has 5000/15000 = 33.33% of shares, so 33.33% of income
      const expectedUser1Income = (ethers.parseUnits('2000', 18) * user1Shares) / totalShares;
      const expectedUser2Income = (ethers.parseUnits('2000', 18) * user2Shares) / totalShares;

      expect(user1MaxWithdrawable).to.be.closeTo(expectedUser1Income, ethers.parseUnits('1', 18));
      expect(user2MaxWithdrawable).to.be.closeTo(expectedUser2Income, ethers.parseUnits('1', 18));
    });
  });
});
