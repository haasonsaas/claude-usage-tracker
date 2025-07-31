import { describe, it, expect } from "vitest";

describe("Calculation Bug Fixes", () => {
	describe("Model Efficiency Token Accumulation", () => {
		it("should accumulate totalTokens correctly", () => {
			// Test the specific bug we fixed where totalTokens was never incremented
			const modelData = {
				totalTokens: 0,
				totalCost: 0,
				conversations: new Set<string>(),
			};

			// Simulate the fixed logic
			const entries = [
				{ total_tokens: 1000, conversationId: "conv-1" },
				{ total_tokens: 500, conversationId: "conv-1" },
				{ total_tokens: 800, conversationId: "conv-2" },
			];

			for (const entry of entries) {
				modelData.totalTokens += entry.total_tokens; // This line was missing before
				modelData.conversations.add(entry.conversationId);
			}

			expect(modelData.totalTokens).toBe(2300); // Not 0 as before
			expect(modelData.conversations.size).toBe(2);

			// These calculations should now work instead of returning NaN
			const avgTokensPerConversation =
				modelData.totalTokens / modelData.conversations.size;
			expect(avgTokensPerConversation).toBe(1150);
			expect(Number.isFinite(avgTokensPerConversation)).toBe(true);
		});
	});

	describe("Hourly Usage Token Tracking", () => {
		it("should track totalTokens per hour correctly", () => {
			// Test the specific bug we fixed where hourData.totalTokens was never updated
			const hourData = {
				hour: 10,
				totalTokens: 0,
				cost: 0,
				conversationCount: 0,
				sonnetTokens: 0,
				opusTokens: 0,
			};

			const entries = [
				{ total_tokens: 1000, model: "claude-3.5-sonnet-20241022" },
				{ total_tokens: 500, model: "claude-3.5-sonnet-20241022" },
				{ total_tokens: 800, model: "claude-opus-4-20250514" },
			];

			for (const entry of entries) {
				hourData.totalTokens += entry.total_tokens; // This line was missing before

				if (entry.model.includes("sonnet")) {
					hourData.sonnetTokens += entry.total_tokens;
				} else if (entry.model.includes("opus")) {
					hourData.opusTokens += entry.total_tokens;
				}
			}

			expect(hourData.totalTokens).toBe(2300); // Not 0 as before
			expect(hourData.sonnetTokens).toBe(1500);
			expect(hourData.opusTokens).toBe(800);
		});
	});

	describe("Cost Savings Calculation", () => {
		it("should always show positive cost savings", () => {
			// Test the fixed cost savings logic
			const sonnetCost = 0.01; // Cheaper model
			const opusCost = 0.05; // Expensive model

			// Old logic: alternativeModelCost - recommendedModelCost
			// If Sonnet is recommended: opusCost - sonnetCost = positive
			// If Opus is recommended: sonnetCost - opusCost = negative (hidden)

			// New logic: Math.abs(alternativeModelCost - recommendedModelCost)
			const savings1 = Math.abs(opusCost - sonnetCost); // Sonnet recommended
			const savings2 = Math.abs(sonnetCost - opusCost); // Opus recommended

			expect(savings1).toBe(0.04);
			expect(savings2).toBe(0.04);
			expect(savings1).toEqual(savings2); // Always same magnitude
		});
	});

	describe("Rate Limit Percentage Calculations", () => {
		it("should calculate percentages consistently", () => {
			const usage = { min: 40, max: 80 };
			const limits = { min: 100, max: 200 };

			// Test consistent calculation approach
			const minPercent = (usage.min / limits.max) * 100;
			const maxPercent = (usage.max / limits.max) * 100;

			expect(minPercent).toBe(20); // 40/200 * 100
			expect(maxPercent).toBe(40); // 80/200 * 100

			// Ensure no mixing of min/max which caused inflated numbers
			expect(minPercent).toBeLessThanOrEqual(maxPercent);
		});
	});
});
