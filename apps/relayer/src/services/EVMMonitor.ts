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
import { LogService } from './LogService';

export class EVMMonitor {
  private provider: ethers.Provider;
  private wallet: ethers.Wallet;
  private config: RelayerConfig;
  private logService: LogService;
  private lastProcessedBlock: number = 0;
  private isMonitoring: boolean = false;
  private stacksManagerContract: ethers.Contract;
  private processedStacksTxHashes: Set<string> = new Set();
  private confirmedMessageIds: Set<string> = new Set();
  private messageConfirmationCallback: ((messageId: string, messageType: number) => void) | null = null;
  private useWebSocket: boolean = false;

  constructor(config: RelayerConfig, logService: LogService) {
    this.config = config;
    this.logService = logService;
    
    // Use WebSocket if URL starts with ws:// or wss://
    this.useWebSocket = config.evm.rpcUrl.startsWith('ws://') || config.evm.rpcUrl.startsWith('wss://');
    
    if (this.useWebSocket) {
      this.provider = new ethers.WebSocketProvider(config.evm.rpcUrl);
      console.log(`🌐 Using WebSocket provider: ${config.evm.rpcUrl}`);
    } else {
      this.provider = new ethers.JsonRpcProvider(config.evm.rpcUrl);
      console.log(`📡 Using HTTP provider: ${config.evm.rpcUrl}`);
    }
    
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
      
      // View functions for validation
      'function isStacksTxHashUsed(bytes32 stacksTxHash) external view returns (bool)',
      'function isMessageProcessed(bytes32 messageId) external view returns (bool)',
      'function getEvmCustodian(string calldata stacksAddress) external view returns (address)',
      'function emergencyPaused() external view returns (bool)',
      'function getSbtcPrice() external view returns (uint256 price, bool isValid)',
      'function calculateUsdValue(uint256 sbtcAmount) external view returns (uint256 usdValue)',
      'function getPoolBalance() external view returns (uint256 balance)'
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

    if (this.useWebSocket) {
      // Use real-time event listeners with WebSocket
      await this.startWebSocketMonitoring();
    } else {
      // Use polling for HTTP providers
      await this.updateLastProcessedBlock();
      this.monitoringLoop();
    }
  }

  /**
   * Start WebSocket event monitoring
   */
  private async startWebSocketMonitoring(): Promise<void> {
    console.log('🎧 Setting up WebSocket event listeners...');

    // Listen for CrossChainMessageProcessed events
    this.stacksManagerContract.on('CrossChainMessageProcessed', (messageId, messageType, event) => {
      const typeLabel = messageType === 1 ? 'Deposit' : messageType === 2 ? 'Withdrawal' : 'Acknowledgment';
      console.log(`\n✅ EVM confirmed message processing: ${messageId}`);
      console.log(`   Message Type: ${messageType} (${typeLabel})`);
      console.log(`   Block: ${event.log.blockNumber}`);
      console.log(`   Transaction: ${event.log.transactionHash}`);

      // Mark as confirmed
      this.confirmedMessageIds.add(messageId);

      // Notify callback if set
      if (this.messageConfirmationCallback) {
        this.messageConfirmationCallback(messageId, messageType);
      }
    });

    // Listen for StacksDepositReceived events
    this.stacksManagerContract.on('StacksDepositReceived', (user, sbtcAmount, oftusdcAmount, stacksTxHash, event) => {
      console.log(`\n💰 EVM deposit confirmed:`);
      console.log(`   User: ${user}`);
      console.log(`   sBTC Amount: ${sbtcAmount.toString()}`);
      console.log(`   OFTUSDC Minted: ${oftusdcAmount.toString()}`);
      console.log(`   Stacks TX: ${stacksTxHash}`);
      console.log(`   Block: ${event.log.blockNumber}`);
    });

    console.log('✅ WebSocket event listeners active');
    console.log('🎧 Listening for EVM events in real-time...\n');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    this.isMonitoring = false;
    
    // Remove all event listeners if using WebSocket
    if (this.useWebSocket) {
      this.stacksManagerContract.removeAllListeners();
      console.log('⏹️ EVM WebSocket listeners removed');
    }
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

          const typeLabel = messageType === 1 ? 'Deposit' : messageType === 2 ? 'Withdrawal' : 'Acknowledgment';
          console.log(`✅ EVM confirmed message processing: ${messageId}`);
          console.log(`   Message Type: ${messageType} (${typeLabel})`);
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

      // Generate message ID (hash of unique event data)
      const messageId = ethers.keccak256(
        ethers.toUtf8Bytes(`${stacksEvent.stacksTxHash}-${stacksEvent.user}-${stacksEvent.amount}`)
      );

      // Generate proof (in production, this would be a merkle proof)
      const proof = ethers.keccak256(
        ethers.toUtf8Bytes(`proof-${stacksEvent.stacksTxHash}`)
      );

      // ============================================================================
      // PRE-FLIGHT CHECKS - Verify contract state before sending transaction
      // ============================================================================
      console.log(`\n🔍 Running Pre-Flight Checks...`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      // Check 1: Emergency pause status
      const emergencyPaused = await this.stacksManagerContract.emergencyPaused();
      console.log(`  Emergency Paused:     ${emergencyPaused ? '❌ YES (BLOCKED)' : '✅ No'}`);
      if (emergencyPaused) {
        throw new Error('StacksCrossChainManager is emergency paused. Cannot process deposits.');
      }

      // Check 2: sBTC price and validity
      const priceInfo = await this.stacksManagerContract.getSbtcPrice();
      const sbtcPrice = priceInfo[0];
      const isPriceValid = priceInfo[1];
      console.log(`  sBTC Price:           $${ethers.formatUnits(sbtcPrice, 8)}`);
      console.log(`  Price Valid:          ${isPriceValid ? '✅ Yes' : '❌ NO (STALE/INVALID)'}`);
      if (!isPriceValid) {
        throw new Error('sBTC price is invalid or stale (older than 1 hour). Update price before processing deposits.');
      }

      // Check 3: Calculate expected USD value
      const usdValue = await this.stacksManagerContract.calculateUsdValue(stacksEvent.amount);
      console.log(`  Expected USD Value:   ${ethers.formatUnits(usdValue, 18)} OFTUSDC`);

      // Check 4: Liquidity pool balance
      const poolBalance = await this.stacksManagerContract.getPoolBalance();
      console.log(`  Pool Balance:         ${ethers.formatUnits(poolBalance, 18)} OFTUSDC`);
      console.log(`  Pool Sufficient:      ${poolBalance >= usdValue ? '✅ Yes' : '❌ NO (INSUFFICIENT)'}`);
      if (poolBalance < usdValue) {
        throw new Error(`Insufficient liquidity pool balance. Required: ${ethers.formatUnits(usdValue, 18)} OFTUSDC, Available: ${ethers.formatUnits(poolBalance, 18)} OFTUSDC`);
      }

      // Check 5: Message already processed
      const isMessageProcessed = await this.stacksManagerContract.isMessageProcessed(messageId);
      console.log(`  Message Processed:    ${isMessageProcessed ? '⚠️  Already processed' : '✅ New'}`);
      if (isMessageProcessed) {
        throw new Error(`Message ${messageId} already processed on EVM`);
      }

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`✅ All pre-flight checks passed!\n`);

      // Log the exact message that will be sent to EVM
      console.log(`📤 Preparing EVM Transaction:`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Contract: StacksCrossChainManager.processCrossChainMessage()`);
      console.log(`Address:  ${this.config.evm.stacksManagerAddress}`);
      console.log(`\nParameters:`);
      console.log(`  messageId:       ${messageId}`);
      console.log(`  messageType:     1 (deposit)`);
      console.log(`  evmCustodian:    ${stacksEvent.evmCustodian}`);
      console.log(`  stacksAddress:   "${stacksEvent.user}"`);
      console.log(`  amount:          ${stacksEvent.amount} (${ethers.formatUnits(stacksEvent.amount, 8)} sBTC)`);
      console.log(`  stacksTxHash:    ${stacksTxHashBytes32}`);
      console.log(`  proof:           ${proof.slice(0, 20)}...`);
      console.log(`  gasLimit:        ${this.config.evm.gasLimit || 800000}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      // Call EVM contract with signed transaction
      const tx = await this.stacksManagerContract.processCrossChainMessage(
        messageId,
        1, // messageType: 1 = deposit
        stacksEvent.evmCustodian,
        stacksEvent.user,
        stacksEvent.amount,
        stacksTxHashBytes32,
        proof,
        {
          gasLimit: this.config.evm.gasLimit || 800000
        }
      );

      this.logService.info('evm-transaction', '📤 Transaction sent to EVM', {
        txHash: tx.hash,
        stacksTxHash: stacksEvent.stacksTxHash,
        amount: stacksEvent.amount
      });

      console.log(`📤 Transaction sent to EVM: ${tx.hash}`);
      console.log(`⏳ Waiting for confirmation...`);

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      this.logService.info('evm-transaction', '✅ Stacks deposit processed on EVM', {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        stacksTxHash: stacksEvent.stacksTxHash
      });

      console.log(`✅ Stacks deposit processed on EVM!`);
      console.log(`   Transaction: ${receipt.hash}`);
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);

      return receipt.hash;
    } catch (error) {
      this.logService.error('evm-transaction', '❌ Error processing Stacks deposit on EVM', {
        error: error instanceof Error ? error.message : String(error),
        stacksTxHash: stacksEvent.stacksTxHash,
        amount: stacksEvent.amount
      });
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
