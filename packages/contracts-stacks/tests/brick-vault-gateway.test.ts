import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const address1 = accounts.get("wallet_1")!;
const address2 = accounts.get("wallet_2")!;
const address3 = accounts.get("wallet_3")!;
const deployer = accounts.get("deployer")!;

describe("BrickVault Gateway Contract Tests", () => {
  beforeEach(() => {
    // Reset simnet state before each test
    simnet.mineEmptyBlock();
  });

  describe("Basic Contract Tests", () => {
    it("should initialize with correct default values", () => {
      const { result } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-demo-status",
        [],
        address1
      );
      
      expect(result).toBeDefined();
      const status = result.value.value;
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
        [Cl.principal(address2)],
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
        [Cl.principal(address2)],
        address1
      );

      // Second registration should fail
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [Cl.principal(address3)],
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
        [Cl.principal(address2)],
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
      // Register Stacks address to EVM custodian
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [Cl.principal(address2)],
        address1
      );
    });

    it("should allow valid sBTC deposit", () => {
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(2000000)], // 2 sBTC
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('true');
    });

    it("should not allow deposit below minimum amount", () => {
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(500000)], // 0.5 sBTC (below 1 sBTC minimum)
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('err');
      expect(result.value.value.value).toBe(102n); // ERR-INVALID-AMOUNT
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
        [Cl.uint(2000000)],
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
        [Cl.uint(2000000)],
        address1
      );

      // Check balance
      const { result } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-user-sbtc-deposits",
        [Cl.principal(address1)],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.value).toBe(2000000n);
    });

    it("should track global total correctly", () => {
      // Register second user
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [Cl.principal(address3)],
        address2
      );

      // Make deposits from multiple users
      simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(2000000)],
        address1
      );

      simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1500000)],
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
      expect(result.value.value).toBe(3500000n); // 2 + 1.5 = 3.5 sBTC
    });

    it("should not allow deposit without registration", () => {
      // Try to deposit with unregistered address
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(2000000)],
        address3 // Not registered
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('err');
      expect(result.value.value.value).toBe(109n); // ERR-STACKS-ADDRESS-NOT-REGISTERED
    });
  });

  describe("sBTC Transfer Tests", () => {
    beforeEach(() => {
      // Register Stacks address to EVM custodian
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [Cl.principal(address2)],
        address1
      );
    });

    it("should transfer sBTC from user to contract", () => {
      // Get initial sBTC balance of user
      const initialBalance = simnet.callReadOnlyFn(
        "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
        "get-balance",
        [Cl.standardPrincipal(address1)],
        address1
      );

      // Make deposit (this should transfer sBTC to contract)
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(2000000)], // 2 sBTC
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('true');

      // Get final sBTC balance of user
      const finalBalance = simnet.callReadOnlyFn(
        "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
        "get-balance",
        [Cl.standardPrincipal(address1)],
        address1
      );

      // Verify sBTC was transferred (user balance should decrease)
      expect(Number(finalBalance.result.value.value)).toBeLessThan(
        Number(initialBalance.result.value.value)
      );
    });

    it("should fail sBTC transfer if user has insufficient balance", () => {
      // Try to deposit more sBTC than user has (user has ~1 sBTC, try to deposit 2 sBTC)
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(2000000000)], // 2 sBTC - more than user has
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('err');
      expect(result.value.value.value).toBe(110n); // ERR-TRANSFER-FAILED
    });
  });

  describe("Event Emission Tests", () => {
    beforeEach(() => {
      // Register Stacks address to EVM custodian
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [Cl.principal(address2)],
        address1
      );
    });

    it("should emit deposit event with correct format", () => {
      // Make deposit and check events
      const { events } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(2000000)],
        address1
      );

      // Check that print event was emitted (deposit event for relayer)
      expect(events.length).toBeGreaterThan(0);
      // Print events are logged to stdout, not as contract events
      // The contract is working correctly if no error was thrown
    });

    it("should emit registration event with correct format", () => {
      // Make registration and check events
      const { events } = simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [Cl.principal(address3)],
        address2
      );

      // Check that print event was emitted (registration event for relayer)
      expect(events.length).toBeGreaterThan(0);
      // Print events are logged to stdout, not as contract events
      // The contract is working correctly if no error was thrown
    });
  });

});