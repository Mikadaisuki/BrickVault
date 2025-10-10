import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PropertyRegistryAnalytics, EnvironmentConfig, PropertyVault } from '../typechain-types';

describe('PropertyRegistryAnalytics', function () {
  let registry: PropertyRegistryAnalytics;
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

    // Deploy PropertyRegistryAnalytics
    const PropertyRegistryAnalytics = await ethers.getContractFactory('PropertyRegistryAnalytics');
    registry = await PropertyRegistryAnalytics.deploy(deployer.address, await environmentConfig.getAddress());
    await registry.waitForDeployment();
  });

  describe('Analytics Functions', function () {
    beforeEach(async function () {
      // Create multiple properties for testing
      await registry.createProperty('Property 1', ethers.parseUnits('1000000', 18), await oftUSDC.getAddress());
      await registry.createProperty('Property 2', ethers.parseUnits('2000000', 18), await oftUSDC.getAddress());
      await registry.createProperty('Property 3', ethers.parseUnits('3000000', 18), await oftUSDC.getAddress());
    });

    it('Should get all active properties', async function () {
      const activeProperties = await registry.getActiveProperties();
      
      expect(activeProperties).to.have.length(3);
      expect(activeProperties[0]).to.equal(1);
      expect(activeProperties[1]).to.equal(2);
      expect(activeProperties[2]).to.equal(3);
    });

    it('Should get properties by status', async function () {
      // Get active properties (status = 1)
      const activeProperties = await registry.getPropertiesByStatus(1); // PropertyStatus.Active
      expect(activeProperties).to.have.length(3);

      // Update status to inactive
      await registry.updatePropertyStatus(2, 0); // PropertyStatus.Inactive
      const inactiveProperties = await registry.getPropertiesByStatus(0); // PropertyStatus.Inactive
      expect(inactiveProperties).to.have.length(1);
      expect(inactiveProperties[0]).to.equal(2);

      // Update status to inactive
      await registry.updatePropertyStatus(3, 0); // PropertyStatus.Inactive
      const inactiveProperties2 = await registry.getPropertiesByStatus(0); // PropertyStatus.Inactive
      expect(inactiveProperties2).to.have.length(2);
    });

    it('Should get property status summary', async function () {
      // Initially all properties are active
      let summary = await registry.getPropertyStatusSummary();
      expect(summary.totalProperties).to.equal(3);
      expect(summary.activeProperties).to.equal(3);
      expect(summary.inactiveProperties).to.equal(0);

      // Set one to inactive
      await registry.updatePropertyStatus(2, 0); // PropertyStatus.Inactive
      summary = await registry.getPropertyStatusSummary();
      expect(summary.totalProperties).to.equal(3);
      expect(summary.activeProperties).to.equal(2);
      expect(summary.inactiveProperties).to.equal(1);

      // Set another to inactive
      await registry.updatePropertyStatus(3, 0); // PropertyStatus.Inactive
      summary = await registry.getPropertyStatusSummary();
      expect(summary.totalProperties).to.equal(3);
      expect(summary.activeProperties).to.equal(1);
      expect(summary.inactiveProperties).to.equal(2);
    });

    it('Should handle empty property list', async function () {
      // Deploy fresh registry with no properties
      const PropertyRegistryAnalytics = await ethers.getContractFactory('PropertyRegistryAnalytics');
      const emptyRegistry = await PropertyRegistryAnalytics.deploy(deployer.address, await environmentConfig.getAddress());
      await emptyRegistry.waitForDeployment();

      const activeProperties = await emptyRegistry.getActiveProperties();
      expect(activeProperties).to.have.length(0);

      const summary = await emptyRegistry.getPropertyStatusSummary();
      expect(summary.totalProperties).to.equal(0);
      expect(summary.activeProperties).to.equal(0);
      expect(summary.inactiveProperties).to.equal(0);
    });

    it('Should handle mixed property states correctly', async function () {
      // Create additional properties
      await registry.createProperty('Property 4', ethers.parseUnits('4000000', 18), await oftUSDC.getAddress());
      await registry.createProperty('Property 5', ethers.parseUnits('5000000', 18), await oftUSDC.getAddress());

      // Set different states
      await registry.updatePropertyStatus(2, 0); // Set property 2 to inactive
      await registry.updatePropertyStatus(3, 0); // Set property 3 to inactive
      await registry.updatePropertyStatus(4, 1); // Set property 4 to active (already active)

      // Check active properties
      const activeProperties = await registry.getActiveProperties();
      expect(activeProperties).to.have.length(3); // Properties 1, 4, and 5

      // Check inactive properties
      const inactiveProperties = await registry.getPropertiesByStatus(0); // PropertyStatus.Inactive
      expect(inactiveProperties).to.have.length(2); // Properties 2 and 3

      // Check summary
      const summary = await registry.getPropertyStatusSummary();
      expect(summary.totalProperties).to.equal(5);
      expect(summary.activeProperties).to.equal(3); // Properties 1, 4, and 5
      expect(summary.inactiveProperties).to.equal(2); // Properties 2 and 3
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

    it('Should maintain property creation functionality', async function () {
      const tx = await registry.createProperty('Analytics Property', ethers.parseUnits('2000000', 18), await oftUSDC.getAddress());
      await tx.wait();

      const property = await registry.getProperty(1);
      expect(property.vault).to.not.equal(ethers.ZeroAddress);
      expect(property.depositCap).to.equal(ethers.parseUnits('2000000', 18));
      expect(property.status).to.equal(1); // PropertyStatus.Active
    });
  });

  describe('Edge Cases', function () {
    it('Should handle property status transitions correctly', async function () {
      await registry.createProperty('Test Property', ethers.parseUnits('1000000', 18), await oftUSDC.getAddress());

      // Test status transitions
      await registry.updatePropertyStatus(1, 1); // Active
      let summary = await registry.getPropertyStatusSummary();
      expect(summary.activeProperties).to.equal(1);
      expect(summary.inactiveProperties).to.equal(0);

      await registry.updatePropertyStatus(1, 0); // Inactive
      summary = await registry.getPropertyStatusSummary();
      expect(summary.totalProperties).to.equal(1);
      expect(summary.activeProperties).to.equal(0);
      expect(summary.inactiveProperties).to.equal(1);

      // Reactivate
      await registry.updatePropertyStatus(1, 1); // Active
      summary = await registry.getPropertyStatusSummary();
      expect(summary.activeProperties).to.equal(1);
      expect(summary.inactiveProperties).to.equal(0);
    });

    it('Should handle active/inactive transitions correctly', async function () {
      await registry.createProperty('Test Property', ethers.parseUnits('1000000', 18), await oftUSDC.getAddress());

      // Initially active
      let activeProperties = await registry.getActiveProperties();
      expect(activeProperties).to.have.length(1);

      // Set to inactive
      await registry.updatePropertyStatus(1, 0);
      activeProperties = await registry.getActiveProperties();
      expect(activeProperties).to.have.length(0);

      // Reactivate
      await registry.updatePropertyStatus(1, 1);
      activeProperties = await registry.getActiveProperties();
      expect(activeProperties).to.have.length(1);
    });
  });
});
