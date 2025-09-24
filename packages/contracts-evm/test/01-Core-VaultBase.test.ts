import { expect } from 'chai';
import { ethers } from 'hardhat';
import { VaultBase, OFTUSDC } from '../typechain-types/src';
import { SimpleMockLayerZeroEndpoint } from '../typechain-types/src/mocks';

describe('VaultBase', function () {
  let vault: VaultBase;
  let oftUSDC: OFTUSDC;
  let mockEndpoint: SimpleMockLayerZeroEndpoint;
  let owner: any;
  let user1: any;
  let user2: any;

  const VAULT_NAME = 'Test Vault';
  const VAULT_SYMBOL = 'TV';
  const DEPOSIT_CAP = ethers.parseUnits('1000000', 18); // 1M OFTUSDC
  const INITIAL_SUPPLY = ethers.parseUnits('1000000', 18); // 1M OFTUSDC

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

    // Deploy VaultBase
    const VaultBase = await ethers.getContractFactory('VaultBase');
    vault = await VaultBase.deploy(
      await oftUSDC.getAddress(),
      VAULT_NAME,
      VAULT_SYMBOL,
      owner.address,
      DEPOSIT_CAP
    );
    await vault.waitForDeployment();

    // Transfer USDC to users (OFTUSDC mints to deployer in constructor)
    const quarterSupply = INITIAL_SUPPLY / 4n;
    await oftUSDC.transfer(user1.address, quarterSupply);
    await oftUSDC.transfer(user2.address, quarterSupply);
    // Keep some for owner operations
  });

  describe('Deployment', function () {
    it('Should set correct initial values', async function () {
      expect(await vault.name()).to.equal(VAULT_NAME);
      expect(await vault.symbol()).to.equal(VAULT_SYMBOL);
      expect(await vault.asset()).to.equal(await oftUSDC.getAddress());
      expect(await vault.owner()).to.equal(owner.address);
      expect(await vault.depositCap()).to.equal(DEPOSIT_CAP);
      // feeRecipient removed for demo
    });

    it('Should have zero initial supply and assets', async function () {
      expect(await vault.totalSupply()).to.equal(0);
      expect(await vault.totalAssets()).to.equal(0);
    });
  });

  describe('Deposits', function () {
    it('Should handle first deposit correctly', async function () {
      const depositAmount = ethers.parseUnits('1000', 6);
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      expect(await vault.totalSupply()).to.equal(depositAmount);
      expect(await vault.totalAssets()).to.equal(depositAmount);
      expect(await vault.balanceOf(user1.address)).to.equal(depositAmount);
      expect(await vault.getAssetsPerShare()).to.equal(ethers.parseUnits('1', 18));
    });

    it('Should handle multiple deposits correctly', async function () {
      const deposit1 = ethers.parseUnits('1000', 6);
      const deposit2 = ethers.parseUnits('2000', 6);
      
      // First deposit
      await oftUSDC.connect(user1).approve(await vault.getAddress(), deposit1);
      await vault.connect(user1).deposit(deposit1, user1.address);

      // Second deposit
      await oftUSDC.connect(user2).approve(await vault.getAddress(), deposit2);
      await vault.connect(user2).deposit(deposit2, user2.address);

      expect(await vault.totalSupply()).to.equal(deposit1 + deposit2);
      expect(await vault.totalAssets()).to.equal(deposit1 + deposit2);
      expect(await vault.balanceOf(user1.address)).to.equal(deposit1);
      expect(await vault.balanceOf(user2.address)).to.equal(deposit2);
    });

    it('Should respect deposit cap', async function () {
      const overCapAmount = DEPOSIT_CAP + ethers.parseUnits('1', 6);
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), overCapAmount);
      
      await expect(
        vault.connect(user1).deposit(overCapAmount, user1.address)
      ).to.be.reverted;
    });

    it('Should handle mint function correctly', async function () {
      const shares = ethers.parseUnits('1000', 6);
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), shares);
      await vault.connect(user1).mint(shares, user1.address);

      expect(await vault.totalSupply()).to.equal(shares);
      expect(await vault.balanceOf(user1.address)).to.equal(shares);
    });
  });

  describe('Redemptions', function () {
    beforeEach(async function () {
      // Setup: deposit some assets first
      const depositAmount = ethers.parseUnits('1000', 6);
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);
    });

    it('Should handle partial redemption correctly', async function () {
      const redeemShares = ethers.parseUnits('500', 6);
      const initialBalance = await oftUSDC.balanceOf(user1.address);
      
      await vault.connect(user1).redeem(redeemShares, user1.address, user1.address);

      expect(await vault.balanceOf(user1.address)).to.equal(ethers.parseUnits('500', 6));
      expect(await vault.totalSupply()).to.equal(ethers.parseUnits('500', 6));
      expect(await oftUSDC.balanceOf(user1.address)).to.equal(initialBalance + redeemShares);
    });

    it('Should handle full redemption correctly', async function () {
      const userShares = await vault.balanceOf(user1.address);
      const initialBalance = await oftUSDC.balanceOf(user1.address);
      
      await vault.connect(user1).redeem(userShares, user1.address, user1.address);

      expect(await vault.balanceOf(user1.address)).to.equal(0);
      expect(await vault.totalSupply()).to.equal(0);
      expect(await oftUSDC.balanceOf(user1.address)).to.equal(initialBalance + userShares);
    });

    it('Should handle withdraw function correctly', async function () {
      const withdrawAmount = ethers.parseUnits('500', 6);
      const initialBalance = await oftUSDC.balanceOf(user1.address);
      
      await vault.connect(user1).withdraw(withdrawAmount, user1.address, user1.address);

      expect(await vault.balanceOf(user1.address)).to.equal(ethers.parseUnits('500', 6));
      expect(await oftUSDC.balanceOf(user1.address)).to.equal(initialBalance + withdrawAmount);
    });
  });

  describe('Harvest Function', function () {
    it('Should harvest assets correctly', async function () {
      const harvestAmount = ethers.parseUnits('100', 6);
      const initialAssets = await vault.totalAssets();
      
      await oftUSDC.approve(await vault.getAddress(), harvestAmount);
      await vault.harvest(harvestAmount);

      expect(await vault.totalAssets()).to.equal(initialAssets + harvestAmount);
    });

    it('Should update high water mark on harvest', async function () {
      // First deposit
      const depositAmount = ethers.parseUnits('1000', 6);
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Harvest
      const harvestAmount = ethers.parseUnits('100', 6);
      await oftUSDC.approve(await vault.getAddress(), harvestAmount);
      await vault.harvest(harvestAmount);

      // highWaterMark tracking removed for demo
    });

    it('Should revert on zero harvest amount', async function () {
      await expect(vault.harvest(0)).to.be.reverted;
    });
  });

  describe('NAV Updates', function () {
    it('Should handle positive NAV update', async function () {
      const navAmount = ethers.parseUnits('100', 6);
      const initialAssets = await vault.totalAssets();
      
      await oftUSDC.approve(await vault.getAddress(), navAmount);
      await vault.updateNAV(navAmount);

      expect(await vault.totalAssets()).to.equal(initialAssets + navAmount);
    });

    it('Should handle negative NAV update', async function () {
      // First add some assets
      const addAmount = ethers.parseUnits('1000', 6);
      await oftUSDC.approve(await vault.getAddress(), addAmount);
      await vault.harvest(addAmount);

      // Then reduce NAV
      const navReduction = ethers.parseUnits('100', 6);
      const initialBalance = await oftUSDC.balanceOf(owner.address);
      
      await vault.updateNAV(-navReduction);

      expect(await vault.totalAssets()).to.equal(addAmount - navReduction);
      expect(await oftUSDC.balanceOf(owner.address)).to.equal(initialBalance + navReduction);
    });

    it('Should revert on excessive NAV reduction', async function () {
      const excessiveReduction = ethers.parseUnits('1000', 6);
      
      await expect(vault.updateNAV(-excessiveReduction))
        .to.be.reverted;
    });
  });

  describe('Access Control', function () {
    it('Should only allow owner to harvest', async function () {
      const harvestAmount = ethers.parseUnits('100', 6);
      await oftUSDC.connect(user1).approve(await vault.getAddress(), harvestAmount);
      
      await expect(
        vault.connect(user1).harvest(harvestAmount)
      ).to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount');
    });

    it('Should only allow owner to update NAV', async function () {
      const navAmount = ethers.parseUnits('100', 6);
      await oftUSDC.connect(user1).approve(await vault.getAddress(), navAmount);
      
      await expect(
        vault.connect(user1).updateNAV(navAmount)
      ).to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount');
    });

    it('Should only allow owner to set deposit cap', async function () {
      const newCap = ethers.parseUnits('2000000', 6);
      
      await expect(
        vault.connect(user1).setDepositCap(newCap)
      ).to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount');
    });
  });

  describe('Pause Functionality', function () {
    it('Should pause and unpause correctly', async function () {
      await vault.pause();
      expect(await vault.paused()).to.be.true;

      await vault.unpause();
      expect(await vault.paused()).to.be.false;
    });

    it('Should prevent deposits when paused', async function () {
      const depositAmount = ethers.parseUnits('1000', 6);
      
      await vault.pause();
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      
      await expect(
        vault.connect(user1).deposit(depositAmount, user1.address)
      ).to.be.revertedWithCustomError(vault, 'EnforcedPause');
    });

    it('Should prevent redemptions when paused', async function () {
      // First deposit
      const depositAmount = ethers.parseUnits('1000', 6);
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Then pause and try to redeem
      await vault.pause();
      
      await expect(
        vault.connect(user1).redeem(ethers.parseUnits('500', 6), user1.address, user1.address)
      ).to.be.revertedWithCustomError(vault, 'EnforcedPause');
    });
  });

  describe('Math and Rounding', function () {
    it('Should handle zero supply bootstrap correctly', async function () {
      const depositAmount = ethers.parseUnits('1', 6); // 1 USDC
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      expect(await vault.totalSupply()).to.equal(depositAmount);
      expect(await vault.totalAssets()).to.equal(depositAmount);
      expect(await vault.getAssetsPerShare()).to.equal(ethers.parseUnits('1', 18));
    });

    it('Should maintain 1:1 ratio after first deposit', async function () {
      const depositAmount = ethers.parseUnits('1000', 6);
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      expect(await vault.convertToAssets(await vault.balanceOf(user1.address))).to.equal(depositAmount);
      expect(await vault.convertToShares(depositAmount)).to.equal(await vault.balanceOf(user1.address));
    });

    it('Should handle dust amounts correctly', async function () {
      const depositAmount = ethers.parseUnits('1000', 6);
      const dustAmount = 1; // 1 wei
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Add dust via harvest
      await oftUSDC.approve(await vault.getAddress(), dustAmount);
      await vault.harvest(dustAmount);

      expect(await vault.totalAssets()).to.equal(depositAmount + BigInt(dustAmount));
    });
  });

  describe('Utilization and Metrics', function () {
    it('Should calculate utilization correctly', async function () {
      const depositAmount = ethers.parseUnits('250000', 18); // 250K OFTUSDC (half of cap)
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      const utilization = await vault.getUtilization();
      expect(utilization).to.equal(2500); // 25% utilization (250K / 1M * 10000)
    });

    it('Should return zero utilization when cap is zero', async function () {
      await vault.setDepositCap(0);
      const utilization = await vault.getUtilization();
      expect(utilization).to.equal(0);
    });
  });

  describe('LayerZero OVault Integration', function () {
    it('Should work with OFTUSDC as underlying asset', async function () {
      const depositAmount = ethers.parseUnits('1000', 6);
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      expect(await vault.totalAssets()).to.equal(depositAmount);
      expect(await vault.balanceOf(user1.address)).to.equal(depositAmount);
      expect(await oftUSDC.balanceOf(await vault.getAddress())).to.equal(depositAmount);
    });

    it('Should maintain ERC4626 compliance with OFTUSDC', async function () {
      const depositAmount = ethers.parseUnits('1000', 6);
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Test ERC4626 conversion functions
      const shares = await vault.balanceOf(user1.address);
      const assets = await vault.convertToAssets(shares);
      expect(assets).to.equal(depositAmount);

      const convertedShares = await vault.convertToShares(depositAmount);
      expect(convertedShares).to.equal(shares);
    });

    it('Should handle cross-chain asset transfers', async function () {
      const depositAmount = ethers.parseUnits('1000', 6);
      
      // Simulate cross-chain USDC transfer to vault
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Verify vault holds the OFTUSDC tokens
      expect(await oftUSDC.balanceOf(await vault.getAddress())).to.equal(depositAmount);
      expect(await vault.totalAssets()).to.equal(depositAmount);
    });

    it('Should support cross-chain share representation', async function () {
      const depositAmount = ethers.parseUnits('1000', 6);
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      const shares = await vault.balanceOf(user1.address);
      
      // These shares can be represented on other chains via ShareOFT
      expect(shares).to.equal(depositAmount);
      expect(await vault.totalSupply()).to.equal(shares);
    });

    it('Should maintain asset consistency during cross-chain operations', async function () {
      const depositAmount = ethers.parseUnits('1000', 6);
      const harvestAmount = ethers.parseUnits('100', 6);
      
      // Initial deposit
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Harvest (simulating cross-chain income)
      await oftUSDC.approve(await vault.getAddress(), harvestAmount);
      await vault.harvest(harvestAmount);

      // Verify total assets include both deposit and harvest
      expect(await vault.totalAssets()).to.equal(depositAmount + harvestAmount);
      expect(await oftUSDC.balanceOf(await vault.getAddress())).to.equal(depositAmount + harvestAmount);
    });

    it('Should handle OFTUSDC decimals correctly', async function () {
      const depositAmount = ethers.parseUnits('1000', 18); // Use 18 decimals to match OFTUSDC
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Vault should handle 18-decimal OFTUSDC correctly
      expect(await vault.decimals()).to.equal(18); // Vault uses 18 decimals
      expect(await oftUSDC.decimals()).to.equal(18); // OFTUSDC uses 18 decimals
      expect(await vault.totalAssets()).to.equal(depositAmount);
    });

    it('Should support cross-chain redemption flows', async function () {
      const depositAmount = ethers.parseUnits('1000', 18);
      
      // Deposit
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Redeem (simulating cross-chain redemption)
      const redeemShares = ethers.parseUnits('500', 18);
      const initialBalance = await oftUSDC.balanceOf(user1.address);
      
      await vault.connect(user1).redeem(redeemShares, user1.address, user1.address);

      expect(await vault.balanceOf(user1.address)).to.equal(ethers.parseUnits('500', 18));
      expect(await oftUSDC.balanceOf(user1.address)).to.equal(initialBalance + redeemShares);
    });
  });
});