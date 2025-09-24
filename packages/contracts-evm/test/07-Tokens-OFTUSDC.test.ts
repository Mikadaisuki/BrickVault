import { expect } from 'chai';
import { ethers } from 'hardhat';
import { OFTUSDC } from '../typechain-types/src';
import { SimpleMockLayerZeroEndpoint } from '../typechain-types/src/mocks';

describe('OFTUSDC - LayerZero OFT USDC', function () {
  let oftUSDC: OFTUSDC;
  let mockEndpoint: SimpleMockLayerZeroEndpoint;
  let owner: any;
  let user1: any;
  let user2: any;

  const TOKEN_NAME = 'USD Coin';
  const TOKEN_SYMBOL = 'USDC';
  const INITIAL_SUPPLY = ethers.parseUnits('1000000', 18); // 1M OFTUSDC
  const DECIMALS = 18;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy mock LayerZero endpoint
    const SimpleMockLayerZeroEndpoint = await ethers.getContractFactory('SimpleMockLayerZeroEndpoint');
    mockEndpoint = await SimpleMockLayerZeroEndpoint.deploy();
    await mockEndpoint.waitForDeployment();

    // Deploy OFTUSDC
    const OFTUSDC = await ethers.getContractFactory('OFTUSDC');
    oftUSDC = await OFTUSDC.deploy(
      TOKEN_NAME,
      TOKEN_SYMBOL,
      await mockEndpoint.getAddress(), // lzEndpoint - use mock endpoint
      owner.address // delegate
    );
    await oftUSDC.waitForDeployment();

    // Set up peer for testing (destination chain)
    await oftUSDC.setPeer(1, ethers.zeroPadValue(await oftUSDC.getAddress(), 32));
  });

  describe('Deployment', function () {
    it('Should set correct name and symbol', async function () {
      expect(await oftUSDC.name()).to.equal(TOKEN_NAME);
      expect(await oftUSDC.symbol()).to.equal(TOKEN_SYMBOL);
    });

    it('Should set correct decimals', async function () {
      expect(await oftUSDC.decimals()).to.equal(DECIMALS);
    });

    it('Should set correct owner', async function () {
      expect(await oftUSDC.owner()).to.equal(owner.address);
    });

    it('Should mint initial supply to deployer', async function () {
      expect(await oftUSDC.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
      expect(await oftUSDC.totalSupply()).to.equal(INITIAL_SUPPLY);
    });

    it('Should set correct LayerZero endpoint', async function () {
      expect(await oftUSDC.endpoint()).to.equal(await mockEndpoint.getAddress());
    });
  });

  describe('Basic ERC20 Functionality', function () {
    it('Should transfer tokens correctly', async function () {
      const transferAmount = ethers.parseUnits('1000', 18);
      
      await oftUSDC.transfer(user1.address, transferAmount);

      expect(await oftUSDC.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY - transferAmount);
      expect(await oftUSDC.balanceOf(user1.address)).to.equal(transferAmount);
    });

    it('Should approve and transferFrom correctly', async function () {
      const transferAmount = ethers.parseUnits('1000', 18);
      
      await oftUSDC.approve(user1.address, transferAmount);
      expect(await oftUSDC.allowance(owner.address, user1.address)).to.equal(transferAmount);

      await oftUSDC.connect(user1).transferFrom(owner.address, user2.address, transferAmount);

      expect(await oftUSDC.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY - transferAmount);
      expect(await oftUSDC.balanceOf(user2.address)).to.equal(transferAmount);
      expect(await oftUSDC.allowance(owner.address, user1.address)).to.equal(0);
    });

    it('Should emit Transfer events', async function () {
      const transferAmount = ethers.parseUnits('1000', 18);
      
      await expect(oftUSDC.transfer(user1.address, transferAmount))
        .to.emit(oftUSDC, 'Transfer')
        .withArgs(owner.address, user1.address, transferAmount);
    });

    it('Should emit Approval events', async function () {
      const approveAmount = ethers.parseUnits('1000', 18);
      
      await expect(oftUSDC.approve(user1.address, approveAmount))
        .to.emit(oftUSDC, 'Approval')
        .withArgs(owner.address, user1.address, approveAmount);
    });
  });

  describe('LayerZero OFT Functionality', function () {
    it('Should have correct OFT interface', async function () {
      // Check that the contract has the required OFT functions
      expect(typeof oftUSDC.send).to.equal('function');
      expect(typeof oftUSDC.quoteSend).to.equal('function');
      expect(typeof oftUSDC.quoteOFT).to.equal('function');
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

      const fee = await oftUSDC.quoteSend(sendParam, false);

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

      const quote = await oftUSDC.quoteOFT(sendParam);

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
      await expect(
        oftUSDC.send(sendParam, fee, owner.address)
      ).to.not.be.reverted;
    });
  });

  describe('Access Control', function () {
    it('Should only allow owner to perform admin operations', async function () {
      // Test that non-owner cannot call admin functions
      await expect(
        oftUSDC.connect(user1).setPeer(1, ethers.zeroPadValue(user1.address, 32))
      ).to.be.revertedWithCustomError(oftUSDC, 'OwnableUnauthorizedAccount');
    });
  });

  describe('Error Handling', function () {
    it('Should revert on transfer to zero address', async function () {
      const transferAmount = ethers.parseUnits('1000', 18);
      
      await expect(
        oftUSDC.transfer(ethers.ZeroAddress, transferAmount)
      ).to.be.revertedWithCustomError(oftUSDC, 'ERC20InvalidReceiver');
    });

    it('Should revert on transfer from zero address', async function () {
      const transferAmount = ethers.parseUnits('1000', 18);
      
      await expect(
        oftUSDC.transferFrom(ethers.ZeroAddress, user1.address, transferAmount)
      ).to.be.revertedWithCustomError(oftUSDC, 'ERC20InsufficientAllowance');
    });

    it('Should revert on transfer amount exceeds balance', async function () {
      const transferAmount = INITIAL_SUPPLY + ethers.parseUnits('1', 18);
      
      await expect(
        oftUSDC.transfer(user1.address, transferAmount)
      ).to.be.revertedWithCustomError(oftUSDC, 'ERC20InsufficientBalance');
    });

    it('Should revert on transferFrom amount exceeds allowance', async function () {
      const transferAmount = ethers.parseUnits('1000', 18);
      const approveAmount = ethers.parseUnits('500', 18);
      
      await oftUSDC.approve(user1.address, approveAmount);
      
      await expect(
        oftUSDC.connect(user1).transferFrom(owner.address, user2.address, transferAmount)
      ).to.be.revertedWithCustomError(oftUSDC, 'ERC20InsufficientAllowance');
    });
  });

  describe('Edge Cases', function () {
    it('Should handle zero amount transfers', async function () {
      await oftUSDC.transfer(user1.address, 0);
      expect(await oftUSDC.balanceOf(user1.address)).to.equal(0);
    });

    it('Should handle zero amount approvals', async function () {
      await oftUSDC.approve(user1.address, 0);
      expect(await oftUSDC.allowance(owner.address, user1.address)).to.equal(0);
    });
  });
});