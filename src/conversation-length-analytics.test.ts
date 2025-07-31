import { describe, it, expect, beforeEach } from "vitest";
import { ConversationLengthAnalyzer } from "./conversation-length-analytics.js";
import { UsageEntry } from "./types.js";

describe("ConversationLengthAnalyzer", () => {
	let analyzer: ConversationLengthAnalyzer;

	beforeEach(() => {
		analyzer = new ConversationLengthAnalyzer();
		conversationCounter = 0; // Reset counter for consistent test results
	});

	describe("Basic Functionality", () => {
		it("should handle empty conversation list", () => {
			analyzer.loadConversations([]);
			const analysis = analyzer.analyzeConversationLengths();

			expect(analysis.totalConversations).toBe(0);
			expect(analysis.projectProfiles).toHaveLength(0);
			expect(analysis.insights).toHaveLength(0);
		});

		it("should categorize conversation lengths correctly", () => {
			const entries = createTestConversations([
				{ id: "quick", messageCount: 3, project: "test-project" },
				{ id: "medium", messageCount: 15, project: "test-project" },
				{ id: "deep", messageCount: 50, project: "test-project" },
				{ id: "marathon", messageCount: 150, project: "test-project" },
			]);

			analyzer.loadConversations(entries);
			const analysis = analyzer.analyzeConversationLengths();

			expect(analysis.totalConversations).toBe(4);
			expect(analysis.lengthDistribution.quick).toBe(0.25);
			expect(analysis.lengthDistribution.medium).toBe(0.25);
			expect(analysis.lengthDistribution.deep).toBe(0.25);
			expect(analysis.lengthDistribution.marathon).toBe(0.25);
		});
	});

	describe("Project Analysis", () => {
		it("should analyze project-specific patterns", () => {
			const entries = createTestConversations([
				{ id: "web1", messageCount: 10, project: "web-app" },
				{ id: "web2", messageCount: 12, project: "web-app" },
				{ id: "infra1", messageCount: 80, project: "infrastructure" },
				{ id: "infra2", messageCount: 90, project: "infrastructure" },
			]);

			analyzer.loadConversations(entries);
			const analysis = analyzer.analyzeConversationLengths();

			expect(analysis.projectProfiles).toHaveLength(2);

			const webProject = analysis.projectProfiles.find(
				(p) => p.project === "web-app",
			);
			const infraProject = analysis.projectProfiles.find(
				(p) => p.project === "infrastructure",
			);

			expect(webProject).toBeDefined();
			expect(infraProject).toBeDefined();
			expect(webProject!.avgMessageCount).toBe(11);
			expect(infraProject!.avgMessageCount).toBe(85);
		});

		it("should generate project-specific recommendations", () => {
			const entries = createTestConversations([
				// Project with many marathon conversations
				{ id: "complex1", messageCount: 200, project: "complex-project" },
				{ id: "complex2", messageCount: 250, project: "complex-project" },
				{ id: "complex3", messageCount: 300, project: "complex-project" },
			]);

			analyzer.loadConversations(entries);
			const analysis = analyzer.analyzeConversationLengths();

			const complexProject = analysis.projectProfiles.find(
				(p) => p.project === "complex-project",
			);
			expect(complexProject!.recommendations).toContain(
				expect.stringMatching(/break.*down.*complex.*tasks/i),
			);
		});
	});

	describe("Success Pattern Analysis", () => {
		it("should identify quick follow-up patterns", () => {
			const now = new Date();
			const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

			const entries = [
				...createConversationWithTiming("conv1", 5, "project1", now),
				...createConversationWithTiming("conv2", 3, "project1", oneHourLater), // Quick follow-up
			];

			analyzer.loadConversations(entries);
			const analysis = analyzer.analyzeConversationLengths();

			// First conversation should be marked as having quick follow-up
			expect(analysis.recommendations).toContain(
				expect.stringMatching(/quick follow-ups.*thorough/i),
			);
		});

		it("should detect conversation completion patterns", () => {
			const entries = createTestConversations([
				{ id: "normal", messageCount: 25, project: "test" },
				{ id: "stuck", messageCount: 300, project: "test" }, // Very long = likely stuck
			]);

			analyzer.loadConversations(entries);
			const analysis = analyzer.analyzeConversationLengths();

			// Should recommend breaking down complex problems
			expect(analysis.recommendations).toContain(
				expect.stringMatching(/breaking.*down.*complex/i),
			);
		});
	});

	describe("Efficiency Analysis", () => {
		it("should calculate token efficiency correctly", () => {
			const entries = createConversationWithTokensAndDuration("test", 1000, 10); // 100 tokens/minute

			analyzer.loadConversations(entries);
			const analysis = analyzer.analyzeConversationLengths();

			expect(
				analysis.projectProfiles[0].efficiencyByLength.medium.avgEfficiency,
			).toBeCloseTo(100, 1);
		});

		it("should identify low efficiency conversations", () => {
			const entries = createConversationWithTokensAndDuration("slow", 100, 10); // 10 tokens/minute (low)

			analyzer.loadConversations(entries);
			const analysis = analyzer.analyzeConversationLengths();

			expect(analysis.recommendations).toContain(
				expect.stringMatching(/focus.*conversations.*specific.*questions/i),
			);
		});
	});

	describe("Optimal Range Calculation", () => {
		it("should calculate optimal range based on success rates", () => {
			// Create conversations where medium length has highest success
			const entries = [
				...createSuccessfulConversation("quick1", 3, "test", false), // Quick but unsuccessful
				...createSuccessfulConversation("medium1", 15, "test", true), // Medium and successful
				...createSuccessfulConversation("medium2", 18, "test", true), // Medium and successful
				...createSuccessfulConversation("deep1", 80, "test", false), // Deep but unsuccessful
			];

			analyzer.loadConversations(entries);
			const analysis = analyzer.analyzeConversationLengths();

			expect(analysis.overallOptimalRange.minMessages).toBe(6);
			expect(analysis.overallOptimalRange.maxMessages).toBe(20);
			expect(analysis.overallOptimalRange.explanation).toContain(
				"Medium-length",
			);
		});

		it("should adapt optimal range for different project types", () => {
			const entries = [
				// Simple project - quick conversations work well
				...createSuccessfulConversation("simple1", 2, "simple-project", true),
				...createSuccessfulConversation("simple2", 4, "simple-project", true),
				// Complex project - deep conversations work better
				...createSuccessfulConversation(
					"complex1",
					60,
					"complex-project",
					true,
				),
				...createSuccessfulConversation(
					"complex2",
					80,
					"complex-project",
					true,
				),
			];

			analyzer.loadConversations(entries);
			const analysis = analyzer.analyzeConversationLengths();

			const simpleProject = analysis.projectProfiles.find(
				(p) => p.project === "simple-project",
			);
			const complexProject = analysis.projectProfiles.find(
				(p) => p.project === "complex-project",
			);

			expect(simpleProject!.optimalRange.maxMessages).toBeLessThan(
				complexProject!.optimalRange.maxMessages,
			);
		});
	});

	describe("Edge Cases", () => {
		it("should handle single message conversations", () => {
			const entries = createTestConversations([
				{ id: "single", messageCount: 1, project: "test" },
			]);

			analyzer.loadConversations(entries);
			const analysis = analyzer.analyzeConversationLengths();

			expect(analysis.totalConversations).toBe(1);
			expect(analysis.lengthDistribution.quick).toBe(1);
		});

		it("should handle conversations with zero duration", () => {
			const now = new Date();
			const entries = [
				createEntry("conv1", "test-project", now, 1, 100, 50, 1.0),
				createEntry("conv1", "test-project", now, 2, 100, 50, 1.0), // Same timestamp
			];

			analyzer.loadConversations(entries);
			const analysis = analyzer.analyzeConversationLengths();

			// Should handle zero duration gracefully (minimum 1 minute)
			expect(analysis.projectProfiles[0].avgDuration).toBeGreaterThan(0);
		});

		it("should handle missing cost data", () => {
			const entries = [
				createEntry("conv1", "test", new Date(), 1, 100, 50, undefined), // No cost
			];

			analyzer.loadConversations(entries);
			const analysis = analyzer.analyzeConversationLengths();

			expect(analysis.totalConversations).toBe(1);
			expect(analysis.projectProfiles[0].totalConversations).toBe(1);
		});

		it("should handle very large conversation counts", () => {
			const entries: UsageEntry[] = [];

			// Create 1000 conversations to test performance
			for (let i = 0; i < 1000; i++) {
				entries.push(
					...createTestConversations([
						{ id: `conv${i}`, messageCount: 10, project: "large-project" },
					]),
				);
			}

			analyzer.loadConversations(entries);
			const start = Date.now();
			const analysis = analyzer.analyzeConversationLengths();
			const duration = Date.now() - start;

			expect(analysis.totalConversations).toBe(1000);
			expect(duration).toBeLessThan(1000); // Should complete within 1 second
		});
	});

	describe("Real-world Scenarios", () => {
		it("should analyze debugging vs feature development patterns", () => {
			const entries = [
				// Debugging typically has shorter, focused conversations
				...createTestConversations([
					{ id: "debug1", messageCount: 5, project: "debugging" },
					{ id: "debug2", messageCount: 8, project: "debugging" },
				]),
				// Feature development has longer conversations
				...createTestConversations([
					{ id: "feature1", messageCount: 40, project: "feature-dev" },
					{ id: "feature2", messageCount: 35, project: "feature-dev" },
				]),
			];

			analyzer.loadConversations(entries);
			const analysis = analyzer.analyzeConversationLengths();

			const debugProject = analysis.projectProfiles.find(
				(p) => p.project === "debugging",
			);
			const featureProject = analysis.projectProfiles.find(
				(p) => p.project === "feature-dev",
			);

			expect(debugProject!.avgMessageCount).toBeLessThan(
				featureProject!.avgMessageCount,
			);
			expect(debugProject!.optimalRange.maxMessages).toBeLessThan(
				featureProject!.optimalRange.maxMessages,
			);
		});

		it("should identify learning vs maintenance patterns", () => {
			const entries = [
				// Learning conversations tend to be longer
				...createTestConversations([
					{ id: "learn1", messageCount: 60, project: "learning" },
					{ id: "learn2", messageCount: 45, project: "learning" },
				]),
				// Maintenance conversations tend to be shorter
				...createTestConversations([
					{ id: "maint1", messageCount: 12, project: "maintenance" },
					{ id: "maint2", messageCount: 8, project: "maintenance" },
				]),
			];

			analyzer.loadConversations(entries);
			const analysis = analyzer.analyzeConversationLengths();

			const learningProject = analysis.projectProfiles.find(
				(p) => p.project === "learning",
			);
			const maintenanceProject = analysis.projectProfiles.find(
				(p) => p.project === "maintenance",
			);

			expect(learningProject!.avgMessageCount).toBeGreaterThan(
				maintenanceProject!.avgMessageCount,
			);
		});
	});

	describe("Recommendation Quality", () => {
		it("should provide actionable recommendations for marathon conversations", () => {
			const entries = createTestConversations([
				{ id: "marathon1", messageCount: 400, project: "complex" },
				{ id: "marathon2", messageCount: 300, project: "complex" },
				{ id: "normal", messageCount: 20, project: "complex" },
			]);

			analyzer.loadConversations(entries);
			const analysis = analyzer.analyzeConversationLengths();

			expect(analysis.recommendations).toContain(
				expect.stringMatching(/break.*down.*complex.*problems/i),
			);
		});

		it("should identify successful patterns to replicate", () => {
			const entries = [
				...createSuccessfulConversation("success1", 15, "web-dev", true),
				...createSuccessfulConversation("success2", 18, "web-dev", true),
				...createSuccessfulConversation("failure1", 80, "web-dev", false),
			];

			analyzer.loadConversations(entries);
			const analysis = analyzer.analyzeConversationLengths();

			const webProject = analysis.projectProfiles.find(
				(p) => p.project === "web-dev",
			);
			expect(webProject!.recommendations).toContain(
				expect.stringMatching(/medium.*conversations.*work.*well/i),
			);
		});
	});
});

// Helper functions for creating test data
function createTestConversations(
	conversations: { id: string; messageCount: number; project: string }[],
): UsageEntry[] {
	const entries: UsageEntry[] = [];
	const baseTime = new Date("2024-01-01T10:00:00Z");

	for (const conv of conversations) {
		for (let i = 0; i < conv.messageCount; i++) {
			const timestamp = new Date(baseTime.getTime() + i * 60000); // 1 minute apart
			entries.push(
				createEntry(conv.id, conv.project, timestamp, i + 1, 100, 50, 1.0),
			);
		}
	}

	return entries;
}

function createConversationWithTiming(
	conversationId: string,
	messageCount: number,
	project: string,
	startTime: Date,
): UsageEntry[] {
	const entries: UsageEntry[] = [];

	for (let i = 0; i < messageCount; i++) {
		const timestamp = new Date(startTime.getTime() + i * 60000); // 1 minute apart
		entries.push(
			createEntry(conversationId, project, timestamp, i + 1, 100, 50, 1.0),
		);
	}

	return entries;
}

function createConversationWithTokensAndDuration(
	conversationId: string,
	totalTokens: number,
	durationMinutes: number,
): UsageEntry[] {
	const entries: UsageEntry[] = [];
	const messageCount = 10; // Fixed message count
	const tokensPerMessage = totalTokens / messageCount;
	const baseTime = new Date();

	for (let i = 0; i < messageCount; i++) {
		// Spread messages across the full duration, with last message at exactly durationMinutes
		const timestamp = new Date(
			baseTime.getTime() +
				i * ((durationMinutes * 60000) / Math.max(1, messageCount - 1)),
		);
		entries.push(
			createEntry(
				conversationId,
				"test-project",
				timestamp,
				i + 1,
				tokensPerMessage / 2,
				tokensPerMessage / 2,
				0.1,
			),
		);
	}

	return entries;
}

let conversationCounter = 0;

function createSuccessfulConversation(
	conversationId: string,
	messageCount: number,
	project: string,
	successful: boolean,
): UsageEntry[] {
	const entries: UsageEntry[] = [];
	const baseTime = new Date("2024-01-01T10:00:00Z");
	// Space conversations apart by 1 day each to avoid follow-up detection issues
	baseTime.setDate(baseTime.getDate() + conversationCounter++);

	for (let i = 0; i < messageCount; i++) {
		const timestamp = new Date(baseTime.getTime() + i * 60000);
		entries.push(
			createEntry(conversationId, project, timestamp, i + 1, 100, 50, 1.0),
		);
	}

	// If successful, don't create follow-up conversation
	// If unsuccessful, create a quick follow-up (simulates needing to continue)
	if (!successful) {
		const followUpTime = new Date(
			baseTime.getTime() + messageCount * 60000 + 30 * 60000,
		); // 30 min later
		entries.push(
			createEntry(
				conversationId + "_followup",
				project,
				followUpTime,
				1,
				50,
				25,
				0.5,
			),
		);
	}

	return entries;
}

function createEntry(
	conversationId: string,
	project: string,
	timestamp: Date,
	messageNumber: number,
	inputTokens: number,
	outputTokens: number,
	cost?: number,
): UsageEntry {
	return {
		timestamp: timestamp.toISOString(),
		conversationId: conversationId,
		instanceId: project,
		model: "claude-3-sonnet",
		requestId: `req_${conversationId}_${messageNumber}`,
		prompt_tokens: inputTokens,
		completion_tokens: outputTokens,
		total_tokens: inputTokens + outputTokens,
		cost: cost,
	};
}
