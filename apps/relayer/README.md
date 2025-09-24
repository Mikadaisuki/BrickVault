# BrickVault Cross-Chain Relayer

A serverless cross-chain relayer service that facilitates communication between Stacks and EVM blockchains for the BrickVault property investment platform.

## Features

- 🔄 **Cross-Chain Message Processing**: Handles deposits, withdrawals, and stage acknowledgments
- 📡 **Real-Time Monitoring**: Monitors both Stacks and EVM blockchains for events
- 🚀 **Serverless Architecture**: Deployable on Vercel with automatic scaling
- 🛡️ **Error Handling**: Robust retry mechanisms and error recovery
- 📊 **Monitoring & Analytics**: Comprehensive status and health checking
- 🧪 **Local Testing**: Full local testing capabilities

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Stacks        │    │   Relayer        │    │   EVM           │
│   (Testnet)     │◄──►│   Service        │◄──►│   (Sepolia)     │
│                 │    │   (Vercel)       │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Message Types

| Type | Description | Direction |
|------|-------------|-----------|
| 1 | Deposit (sBTC → Shares) | Stacks → EVM |
| 2 | Withdrawal (Shares → sBTC) | Stacks → EVM |
| 3 | Stage Acknowledgment | Stacks → EVM |

## Quick Start

### 1. Installation

```bash
cd apps/relayer
npm install
```

### 2. Environment Setup

Copy the example environment file and configure:

```bash
cp env.example .env.local
```

Edit `.env.local` with your configuration:

```env
# Stacks Configuration
STACKS_NETWORK=testnet
STACKS_API_URL=https://api.testnet.hiro.so
STACKS_CONTRACT_ADDRESS=SP[YOUR-CONTRACT-ADDRESS].brick-vault-gateway

# EVM Configuration
EVM_NETWORK=sepolia
EVM_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
EVM_STACKS_MANAGER_ADDRESS=0x[YOUR-STACKS-MANAGER-ADDRESS]

# Relayer Configuration
RELAYER_PRIVATE_KEY=0x[YOUR-RELAYER-PRIVATE-KEY]
RELAYER_STACKS_PRIVATE_KEY=0x[YOUR-STACKS-RELAYER-PRIVATE-KEY]
```

### 3. Local Development

```bash
# Start local development server
npm run dev

# Test the relayer locally
npm run test:local
```

### 4. Deploy to Vercel

```bash
# Deploy to Vercel
npm run deploy
```

## API Endpoints

### Status
- **GET** `/api/status` - Get relayer service status and statistics

### Control
- **POST** `/api/start` - Start the relayer service
- **POST** `/api/stop` - Stop the relayer service

### Health
- **GET** `/api/health` - Get relayer health status

### Processing
- **POST** `/api/process-stacks-event` - Manually process a Stacks event

## Local Testing

### Test with Local Testnets

1. **Deploy Contracts**:
   ```bash
   # Deploy Stacks contract to testnet
   cd packages/contracts-stacks
   clarinet deploy --network testnet
   
   # Deploy EVM contracts to Sepolia
   cd packages/contracts-evm
   npx hardhat deploy --network sepolia
   ```

2. **Configure Environment**:
   Update `.env.local` with deployed contract addresses

3. **Run Tests**:
   ```bash
   # Test specific functionality
   npm run test:local -- --specific
   
   # Test full relayer
   npm run test:local
   ```

### Test Scenarios

1. **Deposit Flow**:
   - User deposits sBTC on Stacks
   - Relayer detects event
   - Relayer mints shares on EVM

2. **Withdrawal Flow**:
   - User requests withdrawal on Stacks
   - Relayer detects event
   - Relayer burns shares on EVM

3. **Stage Synchronization**:
   - EVM PropertyDAO changes stage
   - Relayer notifies Stacks contract
   - Stacks acknowledges receipt

## Configuration

### Stacks Configuration

```typescript
stacks: {
  network: 'testnet' | 'mainnet',
  apiUrl: 'https://api.testnet.hiro.so',
  contractAddress: 'SP[ADDRESS].brick-vault-gateway',
  privateKey: '0x[PRIVATE-KEY]'
}
```

### EVM Configuration

```typescript
evm: {
  network: 'sepolia' | 'mainnet',
  rpcUrl: 'https://sepolia.infura.io/v3/[KEY]',
  stacksManagerAddress: '0x[ADDRESS]',
  privateKey: '0x[PRIVATE-KEY]'
}
```

### Monitoring Configuration

```typescript
monitoring: {
  interval: 10000,      // 10 seconds
  maxRetries: 3,        // Max retry attempts
  retryDelay: 5000      // 5 seconds between retries
}
```

## Monitoring & Observability

### Status Endpoint

```bash
curl https://your-relayer.vercel.app/api/status
```

Response:
```json
{
  "success": true,
  "data": {
    "isRunning": true,
    "uptime": 3600000,
    "stats": {
      "totalMessages": 150,
      "successfulMessages": 148,
      "failedMessages": 2,
      "pendingMessages": 0,
      "lastProcessedBlock": {
        "stacks": 12345,
        "evm": 67890
      }
    },
    "monitoring": {
      "stacks": {
        "isMonitoring": true,
        "lastProcessedBlock": 12345
      },
      "evm": {
        "isMonitoring": true,
        "lastProcessedBlock": 67890
      }
    }
  }
}
```

### Health Check

```bash
curl https://your-relayer.vercel.app/api/health
```

Response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": 1703123456789,
    "details": {
      "relayer": true,
      "stacks": true,
      "evm": true
    }
  }
}
```

## Error Handling

The relayer includes comprehensive error handling:

- **Network Errors**: Automatic retry with exponential backoff
- **Transaction Failures**: Detailed error logging and recovery
- **Rate Limiting**: Built-in rate limiting for API calls
- **Health Monitoring**: Continuous health checks and alerts

## Security Considerations

- **Private Keys**: Store securely in environment variables
- **API Keys**: Use environment variables for all sensitive data
- **Rate Limiting**: Implement rate limiting for public endpoints
- **Validation**: Validate all incoming data and transactions

## Development

### Project Structure

```
apps/relayer/
├── api/                    # Vercel serverless functions
│   ├── status.ts
│   ├── start.ts
│   ├── stop.ts
│   ├── health.ts
│   └── process-stacks-event.ts
├── src/                    # Source code
│   ├── services/          # Core services
│   │   ├── StacksMonitor.ts
│   │   ├── EVMMonitor.ts
│   │   └── MessageProcessor.ts
│   ├── types/             # Type definitions
│   ├── RelayerService.ts  # Main service
│   └── local-testing.ts   # Testing utilities
├── package.json
├── tsconfig.json
├── vercel.json
└── README.md
```

### Adding New Features

1. **New Message Types**: Add to `types/index.ts`
2. **New Services**: Create in `src/services/`
3. **New API Endpoints**: Add to `api/` directory
4. **New Tests**: Add to `src/local-testing.ts`

## Troubleshooting

### Common Issues

1. **Relayer Not Starting**:
   - Check environment variables
   - Verify contract addresses
   - Check network connectivity

2. **Messages Not Processing**:
   - Check relayer status
   - Verify contract permissions
   - Check gas prices

3. **Health Check Failing**:
   - Check API endpoints
   - Verify network connections
   - Check contract states

### Debug Mode

Enable debug logging by setting:
```env
DEBUG=true
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
