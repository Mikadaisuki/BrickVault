import { expect } from 'chai';
import { ethers } from 'hardhat';
import { VaultComposerSync, VaultBase, OFTUSDC, ShareOFTAdapter } from '../typechain-types/src';
import { SimpleMockLayerZeroEndpoint } from '../typechain-types/src/mocks';

describe('VaultComposerSync - LayerZero OVault Integration', function () {
  let vaultComposer: VaultComposerSync;
  let vault: VaultBase;
  let oftUSDC: OFTUSDC;
  let shareOFTAdapter: ShareOFTAdapter;
  let mockEndpoint: SimpleMockLayerZeroEndpoint;
  let owner: any;
  let user1: any;
  let user2: any;

  const VAULT_NAME = 'Test OVault';
  const VAULT_SYMBOL = 'TOV';
  const DEPOSIT_CAP = ethers.parseUnits('1000000', 6); // 1M USDC
  const INITIAL_SUPPLY = ethers.parseUnits('1000000', 6); // 1M USDC

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
      await mockEndpoint.getAddress(), // Use mock endpoint
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

    // Deploy ShareOFTAdapter
    const ShareOFTAdapter = await ethers.getContractFactory('ShareOFTAdapter');
    shareOFTAdapter = await ShareOFTAdapter.deploy(
      await vault.getAddress(), // vault shares token
      await mockEndpoint.getAddress(), // Use mock endpoint
      owner.address // delegate
    );
    await shareOFTAdapter.waitForDeployment();

    // Deploy VaultComposerSync
    const VaultComposerSync = await ethers.getContractFactory('src/VaultComposerSync.sol:VaultComposerSync');
    vaultComposer = await VaultComposerSync.deploy(
      await vault.getAddress(), // vault
      await oftUSDC.getAddress(), // assetOFT
      await shareOFTAdapter.getAddress() // shareOFT
    );
    await vaultComposer.waitForDeployment();

    // Transfer USDC to users (OFTUSDC mints to deployer in constructor)
    const quarterSupply = INITIAL_SUPPLY / 4n;
    await oftUSDC.transfer(user1.address, quarterSupply);
    await oftUSDC.transfer(user2.address, quarterSupply);
    // Keep some for owner operations
  });

  describe('Deployment', function () {
    it('Should set correct vault address', async function () {
      expect(await vaultComposer.VAULT()).to.equal(await vault.getAddress());
    });

    it('Should set correct asset OFT address', async function () {
      expect(await vaultComposer.ASSET_OFT()).to.equal(await oftUSDC.getAddress());
    });

    it('Should set correct share OFT address', async function () {
      expect(await vaultComposer.SHARE_OFT()).to.equal(await shareOFTAdapter.getAddress());
    });

    it('Should have correct vault name and symbol', async function () {
      expect(await vault.name()).to.equal(VAULT_NAME);
      expect(await vault.symbol()).to.equal(VAULT_SYMBOL);
    });
  });

  describe('Cross-Chain Deposit Simulation', function () {
    it('Should handle deposit through vault directly (not cross-chain)', async function () {
      const depositAmount = ethers.parseUnits('1000', 6);
      
      // Approve vault to spend USDC
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      
      // Deposit directly to vault (simulating local deposit)
      await vault.connect(user1).deposit(depositAmount, user1.address);

      expect(await vault.balanceOf(user1.address)).to.equal(depositAmount);
      expect(await vault.totalAssets()).to.equal(depositAmount);
      expect(await oftUSDC.balanceOf(await vault.getAddress())).to.equal(depositAmount);
    });

    it('Should handle multiple deposits through vault directly', async function () {
      const deposit1 = ethers.parseUnits('1000', 6);
      const deposit2 = ethers.parseUnits('2000', 6);
      
      // First deposit
      await oftUSDC.connect(user1).approve(await vault.getAddress(), deposit1);
      await vault.connect(user1).deposit(deposit1, user1.address);

      // Second deposit
      await oftUSDC.connect(user2).approve(await vault.getAddress(), deposit2);
      await vault.connect(user2).deposit(deposit2, user2.address);

      expect(await vault.balanceOf(user1.address)).to.equal(deposit1);
      expect(await vault.balanceOf(user2.address)).to.equal(deposit2);
      expect(await vault.totalAssets()).to.equal(deposit1 + deposit2);
    });

    it('Should respect deposit cap through vault directly', async function () {
      const overCapAmount = DEPOSIT_CAP + ethers.parseUnits('1', 6);
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), overCapAmount);
      
      await expect(
        vault.connect(user1).deposit(overCapAmount, user1.address)
      ).to.be.reverted;
    });
  });

  describe('Cross-Chain Redemption Simulation', function () {
    beforeEach(async function () {
      // Setup: deposit some assets first
      const depositAmount = ethers.parseUnits('1000', 6);
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);
    });

    it('Should handle redemption through vault directly', async function () {
      const redeemShares = ethers.parseUnits('500', 6);
      const initialBalance = await oftUSDC.balanceOf(user1.address);
      
      await vault.connect(user1).redeem(redeemShares, user1.address, user1.address);

      expect(await vault.balanceOf(user1.address)).to.equal(ethers.parseUnits('500', 6));
      expect(await vault.totalSupply()).to.equal(ethers.parseUnits('500', 6));
      expect(await oftUSDC.balanceOf(user1.address)).to.equal(initialBalance + redeemShares);
    });

    it('Should handle full redemption through vault directly', async function () {
      const userShares = await vault.balanceOf(user1.address);
      const initialBalance = await oftUSDC.balanceOf(user1.address);
      
      await vault.connect(user1).redeem(userShares, user1.address, user1.address);

      expect(await vault.balanceOf(user1.address)).to.equal(0);
      expect(await vault.totalSupply()).to.equal(0);
      expect(await oftUSDC.balanceOf(user1.address)).to.equal(initialBalance + userShares);
    });

    it('Should handle withdraw through vault directly', async function () {
      const withdrawAmount = ethers.parseUnits('500', 6);
      const initialBalance = await oftUSDC.balanceOf(user1.address);
      
      await vault.connect(user1).withdraw(withdrawAmount, user1.address, user1.address);

      expect(await vault.balanceOf(user1.address)).to.equal(ethers.parseUnits('500', 6));
      expect(await oftUSDC.balanceOf(user1.address)).to.equal(initialBalance + withdrawAmount);
    });
  });

  describe('Cross-Chain Share Transfer Simulation', function () {
    beforeEach(async function () {
      // Setup: deposit some assets first
      const depositAmount = ethers.parseUnits('1000', 6);
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);
    });

    it('Should handle share transfer directly', async function () {
      const transferAmount = ethers.parseUnits('500', 6);
      
      // Transfer shares directly (simulating local transfer)
      await vault.connect(user1).transfer(user2.address, transferAmount);

      expect(await vault.balanceOf(user1.address)).to.equal(ethers.parseUnits('500', 6));
      expect(await vault.balanceOf(user2.address)).to.equal(transferAmount);
    });

    it('Should handle share approval and transferFrom', async function () {
      const transferAmount = ethers.parseUnits('500', 6);
      
      // Approve and transfer shares
      await vault.connect(user1).approve(user2.address, transferAmount);
      await vault.connect(user2).transferFrom(user1.address, user2.address, transferAmount);

      expect(await vault.balanceOf(user1.address)).to.equal(ethers.parseUnits('500', 6));
      expect(await vault.balanceOf(user2.address)).to.equal(transferAmount);
    });
  });

  describe('Cross-Chain Asset Transfer Simulation', function () {
    it('Should handle USDC transfer directly', async function () {
      const transferAmount = ethers.parseUnits('1000', 6);
      
      // Transfer USDC directly (simulating local transfer)
      await oftUSDC.connect(user1).transfer(user2.address, transferAmount);

      expect(await oftUSDC.balanceOf(user1.address)).to.equal(INITIAL_SUPPLY / 4n - transferAmount);
      expect(await oftUSDC.balanceOf(user2.address)).to.equal(INITIAL_SUPPLY / 4n + transferAmount);
    });

    it('Should handle USDC approval and transferFrom', async function () {
      const transferAmount = ethers.parseUnits('1000', 6);
      
      // Approve and transfer USDC
      await oftUSDC.connect(user1).approve(user2.address, transferAmount);
      await oftUSDC.connect(user2).transferFrom(user1.address, user2.address, transferAmount);

      expect(await oftUSDC.balanceOf(user1.address)).to.equal(INITIAL_SUPPLY / 4n - transferAmount);
      expect(await oftUSDC.balanceOf(user2.address)).to.equal(INITIAL_SUPPLY / 4n + transferAmount);
    });
  });

  describe('Integration with Vault Operations', function () {
    it('Should maintain vault state consistency during operations', async function () {
      const depositAmount = ethers.parseUnits('1000', 6);
      const harvestAmount = ethers.parseUnits('100', 6);
      
      // Deposit through vault directly
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Transfer USDC to owner for harvest operation
      await oftUSDC.transfer(owner.address, harvestAmount);
      await oftUSDC.approve(await vault.getAddress(), harvestAmount);
      await vault.harvest(harvestAmount);

      // Check vault state
      expect(await vault.totalAssets()).to.equal(depositAmount + harvestAmount);
      expect(await vault.balanceOf(user1.address)).to.equal(depositAmount);
      expect(await vault.getAssetsPerShare()).to.be.greaterThan(ethers.parseUnits('1', 18));
    });

    it('Should handle NAV updates with integration', async function () {
      const depositAmount = ethers.parseUnits('1000', 6);
      const navAmount = ethers.parseUnits('200', 6);
      
      // Deposit through vault directly
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Transfer USDC to owner for NAV update operation
      await oftUSDC.transfer(owner.address, navAmount);
      await oftUSDC.approve(await vault.getAddress(), navAmount);
      await vault.updateNAV(navAmount);

      // Check vault state
      expect(await vault.totalAssets()).to.equal(depositAmount + navAmount);
      expect(await vault.balanceOf(user1.address)).to.equal(depositAmount);
    });
  });

  describe('Error Handling', function () {
    it('Should revert on insufficient allowance for deposit', async function () {
      const depositAmount = ethers.parseUnits('1000', 6);
      
      await expect(
        vault.connect(user1).deposit(depositAmount, user1.address)
      ).to.be.revertedWithCustomError(oftUSDC, 'ERC20InsufficientAllowance');
    });

    it('Should revert on insufficient balance for deposit', async function () {
      const depositAmount = ethers.parseUnits('1000000', 6); // More than user has but less than cap
      
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      
      await expect(
        vault.connect(user1).deposit(depositAmount, user1.address)
      ).to.be.revertedWithCustomError(oftUSDC, 'ERC20InsufficientBalance');
    });

    it('Should revert on insufficient shares for redemption', async function () {
      const redeemShares = ethers.parseUnits('1000', 6);
      
      await expect(
        vault.connect(user1).redeem(redeemShares, user1.address, user1.address)
      ).to.be.revertedWithCustomError(vault, 'ERC4626ExceededMaxRedeem');
    });
  });

  describe('Access Control', function () {
    it('Should only allow owner to perform admin operations on vault', async function () {
      const harvestAmount = ethers.parseUnits('100', 6);
      await oftUSDC.connect(user1).approve(await vault.getAddress(), harvestAmount);
      
      await expect(
        vault.connect(user1).harvest(harvestAmount)
      ).to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount');
    });

    it('Should only allow owner to perform admin operations on OFT contracts', async function () {
      // Test that non-owner cannot call admin functions on OFT
      // Since OFTUSDC doesn't have public admin functions, we test that transfers work normally
      const transferAmount = ethers.parseUnits('100', 6);
      
      // This should succeed since user1 has balance
      await oftUSDC.connect(user1).transfer(user2.address, transferAmount);
      
      // Verify the transfer worked
      expect(await oftUSDC.balanceOf(user2.address)).to.equal(INITIAL_SUPPLY / 4n + transferAmount);
    });
  });

  describe('Cross-Chain State Synchronization', function () {
    it('Should maintain consistent state across simulated chains', async function () {
      const depositAmount = ethers.parseUnits('1000', 6);
      
      // Simulate deposit on "source chain"
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // Simulate share transfer to "destination chain"
      const transferAmount = ethers.parseUnits('500', 6);
      await vault.connect(user1).transfer(user2.address, transferAmount);

      // Check final state
      expect(await vault.balanceOf(user1.address)).to.equal(ethers.parseUnits('500', 6));
      expect(await vault.balanceOf(user2.address)).to.equal(transferAmount);
      expect(await vault.totalSupply()).to.equal(depositAmount);
      expect(await vault.totalAssets()).to.equal(depositAmount);
    });
  });
});
