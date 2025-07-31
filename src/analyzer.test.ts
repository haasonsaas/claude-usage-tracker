import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { calculateCost, aggregateDailyUsage, analyzeModelEfficiency, analyzeHourlyUsage } from './analyzer.js';
import type { UsageEntry } from './types.js';
import { setupTestConfig } from './test-utils.js';

describe('Analyzer', () => {
  let cleanup: () => void;

  beforeEach(() => {
    cleanup = setupTestConfig();
  });

  afterEach(() => {
    cleanup();
  });

  const mockEntries: UsageEntry[] = [
    {
      timestamp: '2024-01-15T10:00:00Z',
      model: 'claude-3.5-sonnet-20241022',
      conversationId: 'conv-1',
      requestId: 'req-1',
      prompt_tokens: 1000,
      completion_tokens: 500,
      total_tokens: 1500,
    },
    {
      timestamp: '2024-01-15T11:00:00Z',
      model: 'claude-opus-4-20250514',
      conversationId: 'conv-2', 
      requestId: 'req-2',
      prompt_tokens: 800,
      completion_tokens: 400,
      total_tokens: 1200,
    },
    {
      timestamp: '2024-01-15T10:30:00Z', 
      model: 'claude-3.5-sonnet-20241022',
      conversationId: 'conv-1',
      requestId: 'req-3',
      prompt_tokens: 1000,  // Same as first entry
      completion_tokens: 500,  // Same as first entry
      total_tokens: 1500,  // Same as first entry
      isBatchAPI: true,
    },
  ];

  describe('calculateCost', () => {
    it('should calculate cost correctly for regular API', () => {
      const cost = calculateCost(mockEntries[0]);
      // Sonnet: input 3.0, output 15.0 per million tokens
      // 1000 input + 500 output = (1000/1M * 3.0) + (500/1M * 15.0) = 0.003 + 0.0075 = 0.0105
      expect(cost).toBeCloseTo(0.0105, 4);
    });

    it('should apply batch API discount', () => {
      const regularCost = calculateCost(mockEntries[0]);
      const batchCost = calculateCost(mockEntries[2]);
      
      expect(batchCost).toBeLessThan(regularCost);
      expect(batchCost).toBeCloseTo(regularCost * 0.5, 4); // 50% discount
    });
  });

  describe('analyzeModelEfficiency', () => {
    it('should calculate efficiency metrics correctly', () => {
      const efficiency = analyzeModelEfficiency(mockEntries);
      
      expect(efficiency).toHaveLength(2); // Two models
      
      const sonnetEfficiency = efficiency.find(e => e.model === 'claude-3.5-sonnet-20241022');
      const opusEfficiency = efficiency.find(e => e.model === 'claude-opus-4-20250514');
      
      expect(sonnetEfficiency).toBeDefined();
      expect(opusEfficiency).toBeDefined();
      
      // Check that totalTokens are properly calculated (not NaN)
      expect(sonnetEfficiency!.avgTokensPerConversation).toBeGreaterThan(0);
      expect(sonnetEfficiency!.costPerToken).toBeGreaterThan(0);
      expect(Number.isFinite(sonnetEfficiency!.avgTokensPerConversation)).toBe(true);
      expect(Number.isFinite(sonnetEfficiency!.costPerToken)).toBe(true);
    });
  });

  describe('analyzeHourlyUsage', () => {
    it('should track hourly usage correctly', () => {
      const hourlyUsage = analyzeHourlyUsage(mockEntries);
      
      expect(hourlyUsage).toHaveLength(24); // All 24 hours
      
      const hour10 = hourlyUsage.find(h => h.hour === 10);
      const hour11 = hourlyUsage.find(h => h.hour === 11);
      
      expect(hour10).toBeDefined();
      expect(hour11).toBeDefined();
      
      // Hour 10 has 2 entries (regular + batch), hour 11 has 1
      expect(hour10!.totalTokens).toBe(1500 + 1500); // Both sonnet entries (same tokens now)
      expect(hour11!.totalTokens).toBe(1200); // Opus entry
      expect(hour10!.conversationCount).toBe(1); // Same conversation
      expect(hour11!.conversationCount).toBe(1); // Different conversation
    });
  });

  describe('aggregateDailyUsage', () => {
    it('should aggregate daily usage correctly', () => {
      const dailyUsage = aggregateDailyUsage(mockEntries);
      
      expect(dailyUsage.size).toBe(1); // All entries on same day
      
      const day = dailyUsage.get('2024-01-15');
      expect(day).toBeDefined();
      expect(day!.totalTokens).toBe(4200); // Sum of all tokens (1500+1200+1500)
      expect(day!.conversationCount).toBe(2); // Two unique conversations
    });
  });
});
