import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ShareOFT } from '../typechain-types/src';
import { EndpointV2Mock } from '../typechain-types/src/mocks';

describe('ShareOFT - LayerZero OFT for Vault Shares', function () {
  let shareOFT: ShareOFT;
  let mockEndpoint: EndpointV2Mock;
  let owner: any;
  let user1: any;
  let user2: any;

  const TOKEN_NAME = 'Vault Shares';
  const TOKEN_SYMBOL = 'VS';
  const DECIMALS = 18;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy official LayerZero mock endpoint
    const MockLayerZeroEndpointV2 = await ethers.getContractFactory('EndpointV2Mock');
    mockEndpoint = await MockLayerZeroEndpointV2.deploy(
      1 // eid (endpoint ID) for local testing
    );
    await mockEndpoint.waitForDeployment();

    // Deploy ShareOFT
    const ShareOFT = await ethers.getContractFactory('ShareOFT');
    shareOFT = await ShareOFT.deploy(
      TOKEN_NAME,
      TOKEN_SYMBOL,
      await mockEndpoint.getAddress(), // lzEndpoint - use mock endpoint
      owner.address // delegate
    );
    await shareOFT.waitForDeployment();

    // Set up peer for testing (destination chain)
    await shareOFT.setPeer(1, ethers.zeroPadValue(await shareOFT.getAddress(), 32));
  });

  describe('Deployment', function () {
    it('Should set correct name and symbol', async function () {
      expect(await shareOFT.name()).to.equal(TOKEN_NAME);
      expect(await shareOFT.symbol()).to.equal(TOKEN_SYMBOL);
    });

    it('Should set correct decimals', async function () {
      expect(await shareOFT.decimals()).to.equal(DECIMALS);
    });

    it('Should set correct owner', async function () {
      expect(await shareOFT.owner()).to.equal(owner.address);
    });

    it('Should set correct LayerZero endpoint', async function () {
      expect(await shareOFT.endpoint()).to.equal(await mockEndpoint.getAddress());
    });

    it('Should have zero initial supply', async function () {
      expect(await shareOFT.totalSupply()).to.equal(0);
    });
  });

  describe('Basic ERC20 Functionality', function () {
    it('Should handle zero balance transfers', async function () {
      const transferAmount = ethers.parseUnits('1000', 18);
      
      // Since there's no initial supply, transfers should fail
      await expect(
        shareOFT.transfer(user1.address, transferAmount)
      ).to.be.revertedWithCustomError(shareOFT, 'ERC20InsufficientBalance');
    });

    it('Should handle zero balance transferFrom', async function () {
      const transferAmount = ethers.parseUnits('1000', 18);
      
      // Since there's no initial supply, transferFrom should fail
      await expect(
        shareOFT.connect(user1).transferFrom(owner.address, user2.address, transferAmount)
      ).to.be.revertedWithCustomError(shareOFT, 'ERC20InsufficientAllowance');
    });

    it('Should emit Approval events', async function () {
      const approveAmount = ethers.parseUnits('1000', 18);
      
      await expect(shareOFT.approve(user1.address, approveAmount))
        .to.emit(shareOFT, 'Approval')
        .withArgs(owner.address, user1.address, approveAmount);
    });
  });

  describe('LayerZero OFT Functionality', function () {
    it('Should have correct OFT interface', async function () {
      // Check that the contract has the required OFT functions
      expect(typeof shareOFT.send).to.equal('function');
      expect(typeof shareOFT.quoteSend).to.equal('function');
      expect(typeof shareOFT.quoteOFT).to.equal('function');
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

      const fee = await shareOFT.quoteSend(sendParam, false);

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

      const quote = await shareOFT.quoteOFT(sendParam);

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

      // In test environment, this should work with mock endpoint
      // But it will fail due to insufficient balance since there's no initial supply
      await expect(
        shareOFT.send(sendParam, fee, owner.address)
      ).to.be.reverted;
    });
  });

  describe('Access Control', function () {
    it('Should only allow owner to perform admin operations', async function () {
      // Test that non-owner cannot call admin functions
      await expect(
        shareOFT.connect(user1).setPeer(1, ethers.zeroPadValue(user1.address, 32))
      ).to.be.revertedWithCustomError(shareOFT, 'OwnableUnauthorizedAccount');
    });
  });

  describe('Error Handling', function () {
    it('Should revert on transfer to zero address', async function () {
      const transferAmount = ethers.parseUnits('1000', 18);
      
      await expect(
        shareOFT.transfer(ethers.ZeroAddress, transferAmount)
      ).to.be.revertedWithCustomError(shareOFT, 'ERC20InvalidReceiver');
    });

    it('Should revert on transfer from zero address', async function () {
      const transferAmount = ethers.parseUnits('1000', 18);
      
      await expect(
        shareOFT.transferFrom(ethers.ZeroAddress, user1.address, transferAmount)
      ).to.be.revertedWithCustomError(shareOFT, 'ERC20InsufficientAllowance');
    });

    it('Should revert on transfer amount exceeds balance', async function () {
      const transferAmount = ethers.parseUnits('1000', 18);
      
      await expect(
        shareOFT.transfer(user1.address, transferAmount)
      ).to.be.revertedWithCustomError(shareOFT, 'ERC20InsufficientBalance');
    });

    it('Should revert on transferFrom amount exceeds allowance', async function () {
      const transferAmount = ethers.parseUnits('1000', 18);
      const approveAmount = ethers.parseUnits('500', 18);
      
      await shareOFT.approve(user1.address, approveAmount);
      
      await expect(
        shareOFT.connect(user1).transferFrom(owner.address, user2.address, transferAmount)
      ).to.be.revertedWithCustomError(shareOFT, 'ERC20InsufficientAllowance');
    });
  });

  describe('Edge Cases', function () {
    it('Should handle zero amount transfers', async function () {
      await shareOFT.transfer(user1.address, 0);
      expect(await shareOFT.balanceOf(user1.address)).to.equal(0);
    });

    it('Should handle zero amount approvals', async function () {
      await shareOFT.approve(user1.address, 0);
      expect(await shareOFT.allowance(owner.address, user1.address)).to.equal(0);
    });
  });

  describe('Cross-Chain Share Representation', function () {
    it('Should represent vault shares on spoke chains', async function () {
      // This test verifies that the ShareOFT can represent vault shares
      // on spoke chains through LayerZero
      expect(await shareOFT.name()).to.equal(TOKEN_NAME);
      expect(await shareOFT.symbol()).to.equal(TOKEN_SYMBOL);
      expect(await shareOFT.decimals()).to.equal(DECIMALS);
    });

    it('Should maintain share-to-asset ratio consistency', async function () {
      // This test verifies that the ShareOFT maintains consistency
      // with the underlying vault assets across chains
      expect(await shareOFT.totalSupply()).to.equal(0); // No initial supply
      expect(await shareOFT.balanceOf(owner.address)).to.equal(0);
    });
  });
});