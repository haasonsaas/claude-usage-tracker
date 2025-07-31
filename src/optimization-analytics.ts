import { calculateCost } from "./analyzer.js";
import type { UsageEntry } from "./types.js";

export interface ConversationCluster {
	id: string;
	type: "coding" | "analysis" | "writing" | "debugging" | "other";
	conversations: Array<{
		conversationId: string;
		cost: number;
		tokens: number;
		duration: number;
		efficiency: number;
	}>;
	avgCost: number;
	avgTokens: number;
	avgEfficiency: number;
	optimizationPotential: number;
	recommendations: string[];
}

export interface BatchProcessingOpportunity {
	conversationId: string;
	currentCost: number;
	batchCost: number;
	savings: number;
	eligibilityScore: number;
	reasoning: string;
	timeToProcess: number;
}

export interface ModelSwitchingRecommendation {
	conversationId: string;
	currentModel: string;
	recommendedModel: string;
	currentCost: number;
	projectedCost: number;
	savings: number;
	confidence: number;
	riskLevel: "low" | "medium" | "high";
	reasoning: string;
}

export interface OptimizationSummary {
	totalPotentialSavings: number;
	batchProcessingSavings: number;
	modelSwitchingSavings: number;
	efficiencyImprovements: number;
	recommendations: Array<{
		type: "batch" | "model_switch" | "efficiency";
		description: string;
		savings: number;
		effort: "low" | "medium" | "high";
	}>;
}

export class OptimizationAnalyzer {
	private readonly BATCH_API_DISCOUNT = 0.5; // 50% discount
	private readonly MIN_BATCH_COST = 0.1; // Minimum cost to consider for batch processing

	clusterConversations(entries: UsageEntry[]): ConversationCluster[] {
		const conversations = this.groupByConversation(entries);
		const clusters = new Map<string, ConversationCluster>();

		for (const [conversationId, convEntries] of conversations) {
			const clusterType = this.classifyConversationType(convEntries);
			const cost = convEntries.reduce((sum, e) => sum + calculateCost(e), 0);
			const tokens = convEntries.reduce((sum, e) => sum + e.total_tokens, 0);
			const duration = this.calculateConversationDuration(convEntries);
			const efficiency = tokens / Math.max(cost, 0.001);

			if (!clusters.has(clusterType)) {
				clusters.set(clusterType, {
					id: clusterType,
					type: clusterType as ConversationCluster["type"],
					conversations: [],
					avgCost: 0,
					avgTokens: 0,
					avgEfficiency: 0,
					optimizationPotential: 0,
					recommendations: [],
				});
			}

			const cluster = clusters.get(clusterType);
			if (!cluster) continue;
		cluster.conversations.push({
				conversationId,
				cost,
				tokens,
				duration,
				efficiency,
			});
		}

		// Calculate cluster statistics and optimization potential
		for (const cluster of clusters.values()) {
			this.calculateClusterStats(cluster);
			this.generateClusterRecommendations(cluster);
		}

		return Array.from(clusters.values()).sort(
			(a, b) => b.optimizationPotential - a.optimizationPotential,
		);
	}

	identifyBatchProcessingOpportunities(
		entries: UsageEntry[],
	): BatchProcessingOpportunity[] {
		const conversations = this.groupByConversation(entries);
		const opportunities: BatchProcessingOpportunity[] = [];

		for (const [conversationId, convEntries] of conversations) {
			const currentCost = convEntries.reduce(
				(sum, e) => sum + calculateCost(e),
				0,
			);

			// Skip if cost is too low to matter
			if (currentCost < this.MIN_BATCH_COST) continue;

			const batchCost = currentCost * (1 - this.BATCH_API_DISCOUNT);
			const savings = currentCost - batchCost;
			const eligibilityScore = this.calculateBatchEligibility(convEntries);

			// Only include if there's meaningful savings and good eligibility
			if (savings > 0.05 && eligibilityScore > 0.6) {
				opportunities.push({
					conversationId,
					currentCost,
					batchCost,
					savings,
					eligibilityScore,
					reasoning: this.getBatchEligibilityReasoning(
						convEntries,
						eligibilityScore,
					),
					timeToProcess: this.estimateBatchProcessingTime(convEntries),
				});
			}
		}

		return opportunities.sort((a, b) => b.savings - a.savings);
	}

	generateModelSwitchingRecommendations(
		entries: UsageEntry[],
	): ModelSwitchingRecommendation[] {
		const conversations = this.groupByConversation(entries);
		const recommendations: ModelSwitchingRecommendation[] = [];

		for (const [conversationId, convEntries] of conversations) {
			const currentModel = convEntries[0].model;
			const currentCost = convEntries.reduce(
				(sum, e) => sum + calculateCost(e),
				0,
			);

			// Skip small conversations
			if (currentCost < 0.05) continue;

			const recommendation = this.analyzeModelSwitch(
				conversationId,
				convEntries,
				currentModel,
				currentCost,
			);
			if (recommendation) {
				recommendations.push(recommendation);
			}
		}

		return recommendations.sort(
			(a, b) => Math.abs(b.savings) - Math.abs(a.savings),
		);
	}

	generateOptimizationSummary(entries: UsageEntry[]): OptimizationSummary {
		const batchOpportunities =
			this.identifyBatchProcessingOpportunities(entries);
		const modelRecommendations =
			this.generateModelSwitchingRecommendations(entries);
		const clusters = this.clusterConversations(entries);

		const batchProcessingSavings = batchOpportunities.reduce(
			(sum, opp) => sum + opp.savings,
			0,
		);
		const modelSwitchingSavings = modelRecommendations
			.filter((rec) => rec.savings > 0)
			.reduce((sum, rec) => sum + rec.savings, 0);
		const efficiencyImprovements = clusters.reduce(
			(sum, cluster) => sum + cluster.optimizationPotential,
			0,
		);

		const recommendations = [
			...batchOpportunities.slice(0, 3).map((opp) => ({
				type: "batch" as const,
				description: `Use Batch API for conversation ${opp.conversationId.slice(-8)}`,
				savings: opp.savings,
				effort: "low" as const,
			})),
			...modelRecommendations
				.slice(0, 3)
				.filter((rec) => rec.savings > 0)
				.map((rec) => ({
					type: "model_switch" as const,
					description: `Switch to ${rec.recommendedModel.includes("sonnet") ? "Sonnet" : "Opus"} for conversation ${rec.conversationId.slice(-8)}`,
					savings: rec.savings,
					effort:
						rec.riskLevel === "low" ? ("low" as const) : ("medium" as const),
				})),
			...clusters.slice(0, 2).map((cluster) => ({
				type: "efficiency" as const,
				description: `Optimize ${cluster.type} workflow patterns`,
				savings: cluster.optimizationPotential,
				effort: "medium" as const,
			})),
		];

		return {
			totalPotentialSavings:
				batchProcessingSavings + modelSwitchingSavings + efficiencyImprovements,
			batchProcessingSavings,
			modelSwitchingSavings,
			efficiencyImprovements,
			recommendations: recommendations
				.sort((a, b) => b.savings - a.savings)
				.slice(0, 5),
		};
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

	private classifyConversationType(entries: UsageEntry[]): string {
		const totalTokens = entries.reduce((sum, e) => sum + e.total_tokens, 0);
		const avgTokensPerMessage = totalTokens / entries.length;
		const conversationLength = entries.length;
		const cost = entries.reduce((sum, e) => sum + calculateCost(e), 0);

		// Classification based on patterns
		if (conversationLength > 20 && avgTokensPerMessage > 3000) {
			return "coding";
		} else if (cost > 2.0 && conversationLength > 10) {
			return "analysis";
		} else if (conversationLength > 15 && avgTokensPerMessage < 2000) {
			return "writing";
		} else if (conversationLength > 5 && avgTokensPerMessage > 4000) {
			return "debugging";
		} else {
			return "other";
		}
	}

	private calculateConversationDuration(entries: UsageEntry[]): number {
		if (entries.length < 2) return 0;

		const sortedEntries = [...entries].sort(
			(a, b) =>
				new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
		);

		const start = new Date(sortedEntries[0].timestamp);
		const end = new Date(sortedEntries[sortedEntries.length - 1].timestamp);

		return (end.getTime() - start.getTime()) / (1000 * 60); // Duration in minutes
	}

	private calculateClusterStats(cluster: ConversationCluster): void {
		const conversations = cluster.conversations;

		cluster.avgCost =
			conversations.reduce((sum, conv) => sum + conv.cost, 0) /
			conversations.length;
		cluster.avgTokens =
			conversations.reduce((sum, conv) => sum + conv.tokens, 0) /
			conversations.length;
		cluster.avgEfficiency =
			conversations.reduce((sum, conv) => sum + conv.efficiency, 0) /
			conversations.length;

		// Calculate optimization potential based on efficiency variance
		const efficiencies = conversations.map((conv) => conv.efficiency);
		const maxEfficiency = Math.max(...efficiencies);
		const currentAvgEfficiency = cluster.avgEfficiency;

		// Potential savings if all conversations reached max efficiency
		const improvementFactor = maxEfficiency / Math.max(currentAvgEfficiency, 1);
		const totalCost = conversations.reduce((sum, conv) => sum + conv.cost, 0);
		cluster.optimizationPotential = totalCost * (1 - 1 / improvementFactor);
	}

	private generateClusterRecommendations(cluster: ConversationCluster): void {
		const recommendations: string[] = [];

		if (cluster.type === "coding" && cluster.avgCost > 1.0) {
			recommendations.push(
				"Consider breaking down large coding tasks into smaller iterations",
			);
		}

		if (cluster.type === "analysis" && cluster.avgEfficiency < 5000) {
			recommendations.push(
				"Try providing more structured prompts for analysis tasks",
			);
		}

		if (cluster.type === "debugging" && cluster.conversations.length > 10) {
			recommendations.push("Create debugging templates to improve efficiency");
		}

		if (cluster.avgCost > 2.0) {
			recommendations.push(
				"Monitor for opportunities to use Sonnet instead of Opus",
			);
		}

		cluster.recommendations = recommendations;
	}

	private calculateBatchEligibility(entries: UsageEntry[]): number {
		let score = 0;

		// Longer conversations are better for batch processing
		if (entries.length > 10) score += 0.3;
		if (entries.length > 20) score += 0.2;

		// Non-interactive conversations are ideal
		const avgTimeBetweenMessages =
			this.calculateAvgTimeBetweenMessages(entries);
		if (avgTimeBetweenMessages > 30) score += 0.3; // 30+ seconds between messages

		// Higher cost conversations provide more savings
		const totalCost = entries.reduce((sum, e) => sum + calculateCost(e), 0);
		if (totalCost > 0.5) score += 0.2;

		// Consistent model usage is better for batch
		const models = new Set(entries.map((e) => e.model));
		if (models.size === 1) score += 0.1;

		return Math.min(1.0, score);
	}

	private calculateAvgTimeBetweenMessages(entries: UsageEntry[]): number {
		if (entries.length < 2) return 0;

		const sortedEntries = [...entries].sort(
			(a, b) =>
				new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
		);

		let totalTime = 0;
		for (let i = 1; i < sortedEntries.length; i++) {
			const prevTime = new Date(sortedEntries[i - 1].timestamp).getTime();
			const currTime = new Date(sortedEntries[i].timestamp).getTime();
			totalTime += (currTime - prevTime) / 1000; // Convert to seconds
		}

		return totalTime / (sortedEntries.length - 1);
	}

	private getBatchEligibilityReasoning(
		entries: UsageEntry[],
		score: number,
	): string {
		const reasons: string[] = [];

		if (entries.length > 20) reasons.push("long conversation");
		if (this.calculateAvgTimeBetweenMessages(entries) > 30)
			reasons.push("low interactivity");

		const totalCost = entries.reduce((sum, e) => sum + calculateCost(e), 0);
		if (totalCost > 0.5) reasons.push("high cost");

		const models = new Set(entries.map((e) => e.model));
		if (models.size === 1) reasons.push("consistent model");

		return `Eligible due to: ${reasons.join(", ")} (score: ${(score * 100).toFixed(0)}%)`;
	}

	private estimateBatchProcessingTime(entries: UsageEntry[]): number {
		// Estimate based on token count and complexity
		const totalTokens = entries.reduce((sum, e) => sum + e.total_tokens, 0);
		return Math.ceil(totalTokens / 10000) * 30; // ~30 seconds per 10K tokens
	}

	private analyzeModelSwitch(
		conversationId: string,
		entries: UsageEntry[],
		currentModel: string,
		currentCost: number,
	): ModelSwitchingRecommendation | null {
		const isCurrentlyOpus = currentModel.includes("opus");
		const complexity = this.assessConversationComplexity(entries);
		const hasCodeContext = this.detectCodeContext(entries);

		// Suggest Sonnet for Opus conversations with low complexity
		if (isCurrentlyOpus && complexity < 0.5 && !hasCodeContext) {
			const projectedCost = currentCost * 0.22; // 78% savings with Sonnet
			return {
				conversationId,
				currentModel,
				recommendedModel: "claude-3.5-sonnet-20241022",
				currentCost,
				projectedCost,
				savings: currentCost - projectedCost,
				confidence: 0.85,
				riskLevel: "low",
				reasoning:
					"Low complexity conversation suitable for Sonnet with significant cost savings",
			};
		}

		// Suggest Opus for Sonnet conversations with high complexity
		if (!isCurrentlyOpus && complexity > 0.7 && currentCost > 0.3) {
			const projectedCost = currentCost * 4.5; // Opus costs ~4.5x more
			return {
				conversationId,
				currentModel,
				recommendedModel: "claude-opus-4-20250514",
				currentCost,
				projectedCost,
				savings: currentCost - projectedCost, // Negative savings (additional cost)
				confidence: 0.65,
				riskLevel: "medium",
				reasoning:
					"High complexity conversation may benefit from Opus capabilities",
			};
		}

		return null;
	}

	private assessConversationComplexity(entries: UsageEntry[]): number {
		const avgTokens =
			entries.reduce((sum, e) => sum + e.total_tokens, 0) / entries.length;
		const conversationLength = entries.length;
		const totalCost = entries.reduce((sum, e) => sum + calculateCost(e), 0);

		let complexity = 0;

		// High token usage suggests complexity
		if (avgTokens > 5000) complexity += 0.3;
		if (avgTokens > 8000) complexity += 0.2;

		// Long conversations may be complex
		if (conversationLength > 15) complexity += 0.3;
		if (conversationLength > 30) complexity += 0.2;

		// High cost suggests complex reasoning
		if (totalCost > 1.0) complexity += 0.2;

		return Math.min(1.0, complexity);
	}

	private detectCodeContext(entries: UsageEntry[]): boolean {
		// Simple heuristic: moderate length conversations with consistent token usage
		const avgTokens =
			entries.reduce((sum, e) => sum + e.total_tokens, 0) / entries.length;
		return entries.length > 5 && avgTokens > 2000 && avgTokens < 8000;
	}

	// Interface methods expected by tests
	analyzeConversationClusters(entries: UsageEntry[]) {
		const conversations = this.groupByConversation(entries);
		const clusters: Array<{
			conversationIds: string[];
			characteristics: {
				avgTokens: number;
				avgCost: number;
				complexity: number;
			};
			optimization: {
				potentialSavings: number;
				recommendation: string;
			};
		}> = [];
		
		// Group conversations by similarity (token count, cost, model)
		const clusterMap = new Map<string, string[]>();
		
		for (const [conversationId, convEntries] of conversations) {
			const avgTokens = convEntries.reduce((sum, e) => sum + e.total_tokens, 0) / convEntries.length;
			const totalCost = convEntries.reduce((sum, e) => sum + calculateCost(e), 0);
			const model = convEntries[0].model;
			
			// Create cluster key based on model and complexity
			const complexity = this.calculateComplexityScore(convEntries);
			const clusterKey = `${model}-${Math.floor(complexity * 4)}`; // 4 complexity buckets
			
			if (!clusterMap.has(clusterKey)) {
				clusterMap.set(clusterKey, []);
			}
			clusterMap.get(clusterKey)!.push(conversationId);
		}
		
		// Convert to cluster analysis format
		for (const [clusterKey, conversationIds] of clusterMap) {
			if (conversationIds.length < 2) continue; // Only clusters with multiple conversations
			
			const clusterEntries = conversationIds.flatMap(id => 
				conversations.get(id) || []
			);
			
			const avgTokens = clusterEntries.reduce((sum, e) => sum + e.total_tokens, 0) / clusterEntries.length;
			const totalCost = clusterEntries.reduce((sum, e) => sum + calculateCost(e), 0);
			const avgCost = totalCost / conversationIds.length;
			const complexity = this.calculateComplexityScore(clusterEntries);
			
			// Calculate optimization potential
			const isOpus = clusterKey.includes('opus');
			const potentialSavings = isOpus && complexity < 0.5 ? totalCost * 0.78 : 0;
			
			clusters.push({
				conversationIds,
				characteristics: {
					avgTokens,
					avgCost,
					complexity
				},
				optimization: {
					potentialSavings,
					recommendation: potentialSavings > 0 
						? 'Switch to Sonnet for cost savings'
						: 'Current model appropriate for complexity'
				}
			});
		}
		
		return {
			clusters,
			totalConversations: conversations.size,
			avgClusterSize: clusters.length > 0 ? clusters.reduce((sum, c) => sum + c.conversationIds.length, 0) / clusters.length : 0
		};
	}








	private removeBatchOverlaps(opportunities: Array<{ conversationIds: string[] }>) {
		const used = new Set<string>();
		const filtered = [];
		
		// Sort by group size (descending) to prefer larger batches
		const sorted = [...opportunities].sort((a, b) => b.conversationIds.length - a.conversationIds.length);
		
		for (const opportunity of sorted) {
			const hasOverlap = opportunity.conversationIds.some(id => used.has(id));
			if (!hasOverlap) {
				opportunity.conversationIds.forEach(id => used.add(id));
				filtered.push(opportunity);
			}
		}
		
		return filtered;
	}

	private calculateComplexityScore(entries: UsageEntry[]): number {
		if (entries.length === 0) return 0;
		
		const conversationLength = entries.length;
		const avgTokensPerMessage = entries.reduce((sum, e) => sum + e.total_tokens, 0) / entries.length;
		const totalCost = entries.reduce((sum, e) => sum + calculateCost(e), 0);
		
		let score = 0;
		if (conversationLength > 10) score += 0.3;
		if (avgTokensPerMessage > 5000) score += 0.4;
		if (totalCost > 1.0) score += 0.3;
		
		return Math.min(1.0, score);
	}
}
