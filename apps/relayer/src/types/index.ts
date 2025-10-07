/**
 * Cross-Chain Relayer Types
 * Defines interfaces for cross-chain message processing between Stacks and EVM
 */

export interface StacksEvent {
  id: string;
  eventType: 'deposit' | 'withdrawal' | 'stage-transition' | 'stage-acknowledgment';
  user: string;
  propertyId: number;
  amount: string;
  stacksTxHash: string;
  timestamp: number;
  processed: boolean;
  blockHeight?: number;
  evmCustodian?: string; // EVM address where OFTUSDC should be minted
}

export interface CrossChainMessage {
  messageId: string;
  messageType: 1 | 2 | 3; // 1=deposit, 2=withdrawal, 3=acknowledgment
  propertyId: number;
  evmCustodian: string;
  stacksAddress: string;
  amount: string;
  stacksTxHash: string;
  proof: string;
  timestamp: number;
  processed: boolean;
}

// RelayerConfig is now defined in ./config/index.js

export interface ProcessedMessage {
  messageId: string;
  success: boolean;
  error?: string;
  timestamp: number;
  retryCount: number;
}

export interface RelayerStats {
  totalMessages: number;
  successfulMessages: number;
  failedMessages: number;
  pendingMessages: number;
  lastProcessedBlock: {
    stacks: number;
    evm: number;
  };
}

export interface StacksContractEvent {
  event: string;
  data: {
    // For ft_transfer_event
    amount?: string;
    asset_identifier?: string;
    recipient?: string;
    sender?: string;
    
    // For print_event
    contract_identifier?: string;
    topic?: string;
    value?: any;
    raw_value?: string;
    
    // Legacy fields
    property_id?: string;
    user?: string;
    stage?: string;
    
    // Generic field for any other data
    [key: string]: any;
  };
  tx_id: string;
  block_height: number;
  contract_address?: string;
}

export interface EVMContractEvent {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

export interface MessageProcessingResult {
  success: boolean;
  messageId: string;
  error?: string;
  gasUsed?: string;
  transactionHash?: string;
}
