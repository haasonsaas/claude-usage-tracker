import { calculateCost } from "./analyzer.js";
import type { UsageEntry } from "./types.js";

export interface ConversationSuccessMetrics {
	conversationId: string;
	messageCount: number;
	totalCost: number;
	totalTokens: number;
	duration: number; // in minutes
	successScore: number; // 0-1
	efficiency: number; // tokens per dollar
	promptComplexity: number; // 0-1
	cacheUtilization: number; // percentage
	modelSwitches: number;
	timeOfDay: number; // hour
	dayOfWeek: number;
	avgResponseTime: number; // average time between messages
}

export interface ProjectAnalysis {
	projectPath: string;
	totalCost: number;
	totalTokens: number;
	conversationCount: number;
	avgCostPerConversation: number;
	efficiency: number;
	timeSpent: number; // in hours
	roi: number; // efficiency relative to cost
	primaryModel: string;
	topics: string[];
}

export interface TimeSeriesDataPoint {
	date: string;
	dailyCost: number;
	dailyTokens: number;
	conversationCount: number;
	avgEfficiency: number;
	opusPercentage: number;
	cacheHitRate: number;
}

export interface CacheOptimizationInsight {
	totalCacheTokens: number;
	cacheHitRate: number;
	cacheSavings: number;
	underutilizedConversations: Array<{
		conversationId: string;
		missedCachingOpportunity: number;
	}>;
	recommendations: string[];
}

export interface PromptingPatternAnalysis {
	avgPromptLength: number;
	effectivePromptPatterns: Array<{
		pattern: string;
		successRate: number;
		efficiency: number;
		examples: string[];
	}>;
	inefficientPatterns: Array<{
		pattern: string;
		wasteRate: number;
		avgCost: number;
	}>;
	optimalPromptingGuidelines: string[];
}

export interface AdvancedInsights {
	conversationSuccess: ConversationSuccessMetrics[];
	projectAnalysis: ProjectAnalysis[];
	timeSeriesData: TimeSeriesDataPoint[];
	cacheOptimization: CacheOptimizationInsight;
	promptingPatterns: PromptingPatternAnalysis;
	correlationInsights: Array<{
		factor1: string;
		factor2: string;
		correlation: number;
		insight: string;
	}>;
}

export class ResearchAnalyzer {
	analyzeConversationSuccess(entries: UsageEntry[]): ConversationSuccessMetrics[] {
		const conversations = this.groupByConversation(entries);
		const metrics: ConversationSuccessMetrics[] = [];

		for (const [conversationId, convEntries] of conversations) {
			if (convEntries.length < 2) continue; // Need at least 2 messages

			const sortedEntries = [...convEntries].sort(
				(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
			);

			const messageCount = convEntries.length;
			const totalCost = convEntries.reduce((sum, e) => sum + calculateCost(e), 0);
			const totalTokens = convEntries.reduce((sum, e) => sum + e.total_tokens, 0);
			
			const startTime = new Date(sortedEntries[0].timestamp);
			const endTime = new Date(sortedEntries[sortedEntries.length - 1].timestamp);
			const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60);

			const efficiency = totalTokens / Math.max(totalCost, 0.001);
			const successScore = this.calculateSuccessScore(convEntries, duration, efficiency);
			const promptComplexity = this.calculatePromptComplexity(convEntries);
			const cacheUtilization = this.calculateCacheUtilization(convEntries);
			const modelSwitches = this.countModelSwitches(convEntries);
			
			const timeOfDay = startTime.getHours();
			const dayOfWeek = startTime.getDay();
			const avgResponseTime = this.calculateAvgResponseTime(sortedEntries);

			metrics.push({
				conversationId,
				messageCount,
				totalCost,
				totalTokens,
				duration,
				successScore,
				efficiency,
				promptComplexity,
				cacheUtilization,
				modelSwitches,
				timeOfDay,
				dayOfWeek,
				avgResponseTime
			});
		}

		return metrics.sort((a, b) => b.successScore - a.successScore);
	}

	analyzeProjectROI(entries: UsageEntry[]): ProjectAnalysis[] {
		const projectMap = new Map<string, UsageEntry[]>();

		// Group by project path (extracted from conversation directory structure)
		for (const entry of entries) {
			const projectPath = this.extractProjectPath(entry.conversationId);
			if (!projectMap.has(projectPath)) {
				projectMap.set(projectPath, []);
			}
			projectMap.get(projectPath)!.push(entry);
		}

		const analyses: ProjectAnalysis[] = [];

		for (const [projectPath, projectEntries] of projectMap) {
			if (projectEntries.length < 5) continue; // Filter out small projects

			const totalCost = projectEntries.reduce((sum, e) => sum + calculateCost(e), 0);
			const totalTokens = projectEntries.reduce((sum, e) => sum + e.total_tokens, 0);
			const conversations = new Set(projectEntries.map(e => e.conversationId));
			const conversationCount = conversations.size;
			const avgCostPerConversation = totalCost / conversationCount;
			const efficiency = totalTokens / Math.max(totalCost, 0.001);
			
			const timeSpent = this.calculateProjectTimeSpent(projectEntries);
			const roi = this.calculateROI(efficiency, totalCost, timeSpent);
			const primaryModel = this.getPrimaryModel(projectEntries);
			const topics = this.inferTopics(projectPath);

			analyses.push({
				projectPath,
				totalCost,
				totalTokens,
				conversationCount,
				avgCostPerConversation,
				efficiency,
				timeSpent,
				roi,
				primaryModel,
				topics
			});
		}

		return analyses.sort((a, b) => b.roi - a.roi);
	}

	generateTimeSeriesData(entries: UsageEntry[]): TimeSeriesDataPoint[] {
		const dailyMap = new Map<string, {
			entries: UsageEntry[];
			conversations: Set<string>;
		}>();

		// Group by date
		for (const entry of entries) {
			const date = new Date(entry.timestamp).toISOString().split('T')[0];
			if (!dailyMap.has(date)) {
				dailyMap.set(date, { entries: [], conversations: new Set() });
			}
			const dayData = dailyMap.get(date)!;
			dayData.entries.push(entry);
			dayData.conversations.add(entry.conversationId);
		}

		const timeSeriesData: TimeSeriesDataPoint[] = [];

		for (const [date, dayData] of dailyMap) {
			const { entries: dayEntries } = dayData;
			
			const dailyCost = dayEntries.reduce((sum, e) => sum + calculateCost(e), 0);
			const dailyTokens = dayEntries.reduce((sum, e) => sum + e.total_tokens, 0);
			const conversationCount = dayData.conversations.size;
			const avgEfficiency = dailyTokens / Math.max(dailyCost, 0.001);
			
			const opusEntries = dayEntries.filter(e => e.model.includes("opus"));
			const opusPercentage = opusEntries.length / dayEntries.length;
			
			const cacheHitRate = this.calculateDailyCacheHitRate(dayEntries);

			timeSeriesData.push({
				date,
				dailyCost,
				dailyTokens,
				conversationCount,
				avgEfficiency,
				opusPercentage,
				cacheHitRate
			});
		}

		return timeSeriesData.sort((a, b) => a.date.localeCompare(b.date));
	}

	analyzeCacheOptimization(entries: UsageEntry[]): CacheOptimizationInsight {
		const totalTokens = entries.reduce((sum, e) => sum + e.total_tokens, 0);
		const totalCacheTokens = entries.reduce((sum, e) => 
			sum + (e.cache_creation_input_tokens || 0) + (e.cache_read_input_tokens || 0), 0);
		
		const cacheHitRate = totalCacheTokens / Math.max(totalTokens, 1);
		
		// Calculate cache savings (estimate based on cache vs non-cache pricing)
		const cacheSavings = entries.reduce((sum, e) => {
			const cacheReadTokens = e.cache_read_input_tokens || 0;
			const regularInputCost = (e.prompt_tokens / 1_000_000) * 15; // Assume $15/M
			const cacheReadCost = (cacheReadTokens / 1_000_000) * 3.75; // 75% discount
			return sum + Math.max(0, regularInputCost - cacheReadCost);
		}, 0);

		// Find conversations with low cache utilization
		const conversations = this.groupByConversation(entries);
		const underutilizedConversations = [];

		for (const [conversationId, convEntries] of conversations) {
			const convCacheRate = this.calculateCacheUtilization(convEntries);
			if (convEntries.length > 10 && convCacheRate < 0.3) { // Long conversations with low cache usage
				const missedOpportunity = this.calculateMissedCachingOpportunity(convEntries);
				underutilizedConversations.push({
					conversationId,
					missedCachingOpportunity: missedOpportunity
				});
			}
		}

		const recommendations = this.generateCacheRecommendations(cacheHitRate, underutilizedConversations);

		return {
			totalCacheTokens,
			cacheHitRate,
			cacheSavings,
			underutilizedConversations: underutilizedConversations.slice(0, 10),
			recommendations
		};
	}

	analyzePromptingPatterns(entries: UsageEntry[]): PromptingPatternAnalysis {
		const conversations = this.groupByConversation(entries);
		const promptPatterns = new Map<string, {
			successes: number;
			failures: number;
			totalCost: number;
			totalEfficiency: number;
			examples: string[];
		}>();

		// Note: This is a simplified analysis since we don't have actual prompt content
		// In a real scenario, you'd analyze the prompt text for patterns
		
		let totalPromptLength = 0;
		let promptCount = 0;

		for (const [_, convEntries] of conversations) {
			const avgTokensPerMessage = convEntries.reduce((sum, e) => sum + e.prompt_tokens, 0) / convEntries.length;
			const efficiency = convEntries.reduce((sum, e) => sum + e.total_tokens, 0) / 
				Math.max(convEntries.reduce((sum, e) => sum + calculateCost(e), 0), 0.001);
			
			// Categorize by prompt length and context
			let pattern = "short";
			if (avgTokensPerMessage > 1000) pattern = "medium";
			if (avgTokensPerMessage > 3000) pattern = "long";
			if (avgTokensPerMessage > 8000) pattern = "very_long";

			if (!promptPatterns.has(pattern)) {
				promptPatterns.set(pattern, {
					successes: 0,
					failures: 0,
					totalCost: 0,
					totalEfficiency: 0,
					examples: []
				});
			}

			const patternData = promptPatterns.get(pattern)!;
			const isSuccess = efficiency > 3000; // Arbitrary threshold
			
			if (isSuccess) {
				patternData.successes++;
			} else {
				patternData.failures++;
			}
			
			patternData.totalCost += convEntries.reduce((sum, e) => sum + calculateCost(e), 0);
			patternData.totalEfficiency += efficiency;
			
			totalPromptLength += avgTokensPerMessage;
			promptCount++;
		}

		const avgPromptLength = totalPromptLength / Math.max(promptCount, 1);

		const effectivePromptPatterns = Array.from(promptPatterns.entries())
			.filter(([_, data]) => data.successes + data.failures > 5)
			.map(([pattern, data]) => ({
				pattern,
				successRate: data.successes / (data.successes + data.failures),
				efficiency: data.totalEfficiency / (data.successes + data.failures),
				examples: data.examples.slice(0, 3)
			}))
			.sort((a, b) => b.successRate - a.successRate);

		const inefficientPatterns = Array.from(promptPatterns.entries())
			.filter(([_, data]) => data.successes + data.failures > 5)
			.map(([pattern, data]) => ({
				pattern,
				wasteRate: data.failures / (data.successes + data.failures),
				avgCost: data.totalCost / (data.successes + data.failures)
			}))
			.sort((a, b) => b.wasteRate - a.wasteRate);

		const optimalPromptingGuidelines = this.generatePromptingGuidelines(effectivePromptPatterns, inefficientPatterns);

		return {
			avgPromptLength,
			effectivePromptPatterns,
			inefficientPatterns,
			optimalPromptingGuidelines
		};
	}

	generateAdvancedInsights(entries: UsageEntry[]): AdvancedInsights {
		const conversationSuccess = this.analyzeConversationSuccess(entries);
		const projectAnalysis = this.analyzeProjectROI(entries);
		const timeSeriesData = this.generateTimeSeriesData(entries);
		const cacheOptimization = this.analyzeCacheOptimization(entries);
		const promptingPatterns = this.analyzePromptingPatterns(entries);
		const correlationInsights = this.calculateCorrelationInsights(conversationSuccess);

		return {
			conversationSuccess,
			projectAnalysis,
			timeSeriesData,
			cacheOptimization,
			promptingPatterns,
			correlationInsights
		};
	}

	// Private helper methods
	private groupByConversation(entries: UsageEntry[]): Map<string, UsageEntry[]> {
		const conversations = new Map<string, UsageEntry[]>();
		for (const entry of entries) {
			if (!conversations.has(entry.conversationId)) {
				conversations.set(entry.conversationId, []);
			}
			conversations.get(entry.conversationId)!.push(entry);
		}
		return conversations;
	}

	private calculateSuccessScore(entries: UsageEntry[], duration: number, efficiency: number): number {
		// Multi-factor success score
		let score = 0;
		
		// Efficiency component (40%)
		const efficiencyScore = Math.min(efficiency / 10000, 1) * 0.4;
		score += efficiencyScore;
		
		// Duration component (30%) - moderate duration is better
		const optimalDuration = 30; // 30 minutes
		const durationScore = Math.max(0, 1 - Math.abs(duration - optimalDuration) / optimalDuration) * 0.3;
		score += durationScore;
		
		// Message count component (30%) - not too short, not too long
		const messageCount = entries.length;
		const optimalMessageCount = 15;
		const messageScore = Math.max(0, 1 - Math.abs(messageCount - optimalMessageCount) / optimalMessageCount) * 0.3;
		score += messageScore;
		
		return Math.min(1, score);
	}

	private calculatePromptComplexity(entries: UsageEntry[]): number {
		const avgPromptTokens = entries.reduce((sum, e) => sum + e.prompt_tokens, 0) / entries.length;
		// Normalize to 0-1 scale
		return Math.min(avgPromptTokens / 10000, 1);
	}

	private calculateCacheUtilization(entries: UsageEntry[]): number {
		const totalTokens = entries.reduce((sum, e) => sum + e.total_tokens, 0);
		const cacheTokens = entries.reduce((sum, e) => 
			sum + (e.cache_creation_input_tokens || 0) + (e.cache_read_input_tokens || 0), 0);
		return cacheTokens / Math.max(totalTokens, 1);
	}

	private countModelSwitches(entries: UsageEntry[]): number {
		let switches = 0;
		for (let i = 1; i < entries.length; i++) {
			if (entries[i].model !== entries[i-1].model) {
				switches++;
			}
		}
		return switches;
	}

	private calculateAvgResponseTime(sortedEntries: UsageEntry[]): number {
		if (sortedEntries.length < 2) return 0;
		
		let totalTime = 0;
		for (let i = 1; i < sortedEntries.length; i++) {
			const prevTime = new Date(sortedEntries[i-1].timestamp).getTime();
			const currTime = new Date(sortedEntries[i].timestamp).getTime();
			totalTime += (currTime - prevTime) / 1000; // Convert to seconds
		}
		
		return totalTime / (sortedEntries.length - 1);
	}

	private extractProjectPath(conversationId: string): string {
		// Extract project path from conversation directory structure
		// Example: "/Users/jonathanhaas/.claude/projects/-Users-jonathanhaas-evalops-platform/..."
		const parts = conversationId.split('/');
		const projectIndex = parts.findIndex(part => part.includes('-Users-jonathanhaas-'));
		if (projectIndex !== -1 && projectIndex < parts.length - 1) {
			return parts[projectIndex].replace('-Users-jonathanhaas-', '');
		}
		return 'unknown';
	}

	private calculateProjectTimeSpent(entries: UsageEntry[]): number {
		const conversations = this.groupByConversation(entries);
		let totalTime = 0;
		
		for (const convEntries of conversations.values()) {
			if (convEntries.length < 2) continue;
			const sorted = [...convEntries].sort((a, b) => 
				new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
			const start = new Date(sorted[0].timestamp);
			const end = new Date(sorted[sorted.length - 1].timestamp);
			totalTime += (end.getTime() - start.getTime()) / (1000 * 60 * 60); // hours
		}
		
		return totalTime;
	}

	private calculateROI(efficiency: number, totalCost: number, timeSpent: number): number {
		// ROI = (efficiency * output volume) / (cost + time opportunity cost)
		const opportunityCost = timeSpent * 50; // Assume $50/hour opportunity cost
		const totalInvestment = totalCost + opportunityCost;
		return efficiency / Math.max(totalInvestment, 1);
	}

	private getPrimaryModel(entries: UsageEntry[]): string {
		const modelCounts = new Map<string, number>();
		for (const entry of entries) {
			modelCounts.set(entry.model, (modelCounts.get(entry.model) || 0) + 1);
		}
		
		let primaryModel = "unknown";
		let maxCount = 0;
		for (const [model, count] of modelCounts) {
			if (count > maxCount) {
				maxCount = count;
				primaryModel = model;
			}
		}
		
		return primaryModel;
	}

	private inferTopics(projectPath: string): string[] {
		const topics: string[] = [];
		const path = projectPath.toLowerCase();
		
		if (path.includes('homelab')) topics.push('infrastructure');
		if (path.includes('blog')) topics.push('content');
		if (path.includes('evalops') || path.includes('platform')) topics.push('development');
		if (path.includes('bloom')) topics.push('mobile');
		if (path.includes('dotfiles')) topics.push('configuration');
		if (path.includes('proxmox')) topics.push('virtualization');
		
		return topics.length > 0 ? topics : ['general'];
	}

	private calculateDailyCacheHitRate(entries: UsageEntry[]): number {
		const totalPromptTokens = entries.reduce((sum, e) => sum + e.prompt_tokens, 0);
		const cacheReadTokens = entries.reduce((sum, e) => sum + (e.cache_read_input_tokens || 0), 0);
		return cacheReadTokens / Math.max(totalPromptTokens, 1);
	}

	private calculateMissedCachingOpportunity(entries: UsageEntry[]): number {
		const totalCost = entries.reduce((sum, e) => sum + calculateCost(e), 0);
		const currentCacheUtilization = this.calculateCacheUtilization(entries);
		const potentialCacheUtilization = 0.8; // Assume 80% could be cached
		
		// Estimate savings if better caching was used
		const potentialSavings = totalCost * (potentialCacheUtilization - currentCacheUtilization) * 0.75;
		return Math.max(0, potentialSavings);
	}

	private generateCacheRecommendations(cacheHitRate: number, underutilized: any[]): string[] {
		const recommendations: string[] = [];
		
		if (cacheHitRate < 0.3) {
			recommendations.push("Consider enabling context caching for longer conversations");
		}
		
		if (underutilized.length > 5) {
			recommendations.push(`${underutilized.length} conversations have missed caching opportunities`);
		}
		
		recommendations.push("Use conversation continuation instead of starting fresh for related tasks");
		
		return recommendations;
	}

	private generatePromptingGuidelines(effective: any[], _inefficient: any[]): string[] {
		const guidelines: string[] = [];
		
		const bestPattern = effective[0];
		if (bestPattern) {
			guidelines.push(`Optimal prompt length appears to be ${bestPattern.pattern} prompts`);
		}
		
		guidelines.push("Break complex tasks into smaller, focused prompts");
		guidelines.push("Use context caching for repeated information");
		guidelines.push("Provide clear, specific instructions to reduce back-and-forth");
		
		return guidelines;
	}

	private calculateCorrelationInsights(metrics: ConversationSuccessMetrics[] | any): Array<{
		factor1: string;
		factor2: string;
		correlation: number;
		insight: string;
	}> {
		// Handle both ConversationSuccessMetrics[] and other formats
		if (!Array.isArray(metrics)) {
			return [{
				factor1: "data",
				factor2: "format",
				correlation: 0,
				insight: "Insufficient data format for correlation analysis"
			}];
		}
		
		if (metrics.length === 0) {
			return [{
				factor1: "sample",
				factor2: "size",
				correlation: 0,
				insight: "No data available for correlation analysis"
			}];
		}
		
		const insights = [];
		
		// Ensure metrics have the expected properties
		const validMetrics = metrics.filter(m => 
			m && typeof m === 'object' && 
			'timeOfDay' in m && 'successScore' in m
		);
		
		if (validMetrics.length < 2) {
			return [{
				factor1: "data",
				factor2: "quality",
				correlation: 0,
				insight: "Insufficient valid data points for correlation analysis"
			}];
		}
		
		// Correlation between time of day and success
		const timeSuccessCorr = this.calculateCorrelation(
			validMetrics.map(m => m.timeOfDay),
			validMetrics.map(m => m.successScore)
		);
		
		insights.push({
			factor1: "timeOfDay",
			factor2: "successScore", 
			correlation: timeSuccessCorr,
			insight: timeSuccessCorr > 0.3 ? "Later hours show higher success rates" : 
					timeSuccessCorr < -0.3 ? "Earlier hours show higher success rates" : 
					"Time of day has minimal impact on success"
		});
		
		// Correlation between conversation length and efficiency
		const lengthEfficiencyCorr = this.calculateCorrelation(
			validMetrics.map(m => m.messageCount || 0),
			validMetrics.map(m => m.efficiency || 0)
		);
		
		insights.push({
			factor1: "messageCount",
			factor2: "efficiency",
			correlation: lengthEfficiencyCorr,
			insight: lengthEfficiencyCorr > 0.3 ? "Longer conversations tend to be more efficient" :
					lengthEfficiencyCorr < -0.3 ? "Shorter conversations tend to be more efficient" :
					"Conversation length doesn't strongly affect efficiency"
		});
		
		return insights;
	}

	private calculateCorrelation(x: number[], y: number[]): number {
	if (x.length !== y.length || x.length === 0) return 0;

	const meanX = x.reduce((sum, val) => sum + val, 0) / x.length;
	const meanY = y.reduce((sum, val) => sum + val, 0) / y.length;

	let numerator = 0;
	let sumXSquared = 0;
	let sumYSquared = 0;

	for (let i = 0; i < x.length; i++) {
	const deltaX = x[i] - meanX;
	const deltaY = y[i] - meanY;
	numerator += deltaX * deltaY;
	sumXSquared += deltaX ** 2;
	sumYSquared += deltaY ** 2;
	}

	const denominator = Math.sqrt(sumXSquared * sumYSquared);
	return denominator === 0 ? 0 : numerator / denominator;
	}

	// Interface methods expected by tests
	analyzeConversationSuccess(entries: UsageEntry[]) {
		const conversations = this.groupByConversation(entries);
		
		const successful: string[] = [];
		const struggling: string[] = [];
		const abandoned: string[] = [];
		
		let totalSuccessScore = 0;
		let completedConversations = 0;
		
		for (const [conversationId, convEntries] of conversations) {
			const messageCount = convEntries.length;
			const totalCost = convEntries.reduce((sum, e) => sum + calculateCost(e), 0);
			const totalTokens = convEntries.reduce((sum, e) => sum + e.total_tokens, 0);
			
			// Calculate success score based on efficiency and completion
			const avgTokensPerMessage = totalTokens / messageCount;
			const costEfficiency = totalTokens / Math.max(totalCost, 0.001);
			
			let successScore = 0.5; // Base score
			
			// High token output suggests successful responses
			if (avgTokensPerMessage > 1500) successScore += 0.2;
			if (avgTokensPerMessage > 3000) successScore += 0.1;
			
			// Reasonable conversation length suggests engagement
			if (messageCount >= 2 && messageCount <= 10) successScore += 0.2;
			
			// Good cost efficiency
			if (costEfficiency > 1000) successScore += 0.1;
			
			// Normalize success score
			successScore = Math.min(1.0, successScore);
			
			totalSuccessScore += successScore;
			completedConversations++;
			
			// Classify conversation
			if (messageCount === 1) {
				abandoned.push(conversationId);
			} else if (messageCount > 15 || successScore < 0.4) {
				struggling.push(conversationId);
			} else {
				successful.push(conversationId);
			}
		}
		
		const completionRate = conversations.size > 0 ? (successful.length + struggling.length) / conversations.size : 0;
		const avgSuccessScore = completedConversations > 0 ? totalSuccessScore / completedConversations : 0;
		
		// Generate success factors and failure points
		const successFactors = [
			'Conversations with 2-10 exchanges tend to be most successful',
			'Higher token output indicates better response quality',
			'Balanced cost-to-output ratio shows efficiency'
		];
		
		const commonFailurePoints = [
			abandoned.length > 0 ? 'Some conversations abandoned after single exchange' : '',
			struggling.length > 0 ? 'Long conversations may indicate unclear requirements' : '',
			avgSuccessScore < 0.6 ? 'Overall success rate could be improved' : ''
		].filter(point => point !== '');
		
		return {
			successMetrics: {
				totalConversations: conversations.size,
				completionRate,
				avgSuccessScore
			},
			conversationCategories: {
				successful,
				struggling,
				abandoned
			},
			patterns: {
				successFactors,
				commonFailurePoints
			},
			recommendations: [
				successful.length > struggling.length ? 
					'Good conversation success rate' : 
					'Consider breaking complex tasks into smaller conversations',
				abandoned.length > conversations.size * 0.2 ? 
					'High abandonment rate - review initial prompts' :
					'Low abandonment rate indicates good engagement'
			]
		};
	}

	calculateProjectROI(entries: UsageEntry[]) {
		const projects = new Map<string, {
			totalCost: number;
			conversationCount: number;
			totalTokens: number;
			complexity: number;
		}>();
		
		// Extract project info from conversation IDs (simple heuristic)
		for (const entry of entries) {
			// Use first 8 chars of conversation ID as project identifier
			const projectId = entry.conversationId.slice(0, 8);
			
			if (!projects.has(projectId)) {
				projects.set(projectId, {
					totalCost: 0,
					conversationCount: 0,
					totalTokens: 0,
					complexity: 0
				});
			}
			
			const project = projects.get(projectId)!;
			project.totalCost += calculateCost(entry);
			project.totalTokens += entry.total_tokens;
		}
		
		// Count conversations per project
		const conversations = this.groupByConversation(entries);
		for (const [conversationId, _] of conversations) {
			const projectId = conversationId.slice(0, 8);
			if (projects.has(projectId)) {
				projects.get(projectId)!.conversationCount++;
			}
		}
		
		// Calculate ROI and characteristics for each project
		const projectAnalysis = Array.from(projects.entries()).map(([projectId, data]) => {
			const avgCostPerConversation = data.totalCost / Math.max(data.conversationCount, 1);
			const tokensPerDollar = data.totalTokens / Math.max(data.totalCost, 0.001);
			
			// ROI score based on efficiency (tokens per dollar)
			const roiScore = Math.min(1.0, tokensPerDollar / 1000); // Normalize to 0-1
			
			const characteristics = [];
			if (data.conversationCount > 10) characteristics.push('High activity project');
			if (avgCostPerConversation > 5) characteristics.push('Complex conversations');
			if (tokensPerDollar > 2000) characteristics.push('High efficiency');
			if (characteristics.length === 0) characteristics.push('Standard project');
			
			const recommendations = [];
			if (roiScore < 0.5) recommendations.push('Consider optimizing conversation approach');
			if (avgCostPerConversation > 10) recommendations.push('Break down complex tasks');
			if (recommendations.length === 0) recommendations.push('Project ROI is optimized');
			
			return {
				projectId,
				totalCost: data.totalCost,
				conversationCount: data.conversationCount,
				avgCostPerConversation,
				roiScore,
				characteristics,
				recommendations
			};
		});
		
		const totalInvestment = projectAnalysis.reduce((sum, p) => sum + p.totalCost, 0);
		const avgROI = projectAnalysis.reduce((sum, p) => sum + p.roiScore, 0) / Math.max(projectAnalysis.length, 1);
		
		// Sort projects by ROI
		const sortedProjects = [...projectAnalysis].sort((a, b) => b.roiScore - a.roiScore);
		
		return {
			projects: projectAnalysis,
			totalInvestment,
			avgROI,
			insights: {
				topPerformers: sortedProjects.slice(0, 3).map(p => p.projectId),
				underperformers: sortedProjects.slice(-3).map(p => p.projectId)
			}
		};
	}

	findCorrelations(entries: UsageEntry[]) {
		if (entries.length < 10) {
			return {
				correlations: [],
				strongestCorrelations: [],
				insights: ['Insufficient data for correlation analysis']
			};
		}
		
		const conversations = this.groupByConversation(entries);
		const dataPoints: Array<{
			cost: number;
			tokens: number;
			timeOfDay: number;
			isWeekend: number;
			messageCount: number;
			modelType: number; // 0=sonnet, 1=opus
		}> = [];
		
		// Extract data points
		for (const [_, convEntries] of conversations) {
			const cost = convEntries.reduce((sum, e) => sum + calculateCost(e), 0);
			const tokens = convEntries.reduce((sum, e) => sum + e.total_tokens, 0);
			const firstEntry = convEntries[0];
			const date = new Date(firstEntry.timestamp);
			const timeOfDay = date.getHours();
			const isWeekend = date.getDay() === 0 || date.getDay() === 6 ? 1 : 0;
			const messageCount = convEntries.length;
			const modelType = firstEntry.model.includes('opus') ? 1 : 0;
			
			dataPoints.push({
				cost,
				tokens,
				timeOfDay,
				isWeekend,
				messageCount,
				modelType
			});
		}
		
		// Calculate correlations between different variables
		const correlations: Array<{
			variable1: string;
			variable2: string;
			strength: number;
			significance: 'weak' | 'moderate' | 'strong';
			interpretation: string;
		}> = [];
		
		const variables = [
			{ name: 'cost', values: dataPoints.map(d => d.cost) },
			{ name: 'tokens', values: dataPoints.map(d => d.tokens) },
			{ name: 'time_of_day', values: dataPoints.map(d => d.timeOfDay) },
			{ name: 'weekend_usage', values: dataPoints.map(d => d.isWeekend) },
			{ name: 'message_count', values: dataPoints.map(d => d.messageCount) },
			{ name: 'model_complexity', values: dataPoints.map(d => d.modelType) }
		];
		
		// Calculate correlations between all pairs
		for (let i = 0; i < variables.length; i++) {
			for (let j = i + 1; j < variables.length; j++) {
				const var1 = variables[i];
				const var2 = variables[j];
				const correlation = this.calculateCorrelation(var1.values, var2.values);
				
				const absCorrelation = Math.abs(correlation);
				let significance: 'weak' | 'moderate' | 'strong' = 'weak';
				if (absCorrelation > 0.7) significance = 'strong';
				else if (absCorrelation > 0.4) significance = 'moderate';
				
				let interpretation = '';
				if (absCorrelation > 0.3) {
					const direction = correlation > 0 ? 'increases' : 'decreases';
					interpretation = `As ${var1.name} increases, ${var2.name} tends to ${direction}`;
				} else {
					interpretation = `No significant relationship between ${var1.name} and ${var2.name}`;
				}
				
				correlations.push({
					variable1: var1.name,
					variable2: var2.name,
					strength: correlation,
					significance,
					interpretation
				});
			}
		}
		
		// Find strongest correlations
		const strongestCorrelations = correlations
			.filter(c => Math.abs(c.strength) > 0.4)
			.sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength))
			.slice(0, 5);
		
		// Generate insights
		const insights = [];
		if (strongestCorrelations.length > 0) {
			insights.push(`Found ${strongestCorrelations.length} significant correlations`);
			const strongest = strongestCorrelations[0];
			insights.push(`Strongest relationship: ${strongest.variable1} vs ${strongest.variable2} (${strongest.strength.toFixed(2)})`);
		} else {
			insights.push('No strong correlations detected in usage patterns');
		}
		
		// Check for time-based patterns
		const timeCorrelation = correlations.find(c => 
			c.variable1.includes('time') || c.variable2.includes('time')
		);
		if (timeCorrelation && Math.abs(timeCorrelation.strength) > 0.3) {
			insights.push('Time-based usage patterns detected');
		}
		
		return {
			correlations,
			strongestCorrelations,
			insights
		};
	}

	private groupByConversation(entries: UsageEntry[]): Map<string, UsageEntry[]> {
		const conversations = new Map<string, UsageEntry[]>();
		for (const entry of entries) {
			if (!conversations.has(entry.conversationId)) {
				conversations.set(entry.conversationId, []);
			}
			conversations.get(entry.conversationId)!.push(entry);
		}
		return conversations;
	}
}
