/**
 * Vercel Serverless Function: Logs API
 * GET /api/logs - Get relayer logs with filtering and pagination
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { RelayerService } from '../src/RelayerService';
import { getConfig } from '../src/config/index.js';
import { LogLevel } from '../src/services/LogService';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const relayer = getRelayerService();
    
    // Parse query parameters
    const {
      level,
      category,
      limit,
      offset,
      since,
      stats
    } = req.query;

    // If stats=true, return statistics instead of logs
    if (stats === 'true') {
      const logStats = relayer.getLogStats();
      return res.status(200).json({
        success: true,
        data: logStats,
        timestamp: new Date().toISOString()
      });
    }

    // Get logs with filters
    const logs = relayer.getLogs({
      level: level as LogLevel | undefined,
      category: category as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      since: since ? parseInt(since as string) : undefined
    });

    // Get available categories for frontend filtering
    const categories = relayer.getLogCategories();

    return res.status(200).json({
      success: true,
      data: {
        logs,
        total: logs.length,
        categories,
        filters: {
          level: level || null,
          category: category || null,
          limit: limit ? parseInt(limit as string) : null,
          offset: offset ? parseInt(offset as string) : null,
          since: since ? parseInt(since as string) : null
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error getting logs:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to get logs',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
}

