import { calculateCost } from "./analyzer.js";
import type { UsageEntry } from "./types.js";

export interface ConversationLengthPattern {
	lengthCategory: "short" | "medium" | "long" | "extended";
	messageCount: number;
	avgTokensPerMessage: number;
	avgCostPerMessage: number;
	efficiency: number;
	frequency: number;
	trendDirection: "increasing" | "decreasing" | "stable";
}

export interface TimeToCompletionAnalysis {
	taskType: string;
	avgCompletionTime: number; // in minutes
	medianCompletionTime: number;
	successRate: number;
	efficiencyTrend: "improving" | "declining" | "stable";
	optimalSessionLength: number;
	recommendations: string[];
}

export interface TaskSwitchingPattern {
	switchFrequency: number; // switches per day
	avgTimeBetweenSwitches: number; // in minutes
	costOfSwitching: number; // overhead cost
	mostCommonTransitions: Array<{
		from: string;
		to: string;
		frequency: number;
		avgGapTime: number;
	}>;
	recommendations: string[];
}

export interface LearningCurveAnalysis {
	skillArea: string;
	initialEfficiency: number;
	currentEfficiency: number;
	improvementRate: number; // % per week
	plateauDetected: boolean;
	timeToCompetency: number; // days
	costToCompetency: number;
	learningPhase: "novice" | "developing" | "competent" | "expert";
	nextMilestone: string;
}

export interface UsagePattern {
	patternType:
		| "peak_hours"
		| "model_preference"
		| "cost_sensitivity"
		| "efficiency_cycles";
	description: string;
	strength: number; // 0-1 confidence
	impact: "low" | "medium" | "high";
	actionable: boolean;
	recommendation?: string;
}

interface TaskSwitchingData {
	conversationId: string;
	taskType: string;
	startTime: Date;
	endTime: Date;
	cost: number;
}

interface ConversationData {
	conversationId: string;
	startTime: Date;
	efficiency: number;
	cost: number;
	success: boolean;
}

interface TransitionData {
	from: string;
	to: string;
	frequency: number;
	avgGapTime: number;
}

export class PatternAnalyzer {
	analyzeConversationLengthPatterns(entries: UsageEntry[]) {
		const conversations = this.groupByConversation(entries);
		
		// Categorize conversations
		const quickQuestions: string[] = [];
		const detailedDiscussions: string[] = [];
		const deepDives: string[] = [];
		
		const lengthTotals = {
			quickQuestions: 0,
			detailedDiscussions: 0,
			deepDives: 0
		};
		
		const costTotals = {
			quickQuestions: { avgCost: 0, totalCost: 0 },
			detailedDiscussions: { avgCost: 0, totalCost: 0 },
			deepDives: { avgCost: 0, totalCost: 0 }
		};

		for (const [conversationId, convEntries] of conversations) {
			const messageCount = convEntries.length;
			const totalCost = convEntries.reduce((sum, e) => sum + calculateCost(e), 0);
			
			if (messageCount <= 2) {
				quickQuestions.push(conversationId);
				lengthTotals.quickQuestions += messageCount;
				costTotals.quickQuestions.totalCost += totalCost;
			} else if (messageCount <= 8) {
				detailedDiscussions.push(conversationId);
				lengthTotals.detailedDiscussions += messageCount;
				costTotals.detailedDiscussions.totalCost += totalCost;
			} else {
				deepDives.push(conversationId);
				lengthTotals.deepDives += messageCount;
				costTotals.deepDives.totalCost += totalCost;
			}
		}

		// Calculate averages
		const avgLengthByType = {
			quickQuestions: quickQuestions.length > 0 ? lengthTotals.quickQuestions / quickQuestions.length : 0,
			detailedDiscussions: detailedDiscussions.length > 0 ? lengthTotals.detailedDiscussions / detailedDiscussions.length : 0,
			deepDives: deepDives.length > 0 ? lengthTotals.deepDives / deepDives.length : 0
		};

		// Calculate cost distributions
		const costDistribution = {
			quickQuestions: {
				avgCost: quickQuestions.length > 0 ? costTotals.quickQuestions.totalCost / quickQuestions.length : 0,
				totalCost: costTotals.quickQuestions.totalCost
			},
			detailedDiscussions: {
				avgCost: detailedDiscussions.length > 0 ? costTotals.detailedDiscussions.totalCost / detailedDiscussions.length : 0,
				totalCost: costTotals.detailedDiscussions.totalCost
			},
			deepDives: {
				avgCost: deepDives.length > 0 ? costTotals.deepDives.totalCost / deepDives.length : 0,
				totalCost: costTotals.deepDives.totalCost
			}
		};

		// Generate efficiency insights
		const totalTokens = entries.reduce((sum, e) => sum + e.total_tokens, 0);
		const totalExchanges = Array.from(conversations.values()).reduce((sum, conv) => sum + conv.length, 0);
		const avgTokensPerExchange = totalExchanges > 0 ? totalTokens / totalExchanges : 0;

		// Determine most/least efficient types
		const efficiencies = [
			{ type: 'quickQuestions', efficiency: avgLengthByType.quickQuestions > 0 ? costTotals.quickQuestions.totalCost / (avgLengthByType.quickQuestions * quickQuestions.length || 1) : 0 },
			{ type: 'detailedDiscussions', efficiency: avgLengthByType.detailedDiscussions > 0 ? costTotals.detailedDiscussions.totalCost / (avgLengthByType.detailedDiscussions * detailedDiscussions.length || 1) : 0 },
			{ type: 'deepDives', efficiency: avgLengthByType.deepDives > 0 ? costTotals.deepDives.totalCost / (avgLengthByType.deepDives * deepDives.length || 1) : 0 }
		].filter(e => e.efficiency > 0);

		const mostEfficientType = efficiencies.length > 0 ? efficiencies.reduce((min, curr) => curr.efficiency < min.efficiency ? curr : min).type : 'quickQuestions';
		const leastEfficientType = efficiencies.length > 0 ? efficiencies.reduce((max, curr) => curr.efficiency > max.efficiency ? curr : max).type : 'deepDives';

		const efficiencyInsights = {
			mostEfficientType,
			leastEfficientType,
			avgTokensPerExchange
		};

		// Generate recommendations
		const recommendations = [];
		if (deepDives.length > conversations.size * 0.3) {
			recommendations.push('Consider breaking down complex tasks into smaller conversations');
		}
		if (quickQuestions.length > conversations.size * 0.5) {
			recommendations.push('Quick questions are efficient - continue this pattern');
		}
		if (avgTokensPerExchange < 1000) {
			recommendations.push('Consider asking more comprehensive questions to get fuller responses');
		}

		return {
			conversationTypes: {
				quickQuestions: { count: quickQuestions.length },
				detailedDiscussions: { count: detailedDiscussions.length },
				deepDives: { count: deepDives.length }
			},
			avgLengthByType,
			costDistribution,
			efficiencyInsights,
			recommendations
		};
	}

	analyzeTimeToCompletion(entries: UsageEntry[]): TimeToCompletionAnalysis[] {
		const conversations = this.groupByConversation(entries);
		const taskTypes = new Map<
			string,
			Array<{
				completionTime: number;
				success: boolean;
				cost: number;
				tokens: number;
			}>
		>();

		for (const [_, convEntries] of conversations) {
			const taskType = this.inferTaskType(convEntries);
			const completionTime = this.calculateCompletionTime(convEntries);
			const success = this.inferTaskSuccess(convEntries);
			const cost = convEntries.reduce((sum, e) => sum + calculateCost(e), 0);
			const tokens = convEntries.reduce((sum, e) => sum + e.total_tokens, 0);

			if (!taskTypes.has(taskType)) {
				taskTypes.set(taskType, []);
			}

			taskTypes.get(taskType)?.push({
				completionTime,
				success,
				cost,
				tokens,
			});
		}

		const analyses: TimeToCompletionAnalysis[] = [];

		for (const [taskType, data] of taskTypes) {
			if (data.length < 3) continue; // Need enough data

			const completionTimes = data.map((d) => d.completionTime);
			const successRate = data.filter((d) => d.success).length / data.length;

			const avgCompletionTime =
				completionTimes.reduce((sum, t) => sum + t, 0) / completionTimes.length;
			const medianCompletionTime = this.calculateMedian(completionTimes);
			const efficiencyTrend = this.calculateEfficiencyTrend(data);
			const optimalSessionLength = this.findOptimalSessionLength(data);

			analyses.push({
				taskType,
				avgCompletionTime,
				medianCompletionTime,
				successRate,
				efficiencyTrend,
				optimalSessionLength,
				recommendations: this.generateCompletionRecommendations(taskType, {
					avgCompletionTime,
					successRate,
					efficiencyTrend,
				}),
			});
		}

		return analyses.sort((a, b) => b.successRate - a.successRate);
	}

	analyzeTaskSwitchingPatterns(entries: UsageEntry[]): TaskSwitchingPattern {
		const conversations = this.groupByConversation(entries);
		const sortedConversations = Array.from(conversations.entries())
			.map(([id, convEntries]) => {
				try {
					return {
						conversationId: id,
						taskType: this.inferTaskType(convEntries),
						startTime: new Date(convEntries[0].timestamp),
						endTime: new Date(convEntries[convEntries.length - 1].timestamp),
						cost: convEntries.reduce((sum, e) => sum + calculateCost(e), 0),
					};
				} catch (error) {
					// Return null for invalid timestamps, filter out later
					return null;
				}
			})
			.filter((conv): conv is NonNullable<typeof conv> => conv !== null)
			.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

		// Calculate switching metrics
		const switches = [];
		let totalSwitchingCost = 0;

		for (let i = 1; i < sortedConversations.length; i++) {
			const prev = sortedConversations[i - 1];
			const curr = sortedConversations[i];

			if (prev.taskType !== curr.taskType) {
				const gapTime =
					(curr.startTime.getTime() - prev.endTime.getTime()) / (1000 * 60); // minutes
				switches.push({
					from: prev.taskType,
					to: curr.taskType,
					gapTime,
					switchingCost: this.estimateSwitchingCost(prev, curr),
				});
				totalSwitchingCost += switches[switches.length - 1].switchingCost;
			}
		}

		// Analyze transition patterns
		const transitionMap = new Map<string, Array<{ gapTime: number }>>();
		for (const sw of switches) {
			const key = `${sw.from}->${sw.to}`;
			if (!transitionMap.has(key)) {
				transitionMap.set(key, []);
			}
			transitionMap.get(key)?.push({ gapTime: sw.gapTime });
		}

		const mostCommonTransitions = Array.from(transitionMap.entries())
			.map(([transition, data]) => {
				const [from, to] = transition.split("->");
				return {
					from,
					to,
					frequency: data.length,
					avgGapTime: data.reduce((sum, d) => sum + d.gapTime, 0) / data.length,
				};
			})
			.sort((a, b) => b.frequency - a.frequency)
			.slice(0, 5);

		// Handle case with insufficient data
		if (sortedConversations.length < 2) {
			return {
				switchFrequency: 0,
				avgTimeBetweenSwitches: 0,
				costOfSwitching: 0,
				mostCommonTransitions: [],
				recommendations: ["Need more conversation data to analyze task switching patterns"],
			};
		}

		const totalDays = Math.max(
			1,
			(sortedConversations[sortedConversations.length - 1].startTime.getTime() -
				sortedConversations[0].startTime.getTime()) /
				(1000 * 60 * 60 * 24),
		);

		// Calculate average time between all conversations (not just switches)
		let totalGapTime = 0;
		for (let i = 1; i < sortedConversations.length; i++) {
			const prev = sortedConversations[i - 1];
			const curr = sortedConversations[i];
			const gapTime = (curr.startTime.getTime() - prev.endTime.getTime()) / (1000 * 60); // minutes
			totalGapTime += gapTime;
		}
		
		const avgTimeBetweenConversations = sortedConversations.length > 1 
			? totalGapTime / (sortedConversations.length - 1)
			: 0;

		return {
			switchFrequency: switches.length / totalDays,
			avgTimeBetweenSwitches: avgTimeBetweenConversations,
			costOfSwitching: totalSwitchingCost,
			mostCommonTransitions,
			recommendations: this.generateSwitchingRecommendations(
				switches.length / totalDays,
				mostCommonTransitions,
			),
		};
	}

	analyzeLearningCurve(
		entries: UsageEntry[],
		skillArea = "coding",
	): LearningCurveAnalysis {
		const relevantConversations = this.filterBySkillArea(entries, skillArea);
		const conversations = this.groupByConversation(relevantConversations);

		// Sort conversations by time
		const sortedConversations = Array.from(conversations.entries())
			.map(([id, convEntries]) => ({
				conversationId: id,
				startTime: new Date(convEntries[0].timestamp),
				efficiency:
					convEntries.reduce((sum, e) => sum + e.total_tokens, 0) /
					Math.max(
						convEntries.reduce((sum, e) => sum + calculateCost(e), 0),
						0.001,
					),
				cost: convEntries.reduce((sum, e) => sum + calculateCost(e), 0),
				success: this.inferTaskSuccess(convEntries),
			}))
			.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

		if (sortedConversations.length < 5) {
			return this.createDefaultLearningAnalysis(skillArea);
		}

		// Calculate learning metrics
		const early = sortedConversations.slice(
			0,
			Math.ceil(sortedConversations.length * 0.2),
		);
		const recent = sortedConversations.slice(
			-Math.ceil(sortedConversations.length * 0.2),
		);

		const initialEfficiency =
			early.reduce((sum, c) => sum + c.efficiency, 0) / early.length;
		const currentEfficiency =
			recent.reduce((sum, c) => sum + c.efficiency, 0) / recent.length;

		const timeSpan =
			(sortedConversations[sortedConversations.length - 1].startTime.getTime() -
				sortedConversations[0].startTime.getTime()) /
			(1000 * 60 * 60 * 24 * 7); // weeks

		const improvementRate =
			timeSpan > 0
				? (((currentEfficiency - initialEfficiency) / initialEfficiency) *
						100) /
					timeSpan
				: 0;

		// Detect plateau
		const recentTrend = this.calculateRecentEfficiencyTrend(
			sortedConversations.slice(-10),
		);
		const plateauDetected = Math.abs(recentTrend) < 0.05; // Less than 5% change

		const learningPhase = this.determineLearningPhase(
			currentEfficiency,
			improvementRate,
			sortedConversations.length,
		);

		return {
			skillArea,
			initialEfficiency,
			currentEfficiency,
			improvementRate,
			plateauDetected,
			timeToCompetency: this.estimateTimeToCompetency(
				improvementRate,
				currentEfficiency,
			),
			costToCompetency: this.estimateCostToCompetency(sortedConversations),
			learningPhase,
			nextMilestone: this.suggestNextMilestone(
				learningPhase,
				currentEfficiency,
			),
		};
	}

	identifyUsagePatterns(entries: UsageEntry[]): UsagePattern[] {
		const patterns: UsagePattern[] = [];

		// Peak hours pattern
		const hourlyUsage = this.analyzeHourlyDistribution(entries);
		const peakHoursPattern = this.detectPeakHoursPattern(hourlyUsage);
		if (peakHoursPattern) patterns.push(peakHoursPattern);

		// Model preference pattern
		const modelPreference = this.analyzeModelPreference(entries);
		if (modelPreference) patterns.push(modelPreference);

		// Cost sensitivity pattern
		const costSensitivity = this.analyzeCostSensitivity(entries);
		if (costSensitivity) patterns.push(costSensitivity);

		// Efficiency cycles pattern
		const efficiencyCycles = this.detectEfficiencyCycles(entries);
		if (efficiencyCycles) patterns.push(efficiencyCycles);

		return patterns.sort((a, b) => b.strength - a.strength);
	}

	// Private helper methods
	private groupByConversation(
		entries: UsageEntry[],
	): Map<string, UsageEntry[]> {
		const conversations = new Map<string, UsageEntry[]>();
		for (const entry of entries) {
			if (!conversations.has(entry.conversationId)) {
				conversations.set(entry.conversationId, []);
			}
			conversations.get(entry.conversationId)?.push(entry);
		}
		return conversations;
	}

	private categorizeConversationLength(messageCount: number): string {
		if (messageCount <= 5) return "short";
		if (messageCount <= 15) return "medium";
		if (messageCount <= 30) return "long";
		return "extended";
	}

	private calculateLengthTrend(
		entries: UsageEntry[],
		category: string,
	): "increasing" | "decreasing" | "stable" {
		// Simple trend analysis - compare recent vs historical conversation lengths
		const now = new Date();
		const recentCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // Last 2 weeks

		const recent = entries.filter((e) => new Date(e.timestamp) >= recentCutoff);
		const historical = entries.filter(
			(e) => new Date(e.timestamp) < recentCutoff,
		);

		const recentConversations = this.groupByConversation(recent);
		const historicalConversations = this.groupByConversation(historical);

		const recentAvgLength =
			Array.from(recentConversations.values())
				.filter(
					(conv) => this.categorizeConversationLength(conv.length) === category,
				)
				.reduce((sum, conv) => sum + conv.length, 0) /
			Math.max(recentConversations.size, 1);

		const historicalAvgLength =
			Array.from(historicalConversations.values())
				.filter(
					(conv) => this.categorizeConversationLength(conv.length) === category,
				)
				.reduce((sum, conv) => sum + conv.length, 0) /
			Math.max(historicalConversations.size, 1);

		const change =
			(recentAvgLength - historicalAvgLength) /
			Math.max(historicalAvgLength, 1);

		if (change > 0.2) return "increasing";
		if (change < -0.2) return "decreasing";
		return "stable";
	}

	private inferTaskType(entries: UsageEntry[]): string {
		const avgTokens =
			entries.reduce((sum, e) => sum + e.total_tokens, 0) / entries.length;
		const conversationLength = entries.length;
		const avgPromptTokens = entries.reduce((sum, e) => sum + e.prompt_tokens, 0) / entries.length;

		// Use conversation ID as a hint for task type to ensure different classifications
		const conversationId = entries[0]?.conversationId || "";
		
		// More granular classification for better task switching detection
		if (conversationId.includes("coding")) return "coding_task";
		if (conversationId.includes("writing")) return "writing_task";
		if (conversationId.includes("analysis")) return "analysis_task";
		if (conversationId.includes("question")) return "query_task";
		
		// Fallback to token-based classification
		if (conversationLength > 15 && avgTokens > 3000) return "complex_coding";
		if (avgTokens > 4000) return "analysis";
		if (avgTokens > 2500) return "research";
		if (conversationLength > 20) return "debugging";
		if (avgTokens < 1000) return "simple_query";
		if (avgPromptTokens > 1500) return "detailed_coding";
		return "general_coding";
	}

	private calculateCompletionTime(entries: UsageEntry[]): number {
		if (entries.length < 2) return 0;
		const start = new Date(entries[0].timestamp);
		const end = new Date(entries[entries.length - 1].timestamp);
		return (end.getTime() - start.getTime()) / (1000 * 60); // minutes
	}

	private inferTaskSuccess(entries: UsageEntry[]): boolean {
		// Heuristic: shorter conversations with reasonable token usage suggest success
		const avgTokens =
			entries.reduce((sum, e) => sum + e.total_tokens, 0) / entries.length;
		const conversationLength = entries.length;

		// Success indicators: moderate length, good token efficiency
		return (
			conversationLength >= 3 && conversationLength <= 25 && avgTokens > 1000
		);
	}

	private calculateMedian(numbers: number[]): number {
		const sorted = [...numbers].sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);
		return sorted.length % 2 === 0
			? (sorted[mid - 1] + sorted[mid]) / 2
			: sorted[mid];
	}

	private calculateEfficiencyTrend(
		data: Array<{ completionTime: number; tokens: number; cost: number }>,
	): "improving" | "declining" | "stable" {
		if (data.length < 5) return "stable";

		const efficiencies = data.map((d) => d.tokens / Math.max(d.cost, 0.001));
		const first = efficiencies.slice(0, Math.ceil(efficiencies.length / 2));
		const second = efficiencies.slice(Math.floor(efficiencies.length / 2));

		const firstAvg = first.reduce((sum, e) => sum + e, 0) / first.length;
		const secondAvg = second.reduce((sum, e) => sum + e, 0) / second.length;

		const change = (secondAvg - firstAvg) / firstAvg;

		if (change > 0.15) return "improving";
		if (change < -0.15) return "declining";
		return "stable";
	}

	private findOptimalSessionLength(
		data: Array<{ completionTime: number; success: boolean; cost: number }>,
	): number {
		// Find completion time that maximizes success rate
		const successful = data.filter((d) => d.success);
		if (successful.length === 0) return 30; // Default 30 minutes

		const avgSuccessfulTime =
			successful.reduce((sum, d) => sum + d.completionTime, 0) /
			successful.length;
		return Math.round(avgSuccessfulTime);
	}

	private generateCompletionRecommendations(
		taskType: string,
		metrics: {
			avgCompletionTime: number;
			successRate: number;
			efficiencyTrend: string;
		},
	): string[] {
		const recommendations: string[] = [];

		if (metrics.successRate < 0.7) {
			recommendations.push(
				`${taskType}: Break down tasks into smaller chunks (success rate: ${(metrics.successRate * 100).toFixed(0)}%)`,
			);
		}

		if (metrics.avgCompletionTime > 120) {
			recommendations.push(
				`${taskType}: Consider time-boxing sessions to 2 hours max`,
			);
		}

		if (metrics.efficiencyTrend === "declining") {
			recommendations.push(
				`${taskType}: Efficiency declining - review approach or take breaks`,
			);
		}

		return recommendations;
	}

	private estimateSwitchingCost(prev: TaskSwitchingData, curr: TaskSwitchingData): number {
		// Estimate context switching overhead
		const gapTime =
			(curr.startTime.getTime() - prev.endTime.getTime()) / (1000 * 60 * 60); // hours

		// Shorter gaps suggest more expensive context switching
		if (gapTime < 0.5) return 0.1; // High switching cost
		if (gapTime < 2) return 0.05; // Medium switching cost
		return 0.01; // Low switching cost
	}

	private generateSwitchingRecommendations(
		switchFrequency: number,
		transitions: TransitionData[],
	): string[] {
		const recommendations: string[] = [];

		if (switchFrequency > 3) {
			recommendations.push(
				"High task switching detected - consider batching similar tasks",
			);
		} else if (switchFrequency < 1) {
			recommendations.push(
				"Good focused work patterns detected - maintain concentrated effort on similar tasks",
			);
		}

		const mostCommon = transitions[0];
		if (mostCommon && mostCommon.frequency > 3) {
			recommendations.push(
				`Frequent ${mostCommon.from}→${mostCommon.to} transitions - consider dedicated time blocks`,
			);
		}

		return recommendations;
	}

	private filterBySkillArea(
		entries: UsageEntry[],
		_skillArea: string,
	): UsageEntry[] {
		// Simple filter - in practice this would be more sophisticated
		return entries; // For now, return all entries
	}

	private createDefaultLearningAnalysis(
		skillArea: string,
	): LearningCurveAnalysis {
		return {
			skillArea,
			initialEfficiency: 0,
			currentEfficiency: 0,
			improvementRate: 0,
			plateauDetected: false,
			timeToCompetency: 0,
			costToCompetency: 0,
			learningPhase: "novice",
			nextMilestone: "Complete 10 successful coding conversations",
		};
	}

	private calculateRecentEfficiencyTrend(conversations: ConversationData[]): number {
		if (conversations.length < 3) return 0;

		const first = conversations.slice(0, Math.ceil(conversations.length / 2));
		const second = conversations.slice(Math.floor(conversations.length / 2));

		const firstAvg =
			first.reduce((sum, c) => sum + c.efficiency, 0) / first.length;
		const secondAvg =
			second.reduce((sum, c) => sum + c.efficiency, 0) / second.length;

		return (secondAvg - firstAvg) / firstAvg;
	}

	private determineLearningPhase(
		efficiency: number,
		improvementRate: number,
		conversationCount: number,
	): LearningCurveAnalysis["learningPhase"] {
		if (conversationCount < 10) return "novice";
		if (efficiency < 5000 || improvementRate > 20) return "developing";
		if (efficiency < 10000 || improvementRate > 5) return "competent";
		return "expert";
	}

	private estimateTimeToCompetency(
		improvementRate: number,
		currentEfficiency: number,
	): number {
		const targetEfficiency = 8000; // Tokens per dollar
		if (currentEfficiency >= targetEfficiency) return 0;
		if (improvementRate <= 0) return 365; // Default 1 year

		const weeksNeeded =
			(targetEfficiency - currentEfficiency) /
			((currentEfficiency * improvementRate) / 100);
		return Math.ceil(weeksNeeded * 7); // Convert to days
	}

	private estimateCostToCompetency(conversations: ConversationData[]): number {
		const avgCostPerConversation =
			conversations.reduce((sum, c) => sum + c.cost, 0) / conversations.length;
		const conversationsPerWeek =
			conversations.length /
			Math.max(
				1,
				(conversations[conversations.length - 1].startTime.getTime() -
					conversations[0].startTime.getTime()) /
					(1000 * 60 * 60 * 24 * 7),
			);

		return avgCostPerConversation * conversationsPerWeek * 12; // 12 weeks to competency
	}

	private suggestNextMilestone(phase: string, _efficiency: number): string {
		switch (phase) {
			case "novice":
				return "Achieve 5000 tokens per dollar efficiency";
			case "developing":
				return "Complete 25 successful coding conversations";
			case "competent":
				return "Achieve 10000 tokens per dollar efficiency";
			case "expert":
				return "Mentor others and optimize workflows";
			default:
				return "Continue improving";
		}
	}

	private analyzeHourlyDistribution(
		entries: UsageEntry[],
	): Map<number, number> {
		const hourlyMap = new Map<number, number>();

		for (const entry of entries) {
			const hour = new Date(entry.timestamp).getHours();
			const cost = calculateCost(entry);
			hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + cost);
		}

		return hourlyMap;
	}

	private detectPeakHoursPattern(
		hourlyUsage: Map<number, number>,
	): UsagePattern | null {
		const hours = Array.from(hourlyUsage.entries()).sort((a, b) => b[1] - a[1]);
		const topHours = hours.slice(0, 3).map((h) => h[0]);

		// Check if there's a clear peak pattern
		const totalUsage = Array.from(hourlyUsage.values()).reduce(
			(sum, usage) => sum + usage,
			0,
		);
		const topHoursUsage = hours.slice(0, 3).reduce((sum, h) => sum + h[1], 0);

		if (topHoursUsage / totalUsage > 0.5) {
			// 50% of usage in top 3 hours
			return {
				patternType: "peak_hours",
				description: `Peak usage hours: ${topHours.join(", ")}:00`,
				strength: topHoursUsage / totalUsage,
				impact: "medium",
				actionable: true,
				recommendation:
					"Consider batch processing during peak hours for better efficiency",
			};
		}

		return null;
	}

	private analyzeModelPreference(entries: UsageEntry[]): UsagePattern | null {
		const modelUsage = new Map<string, number>();

		for (const entry of entries) {
			const cost = calculateCost(entry);
			modelUsage.set(entry.model, (modelUsage.get(entry.model) || 0) + cost);
		}

		const totalCost = Array.from(modelUsage.values()).reduce(
			(sum, cost) => sum + cost,
			0,
		);
		const opusCost = modelUsage.get("claude-opus-4-20250514") || 0;
		const opusPercentage = opusCost / totalCost;

		if (opusPercentage > 0.7) {
			return {
				patternType: "model_preference",
				description: `Strong preference for Opus (${(opusPercentage * 100).toFixed(0)}% of spend)`,
				strength: opusPercentage,
				impact: "high",
				actionable: true,
				recommendation:
					"Consider using Sonnet for simpler tasks to reduce costs",
			};
		}

		return null;
	}

	private analyzeCostSensitivity(entries: UsageEntry[]): UsagePattern | null {
		const dailyCosts = this.getDailyCosts(entries);
		const avgDailyCost =
			dailyCosts.reduce((sum, cost) => sum + cost, 0) / dailyCosts.length;

		const variability =
			this.calculateStandardDeviation(dailyCosts) / avgDailyCost;

		if (variability < 0.3) {
			// Low variability suggests cost consciousness
			return {
				patternType: "cost_sensitivity",
				description: "Consistent daily spending suggests cost awareness",
				strength: 1 - variability,
				impact: "medium",
				actionable: false,
			};
		}

		return null;
	}

	private detectEfficiencyCycles(entries: UsageEntry[]): UsagePattern | null {
		const conversations = this.groupByConversation(entries);
		const efficiencies = Array.from(conversations.values()).map((conv) => {
			const cost = conv.reduce((sum, e) => sum + calculateCost(e), 0);
			const tokens = conv.reduce((sum, e) => sum + e.total_tokens, 0);
			return tokens / Math.max(cost, 0.001);
		});

		// Simple cycle detection - look for weekly patterns
		if (efficiencies.length < 14) return null;

		const weeklyAvgs = [];
		for (let i = 0; i < efficiencies.length - 7; i += 7) {
			const weekEfficiencies = efficiencies.slice(i, i + 7);
			const avg =
				weekEfficiencies.reduce((sum, e) => sum + e, 0) /
				weekEfficiencies.length;
			weeklyAvgs.push(avg);
		}

		const variability =
			this.calculateStandardDeviation(weeklyAvgs) /
			(weeklyAvgs.reduce((sum, avg) => sum + avg, 0) / weeklyAvgs.length);

		if (variability > 0.2) {
			return {
				patternType: "efficiency_cycles",
				description: "Weekly efficiency cycles detected",
				strength: variability,
				impact: "medium",
				actionable: true,
				recommendation:
					"Track weekly patterns to optimize high-efficiency periods",
			};
		}

		return null;
	}

	private getDailyCosts(entries: UsageEntry[]): number[] {
		const dailyMap = new Map<string, number>();

		for (const entry of entries) {
			const date = new Date(entry.timestamp).toDateString();
			const cost = calculateCost(entry);
			dailyMap.set(date, (dailyMap.get(date) || 0) + cost);
		}

		return Array.from(dailyMap.values());
	}

	private calculateStandardDeviation(values: number[]): number {
		const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
		const squaredDiffs = values.map((val) => (val - mean) ** 2);
		const avgSquaredDiff =
			squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
		return Math.sqrt(avgSquaredDiff);
	}



	identifyLearningCurves(entries: UsageEntry[]) {
		const conversations = this.groupByConversation(entries);
		const periods: Array<{
			startDate: string;
			endDate: string;
			metrics: {
				avgQuestionsPerDay: number;
				avgComplexityScore: number;
			};
			characteristics: string[];
		}> = [];
		
		// Filter out entries with invalid timestamps and sort by date
		const validEntries = entries.filter(entry => {
			const date = new Date(entry.timestamp);
			return !isNaN(date.getTime());
		});
		
		const sortedEntries = validEntries.sort((a, b) => 
			new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);
		
		if (sortedEntries.length === 0) {
			return { periods: [], overallTrend: 'stable' as const, insights: [] };
		}
		
		// Group by weeks
		const weeklyData = new Map<string, UsageEntry[]>();
		for (const entry of sortedEntries) {
			try {
				const date = new Date(entry.timestamp);
				const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
				const weekKey = weekStart.toISOString().split('T')[0];
				
				if (!weeklyData.has(weekKey)) {
					weeklyData.set(weekKey, []);
				}
				weeklyData.get(weekKey)!.push(entry);
			} catch (error) {
				// Skip entries with invalid timestamps
				continue;
			}
		}
		
		// Analyze each week
		const weeks = Array.from(weeklyData.entries()).sort(([a], [b]) => a.localeCompare(b));
		
		for (const [weekStart, weekEntries] of weeks) {
			const weekConversations = this.groupByConversation(weekEntries);
			const weekEnd = new Date(weekStart);
			weekEnd.setDate(weekEnd.getDate() + 6);
			
			const avgQuestionsPerDay = weekConversations.size / 7;
			const avgComplexityScore = this.calculateAverageComplexity(weekEntries);
			
			const characteristics = [];
			if (avgQuestionsPerDay > 5) characteristics.push('High activity period');
			if (avgComplexityScore > 0.7) characteristics.push('Complex problem solving');
			if (avgComplexityScore < 0.3) characteristics.push('Simple queries');
			if (characteristics.length === 0) characteristics.push('Moderate usage');
			
			periods.push({
				startDate: weekStart,
				endDate: weekEnd.toISOString().split('T')[0],
				metrics: {
					avgQuestionsPerDay,
					avgComplexityScore
				},
				characteristics
			});
		}
		
		// Determine overall trend
		let overallTrend: 'improving' | 'declining' | 'stable' = 'stable';
		if (periods.length >= 2) {
			const firstHalf = periods.slice(0, Math.floor(periods.length / 2));
			const secondHalf = periods.slice(Math.floor(periods.length / 2));
			
			const firstAvgComplexity = firstHalf.reduce((sum, p) => sum + p.metrics.avgComplexityScore, 0) / firstHalf.length;
			const secondAvgComplexity = secondHalf.reduce((sum, p) => sum + p.metrics.avgComplexityScore, 0) / secondHalf.length;
			
			if (secondAvgComplexity > firstAvgComplexity * 1.1) {
				overallTrend = 'improving';
			} else if (secondAvgComplexity < firstAvgComplexity * 0.9) {
				overallTrend = 'declining';
			}
		}
		
		const insights = [
			periods.length > 4 ? 'Sufficient data for trend analysis' : 'Limited data for trends',
			overallTrend === 'improving' ? 'Complexity of tasks is increasing over time' :
			overallTrend === 'declining' ? 'Tasks are becoming simpler over time' :
			'consistent usage patterns maintained'
		];
		
		return {
			periods,
			overallTrend,
			insights
		};
	}





	private calculateAverageComplexity(entries: UsageEntry[]): number {
		if (entries.length === 0) return 0;
		
		const totalTokens = entries.reduce((sum, e) => sum + e.total_tokens, 0);
		const avgTokens = totalTokens / entries.length;
		
		// More granular complexity scoring based on token usage
		const normalizedComplexity = Math.min(avgTokens / 8000, 1.0); // Lower threshold for better sensitivity
		return Math.round(normalizedComplexity * 100) / 100; // Round to 2 decimal places
	}

	private classifyTaskType(entries: UsageEntry[]): string {
		const totalTokens = entries.reduce((sum, e) => sum + e.total_tokens, 0);
		const avgTokens = totalTokens / entries.length;
		const messageCount = entries.length;
		
		if (messageCount <= 2 && avgTokens < 1000) return 'quick-question';
		if (avgTokens > 5000 || messageCount > 10) return 'complex-analysis';
		if (avgTokens > 2000 && messageCount > 3) return 'problem-solving';
		return 'general-assistance';
	}

	private groupTasksByType(conversations: Array<{ id: string; type: string; startTime: number; endTime: number }>) {
		const clusters = new Map<string, { conversationIds: string[]; avgDuration: number; characteristics: string[] }>();
		
		for (const conv of conversations) {
			if (!clusters.has(conv.type)) {
				clusters.set(conv.type, {
					conversationIds: [],
					avgDuration: 0,
					characteristics: []
				});
			}
			
			const cluster = clusters.get(conv.type)!;
			cluster.conversationIds.push(conv.id);
			
			const duration = (conv.endTime - conv.startTime) / (60 * 1000); // minutes
			cluster.avgDuration = (cluster.avgDuration * (cluster.conversationIds.length - 1) + duration) / cluster.conversationIds.length;
		}
		
		// Add characteristics
		for (const [type, cluster] of clusters) {
			cluster.characteristics = [
				`${cluster.conversationIds.length} conversations`,
				`~${Math.round(cluster.avgDuration)} min average duration`,
				type.replace('-', ' ')
			];
		}
		
		return Array.from(clusters.entries()).map(([type, data]) => ({
			type,
			conversationIds: data.conversationIds,
			avgDuration: data.avgDuration,
			characteristics: data.characteristics
		}));
	}

	private calculateLongestFocusedSession(conversations: Array<{ type: string; startTime: number; endTime: number }>): number {
		let maxFocusedDuration = 0;
		let currentFocusedStart = conversations[0]?.startTime || 0;
		let currentType = conversations[0]?.type;
		
		for (let i = 1; i < conversations.length; i++) {
			const conv = conversations[i];
			
			if (conv.type !== currentType) {
				// Focus session ended
				const focusedDuration = (conversations[i - 1].endTime - currentFocusedStart) / (60 * 1000);
				maxFocusedDuration = Math.max(maxFocusedDuration, focusedDuration);
				
				// Start new focus session
				currentFocusedStart = conv.startTime;
				currentType = conv.type;
			}
		}
		
		// Check final session
		if (conversations.length > 0) {
			const lastConv = conversations[conversations.length - 1];
			const focusedDuration = (lastConv.endTime - currentFocusedStart) / (60 * 1000);
			maxFocusedDuration = Math.max(maxFocusedDuration, focusedDuration);
		}
		
		return maxFocusedDuration;
	}
}
