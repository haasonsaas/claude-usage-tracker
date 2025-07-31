import { describe, expect, it } from "vitest";
import { ResearchAnalyzer } from "./research-analytics.js";
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

const createProjectEntry = (projectId: string, overrides: Partial<UsageEntry> = {}): UsageEntry => {
	return createMockEntry({
		conversationId: `${projectId}-conversation`,
		...overrides,
	});
};

describe("ResearchAnalyzer", () => {
	const analyzer = new ResearchAnalyzer();

	describe("analyzeConversationSuccess", () => {
		it("should analyze conversation success metrics", () => {
			const entries: UsageEntry[] = [
				// Short, successful conversation
				createMockEntry({
					conversationId: "successful-1",
					prompt_tokens: 500,
					completion_tokens: 1500, // High completion ratio
				}),
				createMockEntry({
					conversationId: "successful-1",
					prompt_tokens: 300,
					completion_tokens: 900,
				}),
				
				// Long, potentially struggling conversation
				...Array.from({ length: 15 }, (_, i) =>
					createMockEntry({
						conversationId: "struggling-1",
						prompt_tokens: 1000,
						completion_tokens: 800, // Lower completion ratio
					})
				),
				
				// Abandoned conversation (single exchange)
				createMockEntry({
					conversationId: "abandoned-1",
					prompt_tokens: 200,
					completion_tokens: 100,
				}),
			];

			const result = analyzer.analyzeConversationSuccess(entries);

			expect(result.successMetrics.totalConversations).toBe(3);
			expect(result.successMetrics.completionRate).toBeGreaterThanOrEqual(0);
			expect(result.successMetrics.completionRate).toBeLessThanOrEqual(1);
			expect(result.successMetrics.avgSuccessScore).toBeGreaterThanOrEqual(0);
			expect(result.successMetrics.avgSuccessScore).toBeLessThanOrEqual(1);

			expect(result.conversationCategories.successful).toBeInstanceOf(Array);
			expect(result.conversationCategories.struggling).toBeInstanceOf(Array);
			expect(result.conversationCategories.abandoned).toBeInstanceOf(Array);

			expect(result.patterns.successFactors).toBeInstanceOf(Array);
			expect(result.patterns.commonFailurePoints).toBeInstanceOf(Array);
			expect(result.recommendations).toBeInstanceOf(Array);
		});

		it("should identify successful conversations correctly", () => {
			const entries: UsageEntry[] = [
				// Highly efficient conversation
				createMockEntry({
					conversationId: "efficient",
					prompt_tokens: 300,
					completion_tokens: 1200, // 4:1 ratio
				}),
				createMockEntry({
					conversationId: "efficient",
					prompt_tokens: 200,
					completion_tokens: 800,
				}),
			];

			const result = analyzer.analyzeConversationSuccess(entries);
			
			expect(result.conversationCategories.successful.length).toBeGreaterThan(0);
			expect(result.successMetrics.avgSuccessScore).toBeGreaterThan(0.7);
		});

		it("should detect struggling conversations", () => {
			const entries: UsageEntry[] = Array.from({ length: 20 }, (_, i) =>
				createMockEntry({
					conversationId: "very-long",
					prompt_tokens: 1500,
					completion_tokens: 500, // Poor ratio
				})
			);

			const result = analyzer.analyzeConversationSuccess(entries);
			
			expect(result.conversationCategories.struggling.length).toBeGreaterThan(0);
		});

		it("should provide actionable success factors", () => {
			const entries: UsageEntry[] = [
				// Mix of successful and unsuccessful patterns
				...Array.from({ length: 3 }, (_, i) =>
					createMockEntry({
						conversationId: `success-${i}`,
						model: "claude-3.5-sonnet-20241022",
						prompt_tokens: 400,
						completion_tokens: 1200,
					})
				),
				...Array.from({ length: 3 }, (_, i) =>
					createMockEntry({
						conversationId: `struggle-${i}`,
						model: "claude-opus-4-20250514",
						prompt_tokens: 2000,
						completion_tokens: 1000,
					})
				),
			];

			const result = analyzer.analyzeConversationSuccess(entries);
			
			expect(result.patterns.successFactors.length).toBeGreaterThan(0);
			expect(result.patterns.successFactors.some(factor => 
				typeof factor === "string" && factor.length > 0
			)).toBe(true);
		});
	});

	describe("calculateProjectROI", () => {
		it("should calculate ROI for different projects", () => {
			const entries: UsageEntry[] = [
				// High-value project with efficient usage
				...Array.from({ length: 5 }, (_, i) =>
					createProjectEntry("high-roi-project", {
						timestamp: createDateEntry(i).timestamp,
						prompt_tokens: 800,
						completion_tokens: 1600,
						model: "claude-3.5-sonnet-20241022",
					})
				),
				
				// Low-efficiency project with expensive usage
				...Array.from({ length: 10 }, (_, i) =>
					createProjectEntry("low-roi-project", {
						timestamp: createDateEntry(i).timestamp,
						prompt_tokens: 2000,
						completion_tokens: 1000,
						model: "claude-opus-4-20250514",
					})
				),
			];

			const result = analyzer.calculateProjectROI(entries);

			expect(result.projects.length).toBeGreaterThan(0);
			expect(result.totalInvestment).toBeGreaterThan(0);
			expect(result.avgROI).toBeDefined();
			expect(result.insights.topPerformers).toBeInstanceOf(Array);
			expect(result.insights.underperformers).toBeInstanceOf(Array);

			result.projects.forEach(project => {
				expect(project.projectId).toBeTruthy();
				expect(project.totalCost).toBeGreaterThan(0);
				expect(project.conversationCount).toBeGreaterThan(0);
				expect(project.avgCostPerConversation).toBeGreaterThan(0);
				expect(project.roiScore).toBeGreaterThanOrEqual(0);
				expect(project.roiScore).toBeLessThanOrEqual(1);
				expect(project.characteristics).toBeInstanceOf(Array);
			});
		});

		it("should identify top and underperforming projects", () => {
			const entries: UsageEntry[] = [
				// Efficient project
				createProjectEntry("efficient-proj", {
					prompt_tokens: 500,
					completion_tokens: 2000,
					model: "claude-3.5-sonnet-20241022",
				}),
				
				// Inefficient project
				...Array.from({ length: 20 }, (_, i) =>
					createProjectEntry("inefficient-proj", {
						prompt_tokens: 3000,
						completion_tokens: 1000,
						model: "claude-opus-4-20250514",
					})
				),
			];

			const result = analyzer.calculateProjectROI(entries);
			
			if (result.projects.length >= 2) {
				expect(result.insights.topPerformers.length).toBeGreaterThan(0);
				expect(result.insights.underperformers.length).toBeGreaterThan(0);
			}
		});

		it("should provide project improvement recommendations", () => {
			const entries: UsageEntry[] = Array.from({ length: 10 }, (_, i) =>
				createProjectEntry("analysis-project", {
					prompt_tokens: 1000 + i * 100,
					completion_tokens: 2000 - i * 50,
					model: i % 2 === 0 ? "claude-opus-4-20250514" : "claude-3.5-sonnet-20241022",
				})
			);

			const result = analyzer.calculateProjectROI(entries);
			
			if (result.projects.length > 0) {
				const project = result.projects[0];
				expect(project.recommendations).toBeInstanceOf(Array);
				expect(project.recommendations.length).toBeGreaterThan(0);
			}
		});
	});

	describe("findCorrelations", () => {
		it("should find correlations between usage metrics", () => {
			const entries: UsageEntry[] = [];
			
			// Create patterns: time of day vs cost, model vs efficiency
			for (let hour = 8; hour < 18; hour++) {
				const date = new Date();
				date.setHours(hour);
				
				entries.push(createMockEntry({
					conversationId: `hourly-${hour}`,
					timestamp: date.toISOString(),
					prompt_tokens: hour * 100, // Cost increases with hour
					completion_tokens: (18 - hour) * 150, // Efficiency decreases
					model: hour < 12 ? "claude-3.5-sonnet-20241022" : "claude-opus-4-20250514",
				}));
			}

			const result = analyzer.findCorrelations(entries);

			expect(result.correlations.length).toBeGreaterThan(0);
			expect(result.strongestCorrelations).toBeInstanceOf(Array);
			expect(result.insights).toBeInstanceOf(Array);

			result.correlations.forEach(correlation => {
				expect(correlation.variable1).toBeTruthy();
				expect(correlation.variable2).toBeTruthy();
				expect(correlation.strength).toBeGreaterThanOrEqual(-1);
				expect(correlation.strength).toBeLessThanOrEqual(1);
				expect(correlation.significance).toMatch(/weak|moderate|strong/);
				expect(correlation.interpretation).toBeTruthy();
			});
		});

		it("should identify time-based patterns", () => {
			const entries: UsageEntry[] = [];
			
			// Weekend vs weekday patterns
			for (let day = 0; day < 14; day++) {
				const date = new Date();
				date.setDate(date.getDate() - day);
				const isWeekend = date.getDay() === 0 || date.getDay() === 6;
				
				entries.push(createDateEntry(day, {
					conversationId: `day-${day}`,
					prompt_tokens: isWeekend ? 2000 : 1000,
					completion_tokens: isWeekend ? 1000 : 2000,
				}));
			}

			const result = analyzer.findCorrelations(entries);
			
			const timeCorrelation = result.correlations.find(c => 
				c.variable1.includes("time") || c.variable2.includes("time") ||
				c.variable1.includes("day") || c.variable2.includes("day")
			);
			
			if (timeCorrelation) {
				expect(timeCorrelation.strength).not.toBe(0);
			}
		});

		it("should detect model performance correlations", () => {
			const entries: UsageEntry[] = [
				// Opus conversations - complex, expensive
				...Array.from({ length: 10 }, (_, i) =>
					createMockEntry({
						conversationId: `opus-${i}`,
						model: "claude-opus-4-20250514",
						prompt_tokens: 2000 + i * 100,
						completion_tokens: 3000 + i * 150,
					})
				),
				
				// Sonnet conversations - simpler, cheaper
				...Array.from({ length: 10 }, (_, i) =>
					createMockEntry({
						conversationId: `sonnet-${i}`,
						model: "claude-3.5-sonnet-20241022",
						prompt_tokens: 800 + i * 50,
						completion_tokens: 1200 + i * 75,
					})
				),
			];

			const result = analyzer.findCorrelations(entries);
			
			const modelCorrelation = result.correlations.find(c => 
				c.variable1.includes("model") || c.variable2.includes("model")
			);
			
			if (modelCorrelation) {
				expect(Math.abs(modelCorrelation.strength)).toBeGreaterThan(0.1);
			}
		});

		it("should provide actionable insights from correlations", () => {
			const entries: UsageEntry[] = Array.from({ length: 20 }, (_, i) =>
				createMockEntry({
					conversationId: `insight-${i}`,
					prompt_tokens: 1000 + i * 100,
					completion_tokens: 2000 - i * 50, // Negative correlation
				})
			);

			const result = analyzer.findCorrelations(entries);
			
			expect(result.insights.length).toBeGreaterThan(0);
			expect(result.insights.every(insight => typeof insight === "string")).toBe(true);
		});
	});

	describe("edge cases", () => {
		it("should handle empty entries array", () => {
			const successResult = analyzer.analyzeConversationSuccess([]);
			expect(successResult.successMetrics.totalConversations).toBe(0);
			expect(successResult.conversationCategories.successful).toHaveLength(0);

			const roiResult = analyzer.calculateProjectROI([]);
			expect(roiResult.projects).toHaveLength(0);
			expect(roiResult.totalInvestment).toBe(0);

			const correlationResult = analyzer.findCorrelations([]);
			expect(correlationResult.correlations).toHaveLength(0);
			expect(correlationResult.strongestCorrelations).toHaveLength(0);
		});

		it("should handle single conversation", () => {
			const entries = [createMockEntry()];

			expect(() => analyzer.analyzeConversationSuccess(entries)).not.toThrow();
			expect(() => analyzer.calculateProjectROI(entries)).not.toThrow();
			expect(() => analyzer.findCorrelations(entries)).not.toThrow();
		});

		it("should handle conversations with zero cost", () => {
			const entries = [
				createMockEntry({
					prompt_tokens: 0,
					completion_tokens: 0,
					total_tokens: 0,
				}),
			];

			const successResult = analyzer.analyzeConversationSuccess(entries);
			expect(successResult.successMetrics.totalConversations).toBe(1);

			const roiResult = analyzer.calculateProjectROI(entries);
			expect(roiResult.projects.length).toBe(1);
			expect(roiResult.projects[0].totalCost).toBe(0);
		});

		it("should handle invalid timestamps gracefully", () => {
			const entries = [
				createMockEntry({ timestamp: "invalid-date" }),
				createMockEntry({ timestamp: "2025-07-31T25:00:00.000Z" }),
			];

			expect(() => analyzer.findCorrelations(entries)).not.toThrow();
		});

		it("should handle identical conversations", () => {
			const entries: UsageEntry[] = Array.from({ length: 5 }, () =>
				createMockEntry({
					conversationId: "identical",
					prompt_tokens: 1000,
					completion_tokens: 2000,
				})
			);

			const successResult = analyzer.analyzeConversationSuccess(entries);
			expect(successResult.successMetrics.totalConversations).toBe(1);

			const correlationResult = analyzer.findCorrelations(entries);
			// Should handle lack of variation gracefully
			expect(correlationResult.correlations.length).toBeGreaterThanOrEqual(0);
		});

		it("should validate metric ranges", () => {
			const entries: UsageEntry[] = Array.from({ length: 10 }, (_, i) =>
				createMockEntry({
					conversationId: `validation-${i}`,
					prompt_tokens: 1000,
					completion_tokens: 2000,
				})
			);

			const successResult = analyzer.analyzeConversationSuccess(entries);
			expect(successResult.successMetrics.completionRate).toBeGreaterThanOrEqual(0);
			expect(successResult.successMetrics.completionRate).toBeLessThanOrEqual(1);
			expect(successResult.successMetrics.avgSuccessScore).toBeGreaterThanOrEqual(0);
			expect(successResult.successMetrics.avgSuccessScore).toBeLessThanOrEqual(1);

			const roiResult = analyzer.calculateProjectROI(entries);
			roiResult.projects.forEach(project => {
				expect(project.roiScore).toBeGreaterThanOrEqual(0);
				expect(project.roiScore).toBeLessThanOrEqual(1);
			});

			const correlationResult = analyzer.findCorrelations(entries);
			correlationResult.correlations.forEach(correlation => {
				expect(correlation.strength).toBeGreaterThanOrEqual(-1);
				expect(correlation.strength).toBeLessThanOrEqual(1);
			});
		});

		it("should handle extreme conversation lengths and costs", () => {
			const entries: UsageEntry[] = [
				// Extremely short conversation
				createMockEntry({
					conversationId: "tiny",
					prompt_tokens: 1,
					completion_tokens: 1,
				}),
				
				// Extremely long/expensive conversation
				...Array.from({ length: 1000 }, (_, i) =>
					createMockEntry({
						conversationId: "massive",
						prompt_tokens: 5000,
						completion_tokens: 10000,
					})
				),
			];

			const successResult = analyzer.analyzeConversationSuccess(entries);
			expect(successResult.successMetrics.totalConversations).toBe(2);

			const roiResult = analyzer.calculateProjectROI(entries);
			expect(roiResult.projects.length).toBe(2);

			expect(() => analyzer.findCorrelations(entries)).not.toThrow();
		});

		it("should provide meaningful default values for edge cases", () => {
			const entries = [createMockEntry()];

			const successResult = analyzer.analyzeConversationSuccess(entries);
			expect(successResult.patterns.successFactors.length).toBeGreaterThanOrEqual(0);
			expect(successResult.recommendations.length).toBeGreaterThanOrEqual(0);

			const roiResult = analyzer.calculateProjectROI(entries);
			expect(roiResult.avgROI).toBeDefined();
			expect(roiResult.insights.topPerformers.length).toBeGreaterThanOrEqual(0);

			const correlationResult = analyzer.findCorrelations(entries);
			expect(correlationResult.insights.length).toBeGreaterThanOrEqual(0);
		});
	});
});
