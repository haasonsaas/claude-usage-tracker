import { homedir } from "node:os";
import { join } from "node:path";

export const CLAUDE_DATA_PATHS = [
	join(homedir(), ".config", "claude", "projects"),
	join(homedir(), ".claude", "projects"),
];

export const MODEL_PRICING = {
	"claude-3-opus-20240229": { input: 15.0, output: 75.0, cached: 1.875 },
	"claude-3-sonnet-20240229": { input: 3.0, output: 15.0, cached: 0.375 },
	"claude-3.5-sonnet-20241022": { input: 3.0, output: 15.0, cached: 0.375 },
	"claude-3-haiku-20240307": { input: 0.25, output: 1.25, cached: 0.03125 },
	"claude-3.5-haiku-20241022": { input: 0.8, output: 4.0, cached: 0.1 },
	"claude-sonnet-4-20250514": { input: 3.0, output: 15.0, cached: 0.375 },
	"claude-opus-4-20250514": { input: 15.0, output: 75.0, cached: 1.875 },
} as const;

// Batch API pricing (50% discount on all models)
export const BATCH_API_DISCOUNT = 0.5;

export const RATE_LIMITS = {
	Pro: {
		price: 20,
		weekly: {
			sonnet4: { min: 40, max: 80 },
			opus4: { min: 4, max: 8 },
		},
	},
	"$100 Max": {
		price: 100,
		weekly: {
			sonnet4: { min: 140, max: 280 },
			opus4: { min: 15, max: 35 },
		},
	},
	"$200 Max": {
		price: 200,
		weekly: {
			sonnet4: { min: 240, max: 480 },
			opus4: { min: 24, max: 40 },
		},
	},
} as const;

export type PlanType = keyof typeof RATE_LIMITS;

// Average tokens per hour estimates (based on typical usage patterns)
export const TOKENS_PER_HOUR_ESTIMATES = {
	sonnet4: { min: 50000, max: 100000 },
	opus4: { min: 40000, max: 80000 },
};
