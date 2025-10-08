/**
 * EVM Transaction Sender
 * 
 * Purpose: Sign and send cross-chain messages to EVM
 * 
 * Flow:
 * 1. Receive Stacks event data from MessageProcessor
 * 2. Sign transaction using EVM owner private key
 * 3. Call StacksCrossChainManager.processCrossChainMessage()
 * 4. Return transaction hash
 */

import { ethers } from 'ethers';
import { RelayerConfig } from '../config/index.js';
import { StacksEvent } from '../types';

export class EVMMonitor {
  private provider: ethers.Provider;
  private wallet: ethers.Wallet;
  private config: RelayerConfig;
  private lastProcessedBlock: number = 0;
  private isMonitoring: boolean = false;
  private stacksManagerContract: ethers.Contract;
  private processedStacksTxHashes: Set<string> = new Set();
  private confirmedMessageIds: Set<string> = new Set();
  private messageConfirmationCallback: ((messageId: string, messageType: number) => void) | null = null;

  constructor(config: RelayerConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.evm.rpcUrl);
    this.wallet = new ethers.Wallet(config.evm.privateKey, this.provider);
    this.stacksManagerContract = this.createStacksManagerContract();
    
    console.log(`🔑 EVM Wallet Address: ${this.wallet.address}`);
  }

  /**
   * Set callback for when message processing is confirmed on EVM
   */
  setMessageConfirmationCallback(callback: (messageId: string, messageType: number) => void): void {
    this.messageConfirmationCallback = callback;
  }

  /**
   * Create StacksCrossChainManager contract instance
   */
  private createStacksManagerContract(): ethers.Contract {
    // ABI for StacksCrossChainManager - focused on deposit processing
    const abi = [
      // Event emitted when deposit is processed
      'event StacksDepositReceived(address indexed user, uint256 sbtcAmount, uint256 oftusdcAmount, bytes32 indexed stacksTxHash)',
      'event CrossChainMessageProcessed(bytes32 indexed messageId, uint8 messageType)',
      
      // Main function for processing cross-chain messages
      'function processCrossChainMessage(bytes32 messageId, uint8 messageType, address evmCustodian, string calldata stacksAddress, uint256 amount, bytes32 stacksTxHash, bytes calldata proof) external',
      
      // View functions
      'function isStacksTxHashUsed(bytes32 stacksTxHash) external view returns (bool)',
      'function isMessageProcessed(bytes32 messageId) external view returns (bool)',
      'function getEvmCustodian(string calldata stacksAddress) external view returns (address)'
    ];

    return new ethers.Contract(
      this.config.evm.stacksManagerAddress,
      abi,
      this.wallet // Connected with wallet for signing transactions
    );
  }

  /**
   * Start monitoring EVM blockchain for events
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
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
      // Silently process blocks (only log when events are found)
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
      // Query logs from our contract for this block
      const logs = await this.provider.getLogs({
        address: this.config.evm.stacksManagerAddress,
        fromBlock: blockNumber,
        toBlock: blockNumber
      });

      if (logs.length > 0) {
        await this.processTransactionLogs(logs);
      }
    } catch (error) {
      console.error(`❌ Error processing block ${blockNumber}:`, error);
    }
  }

  /**
   * Process transaction logs for CrossChainMessageProcessed events
   */
  private async processTransactionLogs(logs: ethers.Log[]): Promise<void> {
    for (const log of logs) {
      try {
        // Check if this log is from our contract
        if (log.address.toLowerCase() !== this.config.evm.stacksManagerAddress.toLowerCase()) {
          continue;
        }

        // Try to parse the log
        const parsed = this.stacksManagerContract.interface.parseLog({
          topics: [...log.topics],
          data: log.data
        });

        if (!parsed) continue;

        // Check if it's a CrossChainMessageProcessed event
        if (parsed.name === 'CrossChainMessageProcessed') {
          const messageId = parsed.args.messageId;
          const messageType = parsed.args.messageType;

          console.log(`✅ EVM confirmed message processing: ${messageId}`);
          console.log(`   Message Type: ${messageType} (1=deposit, 2=withdrawal, 3=ack)`);
          console.log(`   Block: ${log.blockNumber}`);
          console.log(`   Transaction: ${log.transactionHash}`);

          // Mark as confirmed
          this.confirmedMessageIds.add(messageId);

          // Notify callback if set
          if (this.messageConfirmationCallback) {
            this.messageConfirmationCallback(messageId, messageType);
          }
        }

        // Also log StacksDepositReceived for additional confirmation
        if (parsed.name === 'StacksDepositReceived') {
          const user = parsed.args.user;
          const sbtcAmount = parsed.args.sbtcAmount;
          const oftusdcAmount = parsed.args.oftusdcAmount;
          const stacksTxHash = parsed.args.stacksTxHash;

          console.log(`💰 EVM deposit confirmed:`);
          console.log(`   User: ${user}`);
          console.log(`   sBTC Amount: ${sbtcAmount.toString()}`);
          console.log(`   OFTUSDC Minted: ${oftusdcAmount.toString()}`);
          console.log(`   Stacks TX: ${stacksTxHash}`);
        }

      } catch (error) {
        // Ignore unparseable logs (they might be from other contracts)
        continue;
      }
    }
  }

  /**
   * Process Stacks deposit event and send to EVM
   * This is the main function called by MessageProcessor
   */
  async processStacksDeposit(stacksEvent: StacksEvent): Promise<string> {
    try {
      // Validate event
      if (!stacksEvent.evmCustodian) {
        throw new Error('No EVM custodian address in event');
      }

      // Check if already processed on EVM
      const stacksTxHashBytes32 = this.stringToBytes32(stacksEvent.stacksTxHash);
      const isProcessed = await this.stacksManagerContract.isStacksTxHashUsed(stacksTxHashBytes32);
      
      if (isProcessed) {
        console.log(`⚠️ Stacks transaction already processed on EVM: ${stacksEvent.stacksTxHash}`);
        return 'already-processed';
      }

      // Mark as processing
      if (this.processedStacksTxHashes.has(stacksEvent.stacksTxHash)) {
        console.log(`⚠️ Stacks transaction already being processed: ${stacksEvent.stacksTxHash}`);
        return 'processing';
      }
      this.processedStacksTxHashes.add(stacksEvent.stacksTxHash);

      console.log(`🔄 Processing Stacks deposit on EVM:`, {
        stacksTxHash: stacksEvent.stacksTxHash,
        user: stacksEvent.user,
        amount: stacksEvent.amount,
        evmCustodian: stacksEvent.evmCustodian
      });

      // Generate message ID (hash of unique event data)
      const messageId = ethers.keccak256(
        ethers.toUtf8Bytes(`${stacksEvent.stacksTxHash}-${stacksEvent.user}-${stacksEvent.amount}`)
      );

      // Generate proof (in production, this would be a merkle proof)
      const proof = ethers.keccak256(
        ethers.toUtf8Bytes(`proof-${stacksEvent.stacksTxHash}`)
      );

      // Call EVM contract with signed transaction
      // Message type 1 = deposit
      const tx = await this.stacksManagerContract.processCrossChainMessage(
        messageId,
        1, // messageType: 1 = deposit
        stacksEvent.evmCustodian,
        stacksEvent.user,
        stacksEvent.amount,
        stacksTxHashBytes32,
        proof,
        {
          gasLimit: this.config.evm.gasLimit || 500000
        }
      );

      console.log(`📤 Transaction sent to EVM: ${tx.hash}`);
      console.log(`⏳ Waiting for confirmation...`);

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      console.log(`✅ Stacks deposit processed on EVM!`);
      console.log(`   Transaction: ${receipt.hash}`);
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);

      return receipt.hash;
    } catch (error) {
      console.error('❌ Error processing Stacks deposit on EVM:', error);
      // Remove from processing set on error
      this.processedStacksTxHashes.delete(stacksEvent.stacksTxHash);
      throw error;
    }
  }

  /**
   * Convert string to bytes32 for EVM
   */
  private stringToBytes32(str: string): string {
    // If it's already a hex string starting with 0x, return as is
    if (str.startsWith('0x') && str.length === 66) {
      return str;
    }
    
    // Otherwise, hash it to create a bytes32
    return ethers.keccak256(ethers.toUtf8Bytes(str));
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
    // Start from current block - 10 to catch recent events
    const currentBlock = await this.getCurrentBlockNumber();
    this.lastProcessedBlock = Math.max(0, currentBlock - 10);
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

  /**
   * Check if a message has been confirmed on EVM
   */
  isMessageConfirmed(messageId: string): boolean {
    return this.confirmedMessageIds.has(messageId);
  }

  /**
   * Get all confirmed message IDs
   */
  getConfirmedMessageIds(): string[] {
    return Array.from(this.confirmedMessageIds);
  }

  /**
   * Get confirmation statistics
   */
  getConfirmationStats(): {
    totalConfirmed: number;
    confirmedMessageIds: string[];
  } {
    return {
      totalConfirmed: this.confirmedMessageIds.size,
      confirmedMessageIds: Array.from(this.confirmedMessageIds)
    };
  }
}
