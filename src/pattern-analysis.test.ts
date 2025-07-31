import { describe, expect, it } from "vitest";
import { PatternAnalyzer } from "./pattern-analysis.js";
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

const createDateEntry = (daysAgo: number, overrides: Partial<UsageEntry> = {}): UsageEntry => {
	const date = new Date();
	date.setDate(date.getDate() - daysAgo);
	return createMockEntry({
		timestamp: date.toISOString(),
		...overrides,
	});
};

const createTimeEntry = (hoursAgo: number, overrides: Partial<UsageEntry> = {}): UsageEntry => {
	const date = new Date();
	date.setHours(date.getHours() - hoursAgo);
	return createMockEntry({
		timestamp: date.toISOString(),
		...overrides,
	});
};

describe("PatternAnalyzer", () => {
	const analyzer = new PatternAnalyzer();

	describe("analyzeConversationLengthPatterns", () => {
		it("should classify conversation types correctly", () => {
			const entries: UsageEntry[] = [
				// Quick questions (1-2 exchanges)
				createMockEntry({
					conversationId: "quick-1",
					prompt_tokens: 100,
					completion_tokens: 200,
				}),
				createMockEntry({
					conversationId: "quick-1",
					prompt_tokens: 150,
					completion_tokens: 300,
				}),
				
				// Detailed discussions (3-8 exchanges)
				...Array.from({ length: 5 }, (_, i) =>
					createMockEntry({
						conversationId: "detailed-1",
						prompt_tokens: 800,
						completion_tokens: 1200,
					})
				),
				
				// Deep dives (9+ exchanges)
				...Array.from({ length: 12 }, (_, i) =>
					createMockEntry({
						conversationId: "deep-1",
						prompt_tokens: 1500,
						completion_tokens: 2500,
					})
				),
			];

			const result = analyzer.analyzeConversationLengthPatterns(entries);

			expect(result.conversationTypes).toBeDefined();
			expect(result.conversationTypes.quickQuestions.count).toBe(1);
			expect(result.conversationTypes.detailedDiscussions.count).toBe(1);
			expect(result.conversationTypes.deepDives.count).toBe(1);

			expect(result.avgLengthByType.quickQuestions).toBe(2);
			expect(result.avgLengthByType.detailedDiscussions).toBe(5);
			expect(result.avgLengthByType.deepDives).toBe(12);

			expect(result.recommendations).toBeInstanceOf(Array);
			expect(result.recommendations.length).toBeGreaterThan(0);
		});

		it("should calculate accurate cost distributions", () => {
			const entries: UsageEntry[] = [
				// Expensive quick question
				createMockEntry({
					conversationId: "expensive-quick",
					model: "claude-opus-4-20250514",
					prompt_tokens: 500,
					completion_tokens: 1000,
				}),
				
				// Cheap detailed discussion
				...Array.from({ length: 6 }, (_, i) =>
					createMockEntry({
						conversationId: "cheap-detailed",
						model: "claude-3.5-sonnet-20241022",
						prompt_tokens: 300,
						completion_tokens: 600,
					})
				),
			];

			const result = analyzer.analyzeConversationLengthPatterns(entries);

			expect(result.costDistribution.quickQuestions.avgCost).toBeGreaterThan(0);
			expect(result.costDistribution.detailedDiscussions.avgCost).toBeGreaterThan(0);
			expect(result.costDistribution.quickQuestions.totalCost).toBeGreaterThan(0);
			expect(result.costDistribution.detailedDiscussions.totalCost).toBeGreaterThan(0);
		});

		it("should provide efficiency insights", () => {
			const entries: UsageEntry[] = [
				// Efficient conversation
				createMockEntry({
					conversationId: "efficient",
					prompt_tokens: 1000,
					completion_tokens: 3000, // High completion ratio
				}),
				
				// Inefficient conversation  
				createMockEntry({
					conversationId: "inefficient",
					prompt_tokens: 3000,
					completion_tokens: 500, // Low completion ratio
				}),
			];

			const result = analyzer.analyzeConversationLengthPatterns(entries);

			expect(result.efficiencyInsights.mostEfficientType).toBeTruthy();
			expect(result.efficiencyInsights.leastEfficientType).toBeTruthy();
			expect(result.efficiencyInsights.avgTokensPerExchange).toBeGreaterThan(0);
		});
	});

	describe("identifyLearningCurves", () => {
		it("should track learning progression over time", () => {
			const entries: UsageEntry[] = [];
			
			// Simulate learning curve: start with many questions, improve over time
			for (let week = 0; week < 12; week++) {
				const questionsThisWeek = Math.max(1, 10 - week); // Decreasing questions
				const complexityThisWeek = 0.3 + (week * 0.05); // Increasing complexity
				
				for (let q = 0; q < questionsThisWeek; q++) {
					entries.push(createDateEntry(week * 7 + q, {
						conversationId: `week-${week}-q-${q}`,
						prompt_tokens: Math.floor(500 + complexityThisWeek * 2000),
						completion_tokens: Math.floor(1000 + complexityThisWeek * 3000),
					}));
				}
			}

			const result = analyzer.identifyLearningCurves(entries);

			expect(result.periods).toBeInstanceOf(Array);
			expect(result.periods.length).toBeGreaterThan(0);
			expect(result.overallTrend).toMatch(/improving|stable|declining/);
			expect(result.insights).toBeInstanceOf(Array);

			result.periods.forEach(period => {
				expect(period.startDate).toBeTruthy();
				expect(period.endDate).toBeTruthy();
				expect(period.metrics.avgQuestionsPerDay).toBeGreaterThanOrEqual(0);
				expect(period.metrics.avgComplexityScore).toBeGreaterThanOrEqual(0);
				expect(period.metrics.avgComplexityScore).toBeLessThanOrEqual(1);
				expect(period.characteristics).toBeInstanceOf(Array);
			});
		});

		it("should detect plateau periods", () => {
			const entries: UsageEntry[] = Array.from({ length: 30 }, (_, i) =>
				createDateEntry(i, {
					conversationId: `plateau-${i}`,
					prompt_tokens: 1000 + Math.random() * 100, // Minimal variation
					completion_tokens: 2000 + Math.random() * 200,
				})
			);

			const result = analyzer.identifyLearningCurves(entries);
			
			expect(result.overallTrend).toBe("stable");
			expect(result.insights.some(insight => insight.includes("consistent"))).toBe(true);
		});

		it("should identify declining patterns", () => {
			const entries: UsageEntry[] = Array.from({ length: 14 }, (_, i) =>
				createDateEntry(i, {
					conversationId: `decline-${i}`,
					prompt_tokens: 2000 - i * 100, // Decreasing complexity
					completion_tokens: 4000 - i * 200,
				})
			);

			const result = analyzer.identifyLearningCurves(entries);
			
			if (result.periods.length >= 2) {
				const recent = result.periods[result.periods.length - 1];
				const earlier = result.periods[0];
				expect(recent.metrics.avgComplexityScore).toBeLessThan(earlier.metrics.avgComplexityScore);
			}
		});
	});

	describe("analyzeTaskSwitchingPatterns", () => {
		it("should identify rapid task switching", () => {
			const entries: UsageEntry[] = [
				// Rapid switching between different conversation types
				createTimeEntry(5, {
					conversationId: "coding-task",
					prompt_tokens: 2000,
					completion_tokens: 3000,
				}),
				createTimeEntry(4.5, {
					conversationId: "writing-task",
					prompt_tokens: 800,
					completion_tokens: 1200,
				}),
				createTimeEntry(4, {
					conversationId: "analysis-task",
					prompt_tokens: 1500,
					completion_tokens: 2000,
				}),
				createTimeEntry(3.5, {
					conversationId: "quick-question",
					prompt_tokens: 200,
					completion_tokens: 400,
				}),
			];

			const result = analyzer.analyzeTaskSwitchingPatterns(entries);

			expect(result.switchingMetrics.totalSwitches).toBeGreaterThan(0);
			expect(result.switchingMetrics.avgTimeBetweenSwitches).toBeGreaterThan(0);
			expect(result.switchingMetrics.rapidSwitchingPeriods).toBeGreaterThanOrEqual(0);

			expect(result.taskClusters).toBeInstanceOf(Array);
			expect(result.efficiency.switchingOverhead).toBeGreaterThanOrEqual(0);
			expect(result.recommendations).toBeInstanceOf(Array);
		});

		it("should detect focused work sessions", () => {
			const entries: UsageEntry[] = [
				// Long focused session on similar tasks
				...Array.from({ length: 8 }, (_, i) =>
					createTimeEntry(8 - i * 0.5, {
						conversationId: `focused-${i}`,
						prompt_tokens: 1500 + Math.random() * 300,
						completion_tokens: 2500 + Math.random() * 500,
					})
				),
			];

			const result = analyzer.analyzeTaskSwitchingPatterns(entries);

			expect(result.switchingMetrics.totalSwitches).toBeLessThan(3);
			expect(result.efficiency.focusedSessionDuration).toBeGreaterThan(0);
			expect(result.recommendations.some(r => r.includes("focused"))).toBe(true);
		});

		it("should classify task types accurately", () => {
			const entries: UsageEntry[] = [
				// Different task types
				createTimeEntry(5, {
					conversationId: "code-review",
					prompt_tokens: 3000,
					completion_tokens: 4000,
				}),
				createTimeEntry(4, {
					conversationId: "quick-help",
					prompt_tokens: 200,
					completion_tokens: 300,
				}),
				createTimeEntry(3, {
					conversationId: "research-deep",
					prompt_tokens: 2500,
					completion_tokens: 5000,
				}),
				createTimeEntry(2, {
					conversationId: "writing-assist",
					prompt_tokens: 1000,
					completion_tokens: 1500,
				}),
			];

			const result = analyzer.analyzeTaskSwitchingPatterns(entries);

			expect(result.taskClusters.length).toBeGreaterThan(1);
			result.taskClusters.forEach(cluster => {
				expect(cluster.type).toBeTruthy();
				expect(cluster.conversationIds).toBeInstanceOf(Array);
				expect(cluster.conversationIds.length).toBeGreaterThan(0);
				expect(cluster.avgDuration).toBeGreaterThanOrEqual(0);
				expect(cluster.characteristics).toBeInstanceOf(Array);
			});
		});

		it("should calculate efficiency metrics", () => {
			const entries: UsageEntry[] = Array.from({ length: 10 }, (_, i) =>
				createTimeEntry(10 - i, {
					conversationId: `efficiency-test-${i}`,
					prompt_tokens: 1000,
					completion_tokens: 2000,
				})
			);

			const result = analyzer.analyzeTaskSwitchingPatterns(entries);

			expect(result.efficiency.avgTaskCompletionTime).toBeGreaterThan(0);
			expect(result.efficiency.multitaskingEfficiency).toBeGreaterThanOrEqual(0);
			expect(result.efficiency.multitaskingEfficiency).toBeLessThanOrEqual(1);
			expect(result.efficiency.optimalBatchSize).toBeGreaterThan(0);
		});
	});

	describe("edge cases", () => {
		it("should handle empty entries array", () => {
			const lengthResult = analyzer.analyzeConversationLengthPatterns([]);
			expect(lengthResult.conversationTypes.quickQuestions.count).toBe(0);
			expect(lengthResult.conversationTypes.detailedDiscussions.count).toBe(0);
			expect(lengthResult.conversationTypes.deepDives.count).toBe(0);

			const learningResult = analyzer.identifyLearningCurves([]);
			expect(learningResult.periods).toHaveLength(0);
			expect(learningResult.overallTrend).toBe("stable");

			const switchingResult = analyzer.analyzeTaskSwitchingPatterns([]);
			expect(switchingResult.switchingMetrics.totalSwitches).toBe(0);
			expect(switchingResult.taskClusters).toHaveLength(0);
		});

		it("should handle single conversation", () => {
			const entries = [createMockEntry()];

			expect(() => analyzer.analyzeConversationLengthPatterns(entries)).not.toThrow();
			expect(() => analyzer.identifyLearningCurves(entries)).not.toThrow();
			expect(() => analyzer.analyzeTaskSwitchingPatterns(entries)).not.toThrow();
		});

		it("should handle conversations with zero tokens", () => {
			const entries = [
				createMockEntry({
					prompt_tokens: 0,
					completion_tokens: 0,
					total_tokens: 0,
				}),
			];

			const lengthResult = analyzer.analyzeConversationLengthPatterns(entries);
			expect(lengthResult.conversationTypes.quickQuestions.count).toBe(1);

			expect(() => analyzer.identifyLearningCurves(entries)).not.toThrow();
			expect(() => analyzer.analyzeTaskSwitchingPatterns(entries)).not.toThrow();
		});

		it("should handle invalid timestamps gracefully", () => {
			const entries = [
				createMockEntry({ timestamp: "invalid-date" }),
				createMockEntry({ timestamp: "2025-07-31T25:00:00.000Z" }),
			];

			expect(() => analyzer.identifyLearningCurves(entries)).not.toThrow();
			expect(() => analyzer.analyzeTaskSwitchingPatterns(entries)).not.toThrow();
		});

		it("should handle conversations with same timestamp", () => {
			const sameTimestamp = "2025-07-31T12:00:00.000Z";
			const entries = [
				createMockEntry({ 
					conversationId: "same-time-1",
					timestamp: sameTimestamp 
				}),
				createMockEntry({ 
					conversationId: "same-time-2",
					timestamp: sameTimestamp 
				}),
			];

			expect(() => analyzer.analyzeTaskSwitchingPatterns(entries)).not.toThrow();
		});

		it("should validate metrics ranges", () => {
			const entries: UsageEntry[] = Array.from({ length: 5 }, (_, i) =>
				createDateEntry(i, {
					conversationId: `validation-${i}`,
					prompt_tokens: 1000,
					completion_tokens: 2000,
				})
			);

			const lengthResult = analyzer.analyzeConversationLengthPatterns(entries);
			
			// Validate efficiency insights are within reasonable ranges
			expect(lengthResult.efficiencyInsights.avgTokensPerExchange).toBeGreaterThan(0);
			
			const learningResult = analyzer.identifyLearningCurves(entries);
			learningResult.periods.forEach(period => {
				expect(period.metrics.avgComplexityScore).toBeGreaterThanOrEqual(0);
				expect(period.metrics.avgComplexityScore).toBeLessThanOrEqual(1);
			});

			const switchingResult = analyzer.analyzeTaskSwitchingPatterns(entries);
			expect(switchingResult.efficiency.multitaskingEfficiency).toBeGreaterThanOrEqual(0);
			expect(switchingResult.efficiency.multitaskingEfficiency).toBeLessThanOrEqual(1);
		});

		it("should handle extreme conversation lengths", () => {
			const entries: UsageEntry[] = [
				// Very short conversation
				createMockEntry({
					conversationId: "very-short",
					prompt_tokens: 1,
					completion_tokens: 1,
				}),
				
				// Very long conversation
				...Array.from({ length: 100 }, (_, i) =>
					createMockEntry({
						conversationId: "very-long",
						prompt_tokens: 1000,
						completion_tokens: 2000,
					})
				),
			];

			const result = analyzer.analyzeConversationLengthPatterns(entries);
			
			expect(result.conversationTypes.quickQuestions.count).toBe(1);
			expect(result.conversationTypes.deepDives.count).toBe(1);
			expect(result.avgLengthByType.deepDives).toBe(100);
		});
	});
});
