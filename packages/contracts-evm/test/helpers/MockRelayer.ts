import { ethers } from 'hardhat';
import { StacksCrossChainManager } from '../../typechain-types/src';

/**
 * Mock Relayer for Cross-Chain Testing
 * 
 * This helper simulates a real relayer that would:
 * 1. Monitor Stacks blockchain for sBTC deposit events
 * 2. Construct cross-chain messages with proofs
 * 3. Call EVM StacksCrossChainManager to mint OFTUSDC
 * 
 * Simplified Flow:
 * - Users deposit sBTC on Stacks
 * - Relayer detects deposit and sends message to EVM
 * - EVM mints OFTUSDC to user's custodian address
 * - Users can freely invest OFTUSDC in any property
 * - No withdrawal back to sBTC (platform balance only)
 * 
 * Language: TypeScript/JavaScript
 * - Can interact with both Stacks (Clarity) and EVM (Solidity)
 * - Easy to mock blockchain events and proofs
 * - Good for integration testing
 */

export interface StacksEvent {
  id: string;
  eventType: 'deposit' | 'stage-transition';
  user: string;
  amount: string;
  stacksTxHash: string;
  timestamp: number;
  processed: boolean;
}

export interface CrossChainMessage {
  messageId: string;
  eventType: number;
  evmCustodian: string;
  stacksAddress: string;
  amount: string;
  stacksTxHash: string;
  proof: string;
}

export class MockRelayer {
  private stacksEvents: Map<string, StacksEvent> = new Map();
  private processedMessages: Set<string> = new Set();
  private stacksManager: StacksCrossChainManager;
  private relayerSigner: any;

  constructor(stacksManager: StacksCrossChainManager, relayerSigner: any) {
    this.stacksManager = stacksManager;
    this.relayerSigner = relayerSigner;
  }

  /**
   * Simulate a Stacks deposit event
   * In real scenario, this would be emitted by Stacks contract
   */
  async simulateStacksDepositEvent(
    stacksAddress: string,
    sbtcAmount: string,
    stacksTxHash: string
  ): Promise<string> {
    // Use a more unique event ID that includes the tx hash to avoid collisions
    const eventId = ethers.keccak256(
      ethers.toUtf8Bytes(`deposit-${stacksAddress}-${stacksTxHash}-${Date.now()}`)
    );

    const event: StacksEvent = {
      id: eventId,
      eventType: 'deposit',
      user: stacksAddress,
      amount: sbtcAmount,
      stacksTxHash,
      timestamp: Date.now(),
      processed: false
    };

    this.stacksEvents.set(eventId, event);
    console.log(`📡 MockRelayer: Simulated Stacks deposit event ${eventId}`);
    console.log(`   Stacks Address: ${stacksAddress}`);
    console.log(`   sBTC Amount: ${sbtcAmount}`);
    console.log(`   Stacks Tx Hash: ${stacksTxHash}`);
    return eventId;
  }


  /**
   * Simulate a Stacks stage transition event (from EVM to Stacks)
   * This simulates what would happen when EVM PropertyDAO changes stage
   */
  async simulateStacksStageTransitionEvent(
    propertyId: number,
    newStage: number,
    stacksTxHash: string
  ): Promise<string> {
    const eventId = ethers.keccak256(
      ethers.toUtf8Bytes(`stage-transition-${propertyId}-${newStage}-${Date.now()}`)
    );

    const event: StacksEvent = {
      id: eventId,
      eventType: 'stage-transition' as any, // Extend the interface
      user: 'platform', // Stage changes are initiated by platform
      amount: newStage.toString(),
      stacksTxHash,
      timestamp: Date.now(),
      processed: false
    };

    this.stacksEvents.set(eventId, event);
    console.log(`📡 MockRelayer: Simulated Stacks stage transition event ${eventId}`);
    console.log(`   Property ID: ${propertyId}`);
    console.log(`   New Stage: ${newStage}`);
    return eventId;
  }

  /**
   * Simulate Stacks acknowledgment back to EVM (message type 3)
   * This simulates what happens after Stacks receives and processes a stage change
   */
  async simulateStacksStageAcknowledgment(
    propertyId: number,
    acknowledgedStage: number,
    stacksTxHash: string
  ): Promise<string> {
    const eventId = ethers.keccak256(
      ethers.toUtf8Bytes(`stage-ack-${propertyId}-${acknowledgedStage}-${Date.now()}`)
    );

    const event: StacksEvent = {
      id: eventId,
      eventType: 'stage-transition' as any, // Use same type but different handling
      user: 'stacks', // Acknowledgment comes from Stacks
      amount: acknowledgedStage.toString(),
      stacksTxHash,
      timestamp: Date.now(),
      processed: false
    };

    this.stacksEvents.set(eventId, event);
    console.log(`📡 MockRelayer: Simulated Stacks stage acknowledgment ${eventId}`);
    console.log(`   Property ID: ${propertyId}`);
    console.log(`   Acknowledged Stage: ${acknowledgedStage}`);
    return eventId;
  }

  /**
   * Get a Stacks event by ID
   */
  getStacksEvent(eventId: string): StacksEvent | undefined {
    return this.stacksEvents.get(eventId);
  }

  /**
   * Get all unprocessed events
   */
  getUnprocessedEvents(): StacksEvent[] {
    return Array.from(this.stacksEvents.values()).filter(event => !event.processed);
  }

  /**
   * Get event count
   */
  getEventCount(): number {
    return this.stacksEvents.size;
  }

  /**
   * Process a cross-chain message (simulate relayer monitoring and processing)
   * This is the main function that simulates what a real relayer would do
   */
  async processCrossChainMessage(
    eventId: string,
    evmCustodian: string,
    stacksAddress: string
  ): Promise<string> {
    const event = this.stacksEvents.get(eventId);
    if (!event) {
      throw new Error(`MockRelayer: Event ${eventId} not found`);
    }

    if (event.processed) {
      throw new Error(`MockRelayer: Event ${eventId} already processed`);
    }

    // Generate message ID (include event ID and tx hash for uniqueness)
    const messageId = ethers.keccak256(
      ethers.toUtf8Bytes(`message-${eventId}-${event.stacksTxHash}-${Date.now()}`)
    );

    // Check if message already processed
    if (this.processedMessages.has(messageId)) {
      throw new Error(`MockRelayer: Message ${messageId} already processed`);
    }

    // Determine message type
    let messageType: number;
    switch (event.eventType) {
      case 'deposit':
        messageType = 1;
        break;
      case 'stage-transition':
        // Message type 3 is for acknowledgments from Stacks to EVM
        // Only process if this is an acknowledgment (user: 'stacks')
        if (event.user === 'stacks') {
          messageType = 3; // Acknowledgment from Stacks
        } else {
          // This is a stage transition TO Stacks, not FROM Stacks
          // Don't send to EVM, just mark as processed
          event.processed = true;
          console.log(`✅ MockRelayer: Stage transition to Stacks processed (not sent to EVM)`);
          return eventId; // Return eventId as messageId for consistency
        }
        break;
      default:
        throw new Error(`MockRelayer: Unknown event type ${event.eventType}`);
    }

    // Generate mock proof (in real scenario, this would be a merkle proof)
    const proof = ethers.keccak256(ethers.toUtf8Bytes(`proof-${eventId}`));

    console.log(`🔄 MockRelayer: Processing cross-chain message ${messageId}`);
    console.log(`   Event Type: ${event.eventType}`);
    console.log(`   Stacks Address: ${stacksAddress}`);
    console.log(`   EVM Custodian: ${evmCustodian}`);
    console.log(`   Amount: ${event.amount}`);
    
    if (event.eventType === 'deposit') {
      console.log(`   → Will mint OFTUSDC to custodian address`);
    }

    try {
      // Call the EVM contract to process the message
      const tx = await this.stacksManager.connect(this.relayerSigner).processCrossChainMessage(
        messageId,
        messageType,
        evmCustodian,
        stacksAddress,
        event.amount,
        event.stacksTxHash,
        proof
      );

      await tx.wait();

      // Mark event and message as processed
      event.processed = true;
      this.processedMessages.add(messageId);

      console.log(`✅ MockRelayer: Successfully processed message ${messageId}`);
      return messageId;

    } catch (error) {
      console.error(`❌ MockRelayer: Failed to process message ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a message has been processed
   */
  isMessageProcessed(messageId: string): boolean {
    return this.processedMessages.has(messageId);
  }

  /**
   * Check if a Stacks transaction hash has been used (for double spending protection testing)
   */
  async isStacksTxHashUsed(stacksTxHash: string): Promise<boolean> {
    return await this.stacksManager.isStacksTxHashUsed(stacksTxHash);
  }

  /**
   * Get all processed messages
   */
  getProcessedMessages(): string[] {
    return Array.from(this.processedMessages);
  }

  /**
   * Simulate relayer monitoring (batch processing)
   * In real scenario, relayer would continuously monitor Stacks blockchain
   */
  async simulateRelayerMonitoring(
    eventIds: string[],
    evmCustodian: string,
    stacksAddress: string
  ): Promise<string[]> {
    const processedMessageIds: string[] = [];

    console.log(`🔍 MockRelayer: Starting batch monitoring for ${eventIds.length} events`);

    for (const eventId of eventIds) {
      try {
        const messageId = await this.processCrossChainMessage(eventId, evmCustodian, stacksAddress);
        processedMessageIds.push(messageId);
      } catch (error) {
        console.warn(`⚠️ MockRelayer: Failed to process event ${eventId}:`, error);
      }
    }

    console.log(`✅ MockRelayer: Batch processing complete. ${processedMessageIds.length}/${eventIds.length} messages processed`);
    return processedMessageIds;
  }

  /**
   * Simulate relayer failure scenarios
   */
  async simulateRelayerFailure(eventId: string): Promise<void> {
    const event = this.stacksEvents.get(eventId);
    if (!event) {
      throw new Error(`MockRelayer: Event ${eventId} not found`);
    }

    // Simulate network failure or invalid proof
    console.log(`💥 MockRelayer: Simulating failure for event ${eventId}`);
    event.processed = false; // Reset to unprocessed state
  }

  /**
   * Get relayer statistics
   */
  getStats(): {
    totalEvents: number;
    processedEvents: number;
    unprocessedEvents: number;
    processedMessages: number;
  } {
    const totalEvents = this.stacksEvents.size;
    const processedEvents = Array.from(this.stacksEvents.values()).filter(e => e.processed).length;
    const unprocessedEvents = totalEvents - processedEvents;
    const processedMessages = this.processedMessages.size;

    return {
      totalEvents,
      processedEvents,
      unprocessedEvents,
      processedMessages
    };
  }

  /**
   * Simulate complete sBTC deposit flow
   * This is a convenience method that simulates the entire process:
   * 1. User deposits sBTC on Stacks
   * 2. Relayer detects and processes the deposit
   * 3. EVM mints OFTUSDC to custodian address
   */
  async simulateCompleteDepositFlow(
    stacksAddress: string,
    sbtcAmount: string,
    evmCustodian: string,
    stacksTxHash: string = ethers.keccak256(ethers.toUtf8Bytes(`stacks-tx-${Date.now()}`))
  ): Promise<{ eventId: string; messageId: string }> {
    console.log(`🚀 MockRelayer: Starting complete deposit flow simulation`);
    console.log(`   Stacks Address: ${stacksAddress}`);
    console.log(`   sBTC Amount: ${sbtcAmount}`);
    console.log(`   EVM Custodian: ${evmCustodian}`);
    console.log(`   Stacks Tx Hash: ${stacksTxHash}`);
    
    // Step 1: Simulate Stacks deposit event
    const eventId = await this.simulateStacksDepositEvent(
      stacksAddress,
      sbtcAmount,
      stacksTxHash
    );
    
    // Step 2: Process the cross-chain message
    const messageId = await this.processCrossChainMessage(
      eventId,
      evmCustodian,
      stacksAddress
    );
    
    console.log(`✅ MockRelayer: Complete deposit flow simulation finished`);
    console.log(`   Event ID: ${eventId}`);
    console.log(`   Message ID: ${messageId}`);
    console.log(`   → OFTUSDC should now be minted to ${evmCustodian}`);
    
    return { eventId, messageId };
  }

  /**
   * Simulate deposit with specific transaction hash (useful for double spending tests)
   */
  async simulateDepositWithTxHash(
    stacksAddress: string,
    sbtcAmount: string,
    evmCustodian: string,
    stacksTxHash: string
  ): Promise<{ eventId: string; messageId: string }> {
    console.log(`🔒 MockRelayer: Simulating deposit with specific tx hash for testing`);
    console.log(`   Stacks Tx Hash: ${stacksTxHash}`);
    
    return await this.simulateCompleteDepositFlow(
      stacksAddress,
      sbtcAmount,
      evmCustodian,
      stacksTxHash
    );
  }

  /**
   * Reset relayer state (for test cleanup)
   */
  reset(): void {
    this.stacksEvents.clear();
    this.processedMessages.clear();
    console.log(`🔄 MockRelayer: State reset`);
  }
}

/**
 * Factory function to create a MockRelayer instance
 */
export async function createMockRelayer(
  stacksManager: StacksCrossChainManager,
  relayerSigner: any
): Promise<MockRelayer> {
  const relayer = new MockRelayer(stacksManager, relayerSigner);
  console.log(`🚀 MockRelayer: Created for testing`);
  return relayer;
}
