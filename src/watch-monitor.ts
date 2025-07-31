import { watch } from "node:fs";
import { stat } from "node:fs/promises";
import chalk from "chalk";
import { calculateCost, getCurrentWeekUsage } from "./analyzer.js";
import { CLAUDE_DATA_PATHS } from "./config.js";
import { loadUsageData } from "./data-loader.js";
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
	private watchers: fs.FSWatcher[] = [];
	private isWatching = false;
	private updateInterval: NodeJS.Timeout | null = null;
	private conversationHistory: ConversationEvent[] = [];
	private lastProcessedTime = new Date();

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
						async (_eventType, filename) => {
							if (filename?.endsWith(".jsonl")) {
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

		// Initial stats calculation
		await this.updateStats();
		if (this.lastStats) {
			callback(this.lastStats, this.conversationHistory.slice(-5));
		}

		// Regular updates every 10 seconds
		this.updateInterval = setInterval(async () => {
			await this.updateStats();
			if (this.lastStats) {
				callback(this.lastStats, this.conversationHistory.slice(-5));
			}
		}, 10000);

		console.log(chalk.green("✅ Live monitoring started"));
	}

	private async handleFileChange(): Promise<void> {
		try {
			// Debounce rapid file changes
			await new Promise((resolve) => setTimeout(resolve, 500));

			const entries = await loadUsageData();
			const newEntries = entries.filter(
				(entry) => new Date(entry.timestamp) > this.lastProcessedTime,
			);

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

			this.lastProcessedTime = new Date();
			await this.updateStats();
		} catch (_error) {
			// Silently handle file reading errors during updates
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
			const entries = await loadUsageData();
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
			};
		} catch (_error) {
			console.error(chalk.red("Error updating stats:"), error);
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

		// Header with timestamp
		output +=
			chalk.blue.bold("🔴 LIVE USAGE MONITOR") +
			chalk.gray(` (${now.toLocaleTimeString()})\n`);
		output += `${chalk.gray("─".repeat(70))}\n\n`;

		// Today's stats
		output += chalk.cyan.bold("📊 Today's Usage\n");
		output += `Tokens: ${chalk.white(this.formatTokens(stats.todayTotal))} | `;
		output += `Cost: ${chalk.green(`$${stats.todayCost.toFixed(2)}`)} | `;
		output += `Conversations: ${chalk.white(stats.totalConversationsToday)}\n`;

		// Burn rate indicator
		const burnRateColor =
			stats.burnRate > 20
				? chalk.red
				: stats.burnRate > 0
					? chalk.yellow
					: chalk.green;
		const burnRateIcon =
			stats.burnRate > 20 ? "🔥" : stats.burnRate > 0 ? "📈" : "📉";
		output += `Burn Rate: ${burnRateColor(`${stats.burnRate > 0 ? "+" : ""}${stats.burnRate.toFixed(1)}%`)} ${burnRateIcon}\n\n`;

		// Week stats
		output += chalk.cyan.bold("📅 This Week\n");
		output += `Tokens: ${chalk.white(this.formatTokens(stats.weekTotal))} | `;
		output += `Cost: ${chalk.green(`$${stats.weekCost.toFixed(2)}`)}\n\n`;

		// Last conversation
		if (stats.lastConversationModel !== "N/A") {
			const modelName = stats.lastConversationModel.includes("opus")
				? "Opus 4"
				: "Sonnet 4";
			const modelColor = stats.lastConversationModel.includes("opus")
				? chalk.magenta
				: chalk.blue;

			output += chalk.cyan.bold("💬 Last Conversation\n");
			output += `Model: ${modelColor(modelName)} | `;
			output += `Cost: ${chalk.green(`$${stats.lastConversationCost.toFixed(4)}`)}\n\n`;
		}

		// Recent conversations
		if (recentConversations.length > 0) {
			output += chalk.cyan.bold("📝 Recent Activity\n");

			const recent = recentConversations.slice(-3).reverse();
			for (const conv of recent) {
				const timeAgo = this.getTimeAgo(conv.timestamp);
				const modelName = conv.model.includes("opus") ? "Opus" : "Sonnet";
				const modelColor = conv.model.includes("opus")
					? chalk.magenta
					: chalk.blue;
				const efficiencyIcon =
					conv.efficiency === "high"
						? "⭐⭐⭐"
						: conv.efficiency === "medium"
							? "⭐⭐"
							: "⭐";

				output += chalk.gray(`${timeAgo} | `);
				output += `${modelColor(modelName)} | `;
				output += `${chalk.green(`$${conv.cost.toFixed(4)}`)} | `;
				output += `${efficiencyIcon}\n`;
			}
			output += "\n";
		}

		// Tips and alerts
		if (stats.burnRate > 50) {
			output += chalk.red.bold("⚠️  HIGH BURN RATE ALERT\n");
			output += chalk.red(
				"Consider switching to Sonnet 4 for simpler tasks\n\n",
			);
		} else if (stats.averageCostPerConversation > 50) {
			output += chalk.yellow.bold("💡 EFFICIENCY TIP\n");
			output += chalk.yellow(
				"Average conversation cost is high - consider breaking down complex tasks\n\n",
			);
		}

		// Controls
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
}
