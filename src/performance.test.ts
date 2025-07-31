import { describe, expect, it } from "vitest";
import { ResearchAnalyzer } from "./research-analytics.js";
import { PredictiveAnalyzer } from "./predictive-analytics.js";
import { OptimizationAnalyzer } from "./optimization-analytics.js";
import { PatternAnalyzer } from "./pattern-analysis.js";
import type { UsageEntry } from "./types.js";

const createMockEntry = (overrides: Partial<UsageEntry> = {}): UsageEntry => ({
	timestamp: new Date().toISOString(),
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

describe("Performance Tests", () => {
	const researchAnalyzer = new ResearchAnalyzer();
	const predictiveAnalyzer = new PredictiveAnalyzer();
	const optimizationAnalyzer = new OptimizationAnalyzer();
	const patternAnalyzer = new PatternAnalyzer();

	describe("Large Dataset Performance", () => {
		it("should handle 10K entries efficiently", () => {
			// Generate 10K entries across 100 conversations
			const largeDataset: UsageEntry[] = Array.from({ length: 10000 }, (_, i) => {
				const conversationId = `conv-${Math.floor(i / 100)}`;
				const timestamp = new Date(Date.now() - (10000 - i) * 60000).toISOString(); // 1 minute apart
				
				return createMockEntry({
					conversationId,
					timestamp,
					model: i % 3 === 0 ? "claude-opus-4-20250514" : "claude-3.5-sonnet-20241022",
					prompt_tokens: 800 + Math.floor(Math.random() * 400),
					completion_tokens: 1500 + Math.floor(Math.random() * 1000),
					cache_read_input_tokens: i % 4 === 0 ? 200 + Math.floor(Math.random() * 100) : 0,
				});
			});

			const start = Date.now();

			// Test all analytics modules
			const research = researchAnalyzer.generateAdvancedInsights(largeDataset);
			const predictive = {
				budget: predictiveAnalyzer.predictBudgetBurn(largeDataset),
				anomalies: predictiveAnalyzer.detectUsageAnomalies(largeDataset),
				suggestions: predictiveAnalyzer.generateModelSuggestions(largeDataset),
			};
			const optimization = optimizationAnalyzer.generateOptimizationSummary(largeDataset);
			const patterns = {
				lengthPatterns: patternAnalyzer.analyzeConversationLengthPatterns(largeDataset),
				completion: patternAnalyzer.analyzeTimeToCompletion(largeDataset),
				switching: patternAnalyzer.analyzeTaskSwitchingPatterns(largeDataset),
				learning: patternAnalyzer.analyzeLearningCurve(largeDataset),
				usage: patternAnalyzer.identifyUsagePatterns(largeDataset),
			};

			const duration = Date.now() - start;

			// Should complete within 10 seconds for 10K entries
			expect(duration).toBeLessThan(10000);

			// Verify results are meaningful
			expect(research.conversationSuccess.length).toBeGreaterThan(0);
			expect(research.timeSeriesData.length).toBeGreaterThan(0);
			expect(predictive.budget.currentSpend).toBeGreaterThan(0);
			expect(optimization.totalPotentialSavings).toBeGreaterThan(0);
			expect(patterns.lengthPatterns.length).toBeGreaterThan(0);

			console.log(`✅ Processed 10K entries in ${duration}ms`);
		});

		it("should handle memory efficiently with large datasets", () => {
			const initialMemory = process.memoryUsage().heapUsed;

			// Create 50K entries
			const massiveDataset: UsageEntry[] = Array.from({ length: 50000 }, (_, i) =>
				createMockEntry({
					conversationId: `conv-${Math.floor(i / 500)}`, // 100 conversations
					timestamp: new Date(Date.now() - (50000 - i) * 30000).toISOString(),
				})
			);

			// Run analysis
			const result = researchAnalyzer.generateAdvancedInsights(massiveDataset);
			
			const finalMemory = process.memoryUsage().heapUsed;
			const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

			// Memory increase should be reasonable (< 500MB for 50K entries)
			expect(memoryIncrease).toBeLessThan(500);
			expect(result.conversationSuccess.length).toBeGreaterThan(0);

			console.log(`✅ Memory increase: ${memoryIncrease.toFixed(1)}MB for 50K entries`);
		});
	});

	describe("Edge Case Resilience", () => {
		it("should handle corrupted data gracefully", () => {
			const corruptedData: UsageEntry[] = [
				// Normal entry
				createMockEntry(),
				// Zero values
				createMockEntry({
					prompt_tokens: 0,
					completion_tokens: 0,
					total_tokens: 0,
				}),
				// Extreme values
				createMockEntry({
					prompt_tokens: 1000000,
					completion_tokens: 2000000,
					total_tokens: 3000000,
				}),
				// Negative values (shouldn't happen but test resilience)
				createMockEntry({
					prompt_tokens: -100,
					completion_tokens: -200,
					total_tokens: -300,
				}),
			];

			expect(() => {
				researchAnalyzer.generateAdvancedInsights(corruptedData);
				predictiveAnalyzer.predictBudgetBurn(corruptedData);
				optimizationAnalyzer.generateOptimizationSummary(corruptedData);
				patternAnalyzer.analyzeConversationLengthPatterns(corruptedData);
			}).not.toThrow();
		});

		it("should handle rapid timestamp changes", () => {
			const rapidEntries: UsageEntry[] = Array.from({ length: 1000 }, (_, i) =>
				createMockEntry({
					conversationId: "rapid-conv",
					timestamp: new Date(Date.now() + i).toISOString(), // 1ms apart
				})
			);

			const start = Date.now();
			const result = researchAnalyzer.generateAdvancedInsights(rapidEntries);
			const duration = Date.now() - start;

			expect(duration).toBeLessThan(2000); // Should complete quickly
			expect(result.conversationSuccess.length).toBeGreaterThan(0);
		});

		it("should handle very long conversations", () => {
			const longConversation: UsageEntry[] = Array.from({ length: 5000 }, (_, i) =>
				createMockEntry({
					conversationId: "ultra-long-conv",
					timestamp: new Date(Date.now() + i * 60000).toISOString(), // 1 minute apart
					prompt_tokens: 1000 + i,
					completion_tokens: 2000 + i * 2,
				})
			);

			expect(() => {
				const result = patternAnalyzer.analyzeConversationLengthPatterns(longConversation);
				expect(result.length).toBeGreaterThan(0);
			}).not.toThrow();
		});
	});

	describe("Scalability Tests", () => {
		it("should scale linearly with data size", () => {
			const sizes = [1000, 2000, 4000];
			const times: number[] = [];

			for (const size of sizes) {
				const dataset: UsageEntry[] = Array.from({ length: size }, (_, i) =>
					createMockEntry({
						conversationId: `conv-${Math.floor(i / 10)}`,
						timestamp: new Date(Date.now() - (size - i) * 60000).toISOString(),
					})
				);

				const start = Date.now();
				researchAnalyzer.generateAdvancedInsights(dataset);
				const duration = Date.now() - start;
				times.push(duration);
			}

			// Check that performance doesn't degrade exponentially
			// Allow some variance but expect roughly linear scaling
			const ratio1 = times[1] / times[0]; // 2x data
			const ratio2 = times[2] / times[1]; // 2x data again
			
			expect(ratio1).toBeLessThan(5); // Should not be 5x slower for 2x data
			expect(ratio2).toBeLessThan(5);

			console.log(`✅ Scaling ratios: ${ratio1.toFixed(2)}x, ${ratio2.toFixed(2)}x`);
		});

		it("should handle concurrent analysis efficiently", async () => {
			const dataset: UsageEntry[] = Array.from({ length: 5000 }, (_, i) =>
				createMockEntry({
					conversationId: `concurrent-conv-${Math.floor(i / 50)}`,
					timestamp: new Date(Date.now() - i * 60000).toISOString(),
				})
			);

			const start = Date.now();

			// Run multiple analyses concurrently
			const results = await Promise.all([
				Promise.resolve(researchAnalyzer.generateAdvancedInsights(dataset)),
				Promise.resolve(predictiveAnalyzer.predictBudgetBurn(dataset)),
				Promise.resolve(optimizationAnalyzer.generateOptimizationSummary(dataset)),
				Promise.resolve(patternAnalyzer.identifyUsagePatterns(dataset)),
			]);

			const duration = Date.now() - start;

			expect(duration).toBeLessThan(8000); // Should complete within 8 seconds
			expect(results).toHaveLength(4);
			expect(results[0].conversationSuccess.length).toBeGreaterThan(0);

			console.log(`✅ Concurrent analysis completed in ${duration}ms`);
		});
	});

	describe("Real-world Simulation", () => {
		it("should handle realistic usage patterns", () => {
			// Simulate 6 months of real usage data
			const sixMonthsData: UsageEntry[] = [];
			const startDate = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);

			// Simulate different projects and conversation patterns
			const projects = ["evalops", "homelab", "blog", "platform", "dotfiles"];
			const models = ["claude-opus-4-20250514", "claude-3.5-sonnet-20241022"];

			for (let day = 0; day < 180; day++) {
				const currentDate = new Date(startDate.getTime() + day * 24 * 60 * 60 * 1000);
				
				// Simulate 3-10 conversations per day with varying intensity
				const conversationsToday = 3 + Math.floor(Math.random() * 8);
				
				for (let conv = 0; conv < conversationsToday; conv++) {
					const project = projects[Math.floor(Math.random() * projects.length)];
					const model = models[Math.floor(Math.random() * models.length)];
					const messageCount = 2 + Math.floor(Math.random() * 30); // 2-32 messages per conversation
					
					for (let msg = 0; msg < messageCount; msg++) {
						const timestamp = new Date(
							currentDate.getTime() + 
							conv * 60 * 60 * 1000 + // Hour spacing between conversations
							msg * 5 * 60 * 1000 // 5 minutes between messages
						);

						sixMonthsData.push(createMockEntry({
							conversationId: `${project}-${day}-${conv}`,
							timestamp: timestamp.toISOString(),
							model,
							prompt_tokens: model.includes("opus") ? 
								1000 + Math.floor(Math.random() * 2000) : 
								800 + Math.floor(Math.random() * 1200),
							completion_tokens: model.includes("opus") ? 
								2000 + Math.floor(Math.random() * 3000) : 
								1500 + Math.floor(Math.random() * 2500),
							cache_read_input_tokens: Math.random() > 0.7 ? 
								100 + Math.floor(Math.random() * 300) : 0,
						}));
					}
				}
			}

			console.log(`Generated ${sixMonthsData.length} entries simulating 6 months of usage`);

			const start = Date.now();
			const insights = researchAnalyzer.generateAdvancedInsights(sixMonthsData);
			const duration = Date.now() - start;

			// Validate realistic results
			expect(insights.conversationSuccess.length).toBeGreaterThan(100);
			expect(insights.projectAnalysis.length).toBeGreaterThan(2);
			expect(insights.timeSeriesData.length).toBeGreaterThan(150); // ~6 months of days
			expect(insights.cacheOptimization.cacheHitRate).toBeGreaterThan(0);
			expect(insights.correlationInsights.length).toBeGreaterThan(0);

			// Performance should be reasonable
			expect(duration).toBeLessThan(15000); // 15 seconds for 6 months of data

			console.log(`✅ Realistic simulation completed in ${duration}ms`);
			console.log(`   - ${insights.conversationSuccess.length} conversations analyzed`);
			console.log(`   - ${insights.projectAnalysis.length} projects identified`);
			console.log(`   - ${insights.timeSeriesData.length} days of time series data`);
			console.log(`   - ${(insights.cacheOptimization.cacheHitRate * 100).toFixed(1)}% cache hit rate`);
		});
	});
});
