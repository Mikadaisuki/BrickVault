/**
 * EVM Event Monitor
 * Monitors EVM blockchain for cross-chain events using ethers.js
 */

import { ethers } from 'ethers';
import { RelayerConfig } from '../config/index.js';
import { EVMContractEvent } from '../types';

export class EVMMonitor {
  private provider: ethers.Provider;
  private wallet: ethers.Wallet;
  private config: RelayerConfig;
  private lastProcessedBlock: number = 0;
  private isMonitoring: boolean = false;
  private stacksManagerContract: ethers.Contract;

  // Event signatures for filtering
  private readonly STACKS_STAGE_CHANGE_EVENT = 'StacksStageChange(uint32,uint8)';

  constructor(config: RelayerConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.evm.rpcUrl);
    this.wallet = new ethers.Wallet(config.evm.privateKey, this.provider);
    this.stacksManagerContract = this.createStacksManagerContract();
  }

  /**
   * Create StacksCrossChainManager contract instance
   */
  private createStacksManagerContract(): ethers.Contract {
    // ABI for StacksCrossChainManager events and functions
    const abi = [
      'event StacksStageChange(uint32 indexed propertyId, uint8 newStage)',
      'function processCrossChainMessage(bytes32 messageId, uint8 messageType, uint32 propertyId, address evmCustodian, string calldata stacksAddress, uint256 amount, bytes32 stacksTxHash, bytes calldata proof) external',
      'function notifyStacksStageChange(uint32 propertyId, uint8 newStage) external'
    ];

    return new ethers.Contract(
      this.config.evm.stacksManagerAddress,
      abi,
      this.wallet
    );
  }

  /**
   * Start monitoring EVM blockchain for events
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log('EVM monitoring already running');
      return;
    }

    this.isMonitoring = true;
    console.log('🔍 Starting EVM event monitoring...');

    // Get current block number
    await this.updateLastProcessedBlock();

    // Start monitoring loop
    this.monitoringLoop();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    this.isMonitoring = false;
    console.log('⏹️ EVM monitoring stopped');
  }

  /**
   * Main monitoring loop
   */
  private async monitoringLoop(): Promise<void> {
    while (this.isMonitoring) {
      try {
        await this.processNewBlocks();
        await this.sleep(this.config.monitoring.interval);
      } catch (error) {
        console.error('❌ Error in EVM monitoring loop:', error);
        await this.sleep(this.config.monitoring.retryDelay);
      }
    }
  }

  /**
   * Process new blocks for events
   */
  private async processNewBlocks(): Promise<void> {
    const currentBlock = await this.provider.getBlockNumber();
    
    if (currentBlock > this.lastProcessedBlock) {
      console.log(`📦 Processing EVM blocks ${this.lastProcessedBlock + 1} to ${currentBlock}`);
      
      for (let blockNumber = this.lastProcessedBlock + 1; blockNumber <= currentBlock; blockNumber++) {
        await this.processBlock(blockNumber);
      }
      
      this.lastProcessedBlock = currentBlock;
    }
  }

  /**
   * Process a specific block for events
   */
  private async processBlock(blockNumber: number): Promise<void> {
    try {
      const block = await this.provider.getBlock(blockNumber, true);
      
      if (!block || !block.transactions) {
        return;
      }

      // Filter for transactions to our contract
      const relevantTxs = block.transactions.filter(tx => 
        typeof tx === 'object' && 
        'to' in tx &&
        (tx as any).to?.toLowerCase() === this.config.evm.stacksManagerAddress.toLowerCase()
      ) as ethers.TransactionResponse[];

      for (const tx of relevantTxs) {
        if ('logs' in tx && tx.logs) {
          await this.processTransactionLogs(tx.logs as ethers.Log[]);
        }
      }
    } catch (error) {
      console.error(`❌ Error processing block ${blockNumber}:`, error);
    }
  }

  /**
   * Process transaction logs for events
   */
  private async processTransactionLogs(logs: ethers.Log[]): Promise<void> {
    for (const log of logs) {
      try {
        const event = this.parseEVMEvent(log);
        if (event) {
          await this.processEVMEvent(event);
        }
      } catch (error) {
        console.error('❌ Error processing EVM log:', error);
      }
    }
  }

  /**
   * Parse EVM log into our event format
   */
  private parseEVMEvent(log: ethers.Log): EVMContractEvent | null {
    try {
      // Check if this is a StacksStageChange event
      const eventSignature = ethers.id(this.STACKS_STAGE_CHANGE_EVENT);
      
      if (log.topics[0] === eventSignature) {
        return {
          address: log.address,
          topics: [...log.topics], // Convert readonly array to mutable
          data: log.data,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          logIndex: log.index
        };
      }

      return null;
    } catch (error) {
      console.error('❌ Error parsing EVM event:', error);
      return null;
    }
  }

  /**
   * Process EVM contract event
   */
  private async processEVMEvent(event: EVMContractEvent): Promise<void> {
    try {
      // Decode the StacksStageChange event
      const decoded = this.stacksManagerContract.interface.parseLog({
        topics: event.topics,
        data: event.data
      });

      if (decoded && decoded.name === 'StacksStageChange') {
        const propertyId = decoded.args.propertyId;
        const newStage = decoded.args.newStage;

        console.log(`📡 Processing EVM StacksStageChange event: Property ${propertyId}, Stage ${newStage}`);

        // Forward to Stacks
        await this.forwardToStacks(propertyId, newStage, event.transactionHash);
      }
    } catch (error) {
      console.error('❌ Error processing EVM event:', error);
    }
  }

  /**
   * Forward EVM event to Stacks
   */
  private async forwardToStacks(propertyId: number, stage: number, txHash: string): Promise<void> {
    // This will be implemented in the message processor
    console.log(`🔄 Forwarding EVM stage change to Stacks: Property ${propertyId}, Stage ${stage}`);
  }

  /**
   * Process cross-chain message from Stacks
   */
  async processCrossChainMessage(
    messageId: string,
    messageType: 1 | 2 | 3,
    propertyId: number,
    evmCustodian: string,
    stacksAddress: string,
    amount: string,
    stacksTxHash: string,
    proof: string
  ): Promise<string> {
    try {
      console.log(`🔄 Processing cross-chain message: ${messageId}`);

      const tx = await this.stacksManagerContract.processCrossChainMessage(
        messageId,
        messageType,
        propertyId,
        evmCustodian,
        stacksAddress,
        amount,
        stacksTxHash,
        proof
      );

      const receipt = await tx.wait();
      console.log(`✅ Cross-chain message processed: ${receipt.hash}`);

      return receipt.hash;
    } catch (error) {
      console.error('❌ Error processing cross-chain message:', error);
      throw error;
    }
  }

  /**
   * Get current block number
   */
  private async getCurrentBlockNumber(): Promise<number> {
    try {
      return await this.provider.getBlockNumber();
    } catch (error) {
      console.error('❌ Error getting current block number:', error);
      return this.lastProcessedBlock;
    }
  }

  /**
   * Update last processed block from storage
   */
  private async updateLastProcessedBlock(): Promise<void> {
    // In a real implementation, this would read from a database
    // For now, we'll start from current block - 10
    const currentBlock = await this.getCurrentBlockNumber();
    this.lastProcessedBlock = Math.max(0, currentBlock - 10);
    console.log(`📍 Starting EVM monitoring from block ${this.lastProcessedBlock}`);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get monitoring status
   */
  getStatus(): { isMonitoring: boolean; lastProcessedBlock: number } {
    return {
      isMonitoring: this.isMonitoring,
      lastProcessedBlock: this.lastProcessedBlock
    };
  }

  /**
   * Get contract instance for external use
   */
  getStacksManagerContract(): ethers.Contract {
    return this.stacksManagerContract;
  }

  /**
   * Get provider for external use
   */
  getProvider(): ethers.Provider {
    return this.provider;
  }

  /**
   * Get wallet for external use
   */
  getWallet(): ethers.Wallet {
    return this.wallet;
  }
}
