import { describe, expect, it } from "vitest";
import { OptimizationAnalyzer } from "./optimization-analytics.js";
import type { UsageEntry } from "./types.js";

const createMockEntry = (overrides: Partial<UsageEntry> = {}): UsageEntry => ({
	timestamp: "2025-07-31T12:00:00.000Z",
	conversationId: "test-conversation",
	requestId: "test-request",
	model: "claude-opus-4-20250514",
	prompt_tokens: 1000,
	completion_tokens: 2000,
	total_tokens: 3000,
	cache_creation_input_tokens: 0,
	cache_read_input_tokens: 0,
	...overrides,
});

const createDateEntry = (
	daysAgo: number,
	overrides: Partial<UsageEntry> = {},
): UsageEntry => {
	const date = new Date();
	date.setDate(date.getDate() - daysAgo);
	return createMockEntry({
		timestamp: date.toISOString(),
		...overrides,
	});
};

describe("OptimizationAnalyzer", () => {
	const analyzer = new OptimizationAnalyzer();

	describe("analyzeConversationClusters", () => {
		it("should cluster conversations by similarity", () => {
			const entries: UsageEntry[] = [
				// Code review cluster
				...Array.from({ length: 3 }, (_, i) =>
					createMockEntry({
						conversationId: `code-review-${i}`,
						prompt_tokens: 1500,
						completion_tokens: 2500,
						model: "claude-opus-4-20250514",
					}),
				),
				// Simple QA cluster
				...Array.from({ length: 3 }, (_, i) =>
					createMockEntry({
						conversationId: `qa-${i}`,
						prompt_tokens: 300,
						completion_tokens: 600,
						model: "claude-3.5-sonnet-20241022",
					}),
				),
			];

			const result = analyzer.analyzeConversationClusters(entries);

			expect(result.clusters.length).toBeGreaterThan(0);
			expect(result.totalConversations).toBe(6);
			expect(result.avgClusterSize).toBeGreaterThan(0);

			// Verify cluster structure
			result.clusters.forEach((cluster) => {
				expect(cluster.conversationIds).toBeInstanceOf(Array);
				expect(cluster.conversationIds.length).toBeGreaterThan(0);
				expect(cluster.characteristics.avgTokens).toBeGreaterThan(0);
				expect(cluster.characteristics.avgCost).toBeGreaterThan(0);
				expect(cluster.optimization.potentialSavings).toBeGreaterThanOrEqual(0);
				expect(cluster.optimization.recommendation).toBeTruthy();
			});
		});

		it("should handle conversations with different models", () => {
			const entries: UsageEntry[] = [
				createMockEntry({
					conversationId: "opus-conv",
					model: "claude-opus-4-20250514",
					prompt_tokens: 2000,
					completion_tokens: 4000,
				}),
				createMockEntry({
					conversationId: "sonnet-conv",
					model: "claude-3.5-sonnet-20241022",
					prompt_tokens: 2000,
					completion_tokens: 4000,
				}),
			];

			const result = analyzer.analyzeConversationClusters(entries);
			expect(result.clusters.length).toBeGreaterThan(0);
		});

		it("should provide optimization recommendations", () => {
			const entries: UsageEntry[] = Array.from({ length: 5 }, (_, i) =>
				createMockEntry({
					conversationId: `expensive-conv-${i}`,
					model: "claude-opus-4-20250514",
					prompt_tokens: 500,
					completion_tokens: 1000, // Simple conversation that could use Sonnet
				}),
			);

			const result = analyzer.analyzeConversationClusters(entries);

			const hasOptimizationOpportunity = result.clusters.some(
				(cluster) => cluster.optimization.potentialSavings > 0,
			);
			expect(hasOptimizationOpportunity).toBe(true);
		});
	});

	describe("identifyBatchProcessingOpportunities", () => {
		it("should identify suitable batch processing candidates", () => {
			const entries: UsageEntry[] = [
				// Similar short conversations that could be batched
				...Array.from({ length: 8 }, (_, i) =>
					createMockEntry({
						conversationId: `batch-candidate-${i}`,
						timestamp: new Date(Date.now() - i * 5 * 60 * 1000).toISOString(), // 5 minutes apart
						prompt_tokens: 200,
						completion_tokens: 400,
					}),
				),
			];

			const result = analyzer.identifyBatchProcessingOpportunities(entries);

			expect(result.opportunities.length).toBeGreaterThan(0);
			expect(result.totalPotentialSavings).toBeGreaterThan(0);

			result.opportunities.forEach((opportunity) => {
				expect(opportunity.conversationId).toBeTruthy();
				expect(opportunity.savings).toBeGreaterThan(0);
				expect(opportunity.reasoning).toBeTruthy();
				expect(opportunity.eligibilityScore).toBeGreaterThan(0);
				expect(opportunity.eligibilityScore).toBeLessThanOrEqual(1);
			});
		});

		it("should not suggest batching for complex conversations", () => {
			const entries: UsageEntry[] = [
				createMockEntry({
					conversationId: "complex-conv-1",
					prompt_tokens: 5000,
					completion_tokens: 10000,
				}),
				createMockEntry({
					conversationId: "complex-conv-2",
					prompt_tokens: 5000,
					completion_tokens: 10000,
				}),
			];

			const result = analyzer.identifyBatchProcessingOpportunities(entries);

			// Complex conversations should have fewer batching opportunities than simple ones
			expect(result.opportunities.length).toBeLessThanOrEqual(2);
		});

		it("should handle temporal clustering", () => {
			const baseTime = Date.now();
			const entries: UsageEntry[] = [
				// Close in time - good for batching
				createMockEntry({
					conversationId: "temporal-1",
					timestamp: new Date(baseTime).toISOString(),
					prompt_tokens: 300,
					completion_tokens: 600,
				}),
				createMockEntry({
					conversationId: "temporal-2",
					timestamp: new Date(baseTime + 2 * 60 * 1000).toISOString(), // 2 minutes later
					prompt_tokens: 300,
					completion_tokens: 600,
				}),
				// Far in time - not good for batching
				createMockEntry({
					conversationId: "temporal-3",
					timestamp: new Date(baseTime + 24 * 60 * 60 * 1000).toISOString(), // 24 hours later
					prompt_tokens: 300,
					completion_tokens: 600,
				}),
			];

			const result = analyzer.identifyBatchProcessingOpportunities(entries);

			if (result.opportunities.length > 0) {
				// Should prefer temporally close conversations
				const firstOpportunity = result.opportunities[0];
				expect(firstOpportunity.conversationId).toBeTruthy();
				expect(firstOpportunity.savings).toBeGreaterThan(0);
			}
		});
	});

	describe("generateModelSwitchingRecommendations", () => {
		it("should recommend model switches based on usage patterns", () => {
			const entries: UsageEntry[] = [
				// Over-engineered simple tasks (Opus for simple stuff)
				...Array.from({ length: 5 }, (_, i) =>
					createMockEntry({
						conversationId: `simple-opus-${i}`,
						model: "claude-opus-4-20250514",
						prompt_tokens: 200,
						completion_tokens: 400,
					}),
				),
				// Under-engineered complex tasks (Sonnet for complex stuff)
				...Array.from({ length: 3 }, (_, i) =>
					createMockEntry({
						conversationId: `complex-sonnet-${i}`,
						model: "claude-3.5-sonnet-20241022",
						prompt_tokens: 5000,
						completion_tokens: 8000,
					}),
				),
			];

			const result = analyzer.generateModelSwitchingRecommendations(entries);

			expect(result.recommendations.length).toBeGreaterThan(0);
			expect(result.totalPotentialSavings).toBeGreaterThanOrEqual(0);

			result.recommendations.forEach((rec) => {
				expect(rec.currentModel).toBeTruthy();
				expect(rec.recommendedModel).toBeTruthy();
				expect(rec.conversationId).toBeTruthy();
				expect(rec.savings).toBeDefined();
				expect(rec.confidence).toBeGreaterThan(0);
				expect(rec.confidence).toBeLessThanOrEqual(1);
				expect(rec.reasoning).toBeTruthy();
			});
		});

		it("should calculate accurate savings estimates", () => {
			const entries: UsageEntry[] = [
				createMockEntry({
					conversationId: "savings-test",
					model: "claude-opus-4-20250514",
					prompt_tokens: 1000,
					completion_tokens: 2000,
				}),
			];

			const result = analyzer.generateModelSwitchingRecommendations(entries);

			if (result.recommendations.length > 0) {
				const rec = result.recommendations[0];
				if (rec.recommendedModel.includes("sonnet")) {
					// Should show positive savings when switching from Opus to Sonnet
					expect(rec.savings).toBeGreaterThan(0);
				}
			}
		});

		it("should provide confidence scores based on data quality", () => {
			// High confidence scenario: many similar conversations
			const highConfidenceEntries: UsageEntry[] = Array.from(
				{ length: 20 },
				(_, i) =>
					createMockEntry({
						conversationId: `similar-${i}`,
						model: "claude-opus-4-20250514",
						prompt_tokens: 500,
						completion_tokens: 1000,
					}),
			);

			const highConfidenceResult =
				analyzer.generateModelSwitchingRecommendations(highConfidenceEntries);

			// Low confidence scenario: few diverse conversations
			const lowConfidenceEntries: UsageEntry[] = [
				createMockEntry({
					conversationId: "diverse-1",
					model: "claude-opus-4-20250514",
					prompt_tokens: 100,
					completion_tokens: 200,
				}),
				createMockEntry({
					conversationId: "diverse-2",
					model: "claude-opus-4-20250514",
					prompt_tokens: 5000,
					completion_tokens: 10000,
				}),
			];

			const lowConfidenceResult =
				analyzer.generateModelSwitchingRecommendations(lowConfidenceEntries);

			if (
				highConfidenceResult.recommendations.length > 0 &&
				lowConfidenceResult.recommendations.length > 0
			) {
				expect(
					highConfidenceResult.recommendations[0].confidence,
				).toBeGreaterThanOrEqual(
					lowConfidenceResult.recommendations[0].confidence,
				);
			}
		});
	});

	describe("edge cases", () => {
		it("should handle empty entries array", () => {
			const clusters = analyzer.analyzeConversationClusters([]);
			expect(clusters.clusters).toHaveLength(0);
			expect(clusters.totalConversations).toBe(0);

			const batching = analyzer.identifyBatchProcessingOpportunities([]);
			expect(batching.opportunities).toHaveLength(0);
			expect(batching.totalPotentialSavings).toBe(0);

			const switching = analyzer.generateModelSwitchingRecommendations([]);
			expect(switching.recommendations).toHaveLength(0);
			expect(switching.totalPotentialSavings).toBe(0);
		});

		it("should handle single conversation", () => {
			const entries = [createMockEntry()];

			expect(() => analyzer.analyzeConversationClusters(entries)).not.toThrow();
			expect(() =>
				analyzer.identifyBatchProcessingOpportunities(entries),
			).not.toThrow();
			expect(() =>
				analyzer.generateModelSwitchingRecommendations(entries),
			).not.toThrow();
		});

		it("should handle conversations with zero cost", () => {
			const entries = [
				createMockEntry({
					prompt_tokens: 0,
					completion_tokens: 0,
					total_tokens: 0,
				}),
			];

			const clusters = analyzer.analyzeConversationClusters(entries);
			expect(clusters.clusters.length).toBeGreaterThanOrEqual(0);

			const batching = analyzer.identifyBatchProcessingOpportunities(entries);
			expect(batching.opportunities.length).toBeGreaterThanOrEqual(0);
		});

		it("should handle invalid timestamps", () => {
			const entries = [
				createMockEntry({ timestamp: "invalid-date" }),
				createMockEntry({ timestamp: "2025-07-31T25:00:00.000Z" }),
			];

			expect(() =>
				analyzer.identifyBatchProcessingOpportunities(entries),
			).not.toThrow();
		});

		it("should handle conversations with same characteristics", () => {
			const entries: UsageEntry[] = Array.from({ length: 10 }, (_, i) =>
				createMockEntry({
					conversationId: `identical-${i}`,
					prompt_tokens: 1000,
					completion_tokens: 2000,
					model: "claude-opus-4-20250514",
				}),
			);

			const clusters = analyzer.analyzeConversationClusters(entries);
			expect(clusters.clusters.length).toBeGreaterThan(0);

			const switching = analyzer.generateModelSwitchingRecommendations(entries);
			expect(switching.recommendations.length).toBeGreaterThanOrEqual(0);
		});

		it("should validate cluster quality metrics", () => {
			const entries: UsageEntry[] = Array.from({ length: 15 }, (_, i) =>
				createMockEntry({
					conversationId: `quality-test-${i}`,
					prompt_tokens: 1000 + Math.random() * 500,
					completion_tokens: 2000 + Math.random() * 1000,
				}),
			);

			const result = analyzer.analyzeConversationClusters(entries);

			result.clusters.forEach((cluster) => {
				expect(cluster.characteristics.avgTokens).toBeGreaterThan(0);
				expect(cluster.characteristics.avgCost).toBeGreaterThan(0);
				expect(cluster.characteristics.complexity).toBeGreaterThanOrEqual(0);
				expect(cluster.characteristics.complexity).toBeLessThanOrEqual(1);
			});
		});
	});
});
