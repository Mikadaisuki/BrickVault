import { expect } from "chai";
import { ethers } from "hardhat";
import { EnvironmentConfig, EnvironmentConfig__factory } from "../typechain-types";

describe("EnvironmentConfig", function () {
  let environmentConfig: EnvironmentConfig;
  let owner: any;
  let user1: any;

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();
    
    const EnvironmentConfigFactory = await ethers.getContractFactory("EnvironmentConfig");
    environmentConfig = await EnvironmentConfigFactory.deploy(owner.address);
  });

  describe("Deployment", function () {
    it("Should set correct owner", async function () {
      expect(await environmentConfig.owner()).to.equal(owner.address);
    });

    it("Should start in Development environment", async function () {
      expect(await environmentConfig.currentEnvironment()).to.equal(0); // Development = 0
    });

    it("Should have correct default settings for Development", async function () {
      const settings = await environmentConfig.getCurrentSettings();
      expect(settings.strictErrorHandling).to.be.false;
      expect(settings.enableDebugEvents).to.be.true;
      expect(settings.allowMockContracts).to.be.true;
      expect(settings.environmentName).to.equal("Development");
    });
  });

  describe("Environment Management", function () {
    it("Should allow owner to change environment", async function () {
      await environmentConfig.setEnvironment(1); // Staging
      expect(await environmentConfig.currentEnvironment()).to.equal(1);
      
      // Need to wait for cooldown before next change
      await ethers.provider.send("evm_increaseTime", [3601]); // Increase time by 1 hour + 1 second
      await ethers.provider.send("evm_mine", []); // Mine a new block
      
      await environmentConfig.setEnvironment(2); // Production
      expect(await environmentConfig.currentEnvironment()).to.equal(2);
    });

    it("Should not allow non-admin to change environment", async function () {
      await expect(
        environmentConfig.connect(user1).setEnvironment(1)
      ).to.be.reverted;
    });

    it("Should emit EnvironmentChanged event", async function () {
      // Reset time to avoid cooldown issues
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);
      
      await expect(environmentConfig.setEnvironment(1))
        .to.emit(environmentConfig, "EnvironmentChanged")
        .withArgs(0, 1);
    });
  });

  describe("Environment Settings", function () {
    it("Should return correct settings for Production", async function () {
      // Reset time to avoid cooldown issues
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);
      
      await environmentConfig.setEnvironment(2); // Production
      
      expect(await environmentConfig.isStrictErrorHandling()).to.be.true;
      expect(await environmentConfig.isDebugEventsEnabled()).to.be.false;
      expect(await environmentConfig.isMockContractsAllowed()).to.be.false;
      expect(await environmentConfig.getMaxGasLimit()).to.equal(15000000);
    });

    it("Should return correct settings for Staging", async function () {
      // Reset time to avoid cooldown issues
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);
      
      await environmentConfig.setEnvironment(1); // Staging
      
      expect(await environmentConfig.isStrictErrorHandling()).to.be.true;
      expect(await environmentConfig.isDebugEventsEnabled()).to.be.true;
      expect(await environmentConfig.isMockContractsAllowed()).to.be.false;
      expect(await environmentConfig.getMaxGasLimit()).to.equal(20000000);
    });

    it("Should allow owner to update environment settings", async function () {
      const newSettings = {
        strictErrorHandling: false,
        enableDebugEvents: false,
        maxGasLimit: 5000000,
        allowMockContracts: true,
        environmentName: "Custom",
        enableCrossChain: false,
        crossChainManager: ethers.ZeroAddress
      };

      await environmentConfig.updateEnvironmentSettings(0, newSettings);
      
      await environmentConfig.setEnvironment(0);
      const settings = await environmentConfig.getCurrentSettings();
      
      expect(settings.strictErrorHandling).to.be.false;
      expect(settings.enableDebugEvents).to.be.false;
      expect(settings.maxGasLimit).to.equal(5000000);
      expect(settings.allowMockContracts).to.be.true;
      expect(settings.environmentName).to.equal("Custom");
    });
  });

  describe("Ownership", function () {
    it("Should allow owner to transfer ownership", async function () {
      await environmentConfig.transferOwnership(user1.address);
      expect(await environmentConfig.owner()).to.equal(user1.address);
    });

    it("Should not allow non-owner to transfer ownership", async function () {
      await expect(
        environmentConfig.connect(user1).transferOwnership(user1.address)
      ).to.be.reverted;
    });

    it("Should not allow transfer to zero address", async function () {
      await expect(
        environmentConfig.transferOwnership(ethers.ZeroAddress)
      ).to.be.reverted;
    });
  });
});
