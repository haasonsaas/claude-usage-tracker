import { UsageEntry } from "./types.js";

export interface ConversationLengthInsight {
	conversationId: string;
	messageCount: number;
	tokenCount: number;
	duration: number;
	project: string;
	efficiency: number; // tokens per minute
	costEfficiency: number; // tokens per dollar
	lengthCategory: "quick" | "medium" | "deep" | "marathon";
	followUpPattern: "standalone" | "builds-on-previous" | "repeat-topic";
	successIndicators: {
		hasQuickFollowUp: boolean;
		conversationCompleted: boolean;
		topicResolved: boolean;
	};
}

export interface ProjectLengthProfile {
	project: string;
	totalConversations: number;
	avgMessageCount: number;
	avgDuration: number;
	avgTokens: number;
	optimalRange: {
		minMessages: number;
		maxMessages: number;
		explanation: string;
	};
	efficiencyByLength: {
		quick: { count: number; avgEfficiency: number; successRate: number };
		medium: { count: number; avgEfficiency: number; successRate: number };
		deep: { count: number; avgEfficiency: number; successRate: number };
		marathon: { count: number; avgEfficiency: number; successRate: number };
	};
	recommendations: string[];
}

export interface ConversationLengthAnalysis {
	totalConversations: number;
	overallOptimalRange: {
		minMessages: number;
		maxMessages: number;
		explanation: string;
	};
	projectProfiles: ProjectLengthProfile[];
	lengthDistribution: {
		quick: number;
		medium: number;
		deep: number;
		marathon: number;
	};
	insights: string[];
	recommendations: string[];
}

export class ConversationLengthAnalyzer {
	private conversations: Map<string, UsageEntry[]> = new Map();

	private extractProjectName(conversationId: string): string {
		// Extract project name from the conversation data using instanceId
		// Find the first entry for this conversation to get its instanceId
		const entries = this.conversations.get(conversationId);
		if (entries && entries.length > 0) {
			return entries[0].instanceId || "unknown-project";
		}
		return "unknown-project";
	}

	loadConversations(entries: UsageEntry[]): void {
		// Group entries by conversation ID
		this.conversations.clear();

		for (const entry of entries) {
			const convId = entry.conversationId;
			if (!this.conversations.has(convId)) {
				this.conversations.set(convId, []);
			}
			this.conversations.get(convId)!.push(entry);
		}
	}

	analyzeConversationLengths(): ConversationLengthAnalysis {
		const insights = this.generateConversationInsights();
		const projectProfiles = this.generateProjectProfiles(insights);

		return {
			totalConversations: insights.length,
			overallOptimalRange: this.calculateOptimalRange(insights),
			projectProfiles,
			lengthDistribution: this.calculateLengthDistribution(insights),
			insights: this.generateInsights(insights, projectProfiles),
			recommendations: this.generateRecommendations(insights, projectProfiles),
		};
	}

	private generateConversationInsights(): ConversationLengthInsight[] {
		const insights: ConversationLengthInsight[] = [];

		for (const [conversationId, entries] of this.conversations) {
			if (entries.length === 0) continue;

			const messageCount = entries.length;
			const tokenCount = entries.reduce(
				(sum, entry) =>
					sum + (entry.prompt_tokens || 0) + (entry.completion_tokens || 0),
				0,
			);

			const sortedEntries = entries.sort(
				(a, b) =>
					new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
			);

			const startTime = new Date(sortedEntries[0].timestamp);
			const endTime = new Date(
				sortedEntries[sortedEntries.length - 1].timestamp,
			);
			const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60); // minutes

			const project = this.extractProjectName(conversationId);
			const totalCost = entries.reduce(
				(sum, entry) => sum + (entry.cost || entry.costUSD || 0),
				0,
			);

			const efficiency = duration > 0 ? tokenCount / duration : 0;
			const costEfficiency = totalCost > 0 ? tokenCount / totalCost : 0;

			insights.push({
				conversationId,
				messageCount,
				tokenCount,
				duration: Math.max(duration, 1), // Minimum 1 minute
				project,
				efficiency,
				costEfficiency,
				lengthCategory: this.categorizeLengthByMessages(messageCount),
				followUpPattern: this.analyzeFollowUpPattern(conversationId, entries),
				successIndicators: this.analyzeSuccessIndicators(
					conversationId,
					entries,
				),
			});
		}

		return insights;
	}

	private categorizeLengthByMessages(
		messageCount: number,
	): "quick" | "medium" | "deep" | "marathon" {
		if (messageCount <= 5) return "quick";
		if (messageCount <= 20) return "medium";
		if (messageCount <= 100) return "deep";
		return "marathon";
	}

	private analyzeFollowUpPattern(
		conversationId: string,
		entries: UsageEntry[],
	): "standalone" | "builds-on-previous" | "repeat-topic" {
		// Simple heuristic: if conversation has many messages, likely builds on previous
		// In real implementation, would analyze content similarity with previous conversations
		if (entries.length > 50) return "builds-on-previous";
		if (entries.length > 10) return "builds-on-previous";
		return "standalone";
	}

	private analyzeSuccessIndicators(
		conversationId: string,
		entries: UsageEntry[],
	): {
		hasQuickFollowUp: boolean;
		conversationCompleted: boolean;
		topicResolved: boolean;
	} {
		// Heuristics for success:
		// - Quick follow-up suggests previous conversation was incomplete
		// - Conversation completed if it has a clear ending pattern
		// - Topic resolved if no immediate follow-up on same topic

		const hasQuickFollowUp = this.hasQuickFollowUp(conversationId, entries);
		const conversationCompleted = this.seemsCompleted(entries);
		const topicResolved = !hasQuickFollowUp && conversationCompleted;

		return {
			hasQuickFollowUp,
			conversationCompleted,
			topicResolved,
		};
	}

	private hasQuickFollowUp(
		conversationId: string,
		entries: UsageEntry[],
	): boolean {
		// Check if there's an explicit follow-up conversation (indicated by naming pattern)
		// or a very quick subsequent conversation that suggests the previous one was incomplete
		const lastEntry = entries[entries.length - 1];
		const lastTime = new Date(lastEntry.timestamp);
		const project = this.extractProjectName(conversationId);

		for (const [otherConvId, otherEntries] of this.conversations) {
			if (otherConvId === conversationId) continue;

			// Check for explicit follow-up pattern (e.g., "conv1_followup")
			if (otherConvId.startsWith(conversationId + "_")) {
				return true;
			}

			const otherProject = this.extractProjectName(otherConvId);
			if (otherProject !== project) continue;

			const otherStartTime = new Date(otherEntries[0].timestamp);
			const timeDiff =
				(otherStartTime.getTime() - lastTime.getTime()) / (1000 * 60 * 60); // hours

			// Only consider it a quick follow-up if it's very close in time (within 2 hours)
			// and the current conversation was relatively short (suggesting it was incomplete)
			if (timeDiff > 0 && timeDiff < 2 && entries.length < 50) {
				return true;
			}
		}

		return false;
	}

	private seemsCompleted(entries: UsageEntry[]): boolean {
		// Heuristic: conversation seems completed if it's not extremely long
		// Very long conversations (>200 messages) often indicate getting stuck
		return entries.length < 200;
	}

	private generateProjectProfiles(
		insights: ConversationLengthInsight[],
	): ProjectLengthProfile[] {
		const projectGroups = new Map<string, ConversationLengthInsight[]>();

		for (const insight of insights) {
			if (!projectGroups.has(insight.project)) {
				projectGroups.set(insight.project, []);
			}
			projectGroups.get(insight.project)!.push(insight);
		}

		const profiles: ProjectLengthProfile[] = [];

		for (const [project, projectInsights] of projectGroups) {
			const profile = this.generateSingleProjectProfile(
				project,
				projectInsights,
			);
			profiles.push(profile);
		}

		return profiles.sort((a, b) => b.totalConversations - a.totalConversations);
	}

	private generateSingleProjectProfile(
		project: string,
		insights: ConversationLengthInsight[],
	): ProjectLengthProfile {
		const totalConversations = insights.length;
		const avgMessageCount =
			insights.reduce((sum, i) => sum + i.messageCount, 0) / totalConversations;
		const avgDuration =
			insights.reduce((sum, i) => sum + i.duration, 0) / totalConversations;
		const avgTokens =
			insights.reduce((sum, i) => sum + i.tokenCount, 0) / totalConversations;

		const efficiencyByLength = this.calculateEfficiencyByLength(insights);
		const optimalRange = this.calculateProjectOptimalRange(
			insights,
			efficiencyByLength,
		);
		const recommendations = this.generateProjectRecommendations(
			project,
			insights,
			efficiencyByLength,
			optimalRange,
		);

		return {
			project,
			totalConversations,
			avgMessageCount,
			avgDuration,
			avgTokens,
			optimalRange,
			efficiencyByLength,
			recommendations,
		};
	}

	private calculateEfficiencyByLength(insights: ConversationLengthInsight[]) {
		const groups = {
			quick: insights.filter((i) => i.lengthCategory === "quick"),
			medium: insights.filter((i) => i.lengthCategory === "medium"),
			deep: insights.filter((i) => i.lengthCategory === "deep"),
			marathon: insights.filter((i) => i.lengthCategory === "marathon"),
		};

		const result = {} as any;

		for (const [category, items] of Object.entries(groups)) {
			const count = items.length;
			const avgEfficiency =
				count > 0 ? items.reduce((sum, i) => sum + i.efficiency, 0) / count : 0;
			const successRate =
				count > 0
					? items.filter((i) => i.successIndicators.topicResolved).length /
						count
					: 0;

			result[category] = { count, avgEfficiency, successRate };
		}

		return result;
	}

	private calculateProjectOptimalRange(
		insights: ConversationLengthInsight[],
		efficiencyByLength: any,
	): {
		minMessages: number;
		maxMessages: number;
		explanation: string;
	} {
		// Find the length category with highest success rate and good efficiency
		const categories = ["quick", "medium", "deep", "marathon"];
		let bestCategory = "medium";
		let bestScore = 0;

		for (const category of categories) {
			const data = efficiencyByLength[category];
			if (data.count === 0) continue;

			// Score combines success rate and efficiency (weighted toward success)
			const score = data.successRate * 0.7 + (data.avgEfficiency / 1000) * 0.3;
			if (score > bestScore) {
				bestScore = score;
				bestCategory = category;
			}
		}

		const ranges = {
			quick: {
				min: 1,
				max: 5,
				explanation: "Quick, focused questions work best for this project",
			},
			medium: {
				min: 6,
				max: 20,
				explanation: "Medium-length conversations provide good balance",
			},
			deep: {
				min: 21,
				max: 100,
				explanation: "Deep exploration conversations are most effective",
			},
			marathon: {
				min: 101,
				max: 500,
				explanation: "Complex problems require extended conversations",
			},
		};

		const range = ranges[bestCategory as keyof typeof ranges];
		return {
			minMessages: range.min,
			maxMessages: range.max,
			explanation: range.explanation,
		};
	}

	private generateProjectRecommendations(
		project: string,
		insights: ConversationLengthInsight[],
		efficiencyByLength: any,
		optimalRange: any,
	): string[] {
		const recommendations: string[] = [];

		// Check if user has too many marathon conversations
		const marathonRate = efficiencyByLength.marathon.count / insights.length;
		if (marathonRate > 0.2) {
			recommendations.push(
				`Break down complex tasks into smaller conversations`,
			);
		}

		// Check success rates
		const categoryOrder = { quick: 1, medium: 2, deep: 3, marathon: 4 };
		const bestCategory = Object.entries(efficiencyByLength)
			.filter(([_, data]: [string, any]) => data.count > 0)
			.sort(([categoryA, a], [categoryB, b]) => {
				const successDiff = (b as any).successRate - (a as any).successRate;
				if (Math.abs(successDiff) < 0.01) {
					// If success rates are very close, prefer longer conversations (higher order)
					return (categoryOrder as any)[categoryB] - (categoryOrder as any)[categoryA];
				}
				return successDiff;
			})[0];

		if (bestCategory) {
			const [category, data] = bestCategory as [string, any];
			if (data.successRate > 0.8) {
				recommendations.push(
					`${category} conversations work well for ${project} - consider this approach more often`,
				);
			}
		}

		// Check efficiency
		const avgEfficiency =
			insights.reduce((sum, i) => sum + i.efficiency, 0) / insights.length;
		if (avgEfficiency < 100) {
			recommendations.push(
				`Consider being more focused in ${project} conversations to improve efficiency`,
			);
		}

		return recommendations;
	}

	private calculateOptimalRange(insights: ConversationLengthInsight[]): {
		minMessages: number;
		maxMessages: number;
		explanation: string;
	} {
		// Calculate overall optimal range based on success rates
		const successByLength = insights.reduce(
			(acc, insight) => {
				const category = insight.lengthCategory;
				if (!acc[category]) {
					acc[category] = { total: 0, successful: 0 };
				}
				acc[category].total++;
				if (insight.successIndicators.topicResolved) {
					acc[category].successful++;
				}
				return acc;
			},
			{} as Record<string, { total: number; successful: number }>,
		);

		let bestCategory = "medium";
		let bestSuccessRate = 0;

		for (const [category, data] of Object.entries(successByLength)) {
			const successRate = data.successful / data.total;
			if (successRate > bestSuccessRate) {
				bestSuccessRate = successRate;
				bestCategory = category;
			}
		}

		const ranges = {
			quick: {
				min: 1,
				max: 5,
				explanation:
					"Quick, focused questions tend to be most effective overall",
			},
			medium: {
				min: 6,
				max: 20,
				explanation:
					"Medium-length conversations provide the best balance of depth and efficiency",
			},
			deep: {
				min: 21,
				max: 100,
				explanation: "Deep exploration is most effective for complex problems",
			},
			marathon: {
				min: 101,
				max: 500,
				explanation: "Extended conversations needed for very complex topics",
			},
		};

		const range = ranges[bestCategory as keyof typeof ranges];
		return {
			minMessages: range.min,
			maxMessages: range.max,
			explanation: range.explanation,
		};
	}

	private calculateLengthDistribution(insights: ConversationLengthInsight[]): {
		quick: number;
		medium: number;
		deep: number;
		marathon: number;
	} {
		const total = insights.length;
		if (total === 0) {
			return { quick: 0, medium: 0, deep: 0, marathon: 0 };
		}

		const counts = insights.reduce(
			(acc, insight) => {
				acc[insight.lengthCategory]++;
				return acc;
			},
			{ quick: 0, medium: 0, deep: 0, marathon: 0 },
		);

		return {
			quick: counts.quick / total,
			medium: counts.medium / total,
			deep: counts.deep / total,
			marathon: counts.marathon / total,
		};
	}

	private generateInsights(
		insights: ConversationLengthInsight[],
		projectProfiles: ProjectLengthProfile[],
	): string[] {
		const generatedInsights: string[] = [];

		if (insights.length === 0) {
			return generatedInsights;
		}

		// Overall patterns
		const avgMessageCount =
			insights.reduce((sum, i) => sum + i.messageCount, 0) / insights.length;
		generatedInsights.push(
			`Your average conversation length is ${Math.round(avgMessageCount)} messages`,
		);

		// Success patterns
		const successfulConversations = insights.filter(
			(i) => i.successIndicators.topicResolved,
		);
		if (successfulConversations.length === 0) {
			return generatedInsights;
		}
		const avgSuccessfulLength =
			successfulConversations.reduce((sum, i) => sum + i.messageCount, 0) /
			successfulConversations.length;

		if (avgSuccessfulLength < avgMessageCount) {
			generatedInsights.push(
				`Your most successful conversations average ${Math.round(avgSuccessfulLength)} messages - shorter than average`,
			);
		} else {
			generatedInsights.push(
				`Your most successful conversations average ${Math.round(avgSuccessfulLength)} messages - you benefit from deeper exploration`,
			);
		}

		// Project-specific insights
		if (projectProfiles.length > 0) {
			const mostEfficientProject = projectProfiles.reduce((best, current) => {
				const bestEfficiency =
					best.efficiencyByLength.medium.avgEfficiency || 0;
				const currentEfficiency =
					current.efficiencyByLength.medium.avgEfficiency || 0;
				return currentEfficiency > bestEfficiency ? current : best;
			}, projectProfiles[0]);

			if (mostEfficientProject) {
				generatedInsights.push(
					`${mostEfficientProject.project} shows your highest conversation efficiency`,
				);
			}
		}

		return generatedInsights;
	}

	private generateRecommendations(
		insights: ConversationLengthInsight[],
		projectProfiles: ProjectLengthProfile[],
	): string[] {
		const recommendations: string[] = [];

		// Marathon conversation check
		const marathonConversations = insights.filter(
			(i) => i.lengthCategory === "marathon",
		);
		if (marathonConversations.length >= insights.length * 0.1) {
			recommendations.push(
				"Consider breaking down complex problems into multiple focused conversations",
			);
		}

		// Quick follow-up pattern
		const hasQuickFollowUps = insights.filter(
			(i) => i.successIndicators.hasQuickFollowUp,
		);
		if (hasQuickFollowUps.length >= insights.length * 0.3) {
			recommendations.push(
				"Many conversations require quick follow-ups - try being more thorough in initial conversations",
			);
		}

		// Efficiency recommendations
		const lowEfficiencyConversations = insights.filter(
			(i) => i.efficiency < 50,
		);
		if (lowEfficiencyConversations.length >= insights.length * 0.2) {
			recommendations.push(
				"Focus conversations with specific questions to improve time efficiency",
			);
		}

		// Project-specific recommendations
		const projectsWithLowSuccess = projectProfiles.filter((p) => {
			const overallSuccess =
				Object.values(p.efficiencyByLength).reduce(
					(sum, cat) => sum + cat.successRate * cat.count,
					0,
				) / p.totalConversations;
			return overallSuccess < 0.6;
		});

		for (const project of projectsWithLowSuccess) {
			recommendations.push(
				`Consider adjusting approach for ${project.project} - success rate could be improved`,
			);
		}

		return recommendations;
	}
}
