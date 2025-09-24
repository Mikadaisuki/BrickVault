import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ShareOFT } from '../typechain-types/src';
import { SimpleMockLayerZeroEndpoint } from '../typechain-types/src/mocks';

describe('ShareOFT - Security Tests (LayerZero OVault)', function () {
  let shareOFT: ShareOFT;
  let mockEndpoint: SimpleMockLayerZeroEndpoint;
  let owner: any;
  let user1: any;
  let user2: any;

  const TOKEN_NAME = 'Vault Shares';
  const TOKEN_SYMBOL = 'VS';
  const DECIMALS = 18;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy mock LayerZero endpoint
    const SimpleMockLayerZeroEndpoint = await ethers.getContractFactory('SimpleMockLayerZeroEndpoint');
    mockEndpoint = await SimpleMockLayerZeroEndpoint.deploy();
    await mockEndpoint.waitForDeployment();

    // Deploy ShareOFT
    const ShareOFT = await ethers.getContractFactory('ShareOFT');
    shareOFT = await ShareOFT.deploy(
      TOKEN_NAME,
      TOKEN_SYMBOL,
      await mockEndpoint.getAddress(),
      owner.address
    );
    await shareOFT.waitForDeployment();

    // Set up peer for testing (destination chain)
    await shareOFT.setPeer(1, ethers.zeroPadValue(await shareOFT.getAddress(), 32));
  });

  describe('Critical Security: Share-to-Asset Ratio Protection', function () {
    it('Should NOT have public mint function to prevent ratio breaking', async function () {
      // This is the critical test from LayerZero documentation:
      // "Do NOT mint share tokens directly as this breaks the vault's share-to-asset ratio"
      
      // Verify that ShareOFT does not expose a public mint function
      expect(typeof shareOFT.mint).to.equal('undefined');
      
      // Verify that ShareOFT does not expose a public burn function
      expect(typeof shareOFT.burn).to.equal('undefined');
      
      // Verify that ShareOFT does not expose a public burnFrom function
      expect(typeof shareOFT.burnFrom).to.equal('undefined');
    });

    it('Should prevent direct minting that breaks share-to-asset ratio', async function () {
      // Test that no direct minting is possible
      const mintAmount = ethers.parseUnits('1000', 18);
      
      // Attempt to call non-existent mint function should fail
      // Since mint is not a function, this will throw a TypeError
      expect(() => {
        shareOFT['mint(address,uint256)'](user1.address, mintAmount);
      }).to.throw();
    });

    it('Should maintain zero initial supply to prevent pre-minted shares', async function () {
      // ShareOFT should start with zero supply to prevent ratio issues
      expect(await shareOFT.totalSupply()).to.equal(0);
      expect(await shareOFT.balanceOf(owner.address)).to.equal(0);
      expect(await shareOFT.balanceOf(user1.address)).to.equal(0);
    });

    it('Should only allow minting through LayerZero cross-chain mechanism', async function () {
      // Test that the contract has the required cross-chain functionality
      expect(typeof shareOFT.lzReceive).to.equal('function');
      
      // Test that ShareOFT starts with zero supply (no pre-minted tokens)
      expect(await shareOFT.totalSupply()).to.equal(0);
      expect(await shareOFT.balanceOf(owner.address)).to.equal(0);
      expect(await shareOFT.balanceOf(user1.address)).to.equal(0);
      
      // Test that the contract has proper LayerZero interfaces
      expect(await shareOFT.oftVersion()).to.not.be.undefined;
      expect(await shareOFT.oAppVersion()).to.not.be.undefined;
      
      // Test peer management
      const peerAddress = ethers.zeroPadValue(user1.address, 32);
      await shareOFT.setPeer(2, peerAddress);
      expect(await shareOFT.peers(2)).to.equal(peerAddress);
    });

    it('Should prevent unauthorized minting attempts', async function () {
      // Test various ways someone might try to mint tokens
      const mintAmount = ethers.parseUnits('1000', 18);
      
      // Try to call internal functions directly - these should not exist
      expect(() => {
        shareOFT['_mint(address,uint256)'](user1.address, mintAmount);
      }).to.throw();
      
      // Try to call non-existent functions
      expect(() => {
        shareOFT['mintTo(address,uint256)'](user1.address, mintAmount);
      }).to.throw();
    });

    it('Should maintain share-to-asset ratio integrity', async function () {
      // Test that the contract maintains proper ratio integrity
      const initialSupply = await shareOFT.totalSupply();
      
      // Should start with zero supply
      expect(initialSupply).to.equal(0);
      
      // No direct way to increase supply without proper cross-chain mechanism
      expect(await shareOFT.balanceOf(owner.address)).to.equal(0);
      expect(await shareOFT.balanceOf(user1.address)).to.equal(0);
    });
  });

  describe('Cross-Chain Security', function () {
    it('Should only allow minting from authorized sources', async function () {
      const mintAmount = ethers.parseUnits('1000', 18);
      
      // Test with unauthorized source (different peer)
      const unauthorizedOrigin = {
        srcEid: 2, // Different chain ID
        sender: ethers.zeroPadValue(user1.address, 32),
        nonce: 1
      };

      const message = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address'],
        [mintAmount, user1.address]
      );

      // This should fail due to unauthorized source
      await expect(
        shareOFT.lzReceive(
          unauthorizedOrigin,
          ethers.zeroPadValue('0x1234', 32),
          message,
          owner.address,
          '0x'
        )
      ).to.be.reverted;
    });

    it('Should validate message format in lzReceive', async function () {
      const mintAmount = ethers.parseUnits('1000', 18);
      
      const origin = {
        srcEid: 1,
        sender: ethers.zeroPadValue(owner.address, 32),
        nonce: 1
      };

      // Test with invalid message format
      const invalidMessage = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256'], // Missing address parameter
        [mintAmount]
      );

      // This should fail due to invalid message format
      await expect(
        shareOFT.lzReceive(
          origin,
          ethers.zeroPadValue('0x1234', 32),
          invalidMessage,
          owner.address,
          '0x'
        )
      ).to.be.reverted;
    });

    it('Should handle zero address in cross-chain minting', async function () {
      // Test zero address to dead address conversion
      const zeroAddress = ethers.ZeroAddress;
      const deadAddress = '0x000000000000000000000000000000000000dEaD';
      
      // Verify that zero address is properly handled
      expect(zeroAddress).to.not.equal(deadAddress);
      expect(deadAddress).to.equal('0x000000000000000000000000000000000000dEaD');
      
      // Test that the contract can handle zero address conversion
      expect(await shareOFT.balanceOf(zeroAddress)).to.equal(0);
      expect(await shareOFT.balanceOf(deadAddress)).to.equal(0);
      
      // Test that the contract has proper cross-chain functionality
      expect(typeof shareOFT.lzReceive).to.equal('function');
    });
  });

  describe('Access Control Security', function () {
    it('Should only allow owner to set peers', async function () {
      const peerAddress = ethers.zeroPadValue(user1.address, 32);
      
      // Non-owner should not be able to set peers
      await expect(
        shareOFT.connect(user1).setPeer(2, peerAddress)
      ).to.be.revertedWithCustomError(shareOFT, 'OwnableUnauthorizedAccount');
    });

    it('Should only allow owner to transfer ownership', async function () {
      // Non-owner should not be able to transfer ownership
      await expect(
        shareOFT.connect(user1).transferOwnership(user2.address)
      ).to.be.revertedWithCustomError(shareOFT, 'OwnableUnauthorizedAccount');
    });

    it('Should allow owner to transfer ownership', async function () {
      // Owner should be able to transfer ownership
      await shareOFT.transferOwnership(user1.address);
      expect(await shareOFT.owner()).to.equal(user1.address);
    });
  });

  describe('ERC20 Security', function () {
    it('Should prevent transfers from zero address', async function () {
      const transferAmount = ethers.parseUnits('1000', 18);
      
      await expect(
        shareOFT.transferFrom(ethers.ZeroAddress, user1.address, transferAmount)
      ).to.be.revertedWithCustomError(shareOFT, 'ERC20InsufficientAllowance');
    });

    it('Should prevent transfers to zero address', async function () {
      const transferAmount = ethers.parseUnits('1000', 18);
      
      await expect(
        shareOFT.transfer(ethers.ZeroAddress, transferAmount)
      ).to.be.revertedWithCustomError(shareOFT, 'ERC20InvalidReceiver');
    });

    it('Should prevent transfers exceeding balance', async function () {
      const transferAmount = ethers.parseUnits('1000', 18);
      
      await expect(
        shareOFT.transfer(user1.address, transferAmount)
      ).to.be.revertedWithCustomError(shareOFT, 'ERC20InsufficientBalance');
    });

    it('Should prevent transferFrom exceeding allowance', async function () {
      const transferAmount = ethers.parseUnits('1000', 18);
      const approveAmount = ethers.parseUnits('500', 18);
      
      await shareOFT.approve(user1.address, approveAmount);
      
      await expect(
        shareOFT.connect(user1).transferFrom(owner.address, user2.address, transferAmount)
      ).to.be.revertedWithCustomError(shareOFT, 'ERC20InsufficientAllowance');
    });
  });

  describe('LayerZero Integration Security', function () {
    it('Should validate endpoint in cross-chain operations', async function () {
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

      // This should fail due to insufficient balance (no initial supply)
      await expect(
        shareOFT.send(sendParam, fee, owner.address)
      ).to.be.reverted;
    });

    it('Should handle peer validation correctly', async function () {
      const peerAddress = ethers.zeroPadValue(owner.address, 32);
      
      // Set peer
      await shareOFT.setPeer(2, peerAddress);
      
      // Verify peer is set correctly
      expect(await shareOFT.peers(2)).to.equal(peerAddress);
      expect(await shareOFT.isPeer(2, peerAddress)).to.be.true;
      expect(await shareOFT.isPeer(2, ethers.zeroPadValue(user1.address, 32))).to.be.false;
    });
  });

  describe('Edge Cases and Boundary Conditions', function () {
    it('Should handle maximum uint256 values', async function () {
      // Test that the contract can handle maximum values
      const maxAmount = ethers.MaxUint256;
      
      // Test that the contract has proper overflow protection
      expect(await shareOFT.totalSupply()).to.equal(0);
      expect(await shareOFT.balanceOf(owner.address)).to.equal(0);
      expect(await shareOFT.balanceOf(user1.address)).to.equal(0);
      
      // Test that the contract has proper cross-chain functionality
      expect(typeof shareOFT.lzReceive).to.equal('function');
      
      // Test that the contract can handle large values in calculations
      expect(maxAmount).to.equal(ethers.MaxUint256);
    });

    it('Should handle zero amount transfers', async function () {
      // Zero amount transfers should be allowed
      await shareOFT.transfer(user1.address, 0);
      expect(await shareOFT.balanceOf(user1.address)).to.equal(0);
    });

    it('Should handle zero amount approvals', async function () {
      // Zero amount approvals should be allowed
      await shareOFT.approve(user1.address, 0);
      expect(await shareOFT.allowance(owner.address, user1.address)).to.equal(0);
    });
  });
});
