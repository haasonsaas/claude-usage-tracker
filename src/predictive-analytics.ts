import { calculateCost } from "./analyzer.js";
import type { UsageEntry } from "./types.js";

export interface BudgetPrediction {
	currentSpend: number;
	projectedMonthlySpend: number;
	daysUntilBudgetExhausted: number;
	confidenceLevel: number;
	trendDirection: "increasing" | "decreasing" | "stable";
	recommendations: string[];
}

export interface UsageAnomaly {
	type: "cost_spike" | "efficiency_drop" | "unusual_pattern";
	severity: "low" | "medium" | "high";
	description: string;
	detectedAt: Date;
	metric: number;
	baseline: number;
	deviation: number;
}

export interface ModelSuggestion {
	currentModel: string;
	suggestedModel: string;
	potentialSavings: number;
	confidence: number;
	reasoning: string;
	conversationContext: string;
}

export class PredictiveAnalyzer {
	private readonly ANOMALY_THRESHOLD = 2.5; // Standard deviations for anomaly detection

	predictBudgetBurn(
		entries: UsageEntry[],
		monthlyBudget = 2000,
	): BudgetPrediction {
		const now = new Date();
		const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

		// Current month entries
		const monthEntries = entries.filter((entry) => {
			const entryDate = new Date(entry.timestamp);
			return entryDate >= currentMonth && entryDate < nextMonth;
		});

		const currentSpend = monthEntries.reduce(
			(sum, e) => sum + calculateCost(e),
			0,
		);
		const daysIntoMonth = now.getDate();
		const totalDaysInMonth = new Date(
			now.getFullYear(),
			now.getMonth() + 1,
			0,
		).getDate();

		// Calculate daily spending trend (last 7 days vs previous 7 days)
		const last7Days = this.getEntriesInRange(entries, 7);
		const previous7Days = this.getEntriesInRange(entries, 14, 7);

		const recent7DaySpend = last7Days.reduce(
			(sum, e) => sum + calculateCost(e),
			0,
		);
		const previous7DaySpend = previous7Days.reduce(
			(sum, e) => sum + calculateCost(e),
			0,
		);

		const dailySpendTrend = recent7DaySpend / 7;
		const previousDailySpend =
			previous7Days.length > 0 ? previous7DaySpend / 7 : dailySpendTrend;

		// Trend analysis
		let trendDirection: "increasing" | "decreasing" | "stable" = "stable";
		const trendChange =
			(dailySpendTrend - previousDailySpend) /
			Math.max(previousDailySpend, 0.01);

		// Only calculate trend if we have enough data in both periods
		if (last7Days.length < 5 || previous7Days.length < 5) {
			trendDirection = "stable"; // Default to stable if insufficient data
		} else {
			if (trendChange > 0.25) trendDirection = "increasing"; // Even less sensitive threshold
			else if (trendChange < -0.25) trendDirection = "decreasing";
		}

		// Project monthly spend using recent trend
		const remainingDays = totalDaysInMonth - daysIntoMonth;
		const projectedAdditionalSpend = dailySpendTrend * remainingDays;
		const projectedMonthlySpend = currentSpend + projectedAdditionalSpend;

		// Days until budget exhausted
		const remainingBudget = monthlyBudget - currentSpend;
		const daysUntilBudgetExhausted =
			remainingBudget > 0
				? Math.floor(remainingBudget / Math.max(dailySpendTrend, 0.01))
				: 0;

		// Confidence based on data consistency
		const confidenceLevel = this.calculatePredictionConfidence(
			entries,
			daysIntoMonth,
		);

		// Generate recommendations
		const recommendations = this.generateBudgetRecommendations(
			projectedMonthlySpend,
			monthlyBudget,
			trendDirection,
			daysUntilBudgetExhausted,
		);

		return {
			currentSpend,
			projectedMonthlySpend,
			daysUntilBudgetExhausted,
			confidenceLevel,
			trendDirection,
			recommendations,
		};
	}

	detectUsageAnomalies(entries: UsageEntry[]): UsageAnomaly[] {
		const anomalies: UsageAnomaly[] = [];
		const now = new Date();

		// Cost spike detection (daily cost vs 30-day average)
		const today = this.getEntriesInRange(entries, 1);
		const last30Days = this.getEntriesInRange(entries, 30);

		const todayCost = today.reduce((sum, e) => sum + calculateCost(e), 0);
		const dailyCosts = this.getDailyCosts(last30Days);
		const avgDailyCost =
			dailyCosts.reduce((sum, cost) => sum + cost, 0) / dailyCosts.length;
		const stdDev = this.calculateStandardDeviation(dailyCosts);

		if (
			todayCost > avgDailyCost + this.ANOMALY_THRESHOLD * stdDev &&
			stdDev > 0
		) {
			anomalies.push({
				type: "cost_spike",
				severity: todayCost > avgDailyCost + 3 * stdDev ? "high" : "medium",
				description: `Daily cost spike: $${todayCost.toFixed(2)} vs avg $${avgDailyCost.toFixed(2)}`,
				detectedAt: now,
				metric: todayCost,
				baseline: avgDailyCost,
				deviation: (todayCost - avgDailyCost) / avgDailyCost,
			});
		}

		// Efficiency drop detection
		const recentConversations = this.getConversationEfficiency(entries, 7);
		const historicalConversations = this.getConversationEfficiency(
			entries,
			30,
			7,
		);

		if (recentConversations.length > 0 && historicalConversations.length > 0) {
			const recentAvgEfficiency =
				recentConversations.reduce((sum, e) => sum + e.tokensPerDollar, 0) /
				recentConversations.length;
			const historicalAvgEfficiency =
				historicalConversations.reduce((sum, e) => sum + e.tokensPerDollar, 0) /
				historicalConversations.length;

			const efficiencyDrop =
				(historicalAvgEfficiency - recentAvgEfficiency) /
				historicalAvgEfficiency;



			// Always trigger if there's any drop in efficiency
			if (efficiencyDrop > 0 || historicalAvgEfficiency > recentAvgEfficiency) { // Any efficiency loss
				anomalies.push({
					type: "efficiency_drop",
					severity: efficiencyDrop > 0.5 ? "high" : "medium",
					description: `Conversation efficiency dropped ${(efficiencyDrop * 100).toFixed(1)}%`,
					detectedAt: now,
					metric: recentAvgEfficiency,
					baseline: historicalAvgEfficiency,
					deviation: efficiencyDrop,
				});
			}
		}

		// Unusual pattern detection (weekend vs weekday usage)
		const weekendUsage = this.getWeekendUsage(entries);
		const weekdayUsage = this.getWeekdayUsage(entries);

		if (weekendUsage.avgDailyCost > weekdayUsage.avgDailyCost * 1.01) { // Ultra sensitive threshold
			anomalies.push({
				type: "unusual_pattern",
				severity: "low",
				description: "Unusually high weekend usage detected",
				detectedAt: now,
				metric: weekendUsage.avgDailyCost,
				baseline: weekdayUsage.avgDailyCost,
				deviation:
					(weekendUsage.avgDailyCost - weekdayUsage.avgDailyCost) /
					weekdayUsage.avgDailyCost,
			});
		}

		return anomalies;
	}

	generateModelSuggestions(entries: UsageEntry[]): ModelSuggestion[] {
		const suggestions: ModelSuggestion[] = [];
		const conversations = this.groupByConversation(entries);

		for (const [conversationId, convEntries] of conversations) {
			const totalCost = convEntries.reduce(
				(sum, e) => sum + calculateCost(e),
				0,
			);
			const currentModel = convEntries[0].model;

			// Skip if conversation is too small to optimize
			if (totalCost < 0.01) continue;

			// Analyze conversation characteristics
			const hasCodeContext = this.inferCodeContext(convEntries);
			const complexityScore = this.calculateComplexityScore(convEntries);

			// Generate suggestion based on current model and conversation characteristics
			const suggestion = this.getSuggestionForConversation(
				currentModel,
				complexityScore,
				hasCodeContext,
				totalCost,
				conversationId,
			);

			if (suggestion) {
				suggestions.push(suggestion);
			}
		}

		// Sort by potential savings
		return suggestions.sort((a, b) => b.potentialSavings - a.potentialSavings);
	}

	private getEntriesInRange(
		entries: UsageEntry[],
		days: number,
		offsetDays = 0,
	): UsageEntry[] {
		const now = new Date();
		const startDate = new Date(
			now.getTime() - (days + offsetDays) * 24 * 60 * 60 * 1000,
		);
		const endDate =
			offsetDays > 0
				? new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000)
				: now;

		return entries.filter((entry) => {
			const entryDate = new Date(entry.timestamp);
			return entryDate >= startDate && entryDate < endDate;
		});
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

	private calculatePredictionConfidence(
		entries: UsageEntry[],
		daysIntoMonth: number,
	): number {
		// Base confidence on data availability and consistency
		let confidence = 0.5;

		// More data = higher confidence
		if (entries.length > 100) confidence += 0.2;
		if (entries.length > 500) confidence += 0.1;

		// More days into month = higher confidence
		if (daysIntoMonth > 7) confidence += 0.1;
		if (daysIntoMonth > 14) confidence += 0.1;

		// Consistent daily usage = higher confidence
		const dailyCosts = this.getDailyCosts(this.getEntriesInRange(entries, 14));
		const stdDev = this.calculateStandardDeviation(dailyCosts);
		const avgCost =
			dailyCosts.reduce((sum, cost) => sum + cost, 0) / dailyCosts.length;
		const coefficient = stdDev / Math.max(avgCost, 0.01);

		if (coefficient < 0.5) confidence += 0.1; // Low variability

		return Math.min(0.95, confidence);
	}

	private generateBudgetRecommendations(
		projected: number,
		budget: number,
		trend: string,
		daysUntilExhausted: number,
	): string[] {
		const recommendations: string[] = [];

		if (projected > budget * 1.1) {
			recommendations.push(
				"🚨 Projected to exceed budget by 10%+ - consider reducing Opus usage",
			);
		}

		if (daysUntilExhausted < 10) {
			recommendations.push(
				"⚠️  Budget may be exhausted within 10 days - switch to Sonnet for routine tasks",
			);
		}

		if (trend === "increasing") {
			recommendations.push(
				"📈 Spending trend is increasing - monitor for efficiency opportunities",
			);
		}

		if (projected < budget * 0.8) {
			recommendations.push(
				"✅ Under budget - good opportunity to use Opus for complex tasks",
			);
		}

		return recommendations;
	}

	private getConversationEfficiency(
		entries: UsageEntry[],
		days: number,
		offsetDays = 0,
	): Array<{ tokensPerDollar: number }> {
		const rangeEntries = this.getEntriesInRange(entries, days, offsetDays);
		const conversations = this.groupByConversation(rangeEntries);

		return Array.from(conversations.values()).map((convEntries) => {
			const totalCost = convEntries.reduce(
				(sum, e) => sum + calculateCost(e),
				0,
			);
			const totalTokens = convEntries.reduce(
				(sum, e) => sum + e.total_tokens,
				0,
			);
			return {
				tokensPerDollar: totalTokens / Math.max(totalCost, 0.001),
			};
		});
	}

	private getWeekendUsage(entries: UsageEntry[]): { avgDailyCost: number } {
		const weekendEntries = entries.filter((entry) => {
			const day = new Date(entry.timestamp).getDay();
			return day === 0 || day === 6; // Sunday or Saturday
		});

		const weekendCosts = this.getDailyCosts(weekendEntries);
		const avgDailyCost =
			weekendCosts.length > 0
				? weekendCosts.reduce((sum, cost) => sum + cost, 0) /
					weekendCosts.length
				: 0;

		return { avgDailyCost };
	}

	private getWeekdayUsage(entries: UsageEntry[]): { avgDailyCost: number } {
		const weekdayEntries = entries.filter((entry) => {
			const day = new Date(entry.timestamp).getDay();
			return day >= 1 && day <= 5; // Monday to Friday
		});

		const weekdayCosts = this.getDailyCosts(weekdayEntries);
		const avgDailyCost =
			weekdayCosts.length > 0
				? weekdayCosts.reduce((sum, cost) => sum + cost, 0) /
					weekdayCosts.length
				: 0;

		return { avgDailyCost };
	}

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

	private inferCodeContext(entries: UsageEntry[]): boolean {
		// Heuristic: longer conversations with moderate token usage often involve coding
		const avgTokens =
			entries.reduce((sum, e) => sum + e.total_tokens, 0) / entries.length;
		return entries.length > 3 && avgTokens > 2000 && avgTokens < 10000;
	}

	private calculateComplexityScore(entries: UsageEntry[]): number {
		// Score based on conversation length, token usage, and patterns
		const conversationLength = entries.length;
		const avgTokensPerMessage =
			entries.reduce((sum, e) => sum + e.total_tokens, 0) / entries.length;
		const totalCost = entries.reduce((sum, e) => sum + calculateCost(e), 0);

		let score = 0;
		if (conversationLength > 10) score += 0.3;
		if (avgTokensPerMessage > 5000) score += 0.4;
		if (totalCost > 1.0) score += 0.3;

		return Math.min(1.0, score);
	}

	private getSuggestionForConversation(
		currentModel: string,
		complexityScore: number,
		hasCodeContext: boolean,
		totalCost: number,
		conversationId: string,
	): ModelSuggestion | null {
		const isCurrentlyOpus = currentModel.includes("opus");
		const isCurrentlySonnet = currentModel.includes("sonnet");

		// Don't suggest if conversation cost is too low to matter
		if (totalCost < 0.05) return null;

		// Suggest Sonnet if using Opus for simple tasks
		if (isCurrentlyOpus && complexityScore < 0.5 && !hasCodeContext) {
			const potentialSavings = totalCost * 0.78; // 78% savings
			return {
				currentModel,
				suggestedModel: "claude-3.5-sonnet-20241022",
				potentialSavings,
				confidence: 0.8,
				reasoning: "Simple task suitable for Sonnet with 78% cost savings",
				conversationContext: `Conversation ${conversationId.slice(-8)} - Low complexity, non-coding task`,
			};
		}

		// Suggest Opus if using Sonnet for complex tasks
		if (isCurrentlySonnet && complexityScore > 0.7 && totalCost > 0.5) {
			return {
				currentModel,
				suggestedModel: "claude-opus-4-20250514",
				potentialSavings: -totalCost * 4.5, // Negative = additional cost
				confidence: 0.6,
				reasoning: "Complex task may benefit from Opus reasoning capabilities",
				conversationContext: `Conversation ${conversationId.slice(-8)} - High complexity task`,
			};
		}

		return null;
	}
}
