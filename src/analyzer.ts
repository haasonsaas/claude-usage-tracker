import { startOfWeek, endOfWeek, isWithinInterval, format } from 'date-fns';
import type { UsageEntry, DailyUsage, WeeklyUsage, RateLimitInfo } from './types.js';
import { MODEL_PRICING, RATE_LIMITS, TOKENS_PER_HOUR_ESTIMATES, type PlanType } from './config.js';

export function calculateCost(entry: UsageEntry): number {
  if (entry.cost !== undefined) return entry.cost;
  if (entry.costUSD !== undefined) return entry.costUSD;
  
  const pricing = MODEL_PRICING[entry.model as keyof typeof MODEL_PRICING];
  if (!pricing) return 0;
  
  const inputCost = (entry.prompt_tokens / 1_000_000) * pricing.input;
  const outputCost = (entry.completion_tokens / 1_000_000) * pricing.output;
  const cacheCreationCost = ((entry.cache_creation_input_tokens || 0) / 1_000_000) * pricing.input;
  const cacheReadCost = ((entry.cache_read_input_tokens || 0) / 1_000_000) * pricing.cached;
  
  return inputCost + outputCost + cacheCreationCost + cacheReadCost;
}

export function aggregateDailyUsage(entries: UsageEntry[]): Map<string, DailyUsage> {
  const dailyMap = new Map<string, DailyUsage>();
  
  for (const entry of entries) {
    const date = format(new Date(entry.timestamp), 'yyyy-MM-dd');
    
    if (!dailyMap.has(date)) {
      dailyMap.set(date, {
        date,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        cost: 0,
        conversationCount: 0,
        models: new Set(),
      });
    }
    
    const daily = dailyMap.get(date)!;
    daily.totalTokens += entry.total_tokens;
    daily.promptTokens += entry.prompt_tokens;
    daily.completionTokens += entry.completion_tokens;
    daily.cacheCreationTokens += entry.cache_creation_input_tokens || 0;
    daily.cacheReadTokens += entry.cache_read_input_tokens || 0;
    daily.cost += calculateCost(entry);
    daily.models.add(entry.model);
  }
  
  // Count unique conversations per day
  const conversationsByDay = new Map<string, Set<string>>();
  for (const entry of entries) {
    const date = format(new Date(entry.timestamp), 'yyyy-MM-dd');
    if (!conversationsByDay.has(date)) {
      conversationsByDay.set(date, new Set());
    }
    conversationsByDay.get(date)!.add(entry.conversationId);
  }
  
  for (const [date, conversations] of conversationsByDay) {
    const daily = dailyMap.get(date)!;
    daily.conversationCount = conversations.size;
  }
  
  return dailyMap;
}

export function getCurrentWeekUsage(entries: UsageEntry[]): WeeklyUsage {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  
  const weekEntries = entries.filter(entry => 
    isWithinInterval(new Date(entry.timestamp), { start: weekStart, end: weekEnd })
  );
  
  const conversationIds = new Set(weekEntries.map(e => e.conversationId));
  const models = new Set(weekEntries.map(e => e.model));
  
  const totalTokens = weekEntries.reduce((sum, e) => sum + e.total_tokens, 0);
  const promptTokens = weekEntries.reduce((sum, e) => sum + e.prompt_tokens, 0);
  const completionTokens = weekEntries.reduce((sum, e) => sum + e.completion_tokens, 0);
  const cacheCreationTokens = weekEntries.reduce((sum, e) => sum + (e.cache_creation_input_tokens || 0), 0);
  const cacheReadTokens = weekEntries.reduce((sum, e) => sum + (e.cache_read_input_tokens || 0), 0);
  const cost = weekEntries.reduce((sum, e) => sum + calculateCost(e), 0);
  
  // Estimate hours based on token usage
  const sonnet4Tokens = weekEntries
    .filter(e => e.model.includes('sonnet'))
    .reduce((sum, e) => sum + e.total_tokens, 0);
  const opus4Tokens = weekEntries
    .filter(e => e.model.includes('opus'))
    .reduce((sum, e) => sum + e.total_tokens, 0);
  
  return {
    startDate: format(weekStart, 'yyyy-MM-dd'),
    endDate: format(weekEnd, 'yyyy-MM-dd'),
    totalTokens,
    promptTokens,
    completionTokens,
    cacheCreationTokens,
    cacheReadTokens,
    cost,
    conversationCount: conversationIds.size,
    models,
    estimatedHours: {
      sonnet4: {
        min: sonnet4Tokens / TOKENS_PER_HOUR_ESTIMATES.sonnet4.max,
        max: sonnet4Tokens / TOKENS_PER_HOUR_ESTIMATES.sonnet4.min,
      },
      opus4: {
        min: opus4Tokens / TOKENS_PER_HOUR_ESTIMATES.opus4.max,
        max: opus4Tokens / TOKENS_PER_HOUR_ESTIMATES.opus4.min,
      },
    },
  };
}

export function getRateLimitInfo(weeklyUsage: WeeklyUsage, plan: PlanType): RateLimitInfo {
  const limits = RATE_LIMITS[plan];
  
  return {
    plan,
    weeklyLimits: limits.weekly,
    currentUsage: weeklyUsage,
    percentUsed: {
      sonnet4: {
        min: (weeklyUsage.estimatedHours.sonnet4.min / limits.weekly.sonnet4.max) * 100,
        max: (weeklyUsage.estimatedHours.sonnet4.max / limits.weekly.sonnet4.min) * 100,
      },
      opus4: {
        min: (weeklyUsage.estimatedHours.opus4.min / limits.weekly.opus4.max) * 100,
        max: (weeklyUsage.estimatedHours.opus4.max / limits.weekly.opus4.min) * 100,
      },
    },
  };
}