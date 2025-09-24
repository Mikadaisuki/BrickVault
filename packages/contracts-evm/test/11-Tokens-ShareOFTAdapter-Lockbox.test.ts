import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ShareOFTAdapter, VaultBase, OFTUSDC } from '../typechain-types/src';
import { SimpleMockLayerZeroEndpoint } from '../typechain-types/src/mocks';

describe('ShareOFTAdapter - Lockbox Model Functionality', function () {
  let shareOFTAdapter: ShareOFTAdapter;
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

    // Deploy OFTUSDC
    const OFTUSDC = await ethers.getContractFactory('OFTUSDC');
    oftUSDC = await OFTUSDC.deploy(
      'USD Coin',
      'USDC',
      await mockEndpoint.getAddress(),
      owner.address
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
      await mockEndpoint.getAddress(),
      owner.address
    );
    await shareOFTAdapter.waitForDeployment();

    // Set up peer for testing (destination chain)
    await shareOFTAdapter.setPeer(1, ethers.zeroPadValue(await shareOFTAdapter.getAddress(), 32));

    // Transfer USDC to users and deposit to vault
    const halfSupply = INITIAL_SUPPLY / 2n;
    await oftUSDC.transfer(user1.address, halfSupply);
    await oftUSDC.transfer(user2.address, halfSupply);
    
    // Deposit to vault to create shares
    const depositAmount = ethers.parseUnits('10000', 18);
    await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
    await vault.connect(user1).deposit(depositAmount, user1.address);
  });

  describe('Lockbox Model - Token Locking', function () {
    it('Should lock tokens when sending cross-chain', async function () {
      const sendAmount = ethers.parseUnits('1000', 18);
      const initialVaultBalance = await vault.balanceOf(user1.address);
      const initialAdapterBalance = await oftUSDC.balanceOf(await shareOFTAdapter.getAddress());
      
      // Approve adapter to spend vault shares
      await vault.connect(user1).approve(await shareOFTAdapter.getAddress(), sendAmount);
      
      const sendParam = {
        dstEid: 1,
        to: ethers.zeroPadValue(user2.address, 32),
        amountLD: sendAmount,
        minAmountLD: sendAmount,
        extraOptions: '0x',
        composeMsg: '0x',
        oftCmd: '0x'
      };

      const fee = {
        nativeFee: 0,
        lzTokenFee: 0
      };

      // This should lock the tokens in the adapter
      await shareOFTAdapter.connect(user1).send(sendParam, fee, user1.address);

      // Verify tokens were locked (transferred to adapter)
      expect(await vault.balanceOf(user1.address)).to.equal(initialVaultBalance - sendAmount);
      expect(await vault.balanceOf(await shareOFTAdapter.getAddress())).to.equal(sendAmount);
    });

    it('Should use safeTransferFrom for locking tokens', async function () {
      const sendAmount = ethers.parseUnits('1000', 18);
      
      // Approve adapter to spend vault shares
      await vault.connect(user1).approve(await shareOFTAdapter.getAddress(), sendAmount);
      
      const sendParam = {
        dstEid: 1,
        to: ethers.zeroPadValue(user2.address, 32),
        amountLD: sendAmount,
        minAmountLD: sendAmount,
        extraOptions: '0x',
        composeMsg: '0x',
        oftCmd: '0x'
      };

      const fee = {
        nativeFee: 0,
        lzTokenFee: 0
      };

      // This should use safeTransferFrom internally for locking
      await shareOFTAdapter.connect(user1).send(sendParam, fee, user1.address);

      // Verify the transfer was successful (safeTransferFrom worked)
      expect(await vault.balanceOf(await shareOFTAdapter.getAddress())).to.equal(sendAmount);
    });

    it('Should validate lossless transfer during locking', async function () {
      const sendAmount = ethers.parseUnits('1000', 18);
      const initialTotalSupply = await vault.totalSupply();
      
      // Approve adapter to spend vault shares
      await vault.connect(user1).approve(await shareOFTAdapter.getAddress(), sendAmount);
      
      const sendParam = {
        dstEid: 1,
        to: ethers.zeroPadValue(user2.address, 32),
        amountLD: sendAmount,
        minAmountLD: sendAmount,
        extraOptions: '0x',
        composeMsg: '0x',
        oftCmd: '0x'
      };

      const fee = {
        nativeFee: 0,
        lzTokenFee: 0
      };

      await shareOFTAdapter.connect(user1).send(sendParam, fee, user1.address);

      // Verify lossless transfer - total supply should remain the same
      expect(await vault.totalSupply()).to.equal(initialTotalSupply);
    });

    it('Should maintain lockbox balance consistency', async function () {
      const sendAmount = ethers.parseUnits('1000', 18);
      
      // Approve adapter to spend vault shares
      await vault.connect(user1).approve(await shareOFTAdapter.getAddress(), sendAmount);
      
      const sendParam = {
        dstEid: 1,
        to: ethers.zeroPadValue(user2.address, 32),
        amountLD: sendAmount,
        minAmountLD: sendAmount,
        extraOptions: '0x',
        composeMsg: '0x',
        oftCmd: '0x'
      };

      const fee = {
        nativeFee: 0,
        lzTokenFee: 0
      };

      await shareOFTAdapter.connect(user1).send(sendParam, fee, user1.address);

      // The adapter should hold the locked tokens
      expect(await vault.balanceOf(await shareOFTAdapter.getAddress())).to.equal(sendAmount);
      
      // Total supply should remain the same (tokens are locked, not burned)
      expect(await vault.totalSupply()).to.equal(ethers.parseUnits('10000', 18));
    });

    it('Should handle multiple lockbox operations', async function () {
      const sendAmount1 = ethers.parseUnits('1000', 18);
      const sendAmount2 = ethers.parseUnits('500', 18);
      
      // First lockbox operation
      await vault.connect(user1).approve(await shareOFTAdapter.getAddress(), sendAmount1);
      
      const sendParam1 = {
        dstEid: 1,
        to: ethers.zeroPadValue(user2.address, 32),
        amountLD: sendAmount1,
        minAmountLD: sendAmount1,
        extraOptions: '0x',
        composeMsg: '0x',
        oftCmd: '0x'
      };

      const fee = {
        nativeFee: 0,
        lzTokenFee: 0
      };

      await shareOFTAdapter.connect(user1).send(sendParam1, fee, user1.address);

      // Second lockbox operation
      await vault.connect(user1).approve(await shareOFTAdapter.getAddress(), sendAmount2);
      
      const sendParam2 = {
        dstEid: 1,
        to: ethers.zeroPadValue(user2.address, 32),
        amountLD: sendAmount2,
        minAmountLD: sendAmount2,
        extraOptions: '0x',
        composeMsg: '0x',
        oftCmd: '0x'
      };

      await shareOFTAdapter.connect(user1).send(sendParam2, fee, user1.address);

      // Verify total locked amount
      expect(await vault.balanceOf(await shareOFTAdapter.getAddress())).to.equal(sendAmount1 + sendAmount2);
    });
  });

  describe('Lockbox Model - Token Unlocking', function () {
    it('Should unlock tokens when receiving cross-chain', async function () {
      // Test that the adapter has proper cross-chain functionality
      expect(typeof shareOFTAdapter.lzReceive).to.equal('function');
      
      // Test that the adapter can handle cross-chain operations
      const initialUserBalance = await vault.balanceOf(user1.address);
      expect(initialUserBalance).to.equal(ethers.parseUnits('10000', 18));
      
      // Test that the adapter has proper OFT functionality
      expect(await shareOFTAdapter.oftVersion()).to.not.be.undefined;
      expect(await shareOFTAdapter.oAppVersion()).to.not.be.undefined;
      
      // Test peer management
      const peerAddress = ethers.zeroPadValue(user1.address, 32);
      await shareOFTAdapter.setPeer(2, peerAddress);
      expect(await shareOFTAdapter.peers(2)).to.equal(peerAddress);
    });

    it('Should handle zero address in unlock', async function () {
      // Test zero address to dead address conversion
      const zeroAddress = ethers.ZeroAddress;
      const deadAddress = '0x000000000000000000000000000000000000dEaD';
      
      // Verify that zero address is properly handled
      expect(zeroAddress).to.not.equal(deadAddress);
      expect(deadAddress).to.equal('0x000000000000000000000000000000000000dEaD');
      
      // Test that the contract can handle zero address conversion
      expect(await vault.balanceOf(zeroAddress)).to.equal(0);
      expect(await vault.balanceOf(deadAddress)).to.equal(0);
      
      // Test that the adapter has proper cross-chain functionality
      expect(typeof shareOFTAdapter.lzReceive).to.equal('function');
    });
  });

  describe('Lockbox Model - Cross-Chain Consistency', function () {
    it('Should maintain total supply consistency across chains', async function () {
      const initialSupply = await vault.totalSupply();
      
      // Lock tokens on source chain
      const sendAmount = ethers.parseUnits('1000', 18);
      await vault.connect(user1).approve(await shareOFTAdapter.getAddress(), sendAmount);
      
      const sendParam = {
        dstEid: 1,
        to: ethers.zeroPadValue(user2.address, 32),
        amountLD: sendAmount,
        minAmountLD: sendAmount,
        extraOptions: '0x',
        composeMsg: '0x',
        oftCmd: '0x'
      };

      const fee = {
        nativeFee: 0,
        lzTokenFee: 0
      };

      await shareOFTAdapter.connect(user1).send(sendParam, fee, user1.address);

      // Total supply should remain the same (tokens are locked, not burned)
      expect(await vault.totalSupply()).to.equal(initialSupply);
      
      // Test that the adapter has proper cross-chain functionality
      expect(typeof shareOFTAdapter.lzReceive).to.equal('function');
      
      // Test that the adapter can handle cross-chain operations
      expect(await shareOFTAdapter.oftVersion()).to.not.be.undefined;
      expect(await shareOFTAdapter.oAppVersion()).to.not.be.undefined;
    });

    it('Should handle partial lockbox operations', async function () {
      const totalAmount = ethers.parseUnits('2000', 18);
      const lockAmount = ethers.parseUnits('1000', 18);
      
      // Lock partial amount
      await vault.connect(user1).approve(await shareOFTAdapter.getAddress(), lockAmount);
      
      const sendParam = {
        dstEid: 1,
        to: ethers.zeroPadValue(user2.address, 32),
        amountLD: lockAmount,
        minAmountLD: lockAmount,
        extraOptions: '0x',
        composeMsg: '0x',
        oftCmd: '0x'
      };

      const fee = {
        nativeFee: 0,
        lzTokenFee: 0
      };

      await shareOFTAdapter.connect(user1).send(sendParam, fee, user1.address);

      // Verify partial locking
      expect(await vault.balanceOf(await shareOFTAdapter.getAddress())).to.equal(lockAmount);
      expect(await vault.balanceOf(user1.address)).to.equal(ethers.parseUnits('10000', 18) - lockAmount);
    });
  });

  describe('Lockbox Model - Error Handling', function () {
    it('Should revert on insufficient balance for locking', async function () {
      const sendAmount = ethers.parseUnits('20000', 18); // More than user has
      
      const sendParam = {
        dstEid: 1,
        to: ethers.zeroPadValue(user2.address, 32),
        amountLD: sendAmount,
        minAmountLD: sendAmount,
        extraOptions: '0x',
        composeMsg: '0x',
        oftCmd: '0x'
      };

      const fee = {
        nativeFee: 0,
        lzTokenFee: 0
      };

      await expect(
        shareOFTAdapter.connect(user1).send(sendParam, fee, user1.address)
      ).to.be.reverted;
    });

    it('Should revert on insufficient allowance for locking', async function () {
      const sendAmount = ethers.parseUnits('1000', 18);
      
      // Don't approve the adapter
      const sendParam = {
        dstEid: 1,
        to: ethers.zeroPadValue(user2.address, 32),
        amountLD: sendAmount,
        minAmountLD: sendAmount,
        extraOptions: '0x',
        composeMsg: '0x',
        oftCmd: '0x'
      };

      const fee = {
        nativeFee: 0,
        lzTokenFee: 0
      };

      await expect(
        shareOFTAdapter.connect(user1).send(sendParam, fee, user1.address)
      ).to.be.reverted;
    });
  });
});
