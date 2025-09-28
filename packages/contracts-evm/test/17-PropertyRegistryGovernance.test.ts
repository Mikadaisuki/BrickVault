import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PropertyRegistryGovernance, PropertyRegistryRateLimit, EnvironmentConfig } from '../typechain-types';

describe('PropertyRegistryGovernance', function () {
  let registry: PropertyRegistryGovernance;
  let rateLimit: PropertyRegistryRateLimit;
  let environmentConfig: EnvironmentConfig;
  let oftUSDC: any;
  let deployer: any;
  let user1: any;
  let user2: any;

  beforeEach(async function () {
    [deployer, user1, user2] = await ethers.getSigners();

    // Deploy EnvironmentConfig
    const EnvironmentConfig = await ethers.getContractFactory('EnvironmentConfig');
    environmentConfig = await EnvironmentConfig.deploy(deployer.address);
    await environmentConfig.waitForDeployment();

    // Deploy PropertyRegistryRateLimit
    const PropertyRegistryRateLimit = await ethers.getContractFactory('PropertyRegistryRateLimit');
    rateLimit = await PropertyRegistryRateLimit.deploy(deployer.address);
    await rateLimit.waitForDeployment();

    // Deploy MockLayerZeroEndpointV2
    const MockLayerZeroEndpointV2 = await ethers.getContractFactory('EndpointV2Mock');
    const mockEndpoint = await MockLayerZeroEndpointV2.deploy(1); // eid = 1
    await mockEndpoint.waitForDeployment();

    // Deploy OFTUSDC with mock endpoint
    const OFTUSDC = await ethers.getContractFactory('OFTUSDC');
    oftUSDC = await OFTUSDC.deploy(
      'OFT USDC',
      'OFTUSDC',
      await mockEndpoint.getAddress(),
      deployer.address
    );
    await oftUSDC.waitForDeployment();

    // Deploy PropertyRegistryGovernance
    const PropertyRegistryGovernance = await ethers.getContractFactory('PropertyRegistryGovernance');
    registry = await PropertyRegistryGovernance.deploy(deployer.address, await environmentConfig.getAddress());
    await registry.waitForDeployment();

    // Set rate limit contract
    await registry.setRateLimitContract(await rateLimit.getAddress());
  });

  describe('Rate Limiting', function () {
    it('Should enforce rate limits on property creation', async function () {
      // First property creation should succeed
      await registry.createProperty('Property 1', ethers.parseUnits('1000000', 18), await oftUSDC.getAddress());
      
      // Second creation immediately should fail due to cooldown
      await expect(
        registry.createProperty('Property 2', ethers.parseUnits('2000000', 18), await oftUSDC.getAddress())
      ).to.be.reverted;
    });

    it('Should allow property creation after cooldown', async function () {
      // Create first property
      await registry.createProperty('Property 1', ethers.parseUnits('1000000', 18), await oftUSDC.getAddress());
      
      // Fast forward time by 1 minute + 1 second
      await ethers.provider.send('evm_increaseTime', [61]);
      await ethers.provider.send('evm_mine', []);
      
      // Second creation should now succeed
      await registry.createProperty('Property 2', ethers.parseUnits('2000000', 18), await oftUSDC.getAddress());
      
      const count = await registry.getPropertyCount();
      expect(count).to.equal(2);
    });

    it('Should enforce daily rate limit', async function () {
      // Create 20 properties (max per day)
      for (let i = 1; i <= 20; i++) {
        // Fast forward 1 minute between each creation
        if (i > 1) {
          await ethers.provider.send('evm_increaseTime', [61]);
          await ethers.provider.send('evm_mine', []);
        }
        
        await registry.createProperty(
          `Property ${i}`, 
          ethers.parseUnits(`${i}000000`, 18), 
          await oftUSDC.getAddress()
        );
      }
      
      // 21st creation should fail
      await ethers.provider.send('evm_increaseTime', [61]);
      await ethers.provider.send('evm_mine', []);
      
      await expect(
        registry.createProperty('Property 21', ethers.parseUnits('21000000', 18), await oftUSDC.getAddress())
      ).to.be.reverted;
    });

    it('Should reset daily limit after 24 hours', async function () {
      // Create 20 properties
      for (let i = 1; i <= 20; i++) {
        if (i > 1) {
          await ethers.provider.send('evm_increaseTime', [61]);
          await ethers.provider.send('evm_mine', []);
        }
        
        await registry.createProperty(
          `Property ${i}`, 
          ethers.parseUnits(`${i}000000`, 18), 
          await oftUSDC.getAddress()
        );
      }
      
      // Fast forward 24 hours + 1 second
      await ethers.provider.send('evm_increaseTime', [86401]);
      await ethers.provider.send('evm_mine', []);
      
      // Should be able to create again
      await registry.createProperty('Property 21', ethers.parseUnits('21000000', 18), await oftUSDC.getAddress());
      
      const count = await registry.getPropertyCount();
      expect(count).to.equal(21);
    });
  });

  describe('Rate Limit Management', function () {
    it('Should get property creation status', async function () {
      const [canCreate, remainingCount, timeUntilReset] = await registry.getPropertyCreationStatus(deployer.address);
      
      expect(canCreate).to.be.true;
      expect(remainingCount).to.equal(20);
      expect(timeUntilReset).to.equal(0);
    });

    it('Should update creation status after property creation', async function () {
      await registry.createProperty('Property 1', ethers.parseUnits('1000000', 18), await oftUSDC.getAddress());
      
      const [canCreate, remainingCount, timeUntilReset] = await registry.getPropertyCreationStatus(deployer.address);
      
      expect(canCreate).to.be.false; // Due to cooldown
      expect(remainingCount).to.equal(19);
      expect(timeUntilReset).to.be.greaterThan(0);
    });

    it('Should reset rate limit for user', async function () {
      // Create a property
      await registry.createProperty('Property 1', ethers.parseUnits('1000000', 18), await oftUSDC.getAddress());
      
      // Transfer ownership of rate limit contract to registry
      await rateLimit.transferOwnership(await registry.getAddress());
      
      // Reset rate limit
      await registry.resetRateLimit(deployer.address);
      
      const [canCreate, remainingCount, timeUntilReset] = await registry.getPropertyCreationStatus(deployer.address);
      
      expect(canCreate).to.be.true;
      expect(remainingCount).to.equal(20);
      expect(timeUntilReset).to.equal(0);
    });

    it('Should get rate limit data', async function () {
      const [lastCreation, count] = await registry.getRateLimitData(deployer.address);
      
      expect(lastCreation).to.equal(0);
      expect(count).to.equal(0);
    });

    it('Should update rate limit data after creation', async function () {
      await registry.createProperty('Property 1', ethers.parseUnits('1000000', 18), await oftUSDC.getAddress());
      
      const [lastCreation, count] = await registry.getRateLimitData(deployer.address);
      
      expect(lastCreation).to.be.greaterThan(0);
      expect(count).to.equal(1);
    });
  });

  describe('Rate Limit Contract Management', function () {
    it('Should set rate limit contract', async function () {
      // Deploy new rate limit contract
      const PropertyRegistryRateLimit = await ethers.getContractFactory('PropertyRegistryRateLimit');
      const newRateLimit = await PropertyRegistryRateLimit.deploy(deployer.address);
      await newRateLimit.waitForDeployment();
      
      await registry.setRateLimitContract(await newRateLimit.getAddress());
      
      // Verify it's set
      const setRateLimit = await registry.rateLimitContract();
      expect(setRateLimit).to.equal(await newRateLimit.getAddress());
    });

    it('Should only allow owner to set rate limit contract', async function () {
      await expect(
        registry.connect(user1).setRateLimitContract(await rateLimit.getAddress())
      ).to.be.revertedWithCustomError(registry, 'OwnableUnauthorizedAccount');
    });

    it('Should reject invalid rate limit contract address', async function () {
      await expect(
        registry.setRateLimitContract(ethers.ZeroAddress)
      ).to.be.reverted;
    });
  });

  describe('Inheritance from PropertyRegistry', function () {
    it('Should inherit all base PropertyRegistry functions', async function () {
      // Test that all base functions still work
      const propertyId = await registry.createProperty('Test Property', ethers.parseUnits('1000000', 18), await oftUSDC.getAddress());
      
      const property = await registry.getProperty(1);
      expect(property.vault).to.not.equal(ethers.ZeroAddress);
      expect(property.depositCap).to.equal(ethers.parseUnits('1000000', 18));

      const count = await registry.getPropertyCount();
      expect(count).to.equal(1);

      const exists = await registry.propertyExistsExternal(1);
      expect(exists).to.be.true;
    });

    it('Should maintain property management functionality', async function () {
      await registry.createProperty('Test Property', ethers.parseUnits('1000000', 18), await oftUSDC.getAddress());
      
      // Test property management functions
      await registry.updatePropertyStatus(1, 2); // Set to paused
      await registry.setPropertyPaused(1, true);
      
      // Get the vault address and transfer ownership to registry
      const property = await registry.getProperty(1);
      const vault = await ethers.getContractAt('PropertyVault', property.vault);
      await vault.transferOwnership(await registry.getAddress());
      
      // Now update property cap
      await registry.updatePropertyCap(1, ethers.parseUnits('2000000', 18));
      
      const updatedProperty = await registry.getProperty(1);
      expect(updatedProperty.status).to.equal(2);
      expect(updatedProperty.paused).to.be.true;
      expect(updatedProperty.depositCap).to.equal(ethers.parseUnits('2000000', 18));
    });
  });

  describe('Edge Cases', function () {
    it('Should handle rate limit contract not set', async function () {
      // Deploy registry without rate limit contract
      const PropertyRegistryGovernance = await ethers.getContractFactory('PropertyRegistryGovernance');
      const registryNoLimit = await PropertyRegistryGovernance.deploy(deployer.address, await environmentConfig.getAddress());
      await registryNoLimit.waitForDeployment();
      
      // Should fail when trying to create property without rate limit contract
      await expect(
        registryNoLimit.createProperty('Property 1', ethers.parseUnits('1000000', 18), await oftUSDC.getAddress())
      ).to.be.reverted; // Will fail when trying to call rate limit check
    });

    it('Should handle multiple users with separate rate limits', async function () {
      // Transfer ownership to user1
      await registry.transferOwnership(user1.address);
      
      // User1 creates a property
      await registry.connect(user1).createProperty('User1 Property', ethers.parseUnits('1000000', 18), await oftUSDC.getAddress());
      
      // Transfer ownership to user2
      await registry.connect(user1).transferOwnership(user2.address);
      
      // User2 should be able to create property immediately (separate rate limit)
      await registry.connect(user2).createProperty('User2 Property', ethers.parseUnits('2000000', 18), await oftUSDC.getAddress());
      
      const count = await registry.getPropertyCount();
      expect(count).to.equal(2);
    });
  });
});
