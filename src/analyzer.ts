import { endOfWeek, format, isWithinInterval, startOfWeek } from "date-fns";
import {
	BATCH_API_DISCOUNT,
	MODEL_PRICING,
	type PlanType,
	RATE_LIMITS,
	TOKENS_PER_HOUR_ESTIMATES,
} from "./config.js";
import type {
	DailyUsage,
	RateLimitInfo,
	UsageEntry,
	WeeklyUsage,
} from "./types.js";

export function calculateCost(entry: UsageEntry): number {
	if (entry.cost !== undefined) return entry.cost;
	if (entry.costUSD !== undefined) return entry.costUSD;

	const pricing = MODEL_PRICING[entry.model as keyof typeof MODEL_PRICING];
	if (!pricing) return 0;

	const inputCost = (entry.prompt_tokens / 1_000_000) * pricing.input;
	const outputCost = (entry.completion_tokens / 1_000_000) * pricing.output;
	const cacheCreationCost =
		((entry.cache_creation_input_tokens || 0) / 1_000_000) * pricing.input;
	const cacheReadCost =
		((entry.cache_read_input_tokens || 0) / 1_000_000) * pricing.cached;

	let totalCost = inputCost + outputCost + cacheCreationCost + cacheReadCost;

	// Apply batch API discount if applicable
	if (entry.isBatchAPI) {
		totalCost *= 1 - BATCH_API_DISCOUNT;
	}

	return totalCost;
}

export function aggregateDailyUsage(
	entries: UsageEntry[],
): Map<string, DailyUsage> {
	const dailyMap = new Map<string, DailyUsage>();

	for (const entry of entries) {
		const date = format(new Date(entry.timestamp), "yyyy-MM-dd");

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

		const daily = dailyMap.get(date);
		if (daily) {
			daily.totalTokens += entry.total_tokens;
			daily.promptTokens += entry.prompt_tokens;
			daily.completionTokens += entry.completion_tokens;
			daily.cacheCreationTokens += entry.cache_creation_input_tokens || 0;
			daily.cacheReadTokens += entry.cache_read_input_tokens || 0;
			daily.cost += calculateCost(entry);
			daily.models.add(entry.model);
		}
	}

	// Count unique conversations per day
	const conversationsByDay = new Map<string, Set<string>>();
	for (const entry of entries) {
		const date = format(new Date(entry.timestamp), "yyyy-MM-dd");
		if (!conversationsByDay.has(date)) {
			conversationsByDay.set(date, new Set());
		}
		conversationsByDay.get(date)?.add(entry.conversationId);
	}

	for (const [date, conversations] of conversationsByDay) {
		const daily = dailyMap.get(date);
		if (daily) {
			daily.conversationCount = conversations.size;
		}
	}

	return dailyMap;
}

export function calculateActualTokensPerHour(entries: UsageEntry[]): {
	sonnet4: number;
	opus4: number;
} {
	// Group entries by conversation and calculate session durations
	const conversations = new Map<
		string,
		{ entries: UsageEntry[]; startTime: Date; endTime: Date }
	>();

	for (const entry of entries) {
		if (!conversations.has(entry.conversationId)) {
			conversations.set(entry.conversationId, {
				entries: [],
				startTime: new Date(entry.timestamp),
				endTime: new Date(entry.timestamp),
			});
		}

		const conv = conversations.get(entry.conversationId);
		if (conv) {
			conv.entries.push(entry);
			const entryTime = new Date(entry.timestamp);
			if (entryTime < conv.startTime) conv.startTime = entryTime;
			if (entryTime > conv.endTime) conv.endTime = entryTime;
		}
	}

	let sonnet4TotalTokens = 0,
		sonnet4TotalHours = 0;
	let opus4TotalTokens = 0,
		opus4TotalHours = 0;

	for (const conv of conversations.values()) {
		const durationMs = conv.endTime.getTime() - conv.startTime.getTime();
		const durationHours = Math.max(durationMs / (1000 * 60 * 60), 0.1); // Minimum 6 minutes

		const sonnet4Tokens = conv.entries
			.filter((e) => e.model.includes("sonnet"))
			.reduce((sum, e) => sum + e.total_tokens, 0);
		const opus4Tokens = conv.entries
			.filter((e) => e.model.includes("opus"))
			.reduce((sum, e) => sum + e.total_tokens, 0);

		if (sonnet4Tokens > 0) {
			sonnet4TotalTokens += sonnet4Tokens;
			sonnet4TotalHours += durationHours;
		}
		if (opus4Tokens > 0) {
			opus4TotalTokens += opus4Tokens;
			opus4TotalHours += durationHours;
		}
	}

	return {
		sonnet4:
			sonnet4TotalHours > 0
				? sonnet4TotalTokens / sonnet4TotalHours
				: TOKENS_PER_HOUR_ESTIMATES.sonnet4.min,
		opus4:
			opus4TotalHours > 0
				? opus4TotalTokens / opus4TotalHours
				: TOKENS_PER_HOUR_ESTIMATES.opus4.min,
	};
}

export function getCurrentWeekUsage(entries: UsageEntry[]): WeeklyUsage {
	const now = new Date();
	const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
	const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

	const weekEntries = entries.filter((entry) =>
		isWithinInterval(new Date(entry.timestamp), {
			start: weekStart,
			end: weekEnd,
		}),
	);

	const conversationIds = new Set(weekEntries.map((e) => e.conversationId));
	const models = new Set(weekEntries.map((e) => e.model));

	const totalTokens = weekEntries.reduce((sum, e) => sum + e.total_tokens, 0);
	const promptTokens = weekEntries.reduce((sum, e) => sum + e.prompt_tokens, 0);
	const completionTokens = weekEntries.reduce(
		(sum, e) => sum + e.completion_tokens,
		0,
	);
	const cacheCreationTokens = weekEntries.reduce(
		(sum, e) => sum + (e.cache_creation_input_tokens || 0),
		0,
	);
	const cacheReadTokens = weekEntries.reduce(
		(sum, e) => sum + (e.cache_read_input_tokens || 0),
		0,
	);
	const cost = weekEntries.reduce((sum, e) => sum + calculateCost(e), 0);

	// Calculate actual tokens per hour from recent usage data (last 2 weeks)
	const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
	const recentEntries = entries.filter(
		(e) => new Date(e.timestamp) >= twoWeeksAgo,
	);
	const actualRates = calculateActualTokensPerHour(recentEntries);

	// Get token counts for current week
	const sonnet4Tokens = weekEntries
		.filter((e) => e.model.includes("sonnet"))
		.reduce((sum, e) => sum + e.total_tokens, 0);
	const opus4Tokens = weekEntries
		.filter((e) => e.model.includes("opus"))
		.reduce((sum, e) => sum + e.total_tokens, 0);

	return {
		startDate: format(weekStart, "yyyy-MM-dd"),
		endDate: format(weekEnd, "yyyy-MM-dd"),
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
				min: sonnet4Tokens / actualRates.sonnet4,
				max: sonnet4Tokens / actualRates.sonnet4,
			},
			opus4: {
				min: opus4Tokens / actualRates.opus4,
				max: opus4Tokens / actualRates.opus4,
			},
		},
	};
}

export interface HourlyUsage {
	hour: number;
	totalTokens: number;
	cost: number;
	conversationCount: number;
	sonnetTokens: number;
	opusTokens: number;
}

export interface ModelEfficiency {
	model: string;
	avgTokensPerConversation: number;
	avgCostPerConversation: number;
	totalConversations: number;
	totalCost: number;
	costPerToken: number;
}

export interface EfficiencyInsights {
	hourlyUsage: HourlyUsage[];
	peakHours: number[];
	modelEfficiency: ModelEfficiency[];
	costSavingsOpportunity: {
		potentialSavings: number;
		recommendation: string;
	};
}

export function analyzeHourlyUsage(entries: UsageEntry[]): HourlyUsage[] {
	const hourlyMap = new Map<number, HourlyUsage>();

	// Initialize all 24 hours
	for (let hour = 0; hour < 24; hour++) {
		hourlyMap.set(hour, {
			hour,
			totalTokens: 0,
			cost: 0,
			conversationCount: 0,
			sonnetTokens: 0,
			opusTokens: 0,
		});
	}

	const conversations = new Set<string>();

	for (const entry of entries) {
		const hour = new Date(entry.timestamp).getHours();
		const hourData = hourlyMap.get(hour);
		if (hourData) {
			hourData.cost += calculateCost(entry);

			if (entry.model.includes("sonnet")) {
				hourData.sonnetTokens += entry.total_tokens;
			} else if (entry.model.includes("opus")) {
				hourData.opusTokens += entry.total_tokens;
			}

			// Track unique conversations per hour
			const convKey = `${hour}-${entry.conversationId}`;
			if (!conversations.has(convKey)) {
				conversations.add(convKey);
				hourData.conversationCount++;
			}
		}
	}

	return Array.from(hourlyMap.values());
}

export function analyzeModelEfficiency(
	entries: UsageEntry[],
): ModelEfficiency[] {
	const modelMap = new Map<
		string,
		{
			totalTokens: number;
			totalCost: number;
			conversations: Set<string>;
		}
	>();

	for (const entry of entries) {
		if (!modelMap.has(entry.model)) {
			modelMap.set(entry.model, {
				totalTokens: 0,
				totalCost: 0,
				conversations: new Set(),
			});
		}

		const modelData = modelMap.get(entry.model);
		if (modelData) {
			modelData.totalCost += calculateCost(entry);
			modelData.conversations.add(entry.conversationId);
		}
	}

	return Array.from(modelMap.entries()).map(([model, data]) => ({
		model,
		avgTokensPerConversation: data.totalTokens / data.conversations.size,
		avgCostPerConversation: data.totalCost / data.conversations.size,
		totalConversations: data.conversations.size,
		totalCost: data.totalCost,
		costPerToken: data.totalCost / data.totalTokens,
	}));
}

export function getEfficiencyInsights(
	entries: UsageEntry[],
): EfficiencyInsights {
	const hourlyUsage = analyzeHourlyUsage(entries);
	const modelEfficiency = analyzeModelEfficiency(entries);

	// Find peak hours (top 3 highest usage hours)
	const peakHours = hourlyUsage
		.sort((a, b) => b.totalTokens - a.totalTokens)
		.slice(0, 3)
		.map((h) => h.hour)
		.sort((a, b) => a - b);

	// Calculate potential savings from smarter model usage
	const opusEfficiency = modelEfficiency.find((m) => m.model.includes("opus"));
	const sonnetEfficiency = modelEfficiency.find((m) =>
		m.model.includes("sonnet"),
	);

	let potentialSavings = 0;
	let recommendation = "Continue current usage patterns";

	if (opusEfficiency && sonnetEfficiency) {
		const costDifference =
			opusEfficiency.costPerToken - sonnetEfficiency.costPerToken;
		// Assume 30% of Opus conversations could use Sonnet
		const opusTokens = entries
			.filter((e) => e.model.includes("opus"))
			.reduce((sum, e) => sum + e.total_tokens, 0);
		potentialSavings = opusTokens * 0.3 * costDifference;

		if (potentialSavings > 100) {
			// $100+ potential savings
			recommendation = `Consider using Sonnet 4 for simpler tasks. Could save ~${potentialSavings.toFixed(0)}/month by switching 30% of Opus conversations to Sonnet.`;
		}
	}

	return {
		hourlyUsage,
		peakHours,
		modelEfficiency,
		costSavingsOpportunity: {
			potentialSavings,
			recommendation,
		},
	};
}

export function getRateLimitInfo(
	weeklyUsage: WeeklyUsage,
	plan: PlanType,
): RateLimitInfo {
	const limits = RATE_LIMITS[plan];

	return {
		plan,
		weeklyLimits: limits.weekly,
		currentUsage: weeklyUsage,
		percentUsed: {
			sonnet4: {
				min:
					(weeklyUsage.estimatedHours.sonnet4.min / limits.weekly.sonnet4.max) *
					100,
				max:
					(weeklyUsage.estimatedHours.sonnet4.max / limits.weekly.sonnet4.min) *
					100,
			},
			opus4: {
				min:
					(weeklyUsage.estimatedHours.opus4.min / limits.weekly.opus4.max) *
					100,
				max: (weekly.estimatedHours.opus4.max / limits.weekly.opus4.min) * 100,
			},
		},
	};
}

export function calculateBatchAPISavings(entries: UsageEntry[]): number {
	const nonBatchEntries = entries.filter((e) => !e.isBatchAPI);
	let totalSavings = 0;

	for (const entry of nonBatchEntries) {
		const regularCost = calculateCost(entry);
		const batchEntry = { ...entry, isBatchAPI: true };
		const batchCost = calculateCost(batchEntry);
		totalSavings += regularCost - batchCost;
	}

	return totalSavings;
}
