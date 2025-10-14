/**
 * Stacks Event Monitor for BrickVault Gateway
 * 
 * Purpose: Listen to Stacks blockchain events via WebSocket for real-time sBTC deposit detection
 * 
 * Flow:
 * 1. Connect to Stacks WebSocket API
 * 2. Subscribe to transactions for brick-vault-gateway contract address
 * 3. Filter for ft_transfer_event in real-time
 * 4. Extract deposit data: sender, amount, EVM custodian
 * 5. Forward events to MessageProcessor for EVM processing
 */

import { StacksNetwork, STACKS_TESTNET, STACKS_MAINNET } from '@stacks/network';
import { fetchCallReadOnlyFunction, cvToValue } from '@stacks/transactions';
import { Cl } from '@stacks/transactions';
import { connectWebSocketClient } from '@stacks/blockchain-api-client';
import type { RpcAddressTxNotificationParams } from '@stacks/stacks-blockchain-api-types';
import { RelayerConfig } from '../config/index.js';
import { StacksEvent } from '../types';
import { LogService } from './LogService';

export class StacksMonitor {
  private config: RelayerConfig;
  private logService: LogService;
  private lastProcessedBlock: number = 0;
  private isMonitoring: boolean = false;
  private processedTransactions: Set<string> = new Set();
  private eventCallback: ((event: StacksEvent) => Promise<void>) | null = null;
  private wsClient: Awaited<ReturnType<typeof connectWebSocketClient>> | null = null;
  private subscription: { unsubscribe: () => Promise<void> } | null = null;

  constructor(config: RelayerConfig, logService: LogService) {
    this.config = config;
    this.logService = logService;
  }

  private getNetwork(): StacksNetwork {
    // For local devnet, use testnet but point to local URL
    // The network object is only used for contract read calls
    if (this.config.stacks.apiUrl.includes('localhost') || this.config.stacks.apiUrl.includes('127.0.0.1')) {
      // Create a custom network object for localhost
      return {
        ...STACKS_TESTNET,
        coreApiUrl: this.config.stacks.apiUrl,
        isMainnet: () => false
      } as StacksNetwork;
    }
    
    return this.config.stacks.network === 'testnet' ? STACKS_TESTNET : STACKS_MAINNET;
  }

  /**
   * Get WebSocket URL based on network configuration
   */
  private getWebSocketUrl(): string {
    // Replace http/https with ws/wss
    const apiUrl = this.config.stacks.apiUrl;
    if (apiUrl.startsWith('https://')) {
      return apiUrl.replace('https://', 'wss://');
    } else if (apiUrl.startsWith('http://')) {
      return apiUrl.replace('http://', 'ws://');
    }
    // Default WebSocket URLs
    return this.config.stacks.network === 'testnet' 
      ? 'wss://api.testnet.hiro.so/'
      : 'wss://api.mainnet.hiro.so/';
  }

  /**
   * Set callback for when events are detected
   */
  setEventCallback(callback: (event: StacksEvent) => Promise<void>): void {
    this.eventCallback = callback;
  }

  /**
   * Start monitoring Stacks blockchain for events via WebSocket
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log('Stacks monitoring already running');
      return;
    }

    try {
      this.isMonitoring = true;
      const wsUrl = this.getWebSocketUrl();
      console.log('🔍 Starting Stacks event monitoring via WebSocket...');
      console.log(`📡 Connecting to: ${wsUrl}`);

      // Connect to WebSocket
      this.wsClient = await connectWebSocketClient(wsUrl);
      console.log('✅ WebSocket connected to Stacks API');

      // Extract contract address from config (format: ADDRESS.CONTRACT_NAME)
      const contractParts = this.config.stacks.contractAddress.split('.');
      const contractAddress = contractParts[0];
      const contractName = contractParts[1] || 'brick-vault-gateway';

      console.log(`👀 Will monitor for transactions involving: ${contractAddress}.${contractName}`);

      // Subscribe to blocks and process all transactions
      await this.wsClient.subscribeBlocks(async (block) => {
        // Only log blocks with transactions
        if (block.txs && block.txs.length > 0) {
          console.log(`📦 Block #${block.height}: ${block.txs.length} transaction(s)`);
        }
        
        // Check each transaction in the block
        if (block.txs && block.txs.length > 0) {
          for (const txId of block.txs) {
            // Fetch full transaction details from API
            try {
              const txResponse = await fetch(`${this.config.stacks.apiUrl}/extended/v1/tx/${txId}`);
              if (txResponse.ok) {
                const txData = await txResponse.json();
                
                // Check if transaction involves our contract
                const involvesOurContract = 
                  txData.sender_address === contractAddress ||
                  txData.contract_call?.contract_id?.includes(contractAddress) ||
                  txData.ft_transfers?.some((ft: { sender?: string; recipient?: string }) => 
                    ft.sender?.includes(contractAddress) || 
                    ft.recipient?.includes(contractAddress)
                  );
                
                if (involvesOurContract) {
                  // Process transaction involving our contract
                  this.handleTransaction(txData as any);
                }
              }
            } catch (error) {
              console.error(`Error fetching tx ${txId}:`, error);
            }
          }
        }
      });
      console.log('✅ Monitoring blocks and transactions');
      console.log('🎧 Listening for sBTC deposits in real-time...\n');

    } catch (error) {
      this.isMonitoring = false;
      console.error('❌ Failed to start Stacks monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop monitoring
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    try {
      // Unsubscribe from WebSocket
      if (this.subscription) {
        await this.subscription.unsubscribe();
        this.subscription = null;
      }

      // Close WebSocket connection
      if (this.wsClient) {
        this.wsClient = null;
      }

      this.isMonitoring = false;
      console.log('⏹️ Stacks monitoring stopped');

    } catch (error) {
      console.error('❌ Error stopping Stacks monitoring:', error);
      this.isMonitoring = false;
    }
  }

  /**
   * Handle incoming transaction from WebSocket
   */
  private async handleTransaction(txData: any): Promise<void> {
    try {
      // Check if transaction is confirmed
      if (txData.tx_status !== 'success') {
        return;
      }

      // Check events array for FT transfers
      if (!txData.events || txData.events.length === 0) {
        return;
      }

      // Look for fungible_token_asset events
      const ftEvents = txData.events.filter((e: any) => e.event_type === 'fungible_token_asset');

      if (ftEvents.length === 0) {
        return;
      }

      // Process FT events
      await this.processFTEvents(txData, ftEvents);

    } catch (error) {
      console.error('❌ Error handling transaction:', error);
    }
  }

  /**
   * Process fungible token events from transaction
   */
  private async processFTEvents(txData: any, ftEvents: any[]): Promise<void> {
    try {
      // Generate unique identifier
      const uniqueId = txData.tx_id;
      
      // Check if already processed
      if (this.processedTransactions.has(uniqueId)) {
        return;
      }

      // Process each FT event
      for (const event of ftEvents) {
        const asset = event.asset;
        
        // Verify this is an sBTC transfer to our gateway
        const isSBTC = asset.asset_id?.includes('sbtc-token');
        const isToGateway = asset.recipient?.includes('brick-vault-gateway');
        
        if (!isSBTC || !isToGateway) {
          continue;
        }

        this.logService.info('stacks-monitor', '📡 sBTC Deposit Detected', {
          txId: uniqueId,
          amount: asset.amount,
          sender: asset.sender
        });

        console.log(`\n📡 sBTC Deposit Detected: ${uniqueId}`);
        console.log(`   Amount: ${asset.amount} sBTC`);
        console.log(`   From: ${asset.sender}`);

        // Extract sender from event
        const sender = asset.sender;
        if (!sender) {
          this.logService.warn('stacks-monitor', 'No sender address, skipping event');
          console.warn('   ⚠️ No sender address, skipping');
          continue;
        }
        
        const amount = asset.amount || '0';

        // Get EVM custodian address for the sender
        const evmCustodian = await this.getEVMCustodian(sender);
        
        if (!evmCustodian) {
          this.logService.warn('stacks-monitor', 'No EVM custodian registered', {
            sender,
            hint: 'User must call register-stacks-address first'
          });
          console.warn(`   ⚠️ No EVM custodian registered for ${sender}`);
          console.warn(`   💡 User must call register-stacks-address first\n`);
          continue;
        }

        this.logService.info('stacks-monitor', 'EVM custodian found for deposit', {
          sender,
          evmCustodian
        });

        console.log(`   To: ${evmCustodian} (EVM custodian)`);

        // Create StacksEvent
        const blockHeight = txData.block_height;
        const stacksEvent: StacksEvent = {
          id: `${txData.tx_id}-${blockHeight}`,
          eventType: 'deposit',
          user: sender,
          propertyId: 0,
          amount: amount,
          stacksTxHash: txData.tx_id,
          timestamp: Date.now(),
          processed: false,
          blockHeight: blockHeight,
          evmCustodian: evmCustodian
        };

        // Mark as processed BEFORE forwarding
        this.processedTransactions.add(uniqueId);

        // Forward to callback
        if (this.eventCallback) {
          await this.eventCallback(stacksEvent);
        }
      }

    } catch (error) {
      console.error('❌ Error processing FT events:', error);
    }
  }


  /**
   * Get EVM custodian address for a Stacks address by querying the contract
   */
  private async getEVMCustodian(stacksAddress: string): Promise<string | null> {
    try {
      const contractParts = this.config.stacks.contractAddress.split('.');
      if (contractParts.length !== 2) {
        console.error(`❌ Invalid contract address format: ${this.config.stacks.contractAddress}`);
        return null;
      }

      // Convert principal to hex for API call
      const principalCv = Cl.principal(stacksAddress);
      const { cvToHex } = await import('@stacks/transactions');
      const principalHex = cvToHex(principalCv);

      // Call read-only function using Stacks API (same as frontend)
      const response = await fetch(
        `${this.config.stacks.apiUrl}/v2/contracts/call-read/${contractParts[0]}/${contractParts[1]}/get-evm-custodian`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: stacksAddress,
            arguments: [principalHex]
          })
        }
      );

      if (!response.ok) {
        console.warn(`⚠️ Failed to query contract: ${response.status}`);
        return null;
      }

      const data = await response.json();

      if (data.okay && data.result) {
        const resultHex = data.result;
        
        // Check if it's a (some ...) value (0x0a prefix indicates optional-some)
        if (resultHex.includes('0a')) {
          // Extract the buffer value
          const bufferStart = resultHex.indexOf('0200000014'); // 0x02 (buffer) + 0x00000014 (20 bytes length)
          if (bufferStart !== -1) {
            // Extract 20 bytes (40 hex chars) after the length indicator
            const evmAddressHex = resultHex.slice(bufferStart + 10, bufferStart + 10 + 40);
            const evmAddress = `0x${evmAddressHex}`;
            return evmAddress;
          }
        }
      }

      console.warn(`⚠️ No EVM custodian registered for ${stacksAddress}`);
      return null;
    } catch (error) {
      console.error(`❌ Error getting EVM custodian for ${stacksAddress}:`, error);
      return null;
    }
  }



  /**
   * Get monitoring status
   */
  getStatus(): { 
    isMonitoring: boolean; 
    lastProcessedBlock: number;
    processedTransactionsCount: number;
    connectionType: string;
  } {
    return {
      isMonitoring: this.isMonitoring,
      lastProcessedBlock: 0, // Not used with WebSocket, but kept for API compatibility
      processedTransactionsCount: this.processedTransactions.size,
      connectionType: this.isMonitoring ? 'WebSocket' : 'None'
    };
  }

  /**
   * Get processed transactions (for debugging)
   */
  getProcessedTransactions(): string[] {
    return Array.from(this.processedTransactions);
  }

  /**
   * Clear processed transactions (for testing)
   */
  clearProcessedTransactions(): void {
    this.processedTransactions.clear();
    console.log('🧹 Cleared processed transactions set');
  }
}
