import { calculateCost } from "./analyzer.js";
import type { UsageEntry } from "./types.js";

export interface DataQualityReport {
	totalEntries: number;
	validEntries: number;
	invalidEntries: number;
	duplicateEntries: number;
	dateRange: {
		earliest: string;
		latest: string;
		spanDays: number;
	};
	modelDistribution: Record<string, number>;
	conversationDistribution: {
		totalConversations: number;
		avgMessagesPerConversation: number;
		shortConversations: number; // < 3 messages
		mediumConversations: number; // 3-20 messages  
		longConversations: number; // > 20 messages
	};
	costDistribution: {
		totalCost: number;
		medianCost: number;
		top10PercentCost: number;
		costPerModel: Record<string, number>;
	};
	tokenDistribution: {
		totalTokens: number;
		avgPromptTokens: number;
		avgCompletionTokens: number;
		cacheTokens: number;
		extremeEntries: Array<{
			type: "high_tokens" | "low_tokens" | "high_cost";
			conversationId: string;
			value: number;
		}>;
	};
	anomalies: Array<{
		type: string;
		description: string;
		severity: "low" | "medium" | "high";
		affectedEntries: number;
	}>;
}

export interface UsageHeatmap {
	hourlyHeatmap: Array<{
		hour: number;
		dayOfWeek: number;
		totalCost: number;
		conversationCount: number;
		avgEfficiency: number;
	}>;
	monthlyTrends: Array<{
		month: string;
		totalCost: number;
		totalTokens: number;
		conversationCount: number;
		avgEfficiency: number;
		topModel: string;
	}>;
	efficiencyDistribution: Array<{
		range: string;
		count: number;
		percentage: number;
	}>;
}

export interface ConversationFlowAnalysis {
	conversationJourneys: Array<{
		conversationId: string;
		startTime: string;
		endTime: string;
		messageCount: number;
		totalCost: number;
		efficiency: number;
		modelSwitches: number;
		avgResponseTime: number;
		peakActivity: {
			hour: number;
			burstCount: number;
		};
		conversationType: "sprint" | "marathon" | "interrupted" | "focused";
	}>;
	flowPatterns: Array<{
		pattern: string;
		frequency: number;
		avgCost: number;
		successRate: number;
	}>;
}

export interface CostDriverAnalysis {
	primaryDrivers: Array<{
		factor: string;
		impact: number; // 0-1
		description: string;
		recommendedAction: string;
	}>;
	modelUsagePattern: {
		opusUsage: {
			percentage: number;
			appropriateUsage: number; // percentage of appropriate usage
			wastedSpend: number;
		};
		sonnetUsage: {
			percentage: number;
			missedOpportunities: number; // could have used opus
			underutilization: number;
		};
	};
	seasonalPatterns: Array<{
		period: string;
		avgDailyCost: number;
		efficiency: number;
		explanation: string;
	}>;
}

export interface DeepInsights {
	dataQuality: DataQualityReport;
	usageHeatmap: UsageHeatmap;
	conversationFlow: ConversationFlowAnalysis;
	costDrivers: CostDriverAnalysis;
	recommendations: Array<{
		category: "cost" | "efficiency" | "workflow" | "data_quality";
		priority: "high" | "medium" | "low";
		title: string;
		description: string;
		potentialSavings?: number;
		implementationEffort: "low" | "medium" | "high";
	}>;
}

export class DeepAnalyzer {
	generateDataQualityReport(entries: UsageEntry[]): DataQualityReport {
		const validEntries = entries.filter(e => 
			e.prompt_tokens > 0 && e.completion_tokens > 0 && e.total_tokens > 0
		);
		
		const timestamps = entries.map(e => new Date(e.timestamp).getTime()).filter(t => !isNaN(t));
		const earliestTime = Math.min(...timestamps);
		const latestTime = Math.max(...timestamps);
		const spanDays = Math.ceil((latestTime - earliestTime) / (1000 * 60 * 60 * 24));

		// Model distribution
		const modelDistribution: Record<string, number> = {};
		entries.forEach(e => {
			modelDistribution[e.model] = (modelDistribution[e.model] || 0) + 1;
		});

		// Conversation analysis
		const conversations = new Map<string, UsageEntry[]>();
		entries.forEach(e => {
			if (!conversations.has(e.conversationId)) {
				conversations.set(e.conversationId, []);
			}
			conversations.get(e.conversationId)!.push(e);
		});

		let shortConversations = 0;
		let mediumConversations = 0;
		let longConversations = 0;
		let totalMessages = 0;

		conversations.forEach(conv => {
			totalMessages += conv.length;
			if (conv.length < 3) shortConversations++;
			else if (conv.length <= 20) mediumConversations++;
			else longConversations++;
		});

		// Cost analysis
		const costs = entries.map(e => calculateCost(e));
		const totalCost = costs.reduce((sum, cost) => sum + cost, 0);
		const sortedCosts = [...costs].sort((a, b) => a - b);
		const medianCost = sortedCosts[Math.floor(sortedCosts.length / 2)];
		
		const top10PercentIndex = Math.floor(sortedCosts.length * 0.9);
		const top10PercentCost = sortedCosts.slice(top10PercentIndex).reduce((sum, cost) => sum + cost, 0);

		const costPerModel: Record<string, number> = {};
		entries.forEach(e => {
			const cost = calculateCost(e);
			costPerModel[e.model] = (costPerModel[e.model] || 0) + cost;
		});

		// Token analysis
		const totalTokens = entries.reduce((sum, e) => sum + e.total_tokens, 0);
		const avgPromptTokens = entries.reduce((sum, e) => sum + e.prompt_tokens, 0) / entries.length;
		const avgCompletionTokens = entries.reduce((sum, e) => sum + e.completion_tokens, 0) / entries.length;
		const cacheTokens = entries.reduce((sum, e) => 
			sum + (e.cache_creation_input_tokens || 0) + (e.cache_read_input_tokens || 0), 0);

		// Find extreme entries
		const extremeEntries = [];
		const highTokenThreshold = 50000;
		const lowTokenThreshold = 10;
		const highCostThreshold = 10;

		entries.forEach(e => {
			const cost = calculateCost(e);
			if (e.total_tokens > highTokenThreshold) {
				extremeEntries.push({
					type: "high_tokens" as const,
					conversationId: e.conversationId,
					value: e.total_tokens
				});
			}
			if (e.total_tokens < lowTokenThreshold) {
				extremeEntries.push({
					type: "low_tokens" as const,
					conversationId: e.conversationId,
					value: e.total_tokens
				});
			}
			if (cost > highCostThreshold) {
				extremeEntries.push({
					type: "high_cost" as const,
					conversationId: e.conversationId,
					value: cost
				});
			}
		});

		// Detect anomalies
		const anomalies = this.detectDataAnomalies(entries);

		return {
			totalEntries: entries.length,
			validEntries: validEntries.length,
			invalidEntries: entries.length - validEntries.length,
			duplicateEntries: this.countDuplicates(entries),
			dateRange: {
				earliest: new Date(earliestTime).toISOString(),
				latest: new Date(latestTime).toISOString(),
				spanDays
			},
			modelDistribution,
			conversationDistribution: {
				totalConversations: conversations.size,
				avgMessagesPerConversation: totalMessages / conversations.size,
				shortConversations,
				mediumConversations,
				longConversations
			},
			costDistribution: {
				totalCost,
				medianCost,
				top10PercentCost,
				costPerModel
			},
			tokenDistribution: {
				totalTokens,
				avgPromptTokens,
				avgCompletionTokens,
				cacheTokens,
				extremeEntries: extremeEntries.slice(0, 10)
			},
			anomalies
		};
	}

	generateUsageHeatmap(entries: UsageEntry[]): UsageHeatmap {
		// Hourly heatmap
		const heatmapData = new Map<string, {
			totalCost: number;
			conversations: Set<string>;
			totalTokens: number;
		}>();

		entries.forEach(e => {
			const date = new Date(e.timestamp);
			const hour = date.getHours();
			const dayOfWeek = date.getDay();
			const key = `${hour}-${dayOfWeek}`;

			if (!heatmapData.has(key)) {
				heatmapData.set(key, {
					totalCost: 0,
					conversations: new Set(),
					totalTokens: 0
				});
			}

			const data = heatmapData.get(key)!;
			data.totalCost += calculateCost(e);
			data.conversations.add(e.conversationId);
			data.totalTokens += e.total_tokens;
		});

		const hourlyHeatmap = Array.from(heatmapData.entries()).map(([key, data]) => {
			const [hour, dayOfWeek] = key.split('-').map(Number);
			return {
				hour,
				dayOfWeek,
				totalCost: data.totalCost,
				conversationCount: data.conversations.size,
				avgEfficiency: data.totalTokens / Math.max(data.totalCost, 0.001)
			};
		});

		// Monthly trends
		const monthlyData = new Map<string, {
			totalCost: number;
			totalTokens: number;
			conversations: Set<string>;
			modelCounts: Record<string, number>;
		}>();

		entries.forEach(e => {
			const date = new Date(e.timestamp);
			const month = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

			if (!monthlyData.has(month)) {
				monthlyData.set(month, {
					totalCost: 0,
					totalTokens: 0,
					conversations: new Set(),
					modelCounts: {}
				});
			}

			const data = monthlyData.get(month)!;
			data.totalCost += calculateCost(e);
			data.totalTokens += e.total_tokens;
			data.conversations.add(e.conversationId);
			data.modelCounts[e.model] = (data.modelCounts[e.model] || 0) + 1;
		});

		const monthlyTrends = Array.from(monthlyData.entries()).map(([month, data]) => {
			const topModel = Object.entries(data.modelCounts)
				.sort(([,a], [,b]) => b - a)[0]?.[0] || 'unknown';

			return {
				month,
				totalCost: data.totalCost,
				totalTokens: data.totalTokens,
				conversationCount: data.conversations.size,
				avgEfficiency: data.totalTokens / Math.max(data.totalCost, 0.001),
				topModel
			};
		});

		// Efficiency distribution
		const efficiencies = entries.map(e => e.total_tokens / Math.max(calculateCost(e), 0.001));
		const ranges = [
			{ range: "0-1000", min: 0, max: 1000 },
			{ range: "1000-5000", min: 1000, max: 5000 },
			{ range: "5000-10000", min: 5000, max: 10000 },
			{ range: "10000-20000", min: 10000, max: 20000 },
			{ range: "20000+", min: 20000, max: Infinity }
		];

		const efficiencyDistribution = ranges.map(range => {
			const count = efficiencies.filter(eff => eff >= range.min && eff < range.max).length;
			return {
				range: range.range,
				count,
				percentage: (count / efficiencies.length) * 100
			};
		});

		return {
			hourlyHeatmap,
			monthlyTrends,
			efficiencyDistribution
		};
	}

	analyzeConversationFlow(entries: UsageEntry[]): ConversationFlowAnalysis {
		const conversations = new Map<string, UsageEntry[]>();
		entries.forEach(e => {
			if (!conversations.has(e.conversationId)) {
				conversations.set(e.conversationId, []);
			}
			conversations.get(e.conversationId)!.push(e);
		});

		const conversationJourneys = Array.from(conversations.entries()).map(([id, convEntries]) => {
			const sorted = [...convEntries].sort((a, b) => 
				new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
			
			const startTime = sorted[0].timestamp;
			const endTime = sorted[sorted.length - 1].timestamp;
			const messageCount = sorted.length;
			const totalCost = sorted.reduce((sum, e) => sum + calculateCost(e), 0);
			const totalTokens = sorted.reduce((sum, e) => sum + e.total_tokens, 0);
			const efficiency = totalTokens / Math.max(totalCost, 0.001);

			// Count model switches
			let modelSwitches = 0;
			for (let i = 1; i < sorted.length; i++) {
				if (sorted[i].model !== sorted[i-1].model) {
					modelSwitches++;
				}
			}

			// Calculate average response time
			let totalGaps = 0;
			for (let i = 1; i < sorted.length; i++) {
				const gap = new Date(sorted[i].timestamp).getTime() - 
							new Date(sorted[i-1].timestamp).getTime();
				totalGaps += gap;
			}
			const avgResponseTime = sorted.length > 1 ? totalGaps / (sorted.length - 1) / 1000 : 0;

			// Find peak activity
			const hourCounts: Record<number, number> = {};
			sorted.forEach(e => {
				const hour = new Date(e.timestamp).getHours();
				hourCounts[hour] = (hourCounts[hour] || 0) + 1;
			});
			const peakHour = Object.entries(hourCounts)
				.sort(([,a], [,b]) => b - a)[0];

			// Classify conversation type
			const duration = new Date(endTime).getTime() - new Date(startTime).getTime();
			const durationHours = duration / (1000 * 60 * 60);
			
			let conversationType: "sprint" | "marathon" | "interrupted" | "focused";
			if (durationHours < 1 && messageCount > 10) {
				conversationType = "sprint";
			} else if (durationHours > 8) {
				conversationType = "marathon";
			} else if (avgResponseTime > 30 * 60 * 1000) { // 30+ minutes between messages
				conversationType = "interrupted";
			} else {
				conversationType = "focused";
			}

			return {
				conversationId: id,
				startTime,
				endTime,
				messageCount,
				totalCost,
				efficiency,
				modelSwitches,
				avgResponseTime,
				peakActivity: {
					hour: peakHour ? parseInt(peakHour[0]) : 0,
					burstCount: peakHour ? peakHour[1] : 0
				},
				conversationType
			};
		});

		// Analyze flow patterns
		const patterns = new Map<string, {
			count: number;
			totalCost: number;
			successes: number;
		}>();

		conversationJourneys.forEach(journey => {
			const pattern = `${journey.conversationType}_${journey.messageCount < 10 ? 'short' : journey.messageCount < 30 ? 'medium' : 'long'}`;
			
			if (!patterns.has(pattern)) {
				patterns.set(pattern, { count: 0, totalCost: 0, successes: 0 });
			}

			const data = patterns.get(pattern)!;
			data.count++;
			data.totalCost += journey.totalCost;
			if (journey.efficiency > 3000) data.successes++; // Arbitrary success threshold
		});

		const flowPatterns = Array.from(patterns.entries()).map(([pattern, data]) => ({
			pattern,
			frequency: data.count,
			avgCost: data.totalCost / data.count,
			successRate: data.successes / data.count
		}));

		return {
			conversationJourneys,
			flowPatterns
		};
	}

	analyzeCostDrivers(entries: UsageEntry[]): CostDriverAnalysis {
		const totalCost = entries.reduce((sum, e) => sum + calculateCost(e), 0);
		
		// Analyze model usage patterns
		const opusEntries = entries.filter(e => e.model.includes("opus"));
		const sonnetEntries = entries.filter(e => e.model.includes("sonnet"));
		
		const opusCost = opusEntries.reduce((sum, e) => sum + calculateCost(e), 0);
		const sonnetCost = sonnetEntries.reduce((sum, e) => sum + calculateCost(e), 0);
		
		const opusPercentage = (opusCost / totalCost) * 100;
		const sonnetPercentage = (sonnetCost / totalCost) * 100;

		// Analyze appropriate usage (simple heuristic)
		const opusConversations = new Map<string, UsageEntry[]>();
		opusEntries.forEach(e => {
			if (!opusConversations.has(e.conversationId)) {
				opusConversations.set(e.conversationId, []);
			}
			opusConversations.get(e.conversationId)!.push(e);
		});

		let appropriateOpusUsage = 0;
		let wastedOpusSpend = 0;

		opusConversations.forEach(conv => {
			const avgTokens = conv.reduce((sum, e) => sum + e.total_tokens, 0) / conv.length;
			const isComplexTask = avgTokens > 3000 || conv.length > 15;
			
			if (isComplexTask) {
				appropriateOpusUsage++;
			} else {
				wastedOpusSpend += conv.reduce((sum, e) => sum + calculateCost(e), 0);
			}
		});

		const primaryDrivers = [
			{
				factor: "Model Selection",
				impact: opusPercentage > 70 ? 0.8 : 0.4,
				description: `${opusPercentage.toFixed(1)}% of cost from Opus usage`,
				recommendedAction: opusPercentage > 70 ? 
					"Review Opus usage - consider Sonnet for simpler tasks" : 
					"Current model mix appears reasonable"
			},
			{
				factor: "Conversation Length", 
				impact: 0.6,
				description: "Long conversations drive higher costs",
				recommendedAction: "Break complex tasks into focused sessions"
			},
			{
				factor: "Cache Utilization",
				impact: 0.3,
				description: "Opportunity to reduce costs through better caching",
				recommendedAction: "Use context continuation for related tasks"
			}
		];

		return {
			primaryDrivers,
			modelUsagePattern: {
				opusUsage: {
					percentage: opusPercentage,
					appropriateUsage: (appropriateOpusUsage / opusConversations.size) * 100,
					wastedSpend: wastedOpusSpend
				},
				sonnetUsage: {
					percentage: sonnetPercentage,
					missedOpportunities: 0, // Could be calculated
					underutilization: 0
				}
			},
			seasonalPatterns: [] // Could be implemented with more time analysis
		};
	}

	generateDeepInsights(entries: UsageEntry[]): DeepInsights {
		const dataQuality = this.generateDataQualityReport(entries);
		const usageHeatmap = this.generateUsageHeatmap(entries);
		const conversationFlow = this.analyzeConversationFlow(entries);
		const costDrivers = this.analyzeCostDrivers(entries);

		const recommendations = this.generateRecommendations(dataQuality, costDrivers, conversationFlow);

		return {
			dataQuality,
			usageHeatmap,
			conversationFlow,
			costDrivers,
			recommendations
		};
	}

	private detectDataAnomalies(entries: UsageEntry[]): DataQualityReport['anomalies'] {
		const anomalies = [];

		// Check for zero token entries
		const zeroTokenEntries = entries.filter(e => e.total_tokens === 0).length;
		if (zeroTokenEntries > 0) {
			anomalies.push({
				type: "zero_tokens",
				description: `${zeroTokenEntries} entries have zero tokens`,
				severity: "medium" as const,
				affectedEntries: zeroTokenEntries
			});
		}

		// Check for extremely high costs
		const highCostEntries = entries.filter(e => calculateCost(e) > 50).length;
		if (highCostEntries > 0) {
			anomalies.push({
				type: "high_cost",
				description: `${highCostEntries} entries have unusually high costs (>$50)`,
				severity: "high" as const,
				affectedEntries: highCostEntries
			});
		}

		return anomalies;
	}

	private countDuplicates(entries: UsageEntry[]): number {
		const seen = new Set<string>();
		let duplicates = 0;

		entries.forEach(e => {
			const key = `${e.requestId}-${e.timestamp}`;
			if (seen.has(key)) {
				duplicates++;
			} else {
				seen.add(key);
			}
		});

		return duplicates;
	}

	private generateRecommendations(
		dataQuality: DataQualityReport,
		costDrivers: CostDriverAnalysis,
		conversationFlow: ConversationFlowAnalysis
	): DeepInsights['recommendations'] {
		const recommendations = [];

		// Cost optimization recommendations
		if (costDrivers.modelUsagePattern.opusUsage.wastedSpend > 100) {
			recommendations.push({
				category: "cost" as const,
				priority: "high" as const,
				title: "Optimize Opus Usage",
				description: `$${costDrivers.modelUsagePattern.opusUsage.wastedSpend.toFixed(2)} could be saved by using Sonnet for simpler tasks`,
				potentialSavings: costDrivers.modelUsagePattern.opusUsage.wastedSpend,
				implementationEffort: "low" as const
			});
		}

		// Efficiency recommendations
		const sprintConversations = conversationFlow.conversationJourneys.filter(j => j.conversationType === "sprint");
		if (sprintConversations.length > 10) {
			recommendations.push({
				category: "efficiency" as const,
				priority: "medium" as const,
				title: "Optimize Sprint Conversations",
				description: `${sprintConversations.length} sprint conversations detected - consider breaking down complex tasks`,
				implementationEffort: "medium" as const
			});
		}

		// Data quality recommendations
		if (dataQuality.invalidEntries > dataQuality.totalEntries * 0.1) {
			recommendations.push({
				category: "data_quality" as const,
				priority: "medium" as const,
				title: "Improve Data Quality",
				description: `${dataQuality.invalidEntries} invalid entries detected - review data collection`,
				implementationEffort: "high" as const
			});
		}

		return recommendations.sort((a, b) => {
			const priorityOrder = { high: 3, medium: 2, low: 1 };
			return priorityOrder[b.priority] - priorityOrder[a.priority];
		});
	}
}
