import { watch, type FSWatcher } from "node:fs";
import { stat } from "node:fs/promises";
import chalk from "chalk";
import { calculateCost, getCurrentWeekUsage } from "./analyzer.js";
import { CLAUDE_DATA_PATHS } from "./config.js";
import { IncrementalDataLoader } from "./incremental-loader.js";
import { TerminalCharts } from "./terminal-charts.js";
import type { UsageEntry } from "./types.js";

export interface LiveStats {
	todayTotal: number;
	todayCost: number;
	weekTotal: number;
	weekCost: number;
	lastConversationCost: number;
	lastConversationModel: string;
	burnRate: number; // % change from average
	totalConversationsToday: number;
	averageCostPerConversation: number;
	lastUpdated: Date;
}

export interface ConversationEvent {
	conversationId: string;
	model: string;
	cost: number;
	tokens: number;
	timestamp: Date;
	efficiency: "high" | "medium" | "low";
}

export class UsageWatcher {
	private lastStats: LiveStats | null = null;
	private watchers: FSWatcher[] = [];
	private isWatching = false;
	private updateInterval: NodeJS.Timeout | null = null;
	private conversationHistory: ConversationEvent[] = [];
	private lastProcessedTime = new Date();
	private dataLoader = new IncrementalDataLoader();
	private allEntries: UsageEntry[] = []; // Cache all entries for stats calculation
	private tokenHistory: number[] = []; // Track token usage over time for sparkline
	private hourlyUsage: number[] = Array(24).fill(0); // Track usage by hour
	private dailyCosts: Array<{ date: string; cost: number }> = []; // Track daily costs for weekly trend
	private fiveMinuteTokens: number[] = []; // Track tokens per 5-minute interval

	async startWatching(
		callback: (
			stats: LiveStats,
			recentConversations: ConversationEvent[],
		) => void,
	): Promise<void> {
		if (this.isWatching) return;

		this.isWatching = true;
		this.lastProcessedTime = new Date();

		console.log(chalk.dim("Starting live usage monitoring..."));
		console.log(chalk.dim("Watching directories:"));

		// Setup file watchers for all Claude data paths
		for (const dataPath of CLAUDE_DATA_PATHS) {
			try {
				const stats = await stat(dataPath);
				if (stats.isDirectory()) {
					console.log(chalk.dim(`  📁 ${dataPath}`));

					const watcher = watch(
						dataPath,
						{ recursive: true },
						async (eventType, filename) => {
							if (filename?.endsWith(".jsonl")) {
								console.log(chalk.dim(`🔍 File change detected: ${eventType} on ${filename}`));
								await this.handleFileChange();
							}
						},
					);

					this.watchers.push(watcher);
				}
			} catch (_error) {
				// Directory doesn't exist, skip silently
			}
		}

		// Initial load - get all historical data
		console.log(chalk.dim("Loading historical data..."));
		this.allEntries = await this.dataLoader.loadAllData();
		console.log(chalk.dim(`Loaded ${this.allEntries.length} historical entries`));
		
		// Initialize hourly usage from today's data
		const now = new Date();
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const todayEntries = this.allEntries.filter(
			entry => new Date(entry.timestamp) >= todayStart
		);
		
		// Reset hourly usage and populate with today's data
		this.hourlyUsage = Array(24).fill(0);
		for (const entry of todayEntries) {
			const hour = new Date(entry.timestamp).getHours();
			this.hourlyUsage[hour] += entry.total_tokens;
		}
		
		// Initialize token history with recent activity (last 2 hours in 5-minute intervals)
		this.initializeTokenHistory();
		
		// Initialize daily costs for the week
		this.initializeDailyCosts();
		
		// Initial stats calculation
		await this.updateStats();
		if (this.lastStats) {
			callback(this.lastStats, this.conversationHistory.slice(-5));
		}

		// Regular updates every 5 seconds for more responsive display
		this.updateInterval = setInterval(async () => {
			await this.updateStats();
			if (this.lastStats) {
				callback(this.lastStats, this.conversationHistory.slice(-5));
			}
		}, 5000);

		console.log(chalk.green("✅ Live monitoring started"));
	}

	private async handleFileChange(): Promise<void> {
		try {
			// Debounce rapid file changes
			await new Promise((resolve) => setTimeout(resolve, 200));

			// Get only new entries using incremental loader
			const newEntries = await this.dataLoader.loadNewEntries();
			
			if (newEntries.length > 0) {
				console.log(chalk.yellow(`\n📥 Processing ${newEntries.length} new entries...`));
				
				// Add new entries to our cache
				this.allEntries.push(...newEntries);
				
				// Sort to maintain chronological order
				this.allEntries.sort(
					(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
				);
				
				// Memory management: keep only last 30 days of data in memory
				const thirtyDaysAgo = new Date();
				thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
				this.allEntries = this.allEntries.filter(
					entry => new Date(entry.timestamp) >= thirtyDaysAgo
				);
				
				// Process new entries for conversation history
				for (const entry of newEntries) {
					const conversationEvent: ConversationEvent = {
						conversationId: entry.conversationId,
						model: entry.model,
						cost: calculateCost(entry),
						tokens: entry.total_tokens,
						timestamp: new Date(entry.timestamp),
						efficiency: this.calculateEfficiency(entry),
					};

					this.conversationHistory.push(conversationEvent);

					// Keep only last 50 conversations in memory
					if (this.conversationHistory.length > 50) {
						this.conversationHistory = this.conversationHistory.slice(-50);
					}
				}

				// Debug: show what was added
				const totalNewCost = newEntries.reduce((sum, e) => sum + calculateCost(e), 0);
				const totalNewTokens = newEntries.reduce((sum, e) => sum + e.total_tokens, 0);
				console.log(chalk.green(`✅ Added ${newEntries.length} entries, cost: $${totalNewCost.toFixed(4)}`));
				console.log(chalk.blue(`📊 Total entries in memory: ${this.allEntries.length}`));

				// Update token history for sparkline
				this.tokenHistory.push(totalNewTokens);
				if (this.tokenHistory.length > 50) {
					this.tokenHistory = this.tokenHistory.slice(-50);
				}

				// Update hourly usage
				for (const entry of newEntries) {
					const hour = new Date(entry.timestamp).getHours();
					this.hourlyUsage[hour] += entry.total_tokens;
				}

				this.lastProcessedTime = new Date();
				await this.updateStats();
			}
		} catch (_error) {
			// Silently handle file reading errors during updates
			console.error(chalk.red("Error processing file change:"), _error);
		}
	}

	private calculateEfficiency(entry: UsageEntry): "high" | "medium" | "low" {
		const cost = calculateCost(entry);
		const tokensPerDollar = entry.total_tokens / Math.max(cost, 0.001);

		// Efficiency thresholds based on model expectations
		const isOpus = entry.model.includes("opus");
		const thresholds = isOpus
			? { high: 8000, medium: 4000 } // Opus thresholds
			: { high: 15000, medium: 8000 }; // Sonnet thresholds

		if (tokensPerDollar > thresholds.high) return "high";
		if (tokensPerDollar > thresholds.medium) return "medium";
		return "low";
	}

	private async updateStats(): Promise<void> {
		try {
			const entries = this.allEntries; // Use cached entries
			const now = new Date();
			const todayStart = new Date(
				now.getFullYear(),
				now.getMonth(),
				now.getDate(),
			);

			// Today's stats
			const todayEntries = entries.filter(
				(entry) => new Date(entry.timestamp) >= todayStart,
			);

			const todayTotal = todayEntries.reduce(
				(sum, e) => sum + e.total_tokens,
				0,
			);
			const todayCost = todayEntries.reduce(
				(sum, e) => sum + calculateCost(e),
				0,
			);
			const todayConversations = new Set(
				todayEntries.map((e) => e.conversationId),
			).size;

			// Week stats
			const weekUsage = getCurrentWeekUsage(entries);

			// Last conversation
			const sortedEntries = entries.sort(
				(a, b) =>
					new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
			);
			const lastEntry = sortedEntries[0];
			const lastConversationCost = lastEntry ? calculateCost(lastEntry) : 0;
			const lastConversationModel = lastEntry ? lastEntry.model : "N/A";

			// Calculate burn rate (compared to last 7 days average)
			const last7Days = entries.filter((entry) => {
				const entryDate = new Date(entry.timestamp);
				const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
				return entryDate >= cutoff && entryDate < todayStart;
			});

			const avgDailyCost =
				last7Days.length > 0
					? last7Days.reduce((sum, e) => sum + calculateCost(e), 0) / 7
					: 0;

			const burnRate =
				avgDailyCost > 0
					? ((todayCost - avgDailyCost) / avgDailyCost) * 100
					: 0;

			this.lastStats = {
				todayTotal,
				todayCost,
				weekTotal: weekUsage.totalTokens,
				weekCost: weekUsage.cost,
				lastConversationCost,
				lastConversationModel,
				burnRate,
				totalConversationsToday: todayConversations,
				averageCostPerConversation:
					todayConversations > 0 ? todayCost / todayConversations : 0,
				lastUpdated: new Date(),
			};
		} catch (_error) {
			console.error(chalk.red("Error updating stats:"), _error);
		}
	}

	stopWatching(): void {
		if (!this.isWatching) return;

		this.isWatching = false;

		// Close all file watchers
		for (const watcher of this.watchers) {
			watcher.close();
		}
		this.watchers = [];

		// Clear update interval
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
			this.updateInterval = null;
		}
		
		// Clear cache to free memory
		this.allEntries = [];
		this.conversationHistory = [];
		this.dataLoader.clearCache();

		console.log(chalk.yellow("⏹️  Live monitoring stopped"));
	}

	formatLiveDisplay(
		stats: LiveStats,
		recentConversations: ConversationEvent[],
	): string {
		const now = new Date();
		let output = "";

		// Clear screen and move to top
		output += "\x1b[2J\x1b[H";

		// Compact header
		output += chalk.blue.bold("CLAUDE USAGE MONITOR ") + chalk.gray(`${now.toLocaleTimeString()}\n`);
		output += chalk.gray("━".repeat(60)) + "\n\n";

		// Main stats in a compact grid
		const projections = this.calculateProjections(stats);
		
		// Row 1: Today & Week
		output += chalk.cyan("Today: ") + chalk.white(`$${stats.todayCost.toFixed(2)}`);
		output += chalk.gray(" | ");
		output += chalk.cyan("Week: ") + chalk.white(`$${stats.weekCost.toFixed(2)}`);
		output += chalk.gray(" | ");
		output += chalk.cyan("Month proj: ") + chalk.yellow(`$${projections.monthlyProjection.toFixed(0)}`);
		
		// Add warning icon if spending is high
		if (projections.monthlyProjection > 1000) {
			output += chalk.red(" ⚠️");
		}
		output += "\n";

		// Row 2: Model split & burn rate
		const modelUsage = this.getModelUsageDistribution();
		if (modelUsage.length > 0) {
			const sonnetPct = modelUsage.find(m => m.label === "Sonnet 4")?.value || 0;
			const opusPct = modelUsage.find(m => m.label === "Opus 4")?.value || 0;
			const totalTokens = sonnetPct + opusPct;
			
			if (totalTokens > 0) {
				const sonnetPercent = Math.round((sonnetPct / totalTokens) * 100);
				const opusPercent = Math.round((opusPct / totalTokens) * 100);
				
				output += chalk.blue("S4: ") + chalk.white(`${sonnetPercent}%`);
				output += chalk.gray(" | ");
				output += chalk.magenta("O4: ") + chalk.white(`${opusPercent}%`);
			}
		}
		
		output += chalk.gray(" | ");
		const burnRateColor = stats.burnRate > 20 ? chalk.red : stats.burnRate > 0 ? chalk.yellow : chalk.green;
		output += chalk.cyan("Burn: ") + burnRateColor(`${stats.burnRate > 0 ? "+" : ""}${stats.burnRate.toFixed(0)}%`);
		output += "\n\n";

		// Token usage sparkline - more compact
		output += chalk.cyan("Activity: ");
		const sparkline = TerminalCharts.sparkline(
			this.tokenHistory.length > 0 ? this.tokenHistory : [0], 
			40, 
			{
				color: (value, max) => {
					if (value > max * 0.8) return chalk.red;
					if (value > max * 0.5) return chalk.yellow;
					return chalk.green;
				},
			}
		);
		output += sparkline + "\n";
		
		// Hourly heat map - single line
		output += chalk.cyan("24h pattern: ");
		const hourlySparkline = TerminalCharts.sparkline(this.hourlyUsage, 24, {
			color: (value, max) => {
				if (value === 0) return chalk.gray;
				if (value > max * 0.7) return chalk.red;
				if (value > max * 0.4) return chalk.yellow;
				return chalk.green;
			},
		});
		output += hourlySparkline + "\n\n";

		// Recent activity - compact view
		if (recentConversations.length > 0) {
			output += chalk.cyan("Recent: ");
			const recent = recentConversations.slice(-3).reverse();
			recent.forEach((conv, i) => {
				if (i > 0) output += " → ";
				const model = conv.model.includes("opus") ? "O4" : "S4";
				const modelColor = conv.model.includes("opus") ? chalk.magenta : chalk.blue;
				output += modelColor(model) + chalk.gray(`/$${conv.cost.toFixed(2)}`);
			});
			output += "\n\n";
		}

		// Only show critical warnings
		if (projections.monthlyProjection > 1000) {
			output += chalk.red.bold("⚠️  BUDGET ALERT: ") + 
				chalk.red(`Monthly projection: $${projections.monthlyProjection.toFixed(0)}\n`);
		}
		
		if (stats.weekCost > 200) {
			output += chalk.yellow.bold("⚠️  HIGH USAGE: ") + 
				chalk.yellow(`This week already at $${stats.weekCost.toFixed(0)}\n`);
		}
		
		if (stats.burnRate > 50) {
			output += chalk.red.bold("🔥 BURN RATE: ") + 
				chalk.red(`${stats.burnRate.toFixed(0)}% above average\n`);
		}
		
		// Spacer before controls
		output += "\n";

		// Controls
		output += chalk.gray("──────────────────────────────────────────────────────────\n");
		output += chalk.gray("Press Ctrl+C to stop monitoring\n");

		return output;
	}

	private formatTokens(tokens: number): string {
		if (tokens >= 1_000_000) {
			return `${(tokens / 1_000_000).toFixed(2)}M`;
		} else if (tokens >= 1_000) {
			return `${(tokens / 1_000).toFixed(1)}K`;
		}
		return tokens.toString();
	}

	private getTimeAgo(timestamp: Date): string {
		const now = new Date();
		const diffMs = now.getTime() - timestamp.getTime();
		const diffMins = Math.floor(diffMs / (1000 * 60));

		if (diffMins < 1) return "now";
		if (diffMins === 1) return "1min ago";
		if (diffMins < 60) return `${diffMins}min ago`;

		const diffHours = Math.floor(diffMins / 60);
		if (diffHours === 1) return "1hr ago";
		if (diffHours < 24) return `${diffHours}hr ago`;

		return timestamp.toLocaleDateString();
	}

	private getModelUsageDistribution(): Array<{
		label: string;
		value: number;
		color?: typeof chalk;
	}> {
		const now = new Date();
		const todayStart = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
		);

		const todayEntries = this.allEntries.filter(
			(entry) => new Date(entry.timestamp) >= todayStart,
		);

		const sonnetTokens = todayEntries
			.filter((e) => e.model.includes("sonnet"))
			.reduce((sum, e) => sum + e.total_tokens, 0);

		const opusTokens = todayEntries
			.filter((e) => e.model.includes("opus"))
			.reduce((sum, e) => sum + e.total_tokens, 0);

		const totalTokens = sonnetTokens + opusTokens;

		if (totalTokens === 0) return [];

		return [
			{
				label: "Sonnet 4",
				value: sonnetTokens,
				color: chalk.blue,
			},
			{
				label: "Opus 4",
				value: opusTokens,
				color: chalk.magenta,
			},
		];
	}

	private initializeTokenHistory(): void {
		const now = new Date();
		const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
		
		// Create 5-minute buckets for the last 2 hours
		const buckets: number[] = Array(24).fill(0); // 24 five-minute intervals
		
		const recentEntries = this.allEntries.filter(
			entry => new Date(entry.timestamp) >= twoHoursAgo
		);
		
		recentEntries.forEach(entry => {
			const entryTime = new Date(entry.timestamp);
			const minutesAgo = Math.floor((now.getTime() - entryTime.getTime()) / (1000 * 60));
			const bucketIndex = Math.floor(minutesAgo / 5);
			
			if (bucketIndex >= 0 && bucketIndex < 24) {
				buckets[23 - bucketIndex] += entry.total_tokens;
			}
		});
		
		// Store non-zero buckets to create a meaningful sparkline
		this.fiveMinuteTokens = buckets;
		this.tokenHistory = buckets.filter(tokens => tokens > 0);
		
		// If no recent activity, add some sample data to show the sparkline
		if (this.tokenHistory.length === 0) {
			this.tokenHistory = [0];
		}
	}

	private initializeDailyCosts(): void {
		const now = new Date();
		const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		
		// Group entries by day
		const dailyMap = new Map<string, number>();
		
		this.allEntries
			.filter(entry => new Date(entry.timestamp) >= sevenDaysAgo)
			.forEach(entry => {
				const date = new Date(entry.timestamp).toISOString().split('T')[0];
				const cost = calculateCost(entry);
				dailyMap.set(date, (dailyMap.get(date) || 0) + cost);
			});
		
		// Convert to array and sort by date
		this.dailyCosts = Array.from(dailyMap.entries())
			.map(([date, cost]) => ({ date, cost }))
			.sort((a, b) => a.date.localeCompare(b.date));
	}

	private updateFiveMinuteTokens(newTokens: number): void {
		// Shift array and add new value
		this.fiveMinuteTokens.shift();
		this.fiveMinuteTokens.push(newTokens);
		
		// Update token history for sparkline
		this.tokenHistory = this.fiveMinuteTokens.filter(tokens => tokens > 0);
		if (this.tokenHistory.length === 0) {
			this.tokenHistory = [0];
		}
		
		// Keep reasonable size
		if (this.tokenHistory.length > 50) {
			this.tokenHistory = this.tokenHistory.slice(-50);
		}
	}

	private calculateProjections(stats: LiveStats): {
		dailyAverage: number;
		weeklyProjection: number;
		monthlyProjection: number;
	} {
		// Calculate daily average from the last 7 days
		const dailyAverage = this.dailyCosts.length > 0
			? this.dailyCosts.reduce((sum, d) => sum + d.cost, 0) / this.dailyCosts.length
			: stats.todayCost;
		
		// Project based on current burn rate if significantly different from average
		const adjustedDaily = stats.burnRate > 20 
			? dailyAverage * (1 + stats.burnRate / 100)
			: stats.burnRate < -20
			? dailyAverage * (1 + stats.burnRate / 100)
			: dailyAverage;
		
		return {
			dailyAverage,
			weeklyProjection: adjustedDaily * 7,
			monthlyProjection: adjustedDaily * 30,
		};
	}
}
