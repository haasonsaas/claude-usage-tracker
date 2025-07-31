import {
	clearConfigCache,
	setTestConfig,
	clearTestConfig,
} from "./config-loader.js";

// Mock configuration for tests
export const TEST_CONFIG = {
	models: {
		"claude-3.5-sonnet-20241022": {
			name: "Claude 3.5 Sonnet",
			input: 3.0,
			output: 15.0,
			cached: 0.375,
		},
		"claude-opus-4-20250514": {
			name: "Claude Opus 4",
			input: 15.0,
			output: 75.0,
			cached: 1.875,
		},
		"claude-3-haiku-20240307": {
			name: "Claude 3 Haiku",
			input: 0.25,
			output: 1.25,
			cached: 0.03125,
		},
	},
	rate_limits: {
		Pro: {
			price: 20,
			weekly: {
				sonnet4: { min: 40, max: 80 },
				opus4: { min: 4, max: 8 },
			},
		},
	},
	token_estimates: {
		sonnet4: { min: 50000, max: 100000 },
		opus4: { min: 40000, max: 80000 },
	},
	batch_api_discount: 0.5,
	data_paths: ["~/.config/claude/projects"],
	recommendations: {
		code_generation: { model: "claude-3.5-sonnet-20241022", confidence: 0.8 },
		debugging: { model: "claude-opus-4-20250514", confidence: 0.7 },
		simple_query: { model: "claude-3.5-sonnet-20241022", confidence: 0.95 },
		documentation: { model: "claude-3.5-sonnet-20241022", confidence: 0.9 },
	},
};

export function setupTestConfig() {
	// Clear any cached config
	clearConfigCache();
	clearTestConfig();

	// Set up test environment
	const originalEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = "test";

	// Set the test configuration
	setTestConfig(TEST_CONFIG);

	return () => {
		process.env.NODE_ENV = originalEnv;
		clearConfigCache();
		clearTestConfig();
	};
}

export function createMockUsageEntries() {
	return [
		{
			id: "test-1",
			timestamp: new Date("2024-01-15T10:00:00Z").toISOString(),
			model: "claude-3.5-sonnet-20241022",
			conversationId: "conv-1",
			input_tokens: 1000,
			output_tokens: 500,
			total_tokens: 1500,
			isBatchAPI: false,
		},
		{
			id: "test-2",
			timestamp: new Date("2024-01-15T11:00:00Z").toISOString(),
			model: "claude-opus-4-20250514",
			conversationId: "conv-2",
			input_tokens: 800,
			output_tokens: 400,
			total_tokens: 1200,
			isBatchAPI: false,
		},
	];
}
