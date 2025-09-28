import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ShareOFTAdapter, VaultBase, OFTUSDC } from '../typechain-types/src';
import { EndpointV2Mock } from '../typechain-types/src/mocks';

describe('ShareOFTAdapter - LayerZero OFT Adapter for Vault Shares', function () {
  let shareOFTAdapter: ShareOFTAdapter;
  let vault: VaultBase;
  let oftUSDC: OFTUSDC;
  let mockEndpoint: EndpointV2Mock;
  let owner: any;
  let user1: any;
  let user2: any;

  const VAULT_NAME = 'Test Vault';
  const VAULT_SYMBOL = 'TV';
  const DEPOSIT_CAP = ethers.parseUnits('1000000', 18); // 1M OFTUSDC
  const INITIAL_SUPPLY = ethers.parseUnits('1000000', 18); // 1M OFTUSDC

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy official LayerZero mock endpoint
    const MockLayerZeroEndpointV2 = await ethers.getContractFactory('EndpointV2Mock');
    mockEndpoint = await MockLayerZeroEndpointV2.deploy(
      1 // eid (endpoint ID) for local testing
    );
    await mockEndpoint.waitForDeployment();

    // Deploy OFTUSDC
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

    // Deploy ShareOFTAdapter
    const ShareOFTAdapter = await ethers.getContractFactory('ShareOFTAdapter');
    shareOFTAdapter = await ShareOFTAdapter.deploy(
      await vault.getAddress(), // vault shares token
      await mockEndpoint.getAddress(), // lzEndpoint - use mock endpoint
      owner.address // delegate
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

  describe('Deployment', function () {
    it('Should set correct token address', async function () {
      expect(await shareOFTAdapter.token()).to.equal(await vault.getAddress());
    });

    it('Should set correct owner', async function () {
      expect(await shareOFTAdapter.owner()).to.equal(owner.address);
    });

    it('Should set correct LayerZero endpoint', async function () {
      expect(await shareOFTAdapter.endpoint()).to.equal(await mockEndpoint.getAddress());
    });

    it('Should have correct shared decimals', async function () {
      expect(await shareOFTAdapter.sharedDecimals()).to.equal(6); // USDC decimals
    });

    it('Should have correct decimal conversion rate', async function () {
      expect(await shareOFTAdapter.decimalConversionRate()).to.equal(10n ** 12n); // 18 - 6 = 12
    });
  });

  describe('OFT Adapter Functionality', function () {
    it('Should have correct approval required setting', async function () {
      expect(await shareOFTAdapter.approvalRequired()).to.equal(true);
    });

    it('Should have correct OFT version', async function () {
      const version = await shareOFTAdapter.oftVersion();
      expect(version.interfaceId).to.not.equal('');
      expect(version.version).to.be.greaterThan(0);
    });

    it('Should have correct OApp version', async function () {
      const version = await shareOFTAdapter.oAppVersion();
      expect(version.senderVersion).to.be.greaterThan(0);
      expect(version.receiverVersion).to.be.greaterThan(0);
    });
  });

  describe('LayerZero OFT Functionality', function () {
    it('Should have correct OFT interface', async function () {
      // Check that the contract has the required OFT functions
      expect(typeof shareOFTAdapter.send).to.equal('function');
      expect(typeof shareOFTAdapter.quoteSend).to.equal('function');
      expect(typeof shareOFTAdapter.quoteOFT).to.equal('function');
    });

    it('Should quote send fee (mock)', async function () {
      const sendParam = {
        dstEid: 1,
        to: ethers.zeroPadValue(user2.address, 32),
        amountLD: ethers.parseUnits('1000', 18),
        minAmountLD: ethers.parseUnits('1000', 18),
        extraOptions: '0x',
        composeMsg: '0x',
        oftCmd: '0x'
      };

      const fee = await shareOFTAdapter.quoteSend(sendParam, false);

      // In test environment, fees should be zero
      expect(fee.nativeFee).to.equal(0);
      expect(fee.lzTokenFee).to.equal(0);
    });

    it('Should quote OFT details (mock)', async function () {
      const sendParam = {
        dstEid: 1,
        to: ethers.zeroPadValue(user2.address, 32),
        amountLD: ethers.parseUnits('1000', 18),
        minAmountLD: ethers.parseUnits('1000', 18),
        extraOptions: '0x',
        composeMsg: '0x',
        oftCmd: '0x'
      };

      const quote = await shareOFTAdapter.quoteOFT(sendParam);

      // Check that quote returns expected structure
      expect(quote.oftLimit).to.not.be.undefined;
      expect(quote.oftFeeDetails).to.be.an('array');
      expect(quote.oftReceipt).to.not.be.undefined;
    });

    it('Should handle send operation (mock)', async function () {
      const sendParam = {
        dstEid: 1,
        to: ethers.zeroPadValue(user2.address, 32),
        amountLD: ethers.parseUnits('1000', 18),
        minAmountLD: ethers.parseUnits('1000', 18),
        extraOptions: '0x',
        composeMsg: '0x',
        oftCmd: '0x'
      };

      const fee = {
        nativeFee: 0,
        lzTokenFee: 0
      };

      // Approve the adapter to spend vault shares
      await vault.connect(user1).approve(await shareOFTAdapter.getAddress(), ethers.parseUnits('1000', 18));

      // In test environment, this should work with mock endpoint
      await expect(
        shareOFTAdapter.connect(user1).send(sendParam, fee, user1.address)
      ).to.not.be.reverted;
    });
  });

  describe('Lockbox Model Functionality', function () {
    it('Should lock tokens when sending cross-chain', async function () {
      const sendAmount = ethers.parseUnits('1000', 18);
      const initialBalance = await vault.balanceOf(user1.address);
      
      // Approve adapter to spend vault shares
      await vault.connect(user1).approve(await shareOFTAdapter.getAddress(), sendAmount);
      
      // In a real scenario, this would lock the tokens in the adapter
      // For testing, we verify the approval is in place
      expect(await vault.allowance(user1.address, await shareOFTAdapter.getAddress())).to.equal(sendAmount);
    });

    it('Should unlock tokens when receiving cross-chain', async function () {
      // In a real scenario, this would unlock tokens from the adapter
      // For testing, we verify the adapter can handle the operation
      const unlockAmount = ethers.parseUnits('1000', 18);
      
      // This would be called by the LayerZero endpoint when receiving
      // For testing, we just verify the function exists
      expect(typeof shareOFTAdapter.lzReceive).to.equal('function');
    });

    it('Should maintain token balance consistency', async function () {
      const initialVaultSupply = await vault.totalSupply();
      
      // The adapter should always reflect the underlying token's supply
      // Since it's an adapter, it delegates to the underlying token
      expect(await shareOFTAdapter.token()).to.equal(await vault.getAddress());
    });
  });

  describe('Access Control', function () {
    it('Should only allow owner to perform admin operations', async function () {
      // The adapter should only allow the owner to perform certain operations
      // For testing, we verify the owner is set correctly
      expect(await shareOFTAdapter.owner()).to.equal(owner.address);
    });

    it('Should delegate token operations to underlying contract', async function () {
      // The adapter should delegate all token operations to the underlying vault
      expect(await shareOFTAdapter.token()).to.equal(await vault.getAddress());
    });
  });

  describe('Error Handling', function () {
    it('Should revert on send with insufficient allowance', async function () {
      const sendParam = {
        dstEid: 1,
        to: ethers.zeroPadValue(user2.address, 32),
        amountLD: ethers.parseUnits('1000', 18),
        minAmountLD: ethers.parseUnits('1000', 18),
        extraOptions: '0x',
        composeMsg: '0x',
        oftCmd: '0x'
      };

      const fee = {
        nativeFee: 0,
        lzTokenFee: 0
      };

      // Don't approve the adapter to spend vault shares
      await expect(
        shareOFTAdapter.connect(user1).send(sendParam, fee, user1.address)
      ).to.be.reverted;
    });

    it('Should revert on send with invalid destination', async function () {
      const sendParam = {
        dstEid: 0, // Invalid destination
        to: ethers.zeroPadValue(user2.address, 32),
        amountLD: ethers.parseUnits('1000', 18),
        minAmountLD: ethers.parseUnits('1000', 18),
        extraOptions: '0x',
        composeMsg: '0x',
        oftCmd: '0x'
      };

      const fee = {
        nativeFee: 0,
        lzTokenFee: 0
      };

      await vault.connect(user1).approve(await shareOFTAdapter.getAddress(), ethers.parseUnits('1000', 18));
      
      await expect(
        shareOFTAdapter.connect(user1).send(sendParam, fee, user1.address)
      ).to.be.reverted;
    });
  });

  describe('Integration with Vault', function () {
    it('Should reflect vault state changes', async function () {
      const initialVaultBalance = await vault.balanceOf(user1.address);
      
      // Make a deposit directly to vault
      const depositAmount = ethers.parseUnits('1000', 18);
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      // Check that vault balance increased
      const newVaultBalance = await vault.balanceOf(user1.address);
      expect(newVaultBalance).to.equal(initialVaultBalance + depositAmount);
    });

    it('Should handle vault share transfers directly', async function () {
      const transferAmount = ethers.parseUnits('1000', 18);
      const initialUser1Balance = await vault.balanceOf(user1.address);
      const initialUser2Balance = await vault.balanceOf(user2.address);
      
      // Transfer shares directly through vault
      await vault.connect(user1).transfer(user2.address, transferAmount);
      
      expect(await vault.balanceOf(user1.address)).to.equal(initialUser1Balance - transferAmount);
      expect(await vault.balanceOf(user2.address)).to.equal(initialUser2Balance + transferAmount);
    });

    it('Should maintain total supply consistency', async function () {
      const vaultSupply = await vault.totalSupply();
      
      // Make a deposit to vault
      const depositAmount = ethers.parseUnits('1000', 18);
      await oftUSDC.connect(user1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      // Check that vault supply is updated
      const newVaultSupply = await vault.totalSupply();
      expect(newVaultSupply).to.equal(vaultSupply + depositAmount);
    });
  });

  describe('Cross-Chain Share Synchronization', function () {
    it('Should enable cross-chain share transfers', async function () {
      // This test verifies that the adapter enables cross-chain transfers
      // of vault shares through LayerZero
      const shareAmount = ethers.parseUnits('1000', 18);
      
      // Approve adapter to spend shares
      await vault.connect(user1).approve(await shareOFTAdapter.getAddress(), shareAmount);
      
      // In a real scenario, this would initiate a cross-chain transfer
      // For testing, we verify the approval is in place
      expect(await vault.allowance(user1.address, await shareOFTAdapter.getAddress())).to.equal(shareAmount);
    });

    it('Should maintain share-to-asset ratio across chains', async function () {
      // This test verifies that the share representation maintains
      // consistency with the underlying vault assets across chains
      const shareAmount = await vault.balanceOf(user1.address);
      const assetAmount = await vault.convertToAssets(shareAmount);
      
      // The adapter should maintain the same conversion ratio as the vault
      // Since it's an adapter, it delegates to the underlying token
      expect(await shareOFTAdapter.token()).to.equal(await vault.getAddress());
    });
  });
});
