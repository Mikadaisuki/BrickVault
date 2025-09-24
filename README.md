# BrickVault

One pooled, omnichain vault: deposit on Stacks (BTC users), invest via a standard ERC-4626 vault on an EVM hub (OVault-enabled), and redeem either as USDC on EVM or sBTC on Stacks. Clean UX, one source of truth, cross-chain without the bridge gymnastics.

## Architecture Overview

BrickVault is a real estate investment platform that allows users to:

- **Deposit** on Stacks using BTC/sBTC
- **Invest** in individual properties via ERC-4626 vaults on EVM
- **Earn** property-specific rent and appreciation
- **Redeem** as USDC on EVM (cheapest) or sBTC on Stacks

### Core Components

1. **EVM Hub** - Canonical ERC-4626 vaults on Sepolia/Base Sepolia
2. **Property Registry** - Maps property IDs to vault addresses
3. **Stacks Gateway** - Entry point for BTC users
4. **Relayer** - Off-chain service connecting Stacks ↔ EVM
5. **Frontend** - Clean UI for property browsing and management

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- Hardhat
- Git

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd BrickVault

# Install dependencies
pnpm install

# Copy environment file
cp env.example .env
# Edit .env with your RPC URLs and private keys
```

### Development

```bash
# Build all packages
pnpm build

# Run tests
pnpm test

# Deploy to testnets
cd packages/contracts-evm
pnpm deploy:sepolia
```

## Project Structure

```
BrickVault/
├── apps/
│   ├── frontend/          # Next.js React app
│   └── relayer/           # Node.js relayer service
├── packages/
│   ├── contracts-evm/     # Solidity contracts
│   ├── contracts-stacks/  # Clarity contracts
│   ├── shared/           # Shared types and constants
│   └── abi/              # Contract ABIs
├── deployments/          # Deployment configurations
└── scripts/              # Utility scripts
```

## Smart Contracts

### EVM Contracts (Solidity)

- **VaultBase.sol** - ERC-4626 base vault with safety features
- **PropertyVault.sol** - Property-specific vault with rent/NAV functions
- **PropertyRegistry.sol** - Central registry for property management
- **MockUSDC.sol** - Test USDC token

### Key Features

- **Conservative Rounding** - Favor vault on deposits, user on redemptions
- **Safety Controls** - Pause, caps, reentrancy protection
- **Property Isolation** - Each property has its own vault
- **Rent Harvesting** - Admin function to add property income
- **NAV Updates** - Simulate property appreciation/depreciation

## Testing

The test suite covers:

- ✅ ERC-4626 math and rounding
- ✅ Property isolation (A's rent doesn't affect B)
- ✅ Access control and permissions
- ✅ Pause functionality
- ✅ Deposit/redemption flows
- ✅ Rent harvesting and NAV updates
- ✅ Edge cases and error conditions

Run tests:

```bash
# All tests
pnpm test

# Specific package
cd packages/contracts-evm
pnpm test

# With coverage
pnpm coverage
```

## Deployment

### Testnets

1. **Sepolia** - EVM hub with PropertyRegistry and PropertyVault
2. **Base Sepolia** - Secondary EVM for omnichain demo
3. **Stacks Testnet** - Gateway and sSHARE contracts

### Environment Setup

```bash
# Required environment variables
EVM_RPC_SEPOLIA=https://sepolia.infura.io/v3/YOUR_KEY
EVM_RPC_BASE_SEPOLIA=https://sepolia.base.org
STACKS_RPC_TESTNET=https://stacks-node-api.testnet.stacks.co
PRIVATE_KEY=0x...
```

### Deploy Commands

```bash
# Deploy to Sepolia
cd packages/contracts-evm
pnpm deploy:sepolia

# Deploy to Base Sepolia
pnpm deploy:base-sepolia
```

## Demo Flow

1. **Create Property** - Admin creates a property via registry
2. **Deposit** - User deposits USDC into property vault
3. **Harvest Rent** - Admin adds rent income to vault
4. **Update NAV** - Admin simulates property appreciation
5. **Redeem** - User redeems shares for USDC

### Demo Script

```bash
# Run the demo
cd packages/contracts-evm
pnpm run script/deploy.ts
```

This will:
- Deploy all contracts
- Create a sample property
- Test deposit/redemption flows
- Demonstrate rent harvesting
- Show NAV updates

## API Reference

### PropertyRegistry

```solidity
function createProperty(
    PropertyMeta memory meta,
    RiskParams memory risk,
    Fees memory fees,
    address underlyingAsset
) external returns (uint32 propertyId, address vault);

function getProperty(uint32 propertyId) external view returns (Property memory);
function getActiveProperties() external view returns (uint32[] memory);
```

### PropertyVault

```solidity
function harvestRent(uint256 amount) external;
function updateNAV(int256 delta) external;
function getPropertyMetrics() external view returns (PropertyMetrics memory);
function getRentYieldRate() external view returns (uint256);
```

## Security Considerations

- **Access Control** - Owner-only admin functions
- **Reentrancy Protection** - All external calls protected
- **Integer Overflow** - Solidity 0.8+ built-in protection
- **Pause Mechanism** - Emergency stop for deposits/redemptions
- **Cap Limits** - Prevent excessive deposits

## Roadmap

### Phase 1 (Current)
- ✅ Basic ERC-4626 vault infrastructure
- ✅ Property registry and management
- ✅ Comprehensive test suite
- ✅ Deployment scripts

### Phase 2 (Next)
- 🔄 Stacks contracts (Gateway + sSHARE)
- 🔄 Relayer service
- 🔄 Frontend application
- 🔄 OVault integration

### Phase 3 (Future)
- 📋 Real strategy adapters
- 📋 Decentralized relayer
- 📋 Compliance features
- 📋 Production hardening

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For questions or support, please open an issue on GitHub.

---

**Note**: This is a hackathon project. The code is for demonstration purposes and should not be used in production without proper auditing and security review.
