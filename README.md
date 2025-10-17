# BrickVault

A cross-chain tokenized real estate investment platform that enables users to invest in fractional property ownership using established ERC20 tokens across multiple blockchains.

## Key Features

- **Cross-Chain Investment**: Support for sBTC, BTC, and all EVM chains
- **No New Token Risk**: Built on existing ERC20 infrastructure
- **Property Tokenization**: Fractional ownership of real estate assets
- **LayerZero Integration**: Seamless cross-chain asset transfers

## Documentation

For complete documentation, guides, and technical details, visit:

**[📚 BrickVault Documentation](https://brick-vault-frontend.vercel.app/docs)**
**[View the live site:](https://brick-vault-frontend.vercel.app)**

## Videos

- **[🎥 Project Presentation](https://youtu.be/hPiBzkNbKIA)** - Comprehensive slides overview of BrickVault
- **[🎬 Platform Demo](https://youtu.be/g4hohpKgSII)** - Live demonstration of the platform features

## Project Structure

```
BrickVault/
├── apps/
│   ├── frontend/          # Next.js React application with documentation and UI
│   └── relayer/           # Node.js service for cross-chain message relaying
├── packages/
│   ├── contracts-evm/     # Solidity smart contracts for EVM chains
│   ├── contracts-stacks/  # Clarity smart contracts for Stacks blockchain
│   ├── shared/           # Shared TypeScript types and constants
│   └── abi/              # Contract ABIs and deployment artifacts
├── deployments/          # Network deployment configurations
└── scripts/              # Utility and deployment scripts
```

### Component Functions

- **Frontend**: User interface, documentation site, and property browsing
- **Relayer**: Off-chain service connecting Stacks and EVM blockchains
- **Contracts-EVM**: ERC-4626 vaults, property registry, and cross-chain adapters
- **Contracts-Stacks**: Gateway contracts for BTC/sBTC integration
- **Shared**: Common types, constants, and utilities across packages
- **ABI**: Contract interfaces and deployment metadata

## Quick Start

```bash
# Clone the repository
git clone https://github.com/Mikadaisuki/BrickVault.git
cd BrickVault

# Install dependencies
pnpm install

# Build the project
pnpm build
```

## License

MIT License - see LICENSE file for details
