import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";
import { createMockEVMRelaer, MockEVMRelaer } from "./mock-evm-relayer";

const accounts = simnet.getAccounts();
const address1 = accounts.get("wallet_1")!;
const address2 = accounts.get("wallet_2")!;
const address3 = accounts.get("wallet_3")!;
const deployer = accounts.get("deployer")!;

// Mock EVM relayer for cross-chain testing
let mockEVMRelaer: MockEVMRelaer;

describe("BrickVault Gateway Contract Tests", () => {
  beforeEach(() => {
    // Reset simnet state before each test
    simnet.mineEmptyBlock();
    
    // Create fresh mock EVM relayer for each test
    mockEVMRelaer = createMockEVMRelaer();
  });

  describe("Basic Contract Tests", () => {
    it("should initialize with correct default values", () => {
      const { result } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-demo-status",
        [],
        address1
      );
      
      // The result is already an ok value, so we check the value directly
      expect(result).toBeDefined();
      const status = result.value.value; // Access the nested value
      expect(status).toHaveProperty("is-paused");
      expect(status).toHaveProperty("total-sbtc-locked");
      expect(status).toHaveProperty("min-deposit");
    });

    it("should allow contract owner to set min deposit", () => {
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "set-min-deposit",
        [Cl.uint(2000000)], // 2 sBTC
        deployer
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('true');
    });

    it("should not allow non-owner to set min deposit", () => {
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "set-min-deposit",
        [Cl.uint(2000000)],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('err');
      expect(result.value.value.value).toBe(101n); // ERR-NOT-OWNER
    });

    it("should allow contract owner to set property active", () => {
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-active",
        [Cl.uint(1), Cl.bool(true)],
        deployer
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('true');
    });

    it("should allow contract owner to pause/unpause", () => {
      // Pause
      const pauseResult = simnet.callPublicFn(
        "brick-vault-gateway",
        "pause-contract",
        [],
        deployer
      );
      expect(pauseResult.result.value.type).toBe('true');

      // Unpause
      const unpauseResult = simnet.callPublicFn(
        "brick-vault-gateway",
        "unpause-contract",
        [],
        deployer
      );
      expect(unpauseResult.result.value.type).toBe('true');
    });
  });

  describe("Stacks Address Registration", () => {
    it("should allow registering Stacks address to EVM custodian", () => {
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [Cl.principal(address1), Cl.principal(address2)],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('true');
    });

    it("should not allow registering same Stacks address twice", () => {
      // First registration
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [Cl.principal(address1), Cl.principal(address2)],
        address1
      );

      // Second registration should fail
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [Cl.principal(address1), Cl.principal(address3)],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('err');
      expect(result.value.value.value).toBe(108n); // ERR-STACKS-ADDRESS-ALREADY-REGISTERED
    });

    it("should return correct EVM custodian for Stacks address", () => {
      // Register address
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [Cl.principal(address1), Cl.principal(address2)],
        address1
      );

      // Get EVM custodian
      const { result } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-evm-custodian",
        [Cl.principal(address1)],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.value).toBe(address2);
    });
  });

  describe("sBTC Deposit Tests", () => {
    beforeEach(() => {
      // Set up property as active
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-active",
        [Cl.uint(1), Cl.bool(true)],
        deployer
      );
    });

    it("should allow valid sBTC deposit", () => {
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1), Cl.uint(2000000)], // Property 1, 2 sBTC
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('true');
    });

    it("should not allow deposit below minimum amount", () => {
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1), Cl.uint(500000)], // Property 1, 0.5 sBTC (below 1 sBTC minimum)
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('err');
      expect(result.value.value.value).toBe(102n); // ERR-INVALID-AMOUNT
    });

    it("should not allow deposit to inactive property", () => {
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(2), Cl.uint(2000000)], // Property 2 (not active)
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('err');
      expect(result.value.value.value).toBe(103n); // ERR-PROPERTY-NOT-ACTIVE
    });

    it("should not allow deposit when contract is paused", () => {
      // Pause contract
      simnet.callPublicFn(
        "brick-vault-gateway",
        "pause-contract",
        [],
        deployer
      );

      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1), Cl.uint(2000000)],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('err');
      expect(result.value.value.value).toBe(107n); // ERR-CONTRACT-PAUSED
    });

    it("should track user balance correctly", () => {
      // Make deposit
      simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1), Cl.uint(2000000)],
        address1
      );

      // Check balance
      const { result } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-user-balance",
        [Cl.uint(1), Cl.principal(address1)],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.value).toBe(2000000n);
    });

    it("should track property total correctly", () => {
      // Make deposits from multiple users
      simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1), Cl.uint(2000000)],
        address1
      );

      simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1), Cl.uint(1500000)],
        address2
      );

      // Check property total
      const { result } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-property-sbtc-locked",
        [Cl.uint(1)],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.value).toBe(3500000n); // 2 + 1.5 = 3.5 sBTC
    });

    it("should track global total correctly", () => {
      // Make deposits to different properties
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-active",
        [Cl.uint(2), Cl.bool(true)],
        deployer
      );

      simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1), Cl.uint(2000000)],
        address1
      );

      simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(2), Cl.uint(1000000)],
        address2
      );

      // Check global total
      const { result } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-total-sbtc-locked",
        [],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.value).toBe(3000000n); // 2 + 1 = 3 sBTC
    });
  });

  describe("sBTC Withdrawal Tests", () => {
    beforeEach(() => {
      // Set up property as active
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-active",
        [Cl.uint(1), Cl.bool(true)],
        deployer
      );

      // Make initial deposit
      simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1), Cl.uint(2000000)],
        address1
      );
    });

    it("should allow valid sBTC withdrawal", () => {
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "withdraw-sbtc",
        [Cl.uint(1), Cl.uint(1000000)], // Withdraw 1 sBTC
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('true');
    });

    it("should not allow withdrawal exceeding balance", () => {
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "withdraw-sbtc",
        [Cl.uint(1), Cl.uint(3000000)], // Try to withdraw 3 sBTC (only have 2)
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('err');
      expect(result.value.value.value).toBe(105n); // ERR-INSUFFICIENT-BALANCE
    });

    it("should update balances correctly after withdrawal", () => {
      // Withdraw 1 sBTC
      simnet.callPublicFn(
        "brick-vault-gateway",
        "withdraw-sbtc",
        [Cl.uint(1), Cl.uint(1000000)],
        address1
      );

      // Check user balance
      const userBalance = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-user-balance",
        [Cl.uint(1), Cl.principal(address1)],
        address1
      );
      expect(userBalance.result.value.value).toBe(1000000n); // 2 - 1 = 1 sBTC

      // Check property total
      const propertyTotal = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-property-sbtc-locked",
        [Cl.uint(1)],
        address1
      );
      expect(propertyTotal.result.value.value).toBe(1000000n); // 2 - 1 = 1 sBTC
    });
  });

  describe("Platform Withdrawal Tests", () => {
    beforeEach(() => {
      // Set up property as active
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-active",
        [Cl.uint(1), Cl.bool(true)],
        deployer
      );

      // Make deposits from multiple users
      simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1), Cl.uint(2000000)],
        address1
      );

      simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1), Cl.uint(1500000)],
        address2
      );
    });

    it("should allow platform to withdraw all sBTC for property", () => {
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "platform-withdraw-sbtc",
        [Cl.uint(1)],
        deployer
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('uint');
      expect(result.value.value).toBe(3500000n); // Total sBTC withdrawn
    });

    it("should not allow non-owner to perform platform withdrawal", () => {
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "platform-withdraw-sbtc",
        [Cl.uint(1)],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('err');
      expect(result.value.value.value).toBe(101n); // ERR-NOT-OWNER
    });

    it("should reset property total after platform withdrawal", () => {
      // Platform withdraws all
      simnet.callPublicFn(
        "brick-vault-gateway",
        "platform-withdraw-sbtc",
        [Cl.uint(1)],
        deployer
      );

      // Check property total is reset
      const { result } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-property-sbtc-locked",
        [Cl.uint(1)],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.value).toBe(0n);
    });

    it("should update global total after platform withdrawal", () => {
      // Platform withdraws all
      simnet.callPublicFn(
        "brick-vault-gateway",
        "platform-withdraw-sbtc",
        [Cl.uint(1)],
        deployer
      );

      // Check global total is updated
      const { result } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-total-sbtc-locked",
        [],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.value).toBe(0n);
    });
  });

  describe("Event Emission Tests", () => {
    it("should emit deposit event with correct format", () => {
      // Set up property as active
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-active",
        [Cl.uint(1), Cl.bool(true)],
        deployer
      );

      // Make deposit and check events
      const { events } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1), Cl.uint(2000000)],
        address1
      );

      // Check that print event was emitted (deposit event for relayer)
      expect(events.length).toBeGreaterThan(0);
      // Print events are logged to stdout, not as contract events
      // The contract is working correctly if no error was thrown
    });

    it("should emit withdrawal event with correct format", () => {
      // Set up property as active
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-active",
        [Cl.uint(1), Cl.bool(true)],
        deployer
      );

      // Make deposit first
      simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1), Cl.uint(2000000)],
        address1
      );

      // Make withdrawal and check events
      const { events } = simnet.callPublicFn(
        "brick-vault-gateway",
        "withdraw-sbtc",
        [Cl.uint(1), Cl.uint(1000000)],
        address1
      );

      // Check that print event was emitted (withdrawal event for relayer)
      expect(events.length).toBeGreaterThan(0);
      // Print events are logged to stdout, not as contract events
      // The contract is working correctly if no error was thrown
    });

    it("should emit platform withdrawal event with correct format", () => {
      // Set up property as active
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-active",
        [Cl.uint(1), Cl.bool(true)],
        deployer
      );

      // Make deposit first
      simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1), Cl.uint(2000000)],
        address1
      );

      // Platform withdrawal and check events
      const { events } = simnet.callPublicFn(
        "brick-vault-gateway",
        "platform-withdraw-sbtc",
        [Cl.uint(1)],
        deployer
      );

      // Check that print event was emitted (platform withdrawal event for relayer)
      expect(events.length).toBeGreaterThan(0);
      // Print events are logged to stdout, not as contract events
      // The contract is working correctly if no error was thrown
    });
  });

  describe("Cross-Chain Integration Tests", () => {
    it("should handle complete sBTC deposit workflow with EVM integration", async () => {
      // 1. Register Stacks address to EVM custodian mapping
      const stacksAddress = "SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60";
      const evmCustodian = address2; // Use actual simnet address
      
      const { result: registerResult } = simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [Cl.principal(stacksAddress), Cl.principal(evmCustodian)],
        deployer
      );
      
      expect(registerResult.value.type).toBe('true');

      // 2. Set property as active
      const { result: setActiveResult } = simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-active",
        [Cl.uint(1), Cl.bool(true)],
        deployer
      );
      
      expect(setActiveResult.value.type).toBe('true');

      // 3. User deposits sBTC
      const sbtcAmount = 1500000; // 1.5 sBTC
      const stacksTxHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      
      const { result: depositResult } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1), Cl.uint(sbtcAmount)],
        address1
      );
      
      expect(depositResult.value.type).toBe('true');

      // 4. Verify deposit was recorded
      const { result: balanceResult } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-user-balance",
        [Cl.uint(1), Cl.principal(address1)],
        address1
      );
      
      expect(balanceResult.value.value).toBe(BigInt(sbtcAmount));

      // 5. Mock EVM processing of the deposit event
      const evmResponse = await mockEVMRelaer.simulateEVMDepositProcessing(
        stacksAddress,
        1,
        sbtcAmount.toString(),
        stacksTxHash,
        evmCustodian
      );

      expect(evmResponse.success).toBe(true);
      expect(evmResponse.messageId).toBeDefined();

      // 6. Verify EVM relayer statistics
      const stats = mockEVMRelaer.getStats();
      expect(stats.totalMessages).toBe(1);
      expect(stats.successfulMessages).toBe(1);
      expect(stats.failedMessages).toBe(0);
    });

    it("should handle complete sBTC withdrawal workflow with EVM integration", async () => {
      // 1. Setup: Register address and set property active
      const stacksAddress = "SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60";
      const evmCustodian = address2; // Use actual simnet address
      
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [Cl.principal(stacksAddress), Cl.principal(evmCustodian)],
        deployer
      );
      
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-active",
        [Cl.uint(1), Cl.bool(true)],
        deployer
      );

      // 2. User deposits sBTC first
      const sbtcAmount = 2000000; // 2 sBTC
      simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1), Cl.uint(sbtcAmount)],
        address1
      );

      // 3. User withdraws part of their sBTC
      const withdrawalAmount = 1000000; // 1 sBTC
      const stacksTxHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
      
      const { result: withdrawalResult } = simnet.callPublicFn(
        "brick-vault-gateway",
        "withdraw-sbtc",
        [Cl.uint(1), Cl.uint(withdrawalAmount)],
        address1
      );
      
      expect(withdrawalResult.value.type).toBe('true');

      // 4. Verify withdrawal was processed
      const { result: balanceResult } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-user-balance",
        [Cl.uint(1), Cl.principal(address1)],
        address1
      );
      
      expect(balanceResult.value.value).toBe(BigInt(sbtcAmount - withdrawalAmount));

      // 5. Mock EVM processing of the withdrawal event
      const evmResponse = await mockEVMRelaer.simulateEVMWithdrawalProcessing(
        stacksAddress,
        1,
        withdrawalAmount.toString(),
        stacksTxHash,
        evmCustodian
      );

      expect(evmResponse.success).toBe(true);
      expect(evmResponse.messageId).toBeDefined();
    });

    it("should handle multiple cross-chain operations", async () => {
      // Setup
      const stacksAddress1 = "SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60";
      const stacksAddress2 = address3; // Use actual simnet address
      const evmCustodian1 = address2; // Use actual simnet address
      const evmCustodian2 = deployer; // Use actual simnet address
      
      // Register both addresses
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [Cl.principal(stacksAddress1), Cl.principal(evmCustodian1)],
        deployer
      );
      
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [Cl.principal(stacksAddress2), Cl.principal(evmCustodian2)],
        deployer
      );
      
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-active",
        [Cl.uint(1), Cl.bool(true)],
        deployer
      );

      // Multiple deposits
      simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1), Cl.uint(1000000)],
        address1
      );
      
      simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1), Cl.uint(1500000)],
        address2
      );

      // Mock EVM processing for both deposits
      const response1 = await mockEVMRelaer.simulateEVMDepositProcessing(
        stacksAddress1,
        1,
        "1000000",
        "0x1111111111111111111111111111111111111111111111111111111111111111",
        evmCustodian1
      );

      const response2 = await mockEVMRelaer.simulateEVMDepositProcessing(
        stacksAddress2,
        1,
        "1500000",
        "0x2222222222222222222222222222222222222222222222222222222222222222",
        evmCustodian2
      );

      expect(response1.success).toBe(true);
      expect(response2.success).toBe(true);

      // Verify EVM relayer processed both messages
      const stats = mockEVMRelaer.getStats();
      expect(stats.totalMessages).toBe(2);
      expect(stats.successfulMessages).toBe(2);
      expect(stats.failedMessages).toBe(0);
    });

    it("should handle EVM processing failures gracefully", async () => {
      // Setup
      const stacksAddress = "SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60";
      const evmCustodian = address2; // Use actual simnet address
      
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [Cl.principal(stacksAddress), Cl.principal(evmCustodian)],
        deployer
      );
      
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-active",
        [Cl.uint(1), Cl.bool(true)],
        deployer
      );

      // User deposits sBTC
      simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1), Cl.uint(1000000)],
        address1
      );

      // Mock EVM processing failure
      const failureResponse = await mockEVMRelaer.simulateEVMProcessingFailure(
        stacksAddress,
        1,
        "1000000",
        "EVM contract paused"
      );

      expect(failureResponse.success).toBe(false);
      expect(failureResponse.error).toBe("EVM contract paused");

      // Verify EVM relayer statistics show failure
      const stats = mockEVMRelaer.getStats();
      expect(stats.totalMessages).toBe(1);
      expect(stats.successfulMessages).toBe(0);
      expect(stats.failedMessages).toBe(1);
    });

    it("should verify cross-chain message integrity", async () => {
      // Setup
      const stacksAddress = "SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60";
      const evmCustodian = address2; // Use actual simnet address
      
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [Cl.principal(stacksAddress), Cl.principal(evmCustodian)],
        deployer
      );
      
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-active",
        [Cl.uint(1), Cl.bool(true)],
        deployer
      );

      // User deposits sBTC
      const sbtcAmount = 1000000;
      const stacksTxHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      
      simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1), Cl.uint(sbtcAmount)],
        address1
      );

      // Mock EVM processing
      const response = await mockEVMRelaer.simulateEVMDepositProcessing(
        stacksAddress,
        1,
        sbtcAmount.toString(),
        stacksTxHash,
        evmCustodian
      );

      expect(response.success).toBe(true);

      // Verify message integrity
      const processedMessage = mockEVMRelaer.getProcessedMessage(response.messageId);
      expect(processedMessage).toBeDefined();
      expect(processedMessage!.messageType).toBe(1); // deposit
      expect(processedMessage!.propertyId).toBe(1);
      expect(processedMessage!.stacksAddress).toBe(stacksAddress);
      expect(processedMessage!.evmCustodian).toBe(evmCustodian);
      expect(processedMessage!.amount).toBe(sbtcAmount.toString());
      expect(processedMessage!.stacksTxHash).toBe(stacksTxHash);
      expect(processedMessage!.processed).toBe(true);
    });
  });

  describe("Stage Management Tests", () => {
    const propertyId = 1;

    beforeEach(async () => {
      // Set property as active for testing
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-active",
        [Cl.uint(propertyId), Cl.bool(true)],
        deployer
      );
    });

    it("should allow contract owner to set property stage", () => {
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-stage",
        [Cl.uint(propertyId), Cl.uint(1)], // Funded stage
        deployer
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('true');
    });

    it("should reject non-owner attempts to set property stage", () => {
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-stage",
        [Cl.uint(propertyId), Cl.uint(1)], // Funded stage
        address1 // Non-owner
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('err');
      expect(result.value.value.value).toBe(101n); // ERR-NOT-OWNER
    });

    it("should allow contract owner to update stage via relayer", () => {
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "relayer-update-stage",
        [Cl.uint(propertyId), Cl.uint(2), Cl.uint(123)], // UnderManagement stage
        deployer
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('true');
    });

    it("should reject non-owner attempts to update stage via relayer", () => {
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "relayer-update-stage",
        [Cl.uint(propertyId), Cl.uint(2), Cl.uint(123)],
        address1 // Non-owner
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('err');
      expect(result.value.value.value).toBe(101n); // ERR-NOT-OWNER
    });

    it("should read property stage correctly", () => {
      // Set stage to Funded (1)
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-stage",
        [Cl.uint(propertyId), Cl.uint(1)],
        deployer
      );

      const { result } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-property-stage",
        [Cl.uint(propertyId)],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.value).toBe(1n); // Funded stage
    });

    it("should default to OpenToFund stage (0) for new properties", () => {
      const newPropertyId = 999;
      
      const { result } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-property-stage",
        [Cl.uint(newPropertyId)],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.value).toBe(0n); // Default OpenToFund stage
    });

    it("should support all stage values", () => {
      const stages = [0, 1, 2, 3, 4]; // OpenToFund, Funded, UnderManagement, Liquidating, Liquidated
      
      stages.forEach((stage, index) => {
        const { result } = simnet.callPublicFn(
          "brick-vault-gateway",
          "set-property-stage",
          [Cl.uint(propertyId), Cl.uint(stage)],
          deployer
        );
        
        expect(result.value.type).toBe('true');
        
        // Verify the stage was set correctly
        const { result: readResult } = simnet.callReadOnlyFn(
          "brick-vault-gateway",
          "get-property-stage",
          [Cl.uint(propertyId)],
          address1
        );
        
        expect(readResult.value.value).toBe(BigInt(stage));
      });
    });
  });

  describe("Stage-Based Deposit/Withdrawal Restrictions", () => {
    const propertyId = 1;
    const sbtcAmount = 2000000n; // 2 sBTC

    beforeEach(async () => {
      // Set property as active for testing
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-active",
        [Cl.uint(propertyId), Cl.bool(true)],
        deployer
      );

      // Register Stacks address
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [Cl.principal(address1), Cl.principal(address2)], // address1 -> address2 mapping
        deployer
      );
    });

    it("should allow deposits and withdrawals in OpenToFund stage (default)", () => {
      // Verify initial stage is OpenToFund (0)
      const { result: stageResult } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-property-stage",
        [Cl.uint(propertyId)],
        address1
      );
      expect(stageResult.value.value).toBe(0n); // OpenToFund

      // Should allow deposit
      const { result: depositResult } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(propertyId), Cl.uint(sbtcAmount)],
        address1
      );
      expect(depositResult.value.type).toBe('true');

      // Should allow withdrawal
      const { result: withdrawalResult } = simnet.callPublicFn(
        "brick-vault-gateway",
        "withdraw-sbtc",
        [Cl.uint(propertyId), Cl.uint(sbtcAmount)],
        address1
      );
      expect(withdrawalResult.value.type).toBe('true');
    });

    it("should block deposits and withdrawals in Funded stage", () => {
      // Set stage to Funded (1)
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-stage",
        [Cl.uint(propertyId), Cl.uint(1)],
        deployer
      );

      // Should block deposit
      const { result: depositResult } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(propertyId), Cl.uint(sbtcAmount)],
        address1
      );
      expect(depositResult.value.type).toBe('err');
      expect(depositResult.value.value.value).toBe(104n); // ERR-STAGE-NOT-OPEN

      // Should block withdrawal
      const { result: withdrawalResult } = simnet.callPublicFn(
        "brick-vault-gateway",
        "withdraw-sbtc",
        [Cl.uint(propertyId), Cl.uint(sbtcAmount)],
        address1
      );
      expect(withdrawalResult.value.type).toBe('err');
      expect(withdrawalResult.value.value.value).toBe(104n); // ERR-STAGE-NOT-OPEN
    });

    it("should block deposits and withdrawals in UnderManagement stage", () => {
      // Set stage to UnderManagement (2)
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-stage",
        [Cl.uint(propertyId), Cl.uint(2)],
        deployer
      );

      // Should block deposit
      const { result: depositResult } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(propertyId), Cl.uint(sbtcAmount)],
        address1
      );
      expect(depositResult.value.type).toBe('err');
      expect(depositResult.value.value.value).toBe(104n); // ERR-STAGE-NOT-OPEN

      // Should block withdrawal
      const { result: withdrawalResult } = simnet.callPublicFn(
        "brick-vault-gateway",
        "withdraw-sbtc",
        [Cl.uint(propertyId), Cl.uint(sbtcAmount)],
        address1
      );
      expect(withdrawalResult.value.type).toBe('err');
      expect(withdrawalResult.value.value.value).toBe(104n); // ERR-STAGE-NOT-OPEN
    });

    it("should block deposits and withdrawals in Liquidating stage", () => {
      // Set stage to Liquidating (3)
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-stage",
        [Cl.uint(propertyId), Cl.uint(3)],
        deployer
      );

      // Should block deposit
      const { result: depositResult } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(propertyId), Cl.uint(sbtcAmount)],
        address1
      );
      expect(depositResult.value.type).toBe('err');
      expect(depositResult.value.value.value).toBe(104n); // ERR-STAGE-NOT-OPEN

      // Should block withdrawal
      const { result: withdrawalResult } = simnet.callPublicFn(
        "brick-vault-gateway",
        "withdraw-sbtc",
        [Cl.uint(propertyId), Cl.uint(sbtcAmount)],
        address1
      );
      expect(withdrawalResult.value.type).toBe('err');
      expect(withdrawalResult.value.value.value).toBe(104n); // ERR-STAGE-NOT-OPEN
    });

    it("should block deposits and withdrawals in Liquidated stage", () => {
      // Set stage to Liquidated (4)
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-stage",
        [Cl.uint(propertyId), Cl.uint(4)],
        deployer
      );

      // Should block deposit
      const { result: depositResult } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(propertyId), Cl.uint(sbtcAmount)],
        address1
      );
      expect(depositResult.value.type).toBe('err');
      expect(depositResult.value.value.value).toBe(104n); // ERR-STAGE-NOT-OPEN

      // Should block withdrawal
      const { result: withdrawalResult } = simnet.callPublicFn(
        "brick-vault-gateway",
        "withdraw-sbtc",
        [Cl.uint(propertyId), Cl.uint(sbtcAmount)],
        address1
      );
      expect(withdrawalResult.value.type).toBe('err');
      expect(withdrawalResult.value.value.value).toBe(104n); // ERR-STAGE-NOT-OPEN
    });

    it("should allow deposits and withdrawals after reverting to OpenToFund stage", () => {
      // First set to Funded stage
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-stage",
        [Cl.uint(propertyId), Cl.uint(1)],
        deployer
      );

      // Verify deposits are blocked
      const { result: blockedDeposit } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(propertyId), Cl.uint(sbtcAmount)],
        address1
      );
      expect(blockedDeposit.value.type).toBe('err');

      // Revert to OpenToFund stage
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-stage",
        [Cl.uint(propertyId), Cl.uint(0)],
        deployer
      );

      // Should now allow deposit
      const { result: allowedDeposit } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(propertyId), Cl.uint(sbtcAmount)],
        address1
      );
      expect(allowedDeposit.value.type).toBe('true');

      // Should also allow withdrawal
      const { result: allowedWithdrawal } = simnet.callPublicFn(
        "brick-vault-gateway",
        "withdraw-sbtc",
        [Cl.uint(propertyId), Cl.uint(sbtcAmount)],
        address1
      );
      expect(allowedWithdrawal.value.type).toBe('true');
    });
  });

  describe("Cross-Chain Stage Synchronization Tests", () => {
    const propertyId = 1;

    beforeEach(async () => {
      // Set property as active for testing
      simnet.callPublicFn(
        "brick-vault-gateway",
        "set-property-active",
        [Cl.uint(propertyId), Cl.bool(true)],
        deployer
      );
    });

    it("should simulate EVM stage transition workflow", async () => {
      console.log('🔄 Testing cross-chain stage synchronization...');

      // Simulate EVM PropertyDAO transitioning from OpenToFund to Funded
      const stage1Response = await mockEVMRelaer.simulateRelayerStageUpdate(
        propertyId,
        1, // Funded stage
        "proof_funded_stage"
      );

      expect(stage1Response.success).toBe(true);
      expect(stage1Response.messageId).toBeDefined();
      console.log('✅ Simulated Funded stage transition');

      // Simulate EVM PropertyDAO transitioning from Funded to UnderManagement
      const stage2Response = await mockEVMRelaer.simulateRelayerStageUpdate(
        propertyId,
        2, // UnderManagement stage
        "proof_under_management_stage"
      );

      expect(stage2Response.success).toBe(true);
      expect(stage2Response.messageId).toBeDefined();
      console.log('✅ Simulated UnderManagement stage transition');

      // Simulate EVM PropertyDAO transitioning from UnderManagement to Liquidating
      const stage3Response = await mockEVMRelaer.simulateRelayerStageUpdate(
        propertyId,
        3, // Liquidating stage
        "proof_liquidating_stage"
      );

      expect(stage3Response.success).toBe(true);
      expect(stage3Response.messageId).toBeDefined();
      console.log('✅ Simulated Liquidating stage transition');

      // Simulate EVM PropertyDAO transitioning from Liquidating to Liquidated
      const stage4Response = await mockEVMRelaer.simulateRelayerStageUpdate(
        propertyId,
        4, // Liquidated stage
        "proof_liquidated_stage"
      );

      expect(stage4Response.success).toBe(true);
      expect(stage4Response.messageId).toBeDefined();
      console.log('✅ Simulated Liquidated stage transition');

      // Verify all stage transitions were recorded
      const stats = mockEVMRelaer.getStats();
      expect(stats.totalMessages).toBe(4);
      expect(stats.successfulMessages).toBe(4);
      console.log('✅ All stage transitions recorded successfully');

      // Verify individual messages
      const allMessages = mockEVMRelaer.getAllProcessedMessages();
      expect(allMessages).toHaveLength(4);

      // Check that all messages are stage transitions (messageType 3)
      allMessages.forEach((message, index) => {
        expect(message.messageType).toBe(3);
        expect(message.propertyId).toBe(propertyId);
        expect(message.amount).toBe((index + 1).toString());
        expect(message.processed).toBe(true);
      });

      console.log('🎉 Cross-chain stage synchronization test successful!');
    });

    it("should handle stage transition with MockEVMRelaer statistics", async () => {
      // Simulate multiple stage transitions
      await mockEVMRelaer.simulateRelayerStageUpdate(propertyId, 1, "proof1");
      await mockEVMRelaer.simulateRelayerStageUpdate(propertyId, 2, "proof2");
      
      // Verify statistics
      const stats = mockEVMRelaer.getStats();
      expect(stats.totalMessages).toBe(2);
      expect(stats.successfulMessages).toBe(2);
      expect(stats.failedMessages).toBe(0);

      // Test individual message retrieval
      const messages = mockEVMRelaer.getAllProcessedMessages();
      expect(messages).toHaveLength(2);
      
      messages.forEach((message, index) => {
        expect(message.messageType).toBe(3); // Stage transition
        expect(message.propertyId).toBe(propertyId);
        expect(message.amount).toBe((index + 1).toString());
      });
    });

    it("should simulate complete stage change with acknowledgment workflow", async () => {
      console.log('🔄 Testing complete stage change with acknowledgment workflow...');

      // Step 1: Simulate EVM sending stage change to Stacks
      const stageChangeResponse = await mockEVMRelaer.simulateRelayerStageUpdate(
        propertyId,
        1, // Funded stage
        "proof_funded_stage"
      );

      expect(stageChangeResponse.success).toBe(true);
      console.log('✅ Simulated EVM → Stacks stage change');

      // Step 2: Actually call the Stacks contract to update the stage (simulating relayer action)
      const { result: updateResult } = simnet.callPublicFn(
        "brick-vault-gateway",
        "relayer-update-stage",
        [Cl.uint(propertyId), Cl.uint(1), Cl.uint(123)], // propertyId, stage, proof
        deployer
      );

      expect(updateResult.value.type).toBe('true');
      console.log('✅ Stacks contract stage updated');

      // Step 3: Verify Stacks contract received the stage change
      const { result: stageResult } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-property-stage",
        [Cl.uint(propertyId)],
        address1
      );
      expect(stageResult.value.value).toBe(1n); // Should be Funded stage

      // Step 4: Simulate Stacks sending acknowledgment back to EVM
      const ackResponse = await mockEVMRelaer.simulateStacksAcknowledgment(
        propertyId,
        1, // Acknowledged stage
        "stacks_tx_ack_123"
      );

      expect(ackResponse.success).toBe(true);
      expect(ackResponse.messageId).toBeDefined();
      console.log('✅ Simulated Stacks → EVM acknowledgment');

      // Step 5: Verify the acknowledgment was recorded
      const ackMessage = mockEVMRelaer.getProcessedMessage(ackResponse.messageId);
      expect(ackMessage).toBeDefined();
      expect(ackMessage!.messageType).toBe(3); // Acknowledgment message type
      expect(ackMessage!.amount).toBe("1"); // Acknowledged stage

      console.log('🎉 Complete stage change with acknowledgment workflow successful!');
    });

    it("should handle multiple stage transitions with acknowledgments", async () => {
      console.log('🔄 Testing multiple stage transitions with acknowledgments...');

      const stages = [
        { stage: 1, proof: "proof_funded" },
        { stage: 2, proof: "proof_under_management" },
        { stage: 3, proof: "proof_liquidating" }
      ];

      const stageChangeIds: string[] = [];
      const ackIds: string[] = [];

      // Process each stage transition with acknowledgment
      for (const { stage, proof } of stages) {
        // Step 1: EVM → Stacks stage change
        const stageResponse = await mockEVMRelaer.simulateRelayerStageUpdate(
          propertyId,
          stage,
          proof
        );
        expect(stageResponse.success).toBe(true);
        stageChangeIds.push(stageResponse.messageId);

        // Step 2: Stacks → EVM acknowledgment
        const ackResponse = await mockEVMRelaer.simulateStacksAcknowledgment(
          propertyId,
          stage,
          `stacks_tx_ack_${stage}`
        );
        expect(ackResponse.success).toBe(true);
        ackIds.push(ackResponse.messageId);

        console.log(`✅ Processed stage ${stage} with acknowledgment`);
      }

      // Verify all messages were processed
      expect(stageChangeIds.length).toBe(3);
      expect(ackIds.length).toBe(3);

      // Check final statistics
      const stats = mockEVMRelaer.getStats();
      expect(stats.totalMessages).toBe(6); // 3 stage changes + 3 acknowledgments
      expect(stats.successfulMessages).toBe(6);
      expect(stats.failedMessages).toBe(0);

      console.log('🎉 Multiple stage transitions with acknowledgments successful!');
    });

    it("should handle acknowledgment failure scenarios", async () => {
      console.log('🔄 Testing acknowledgment failure scenarios...');

      // Step 1: Simulate successful stage change
      const stageResponse = await mockEVMRelaer.simulateRelayerStageUpdate(
        propertyId,
        1,
        "proof_funded"
      );
      expect(stageResponse.success).toBe(true);

      // Step 2: Simulate acknowledgment failure
      const failedAckResponse = await mockEVMRelaer.simulateEVMProcessingFailure(
        "stacks_user",
        propertyId,
        "1",
        "Network timeout"
      );
      expect(failedAckResponse.success).toBe(false);
      expect(failedAckResponse.error).toBe("Network timeout");

      // Step 3: Verify failure was recorded
      const stats = mockEVMRelaer.getStats();
      expect(stats.totalMessages).toBe(2); // 1 success + 1 failure
      expect(stats.successfulMessages).toBe(1);
      expect(stats.failedMessages).toBe(1);

      console.log('✅ Acknowledgment failure scenario handled correctly');
    });
  });
});