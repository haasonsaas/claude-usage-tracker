import { z } from "zod";

export const usageEntrySchema = z.object({
	timestamp: z.string(),
	conversationId: z.string(),
	instanceId: z.string().optional(),
	model: z.string(),
	requestId: z.string(),
	prompt_tokens: z.number(),
	completion_tokens: z.number(),
	total_tokens: z.number(),
	cache_creation_input_tokens: z.number().optional(),
	cache_read_input_tokens: z.number().optional(),
	cost: z.number().optional(),
	costUSD: z.number().optional(),
	isBatchAPI: z.boolean().optional(),
});

export type UsageEntry = z.infer<typeof usageEntrySchema>;

export interface DailyUsage {
	date: string;
	totalTokens: number;
	promptTokens: number;
	completionTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	cost: number;
	conversationCount: number;
	models: Set<string>;
}

export interface WeeklyUsage {
	startDate: string;
	endDate: string;
	totalTokens: number;
	promptTokens: number;
	completionTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	cost: number;
	conversationCount: number;
	models: Set<string>;
	estimatedHours: {
		sonnet4: { min: number; max: number };
		opus4: { min: number; max: number };
	};
}

export interface RateLimitInfo {
	plan: "Pro" | "$100 Max" | "$200 Max";
	weeklyLimits: {
		sonnet4: { min: number; max: number };
		opus4: { min: number; max: number };
	};
	currentUsage: WeeklyUsage;
	percentUsed: {
		sonnet4: { min: number; max: number };
		opus4: { min: number; max: number };
	};
}
