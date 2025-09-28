import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PropertyRegistryRateLimit } from '../typechain-types';

describe('PropertyRegistryRateLimit', function () {
  let rateLimit: PropertyRegistryRateLimit;
  let deployer: any;
  let user1: any;
  let user2: any;

  beforeEach(async function () {
    [deployer, user1, user2] = await ethers.getSigners();

    // Deploy PropertyRegistryRateLimit
    const PropertyRegistryRateLimit = await ethers.getContractFactory('PropertyRegistryRateLimit');
    rateLimit = await PropertyRegistryRateLimit.deploy(deployer.address);
    await rateLimit.waitForDeployment();
  });

  describe('Rate Limiting Logic', function () {
    it('Should allow first property creation', async function () {
      await expect(
        rateLimit.checkPropertyCreationRateLimit(user1.address)
      ).to.not.be.reverted;
    });

    it('Should enforce cooldown period', async function () {
      // First creation
      await rateLimit.checkPropertyCreationRateLimit(user1.address);
      
      // Second creation immediately should fail
      await expect(
        rateLimit.checkPropertyCreationRateLimit(user1.address)
      ).to.be.reverted; // Just check that it reverts, not the specific message
    });

    it('Should allow creation after cooldown', async function () {
      // First creation
      await rateLimit.checkPropertyCreationRateLimit(user1.address);
      
      // Fast forward 1 minute + 1 second
      await ethers.provider.send('evm_increaseTime', [61]);
      await ethers.provider.send('evm_mine', []);
      
      // Second creation should succeed
      await expect(
        rateLimit.checkPropertyCreationRateLimit(user1.address)
      ).to.not.be.reverted;
    });

    it('Should enforce daily rate limit', async function () {
      // Create 20 properties (max per day)
      for (let i = 0; i < 20; i++) {
        if (i > 0) {
          // Fast forward 1 minute between each creation
          await ethers.provider.send('evm_increaseTime', [61]);
          await ethers.provider.send('evm_mine', []);
        }
        
        await rateLimit.checkPropertyCreationRateLimit(user1.address);
      }
      
      // 21st creation should fail
      await ethers.provider.send('evm_increaseTime', [61]);
      await ethers.provider.send('evm_mine', []);
      
      await expect(
        rateLimit.checkPropertyCreationRateLimit(user1.address)
      ).to.be.reverted;
    });

    it('Should reset daily limit after 24 hours', async function () {
      // Create 20 properties
      for (let i = 0; i < 20; i++) {
        if (i > 0) {
          await ethers.provider.send('evm_increaseTime', [61]);
          await ethers.provider.send('evm_mine', []);
        }
        
        await rateLimit.checkPropertyCreationRateLimit(user1.address);
      }
      
      // Fast forward 24 hours + 1 second
      await ethers.provider.send('evm_increaseTime', [86401]);
      await ethers.provider.send('evm_mine', []);
      
      // Should be able to create again
      await expect(
        rateLimit.checkPropertyCreationRateLimit(user1.address)
      ).to.not.be.reverted;
    });
  });

  describe('Rate Limit Status', function () {
    it('Should return correct status for new user', async function () {
      const [canCreate, remainingCount, timeUntilReset] = await rateLimit.getPropertyCreationStatus(user1.address);
      
      expect(canCreate).to.be.true;
      expect(remainingCount).to.equal(20);
      expect(timeUntilReset).to.equal(0);
    });

    it('Should update status after property creation', async function () {
      await rateLimit.checkPropertyCreationRateLimit(user1.address);
      
      const [canCreate, remainingCount, timeUntilReset] = await rateLimit.getPropertyCreationStatus(user1.address);
      
      expect(canCreate).to.be.false; // Due to cooldown
      expect(remainingCount).to.equal(19);
      expect(timeUntilReset).to.be.greaterThan(0);
    });

    it('Should update status after cooldown expires', async function () {
      await rateLimit.checkPropertyCreationRateLimit(user1.address);
      
      // Fast forward past cooldown
      await ethers.provider.send('evm_increaseTime', [61]);
      await ethers.provider.send('evm_mine', []);
      
      const [canCreate, remainingCount, timeUntilReset] = await rateLimit.getPropertyCreationStatus(user1.address);
      
      expect(canCreate).to.be.true;
      expect(remainingCount).to.equal(19);
      expect(timeUntilReset).to.be.greaterThan(0);
    });

    it('Should reset status after 24 hours', async function () {
      await rateLimit.checkPropertyCreationRateLimit(user1.address);
      
      // Fast forward 24 hours + 1 second
      await ethers.provider.send('evm_increaseTime', [86401]);
      await ethers.provider.send('evm_mine', []);
      
      const [canCreate, remainingCount, timeUntilReset] = await rateLimit.getPropertyCreationStatus(user1.address);
      
      expect(canCreate).to.be.true;
      expect(remainingCount).to.equal(20);
      expect(timeUntilReset).to.equal(0);
    });
  });

  describe('Rate Limit Data', function () {
    it('Should return zero data for new user', async function () {
      const [lastCreation, count] = await rateLimit.getRateLimitData(user1.address);
      
      expect(lastCreation).to.equal(0);
      expect(count).to.equal(0);
    });

    it('Should update data after property creation', async function () {
      const beforeTime = await ethers.provider.getBlock('latest');
      await rateLimit.checkPropertyCreationRateLimit(user1.address);
      
      const [lastCreation, count] = await rateLimit.getRateLimitData(user1.address);
      
      expect(lastCreation).to.be.greaterThan(beforeTime!.timestamp);
      expect(count).to.equal(1);
    });

    it('Should increment count with multiple creations', async function () {
      // Create 3 properties
      for (let i = 0; i < 3; i++) {
        if (i > 0) {
          await ethers.provider.send('evm_increaseTime', [61]);
          await ethers.provider.send('evm_mine', []);
        }
        
        await rateLimit.checkPropertyCreationRateLimit(user1.address);
      }
      
      const [lastCreation, count] = await rateLimit.getRateLimitData(user1.address);
      
      expect(count).to.equal(3);
      expect(lastCreation).to.be.greaterThan(0);
    });
  });

  describe('Rate Limit Reset', function () {
    it('Should reset rate limit for user', async function () {
      // Create a property
      await rateLimit.checkPropertyCreationRateLimit(user1.address);
      
      // Verify data exists
      let [lastCreation, count] = await rateLimit.getRateLimitData(user1.address);
      expect(count).to.equal(1);
      expect(lastCreation).to.be.greaterThan(0);
      
      // Reset rate limit
      await rateLimit.resetRateLimit(user1.address);
      
      // Verify data is reset
      [lastCreation, count] = await rateLimit.getRateLimitData(user1.address);
      expect(count).to.equal(0);
      expect(lastCreation).to.equal(0);
      
      // Verify status is reset
      const [canCreate, remainingCount, timeUntilReset] = await rateLimit.getPropertyCreationStatus(user1.address);
      expect(canCreate).to.be.true;
      expect(remainingCount).to.equal(20);
      expect(timeUntilReset).to.equal(0);
    });

    it('Should only allow owner to reset rate limit', async function () {
      await expect(
        rateLimit.connect(user1).resetRateLimit(user2.address)
      ).to.be.revertedWithCustomError(rateLimit, 'OwnableUnauthorizedAccount');
    });

    it('Should allow immediate creation after reset', async function () {
      // Create a property
      await rateLimit.checkPropertyCreationRateLimit(user1.address);
      
      // Reset rate limit
      await rateLimit.resetRateLimit(user1.address);
      
      // Should be able to create immediately
      await expect(
        rateLimit.checkPropertyCreationRateLimit(user1.address)
      ).to.not.be.reverted;
    });
  });

  describe('Multiple Users', function () {
    it('Should track rate limits separately for different users', async function () {
      // User1 creates a property
      await rateLimit.checkPropertyCreationRateLimit(user1.address);
      
      // User2 should be able to create immediately (separate rate limit)
      await expect(
        rateLimit.checkPropertyCreationRateLimit(user2.address)
      ).to.not.be.reverted;
      
      // Verify separate tracking
      const [user1Count] = await rateLimit.getRateLimitData(user1.address);
      const [user2Count] = await rateLimit.getRateLimitData(user2.address);
      
      expect(user1Count).to.be.greaterThan(0);
      expect(user2Count).to.be.greaterThan(0);
      expect(user1Count).to.not.equal(user2Count);
    });

    it('Should reset rate limits independently', async function () {
      // Both users create properties
      await rateLimit.checkPropertyCreationRateLimit(user1.address);
      await rateLimit.checkPropertyCreationRateLimit(user2.address);
      
      // Reset only user1
      await rateLimit.resetRateLimit(user1.address);
      
      // User1 should be able to create immediately
      await expect(
        rateLimit.checkPropertyCreationRateLimit(user1.address)
      ).to.not.be.reverted;
      
      // User2 should still be in cooldown
      await expect(
        rateLimit.checkPropertyCreationRateLimit(user2.address)
      ).to.be.reverted;
    });
  });

  describe('Edge Cases', function () {
    it('Should handle boundary conditions for daily limit', async function () {
      // Create exactly 20 properties
      for (let i = 0; i < 20; i++) {
        if (i > 0) {
          await ethers.provider.send('evm_increaseTime', [61]);
          await ethers.provider.send('evm_mine', []);
        }
        
        await rateLimit.checkPropertyCreationRateLimit(user1.address);
      }
      
      // Verify exactly at limit
      const [canCreate, remainingCount] = await rateLimit.getPropertyCreationStatus(user1.address);
      expect(canCreate).to.be.false; // Due to cooldown, but count should be at limit
      expect(remainingCount).to.equal(0);
    });

    it('Should handle time edge cases', async function () {
      // Create property
      await rateLimit.checkPropertyCreationRateLimit(user1.address);
      
      // Fast forward exactly 1 minute
      await ethers.provider.send('evm_increaseTime', [60]);
      await ethers.provider.send('evm_mine', []);
      
      // Should be allowed (exactly 1 minute, >= condition)
      await expect(
        rateLimit.checkPropertyCreationRateLimit(user1.address)
      ).to.not.be.reverted;
      
      // Fast forward 1 more second
      await ethers.provider.send('evm_increaseTime', [1]);
      await ethers.provider.send('evm_mine', []);
      
      // Should be reverted (within new cooldown period)
      await expect(
        rateLimit.checkPropertyCreationRateLimit(user1.address)
      ).to.be.reverted;
    });
  });
});
