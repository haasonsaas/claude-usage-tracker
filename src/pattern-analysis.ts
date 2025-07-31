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
	analyzeConversationLengthPatterns(
		entries: UsageEntry[],
	): ConversationLengthPattern[] {
		const conversations = this.groupByConversation(entries);
		const patterns = new Map<string, ConversationLengthPattern>();

		for (const [_, convEntries] of conversations) {
			const messageCount = convEntries.length;
			const category = this.categorizeConversationLength(messageCount);

			if (!patterns.has(category)) {
				patterns.set(category, {
					lengthCategory:
						category as ConversationLengthPattern["lengthCategory"],
					messageCount: 0,
					avgTokensPerMessage: 0,
					avgCostPerMessage: 0,
					efficiency: 0,
					frequency: 0,
					trendDirection: "stable",
				});
			}

			const pattern = patterns.get(category);
			if (!pattern) continue;
		const totalTokens = convEntries.reduce(
				(sum, e) => sum + e.total_tokens,
				0,
			);
			const totalCost = convEntries.reduce(
				(sum, e) => sum + calculateCost(e),
				0,
			);

			pattern.messageCount += messageCount;
			pattern.avgTokensPerMessage += totalTokens;
			pattern.avgCostPerMessage += totalCost;
			pattern.efficiency += totalTokens / Math.max(totalCost, 0.001);
			pattern.frequency += 1;
		}

		// Calculate averages and trends
		for (const pattern of patterns.values()) {
			if (pattern.frequency > 0) {
				pattern.messageCount = Math.round(
					pattern.messageCount / pattern.frequency,
				);
				pattern.avgTokensPerMessage = Math.round(
					pattern.avgTokensPerMessage / pattern.frequency,
				);
				pattern.avgCostPerMessage =
					pattern.avgCostPerMessage / pattern.frequency;
				pattern.efficiency = pattern.efficiency / pattern.frequency;
				pattern.trendDirection = this.calculateLengthTrend(
					entries,
					pattern.lengthCategory,
				);
			}
		}

		return Array.from(patterns.values()).sort(
			(a, b) => b.frequency - a.frequency,
		);
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
			.map(([id, convEntries]) => ({
				conversationId: id,
				taskType: this.inferTaskType(convEntries),
				startTime: new Date(convEntries[0].timestamp),
				endTime: new Date(convEntries[convEntries.length - 1].timestamp),
				cost: convEntries.reduce((sum, e) => sum + calculateCost(e), 0),
			}))
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

		const totalDays = Math.max(
			1,
			(sortedConversations[sortedConversations.length - 1].startTime.getTime() -
				sortedConversations[0].startTime.getTime()) /
				(1000 * 60 * 60 * 24),
		);

		return {
			switchFrequency: switches.length / totalDays,
			avgTimeBetweenSwitches:
				switches.length > 0
					? switches.reduce((sum, s) => sum + s.gapTime, 0) / switches.length
					: 0,
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

		if (conversationLength > 15 && avgTokens > 3000) return "complex_coding";
		if (avgTokens > 5000) return "analysis";
		if (conversationLength > 20) return "debugging";
		if (avgTokens < 2000) return "simple_query";
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
}
