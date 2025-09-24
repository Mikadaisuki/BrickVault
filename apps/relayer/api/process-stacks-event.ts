/**
 * Vercel Serverless Function: Process Stacks Event
 * POST /api/process-stacks-event - Manually process a Stacks event
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { RelayerService } from '../src/RelayerService';
import { getConfig } from '../src/config/index.js';

// Global relayer service instance
let relayerService: RelayerService | null = null;

/**
 * Initialize relayer service with configuration
 */
function getRelayerService(): RelayerService {
  if (!relayerService) {
    const config = getConfig();
    relayerService = new RelayerService(config);
  }
  return relayerService;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate request body
    if (!req.body || !req.body.event) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: event',
        timestamp: new Date().toISOString()
      });
    }

    const relayer = getRelayerService();
    
    // Check if relayer is running
    const status = relayer.getStatus();
    if (!status.isRunning) {
      return res.status(503).json({
        success: false,
        error: 'Relayer service is not running',
        timestamp: new Date().toISOString()
      });
    }

    // Process the Stacks event
    const result = await relayer.processStacksEvent(req.body.event);

    return res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error processing Stacks event:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to process Stacks event',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
}
