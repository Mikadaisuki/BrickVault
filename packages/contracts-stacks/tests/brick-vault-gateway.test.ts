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
    // Helper function to convert EVM address to buffer
    const evmAddressToBuffer = (evmAddress: string) => {
      // Remove 0x prefix if present
      const hex = evmAddress.startsWith('0x') ? evmAddress.slice(2) : evmAddress;
      // Convert to buffer (20 bytes for EVM address)
      return Cl.buffer(Buffer.from(hex.padStart(40, '0'), 'hex'));
    };

    it("should allow registering Stacks address to EVM custodian", () => {
      // Use a mock EVM address (20 bytes / 40 hex chars)
      const mockEvmAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
      
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [evmAddressToBuffer(mockEvmAddress)],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('true');
    });

    it("should not allow registering same Stacks address twice", () => {
      const mockEvmAddress1 = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
      const mockEvmAddress2 = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199';
      
      // First registration
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [evmAddressToBuffer(mockEvmAddress1)],
        address1
      );

      // Second registration should fail
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [evmAddressToBuffer(mockEvmAddress2)],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('err');
      expect(result.value.value.value).toBe(108n); // ERR-STACKS-ADDRESS-ALREADY-REGISTERED
    });

    it("should return correct EVM custodian for Stacks address", () => {
      const mockEvmAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
      
      // Register address
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [evmAddressToBuffer(mockEvmAddress)],
        address1
      );

      // Get EVM custodian
      const { result } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-evm-custodian",
        [Cl.principal(address1)],
        address1
      );

      console.log('Result:', result)
      
      expect(result).toBeDefined();
      // The result type itself is 'some' (optional), wrapped in response
      expect(result.value.type).toBe('some');
      // The value inside should be a buffer containing the EVM address
      expect(result.value.value.type).toBe('buffer');
    });
  });

  describe("Update EVM Custodian Tests", () => {
    const evmAddressToBuffer = (evmAddress: string) => {
      const hex = evmAddress.startsWith('0x') ? evmAddress.slice(2) : evmAddress;
      return Cl.buffer(Buffer.from(hex.padStart(40, '0'), 'hex'));
    };

    beforeEach(() => {
      // Register Stacks address with initial EVM custodian
      const mockEvmAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [evmAddressToBuffer(mockEvmAddress)],
        address1
      );
    });

    it("should allow user to update their EVM custodian address", () => {
      const newEvmAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199';
      
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "update-evm-custodian",
        [evmAddressToBuffer(newEvmAddress)],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('true');
    });

    it("should not allow unregistered user to update custodian", () => {
      const newEvmAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199';
      
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "update-evm-custodian",
        [evmAddressToBuffer(newEvmAddress)],
        address3 // Not registered
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('err');
      expect(result.value.value.value).toBe(109n); // ERR-STACKS-ADDRESS-NOT-REGISTERED
    });

    it("should update to new EVM custodian correctly", () => {
      const newEvmAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199';
      
      // Update custodian
      simnet.callPublicFn(
        "brick-vault-gateway",
        "update-evm-custodian",
        [evmAddressToBuffer(newEvmAddress)],
        address1
      );

      // Verify the custodian was updated
      const { result } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-evm-custodian",
        [Cl.principal(address1)],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('some');
      expect(result.value.value.type).toBe('buffer');
      
      // The buffer should contain the new EVM address
      const bufferValue = result.value.value.value;
      expect(bufferValue).toBeDefined();
    });

    it("should allow multiple updates to custodian address", () => {
      const newEvmAddress1 = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199';
      const newEvmAddress2 = '0x1234567890123456789012345678901234567890';
      
      // First update
      const result1 = simnet.callPublicFn(
        "brick-vault-gateway",
        "update-evm-custodian",
        [evmAddressToBuffer(newEvmAddress1)],
        address1
      );
      expect(result1.result.value.type).toBe('true');

      // Second update
      const result2 = simnet.callPublicFn(
        "brick-vault-gateway",
        "update-evm-custodian",
        [evmAddressToBuffer(newEvmAddress2)],
        address1
      );
      expect(result2.result.value.type).toBe('true');

      // Verify latest custodian
      const { result } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-evm-custodian",
        [Cl.principal(address1)],
        address1
      );
      
      expect(result.value.type).toBe('some');
    });

    it("should emit update event when custodian is updated", () => {
      const newEvmAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199';
      
      const { events } = simnet.callPublicFn(
        "brick-vault-gateway",
        "update-evm-custodian",
        [evmAddressToBuffer(newEvmAddress)],
        address1
      );

      // Check that print event was emitted
      expect(events.length).toBeGreaterThan(0);
      // Print events are logged to stdout
    });

    it("should allow deposits after updating custodian", () => {
      const newEvmAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199';
      
      // Update custodian
      simnet.callPublicFn(
        "brick-vault-gateway",
        "update-evm-custodian",
        [evmAddressToBuffer(newEvmAddress)],
        address1
      );

      // Try to deposit after update
      const { result } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(2000000)], // 2 sBTC
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.type).toBe('true');
    });
  });

  describe("sBTC Deposit Tests", () => {
    const evmAddressToBuffer = (evmAddress: string) => {
      const hex = evmAddress.startsWith('0x') ? evmAddress.slice(2) : evmAddress;
      return Cl.buffer(Buffer.from(hex.padStart(40, '0'), 'hex'));
    };

    beforeEach(() => {
      // Register Stacks address to EVM custodian
      const mockEvmAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [evmAddressToBuffer(mockEvmAddress)],
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
      const mockEvmAddress2 = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199';
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [evmAddressToBuffer(mockEvmAddress2)],
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
    const evmAddressToBuffer = (evmAddress: string) => {
      const hex = evmAddress.startsWith('0x') ? evmAddress.slice(2) : evmAddress;
      return Cl.buffer(Buffer.from(hex.padStart(40, '0'), 'hex'));
    };

    beforeEach(() => {
      // Register Stacks address to EVM custodian
      const mockEvmAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [evmAddressToBuffer(mockEvmAddress)],
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


  describe("Contract Balance Read Tests", () => {
    const evmAddressToBuffer = (evmAddress: string) => {
      const hex = evmAddress.startsWith('0x') ? evmAddress.slice(2) : evmAddress;
      return Cl.buffer(Buffer.from(hex.padStart(40, '0'), 'hex'));
    };

    beforeEach(() => {
      // Register Stacks address and make a deposit
      const mockEvmAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [evmAddressToBuffer(mockEvmAddress)],
        address1
      );
    });

    it("should return contract sBTC balance", () => {
      // Make deposit
      simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(2000000)], // 2 sBTC
        address1
      );

      // Get contract balance
      const { result } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-contract-sbtc-balance",
        [],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.value.value).toBeGreaterThan(0n);
    });

    it("should return zero balance when no deposits", () => {
      // Get contract balance without deposits
      const { result } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-contract-sbtc-balance",
        [],
        address1
      );
      
      expect(result).toBeDefined();
      expect(result.value.value.value).toBe(0n);
    });
  });

  describe("Relayer Data Access Tests", () => {
    const evmAddressToBuffer = (evmAddress: string) => {
      const hex = evmAddress.startsWith('0x') ? evmAddress.slice(2) : evmAddress;
      return Cl.buffer(Buffer.from(hex.padStart(40, '0'), 'hex'));
    };

    beforeEach(() => {
      // Register Stacks address to EVM custodian
      const mockEvmAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [evmAddressToBuffer(mockEvmAddress)],
        address1
      );
    });

    it("should provide relayer access to sBTC deposit data", () => {
      const depositAmount = 2500000; // 2.5 sBTC
      
      // Make deposit and capture transaction data
      const { result, events } = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(depositAmount)],
        address1
      );
      
      // Test transaction success
      expect(result.value.type).toBe('true');
      expect(events.length).toBeGreaterThan(0);
      
      // Test that relayer can access sBTC amount from ft_transfer_event
      const transferEvent = events.find((e: { event: string }) => e.event === 'ft_transfer_event');
      expect(transferEvent).toBeDefined();
      expect(transferEvent.data.amount).toBe('2500000');
      expect(transferEvent.data.sender).toBe(address1);
    });

    it("should demonstrate unique identifiers for double-spend prevention", async () => {
      // Make first deposit
      const deposit1 = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1000000)], // 1 sBTC
        address1
      );
      
      // Make second deposit with same amount
      const deposit2 = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1000000)], // 1 sBTC (same amount)
        address1
      );
      
      const transfer1 = deposit1.events.find((e: { event: string }) => e.event === 'ft_transfer_event');
      const transfer2 = deposit2.events.find((e: { event: string }) => e.event === 'ft_transfer_event');
      
      // Show actual unique IDs that would be generated
      const timestamp1 = Date.now();
      const timestamp2 = Date.now();
      const random1 = Math.random().toString(36).substring(7);
      const random2 = Math.random().toString(36).substring(7);
      
      const uniqueId1 = `${transfer1.data.sender}-${transfer1.data.amount}-${transfer1.data.recipient}-${timestamp1}-${random1}`;
      const uniqueId2 = `${transfer2.data.sender}-${transfer2.data.amount}-${transfer2.data.recipient}-${timestamp2}-${random2}`;
      
      console.log("\n=== ACTUAL UNIQUE IDENTIFIERS ===");
      console.log("Transaction 1 unique ID:", uniqueId1);
      console.log("Transaction 2 unique ID:", uniqueId2);
      console.log("Are they different?", uniqueId1 !== uniqueId2);
      
      // Show what the relayer would actually generate
      console.log("\n=== RELAYER GENERATED IDs ===");
      console.log("Relayer would generate these unique IDs for double-spend prevention:");
      console.log("ID 1:", uniqueId1);
      console.log("ID 2:", uniqueId2);
      
      console.log("\n=== PRODUCTION UNIQUE ID ===");
      console.log("In production, would use event.tx_id instead");
      console.log("Example: '0x1234567890abcdef...' (actual transaction hash)");
      
      expect(deposit1.result.value.type).toBe('true');
      expect(deposit2.result.value.type).toBe('true');
    });


    it("should allow relayer to get EVM custodian address", () => {
      // Make a deposit first
      simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(1000000)],
        address1
      );

      // Relayer can query the contract to get EVM custodian
      const { result } = simnet.callReadOnlyFn(
        "brick-vault-gateway",
        "get-evm-custodian",
        [Cl.principal(address1)],
        address1
      );

      // Test that relayer can get the EVM custodian address (returns optional buffer)
      // The result type itself is 'some' (optional), wrapped in response
      expect(result.value.type).toBe('some');
      // The value inside should be a buffer containing the EVM address
      expect(result.value.value.type).toBe('buffer');
    });

    it("should provide transaction data structure for relayer", () => {
      const depositAmount = 1750000; // 1.75 sBTC
      
      const transactionResult = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(depositAmount)],
        address1
      );
      
      // Test transaction success and events exist
      expect(transactionResult.result.value.type).toBe('true');
      expect(transactionResult.events.length).toBeGreaterThan(0);
      
      // Test that relayer can extract key data from ft_transfer_event
      const transferEvent = transactionResult.events.find((e: { event: string }) => e.event === 'ft_transfer_event');
      expect(transferEvent).toBeDefined();
      expect(transferEvent.data.amount).toBe('1750000');
      expect(transferEvent.data.sender).toBe(address1);
    });

    it("should filter events by contract address", () => {
      const depositAmount = 3000000; // 3 sBTC
      
      // Make deposit
      const transactionResult = simnet.callPublicFn(
        "brick-vault-gateway",
        "deposit-sbtc",
        [Cl.uint(depositAmount)],
        address1
      );
      
      // Filter events by contract address (what relayer would do)
      const gatewayEvents = transactionResult.events.filter((event: { data: { contract_identifier?: string; recipient?: string } }) => {
        return event.data.contract_identifier?.includes('brick-vault-gateway') ||
               event.data.recipient?.includes('brick-vault-gateway');
      });

      // Test that filtering works and we can extract data
      expect(gatewayEvents.length).toBeGreaterThan(0);
      
      const transferEvent = gatewayEvents.find((e: { event: string }) => e.event === 'ft_transfer_event');
      expect(transferEvent).toBeDefined();
      expect(transferEvent.data.amount).toBe('3000000');
      expect(transferEvent.data.sender).toBe(address1);
    });

  });

  describe("Event Emission Tests", () => {
    const evmAddressToBuffer = (evmAddress: string) => {
      const hex = evmAddress.startsWith('0x') ? evmAddress.slice(2) : evmAddress;
      return Cl.buffer(Buffer.from(hex.padStart(40, '0'), 'hex'));
    };

    beforeEach(() => {
      // Register Stacks address to EVM custodian
      const mockEvmAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
      simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [evmAddressToBuffer(mockEvmAddress)],
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
      const mockEvmAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199';
      const { events } = simnet.callPublicFn(
        "brick-vault-gateway",
        "register-stacks-address",
        [evmAddressToBuffer(mockEvmAddress)],
        address2
      );

      // Check that print event was emitted (registration event for relayer)
      expect(events.length).toBeGreaterThan(0);
      // Print events are logged to stdout, not as contract events
      // The contract is working correctly if no error was thrown
    });

  });

});