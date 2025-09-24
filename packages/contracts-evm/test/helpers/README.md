# Mock Relayer for Cross-Chain Testing

## Overview

The `MockRelayer` is a TypeScript/JavaScript test helper that simulates a real cross-chain relayer for testing Stacks ↔ EVM interactions. It provides a comprehensive testing framework for cross-chain messaging without requiring actual blockchain infrastructure.

## Why TypeScript/JavaScript for the Relayer?

Based on the [Clarinet documentation](https://docs.hiro.so/clarinet/develop/contracts/contracts), **TypeScript/JavaScript is the optimal choice** for cross-chain relayers because:

### ✅ **Advantages:**
1. **Multi-Chain Support**: Can interact with both Stacks (Clarity) and EVM (Solidity) contracts
2. **Rich Ecosystem**: Extensive libraries for blockchain interactions (ethers.js, web3.js)
3. **Easy Testing**: Seamless integration with Hardhat, Mocha, and other testing frameworks
4. **Flexible Mocking**: Can easily simulate blockchain events, proofs, and network conditions
5. **Real-World Alignment**: Most production relayers are built in TypeScript/JavaScript

### ❌ **Why Not Other Languages:**
- **Clarity**: Limited to Stacks blockchain only, cannot interact with EVM
- **Solidity**: Limited to EVM blockchains only, cannot interact with Stacks
- **Python**: Less mature ecosystem for cross-chain development
- **Go/Rust**: More complex for rapid prototyping and testing

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Stacks Chain  │    │   Mock Relayer   │    │   EVM Chain     │
│                 │    │  (TypeScript)    │    │                 │
│ • sBTC deposits │───▶│ • Event monitoring│───▶│ • Process msgs  │
│ • User actions  │    │ • Proof generation│    │ • Mint shares   │
│ • Stage changes │    │ • Message relay  │    │ • Update state  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Key Features

### 1. **Event Simulation**
```typescript
// Simulate Stacks deposit event
const eventId = await mockRelayer.simulateStacksDepositEvent(
  'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60', // Stacks address
  1, // Property ID
  '1000000000000000000', // 1 sBTC (18 decimals)
  '0x123...' // Stacks transaction hash
);
```

### 2. **Cross-Chain Message Processing**
```typescript
// Process cross-chain message
const messageId = await mockRelayer.processCrossChainMessage(
  eventId,
  '0xEVM_CUSTODIAN_ADDRESS',
  'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60'
);
```

### 3. **Batch Processing**
```typescript
// Process multiple events
const processedIds = await mockRelayer.simulateRelayerMonitoring(
  [eventId1, eventId2, eventId3],
  evmCustodian,
  stacksAddress
);
```

### 4. **Statistics & Monitoring**
```typescript
const stats = mockRelayer.getStats();
// Returns: { totalEvents, processedEvents, unprocessedEvents, processedMessages }
```

## Message Types

| Type | Description | Stacks Event | EVM Action |
|------|-------------|--------------|------------|
| 1 | Deposit | `deposit-sbtc` | Mint shares to EVM custodian |
| 2 | Withdrawal | `withdraw-sbtc` | Burn shares from EVM custodian |
| 3 | Stage Transition | `stage-change` | Update property stage |

## Testing Workflow

### 1. **Setup**
```typescript
// Create mock relayer
const mockRelayer = await createMockRelayer(stacksManager, relayerSigner);
```

### 2. **Simulate Stacks Events**
```typescript
// User deposits sBTC on Stacks
const eventId = await mockRelayer.simulateStacksDepositEvent(
  stacksAddress, propertyId, sbtcAmount, stacksTxHash
);
```

### 3. **Relayer Processing**
```typescript
// Relayer monitors and processes
const messageId = await mockRelayer.processCrossChainMessage(
  eventId, evmCustodian, stacksAddress
);
```

### 4. **Verify State**
```typescript
// Verify cross-chain synchronization
expect(await stacksManager.isStacksUser(evmCustodian, propertyId)).to.be.true;
expect(await vault.balanceOf(evmCustodian)).to.equal(expectedShares);
```

## Real-World Relayer Implementation

In production, a real relayer would:

1. **Monitor Stacks Blockchain**: Watch for deposit/withdrawal events
2. **Generate Proofs**: Create merkle proofs for transaction validity
3. **Relay Messages**: Call EVM contracts with validated data
4. **Handle Failures**: Implement retry logic and error handling
5. **Security**: Use multi-signature schemes and time locks

## Security Considerations

### **Mock Relayer (Testing)**
- ✅ Simulates all cross-chain flows
- ✅ Tests edge cases and failure scenarios
- ✅ Validates state synchronization
- ⚠️ **Not secure for production** (trusts all inputs)

### **Production Relayer**
- 🔒 **Cryptographic Proofs**: Merkle proofs for transaction validity
- 🔒 **Multi-Signature**: Multiple validators required
- 🔒 **Time Locks**: Delays for large transactions
- 🔒 **Slashing**: Penalties for malicious behavior
- 🔒 **Economic Security**: Bonded validators with stake

## Integration with Clarinet

The mock relayer can be extended to work with [Clarinet's testing framework](https://docs.hiro.so/clarinet/develop/contracts/contracts):

```typescript
// Clarinet integration example
import { Clarinet } from 'clarinet';

describe('Cross-Chain Integration', () => {
  it('Should work with Clarinet contracts', async () => {
    // Deploy Stacks contracts via Clarinet
    const stacksContract = await Clarinet.deployContract('property-vault');
    
    // Use mock relayer to bridge to EVM
    const eventId = await mockRelayer.simulateStacksDepositEvent(
      stacksAddress, propertyId, amount, txHash
    );
    
    // Process cross-chain message
    await mockRelayer.processCrossChainMessage(eventId, evmCustodian, stacksAddress);
  });
});
```

## Best Practices

1. **Always Reset State**: Use `mockRelayer.reset()` between tests
2. **Validate All Flows**: Test both success and failure scenarios
3. **Check Statistics**: Verify relayer metrics match expectations
4. **Test Edge Cases**: Duplicate events, invalid proofs, network failures
5. **Document Workflows**: Clear comments explaining cross-chain logic

## Example Usage

See `15-Stacks-CrossChain-Manager.test.ts` for comprehensive examples of:
- Basic event simulation
- Cross-chain message processing
- Batch processing
- Statistics monitoring
- Complete workflow testing
- Governance participation by Stacks users

This mock relayer provides a robust foundation for testing cross-chain functionality while maintaining the flexibility to evolve into a production-ready implementation.
