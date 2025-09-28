import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PropertyToken } from '../typechain-types';

describe('PropertyToken', function () {
  let propertyToken: PropertyToken;
  let deployer: any;
  let user1: any;
  let user2: any;
  let vault: any;

  beforeEach(async function () {
    [deployer, user1, user2, vault] = await ethers.getSigners();

    // Deploy PropertyToken
    const PropertyToken = await ethers.getContractFactory('PropertyToken');
    propertyToken = await PropertyToken.deploy(
      1, // propertyId
      'Test Property',
      '123 Main St, City, State',
      vault.address // owner (vault)
    );
    await propertyToken.waitForDeployment();
  });

  describe('Initialization', function () {
    it('Should initialize with correct parameters', async function () {
      const [propertyId, propertyName, propertyAddress, totalSupply, totalNAVChanges, lastNAVUpdate] = 
        await propertyToken.getPropertyInfo();
      
      expect(propertyId).to.equal(1);
      expect(propertyName).to.equal('Test Property');
      expect(propertyAddress).to.equal('123 Main St, City, State');
      expect(totalSupply).to.equal(ethers.parseEther('1')); // INITIAL_SUPPLY
      expect(totalNAVChanges).to.equal(0);
      expect(lastNAVUpdate).to.equal(0);
    });

    it('Should mint initial supply to owner', async function () {
      const balance = await propertyToken.balanceOf(vault.address);
      expect(balance).to.equal(ethers.parseEther('1'));
    });

    it('Should set correct decimals', async function () {
      const decimals = await propertyToken.decimals();
      expect(decimals).to.equal(18);
    });

    it('Should reject invalid initialization parameters', async function () {
      const PropertyToken = await ethers.getContractFactory('PropertyToken');
      
      await expect(
        PropertyToken.deploy(0, 'Test', 'Address', vault.address)
      ).to.be.reverted;
      
      await expect(
        PropertyToken.deploy(1, '', 'Address', vault.address)
      ).to.be.reverted;
      
      await expect(
        PropertyToken.deploy(1, 'Test', '', vault.address)
      ).to.be.reverted;
    });
  });

  describe('Authorization Management', function () {
    it('Should add authorized minter', async function () {
      await propertyToken.connect(vault).addAuthorizedMinter(user1.address);
      
      const isAuthorized = await propertyToken.isAuthorizedMinter(user1.address);
      expect(isAuthorized).to.be.true;
    });

    it('Should add authorized burner', async function () {
      await propertyToken.connect(vault).addAuthorizedBurner(user1.address);
      
      const isAuthorized = await propertyToken.isAuthorizedBurner(user1.address);
      expect(isAuthorized).to.be.true;
    });

    it('Should remove authorized minter', async function () {
      await propertyToken.connect(vault).addAuthorizedMinter(user1.address);
      await propertyToken.connect(vault).removeAuthorizedMinter(user1.address);
      
      const isAuthorized = await propertyToken.isAuthorizedMinter(user1.address);
      expect(isAuthorized).to.be.false;
    });

    it('Should remove authorized burner', async function () {
      await propertyToken.connect(vault).addAuthorizedBurner(user1.address);
      await propertyToken.connect(vault).removeAuthorizedBurner(user1.address);
      
      const isAuthorized = await propertyToken.isAuthorizedBurner(user1.address);
      expect(isAuthorized).to.be.false;
    });

    it('Should only allow owner to manage authorization', async function () {
      await expect(
        propertyToken.connect(user1).addAuthorizedMinter(user2.address)
      ).to.be.revertedWithCustomError(propertyToken, 'OwnableUnauthorizedAccount');
    });

    it('Should reject invalid addresses', async function () {
      await expect(
        propertyToken.connect(vault).addAuthorizedMinter(ethers.ZeroAddress)
      ).to.be.reverted;
      
      await expect(
        propertyToken.connect(vault).addAuthorizedBurner(ethers.ZeroAddress)
      ).to.be.reverted;
    });
  });

  describe('Minting', function () {
    beforeEach(async function () {
      await propertyToken.connect(vault).addAuthorizedMinter(user1.address);
    });

    it('Should mint tokens to authorized minter', async function () {
      const mintAmount = ethers.parseEther('100');
      
      await expect(
        propertyToken.connect(user1).mint(user2.address, mintAmount, 'Test mint')
      ).to.not.be.reverted;
      
      const balance = await propertyToken.balanceOf(user2.address);
      expect(balance).to.equal(mintAmount);
    });

    it('Should emit mint event', async function () {
      const mintAmount = ethers.parseEther('50');
      
      await expect(
        propertyToken.connect(user1).mint(user2.address, mintAmount, 'Test mint')
      ).to.emit(propertyToken, 'PropertyTokenMinted')
        .withArgs(user2.address, mintAmount, 'Test mint');
    });

    it('Should reject minting by unauthorized address', async function () {
      const mintAmount = ethers.parseEther('100');
      
      await expect(
        propertyToken.connect(user2).mint(user1.address, mintAmount, 'Test mint')
      ).to.be.reverted;
    });

    it('Should reject minting to zero address', async function () {
      const mintAmount = ethers.parseEther('100');
      
      await expect(
        propertyToken.connect(user1).mint(ethers.ZeroAddress, mintAmount, 'Test mint')
      ).to.be.reverted;
    });

    it('Should reject zero amount minting', async function () {
      await expect(
        propertyToken.connect(user1).mint(user2.address, 0, 'Test mint')
      ).to.be.reverted;
    });

    it('Should reject minting that exceeds max supply', async function () {
      const maxSupply = await propertyToken.MAX_SUPPLY();
      const currentSupply = await propertyToken.totalSupply();
      const excessAmount = maxSupply - currentSupply + 1n;
      
      await expect(
        propertyToken.connect(user1).mint(user2.address, excessAmount, 'Test mint')
      ).to.be.reverted;
    });
  });

  describe('Burning', function () {
    beforeEach(async function () {
      await propertyToken.connect(vault).addAuthorizedMinter(user1.address);
      await propertyToken.connect(vault).addAuthorizedBurner(user1.address);
      
      // Mint some tokens to user2
      await propertyToken.connect(user1).mint(user2.address, ethers.parseEther('100'), 'Initial mint');
    });

    it('Should burn tokens from authorized burner', async function () {
      const burnAmount = ethers.parseEther('50');
      
      await expect(
        propertyToken.connect(user1).burn(user2.address, burnAmount, 'Test burn')
      ).to.not.be.reverted;
      
      const balance = await propertyToken.balanceOf(user2.address);
      expect(balance).to.equal(ethers.parseEther('50'));
    });

    it('Should emit burn event', async function () {
      const burnAmount = ethers.parseEther('25');
      
      await expect(
        propertyToken.connect(user1).burn(user2.address, burnAmount, 'Test burn')
      ).to.emit(propertyToken, 'PropertyTokenBurned')
        .withArgs(user2.address, burnAmount, 'Test burn');
    });

    it('Should reject burning by unauthorized address', async function () {
      const burnAmount = ethers.parseEther('50');
      
      await expect(
        propertyToken.connect(user2).burn(user1.address, burnAmount, 'Test burn')
      ).to.be.reverted;
    });

    it('Should reject burning from zero address', async function () {
      const burnAmount = ethers.parseEther('50');
      
      await expect(
        propertyToken.connect(user1).burn(ethers.ZeroAddress, burnAmount, 'Test burn')
      ).to.be.reverted;
    });

    it('Should reject zero amount burning', async function () {
      await expect(
        propertyToken.connect(user1).burn(user2.address, 0, 'Test burn')
      ).to.be.reverted;
    });

    it('Should reject burning more than balance', async function () {
      const balance = await propertyToken.balanceOf(user2.address);
      const excessAmount = balance + 1n;
      
      await expect(
        propertyToken.connect(user1).burn(user2.address, excessAmount, 'Test burn')
      ).to.be.reverted;
    });
  });

  describe('NAV Updates', function () {
    beforeEach(async function () {
      await propertyToken.connect(vault).addAuthorizedMinter(user1.address);
    });

    it('Should handle positive NAV update (appreciation)', async function () {
      const delta = ethers.parseEther('50');
      
      await expect(
        propertyToken.connect(user1).updateNAV(delta, 'Property appreciation')
      ).to.emit(propertyToken, 'PropertyTokenMinted')
        .withArgs(user1.address, delta, 'Property appreciation');
      
      const balance = await propertyToken.balanceOf(user1.address);
      expect(balance).to.equal(delta);
      
      const [,,, totalSupply, totalNAVChanges, lastNAVUpdate] = await propertyToken.getPropertyInfo();
      expect(totalNAVChanges).to.equal(delta);
      expect(lastNAVUpdate).to.be.greaterThan(0);
    });

    it('Should handle negative NAV update (depreciation)', async function () {
      // First mint some tokens to user1
      await propertyToken.connect(user1).mint(user1.address, ethers.parseEther('100'), 'Initial mint');
      
      const delta = -ethers.parseEther('25');
      
      await expect(
        propertyToken.connect(user1).updateNAV(delta, 'Property depreciation')
      ).to.emit(propertyToken, 'PropertyTokenBurned')
        .withArgs(user1.address, ethers.parseEther('25'), 'Property depreciation');
      
      const balance = await propertyToken.balanceOf(user1.address);
      expect(balance).to.equal(ethers.parseEther('75'));
      
      const [,,, totalSupply, totalNAVChanges, lastNAVUpdate] = await propertyToken.getPropertyInfo();
      expect(totalNAVChanges).to.equal(ethers.parseEther('25'));
      expect(lastNAVUpdate).to.be.greaterThan(0);
    });

    it('Should handle zero NAV update', async function () {
      const delta = 0;
      
      await expect(
        propertyToken.connect(user1).updateNAV(delta, 'No change')
      ).to.not.emit(propertyToken, 'PropertyTokenMinted')
        .and.to.not.emit(propertyToken, 'PropertyTokenBurned');
      
      const [,,, totalSupply, totalNAVChanges, lastNAVUpdate] = await propertyToken.getPropertyInfo();
      expect(totalNAVChanges).to.equal(0);
      expect(lastNAVUpdate).to.be.greaterThan(0);
    });

    it('Should emit NAVUpdated event', async function () {
      const delta = ethers.parseEther('30');
      
      await expect(
        propertyToken.connect(user1).updateNAV(delta, 'NAV update')
      ).to.emit(propertyToken, 'NAVUpdated')
        .withArgs(1, delta, ethers.parseEther('31')); // Initial supply (1) + delta (30)
    });

    it('Should reject NAV update by unauthorized address', async function () {
      const delta = ethers.parseEther('50');
      
      await expect(
        propertyToken.connect(user2).updateNAV(delta, 'Unauthorized update')
      ).to.be.reverted;
    });

    it('Should reject negative NAV update exceeding balance', async function () {
      // Mint some tokens to user1
      await propertyToken.connect(user1).mint(user1.address, ethers.parseEther('100'), 'Initial mint');
      
      const delta = -ethers.parseEther('150'); // More than balance
      
      await expect(
        propertyToken.connect(user1).updateNAV(delta, 'Excessive depreciation')
      ).to.be.reverted;
    });
  });

  describe('NAV Change Percentage', function () {
    it('Should return zero for initial state', async function () {
      const navChangePercentage = await propertyToken.getNAVChangePercentage();
      expect(navChangePercentage).to.equal(0);
    });

    it('Should calculate appreciation percentage correctly', async function () {
      await propertyToken.connect(vault).addAuthorizedMinter(user1.address);
      
      // 50% appreciation
      const delta = ethers.parseEther('0.5');
      await propertyToken.connect(user1).updateNAV(delta, 'Appreciation');
      
      const navChangePercentage = await propertyToken.getNAVChangePercentage();
      expect(navChangePercentage).to.equal(5000); // 50% in basis points
    });

    it('Should calculate depreciation percentage correctly', async function () {
      await propertyToken.connect(vault).addAuthorizedBurner(user1.address);
      
      // 25% depreciation (burn 25% of initial supply)
      const burnAmount = ethers.parseEther('0.25'); // 25% of 1 ETH initial supply
      await propertyToken.connect(user1).burn(vault.address, burnAmount, 'Depreciation');
      
      const navChangePercentage = await propertyToken.getNAVChangePercentage();
      expect(navChangePercentage).to.equal(-2500); // -25% in basis points
    });

    it('Should handle large percentage changes', async function () {
      await propertyToken.connect(vault).addAuthorizedMinter(user1.address);
      
      // 200% appreciation
      const delta = ethers.parseEther('2');
      await propertyToken.connect(user1).updateNAV(delta, 'Large appreciation');
      
      const navChangePercentage = await propertyToken.getNAVChangePercentage();
      expect(navChangePercentage).to.equal(20000); // 200% in basis points
    });
  });

  describe('Edge Cases', function () {
    it('Should handle maximum supply boundary', async function () {
      await propertyToken.connect(vault).addAuthorizedMinter(user1.address);
      
      const maxSupply = await propertyToken.MAX_SUPPLY();
      const currentSupply = await propertyToken.totalSupply();
      const maxMintable = maxSupply - currentSupply;
      
      // Should be able to mint up to max supply
      await expect(
        propertyToken.connect(user1).mint(user2.address, maxMintable, 'Max mint')
      ).to.not.be.reverted;
      
      // Should reject minting 1 more token
      await expect(
        propertyToken.connect(user1).mint(user2.address, 1, 'Over max')
      ).to.be.reverted;
    });

    it('Should handle reentrancy protection', async function () {
      await propertyToken.connect(vault).addAuthorizedMinter(user1.address);
      
      // Multiple rapid calls should not cause issues due to reentrancy guard
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          propertyToken.connect(user1).mint(user2.address, ethers.parseEther('10'), `Mint ${i}`)
        );
      }
      
      await expect(Promise.all(promises)).to.not.be.reverted;
    });
  });
});
