#!/usr/bin/env node

import chalk from "chalk";
import { program } from "commander";
import {
	aggregateDailyUsage,
	getCurrentWeekUsage,
	getEfficiencyInsights,
	getRateLimitInfo,
} from "./analyzer.js";
import type { PlanType } from "./config.js";
import { loadUsageData } from "./data-loader.js";
import {
	formatDailyTable,
	formatEfficiencyInsights,
	formatHeader,
	formatRateLimitStatus,
	formatWeeklySummary,
} from "./formatters.js";
import { ModelAdvisor } from "./model-advisor.js";
import { UsageWatcher } from "./watch-monitor.js";

function handleError(error: unknown, isJsonMode = false): void {
	if (isJsonMode) {
		console.log(JSON.stringify({
			error: "Command failed",
			message: error instanceof Error ? error.message : String(error),
			timestamp: new Date().toISOString()
		}, null, 2));
	} else {
		console.error(chalk.red("❌ Error:"));
		if (error instanceof Error) {
			console.error(chalk.gray(error.message));
			if (error.stack && process.env.NODE_ENV !== "production") {
				console.error(chalk.gray(error.stack));
			}
		} else {
			console.error(chalk.gray(String(error)));
		}
	}
	process.exit(1);
}

program
	.name("claude-usage")
	.description("Track and analyze Claude Code usage with rate limit awareness")
	.version("1.0.0")
	.option(
		"-c, --config <path>",
		"Path to configuration file (YAML format)"
	);

program
	.command("status")
	.description("Show current week usage and rate limit status")
	.option(
		"-p, --plan <plan>",
		"Your Claude plan (Pro, $100 Max, $200 Max)",
		"Pro",
	)
	.option("-j, --json", "Output as JSON instead of formatted text")
	.action(async (options) => {
		try {
			const plan = options.plan as PlanType;
			if (!["Pro", "$100 Max", "$200 Max"].includes(plan)) {
				console.error(
					chalk.red("Invalid plan. Must be one of: Pro, $100 Max, $200 Max"),
				);
				process.exit(1);
			}

			if (!options.json) {
				console.log(chalk.blue("Loading usage data..."));
			}
			const entries = await loadUsageData();

			if (entries.length === 0) {
				if (options.json) {
					console.log(
						JSON.stringify(
							{
								error: "No usage data found",
								message:
									"Make sure Claude Code has been used and data is available.",
							},
							null,
							2,
						),
					);
				} else {
					console.log(
						chalk.yellow(
							"No usage data found. Make sure Claude Code has been used and data is available.",
						),
					);
				}
				return;
			}

			const weeklyUsage = getCurrentWeekUsage(entries);
			const rateLimitInfo = getRateLimitInfo(weeklyUsage, plan);

			if (options.json) {
				const jsonOutput = {
					plan,
					weeklyUsage,
					rateLimitInfo,
					warnings: [] as Array<{ level: string; message: string }>,
				};

				// Add warnings
				if (
					rateLimitInfo.percentUsed.sonnet4.max > 80 ||
					rateLimitInfo.percentUsed.opus4.max > 80
				) {
					jsonOutput.warnings.push({
						level: "warning",
						message: "You are approaching your weekly rate limits!",
					});
				} else if (
					rateLimitInfo.percentUsed.sonnet4.max > 50 ||
					rateLimitInfo.percentUsed.opus4.max > 50
				) {
					jsonOutput.warnings.push({
						level: "notice",
						message: "You have used over 50% of your weekly limits.",
					});
				}

				console.log(JSON.stringify(jsonOutput, null, 2));
			} else {
				console.log(formatHeader(`Claude Code Usage Status (${plan} Plan)`));
				console.log(formatWeeklySummary(weeklyUsage));
				console.log(formatHeader("Rate Limit Status"));
				console.log(formatRateLimitStatus(rateLimitInfo));

				// Warnings
				if (
					rateLimitInfo.percentUsed.sonnet4.max > 80 ||
					rateLimitInfo.percentUsed.opus4.max > 80
				) {
					console.log(
						chalk.red.bold(
							"\\n⚠️  WARNING: You are approaching your weekly rate limits!",
						),
					);
				} else if (
					rateLimitInfo.percentUsed.sonnet4.max > 50 ||
					rateLimitInfo.percentUsed.opus4.max > 50
				) {
					console.log(
						chalk.yellow.bold(
							"\\n⚡ NOTICE: You have used over 50% of your weekly limits.",
						),
					);
				}
			}
		} catch (error) {
			handleError(error, options.json);
		}
	});

program
	.command("daily")
	.description("Show daily usage breakdown")
	.option("-d, --days <days>", "Number of days to show", "7")
	.option("-j, --json", "Output as JSON instead of formatted text")
	.action(async (options) => {
		try {
			if (!options.json) {
				console.log(chalk.blue("Loading usage data..."));
			}
			const entries = await loadUsageData();

			if (entries.length === 0) {
				if (options.json) {
					console.log(JSON.stringify({
						error: "No usage data found"
					}, null, 2));
				} else {
					console.log(chalk.yellow("No usage data found."));
				}
				return;
			}

			const dailyUsage = aggregateDailyUsage(entries);
			const days = parseInt(options.days);

			// Limit to requested number of days
			const recentDays = Array.from(dailyUsage.keys())
				.sort()
				.reverse()
				.slice(0, days);

			const filteredUsage = new Map();
			for (const day of recentDays) {
				const usage = dailyUsage.get(day);
				if (usage) {
					filteredUsage.set(day, usage);
				}
			}

			if (options.json) {
				const jsonOutput = {
					days: parseInt(options.days),
					dailyUsage: Object.fromEntries(filteredUsage)
				};
				console.log(JSON.stringify(jsonOutput, null, 2));
			} else {
				console.log(formatHeader(`Daily Usage (Last ${days} days)`));
				console.log(formatDailyTable(filteredUsage));
			}
		} catch (error) {
			console.error(chalk.red("Error loading usage data:"), error);
			process.exit(1);
		}
	});

program
	.command("week")
	.description("Show current week summary")
	.action(async () => {
		try {
			console.log(chalk.blue("Loading usage data..."));
			const entries = await loadUsageData();

			if (entries.length === 0) {
				console.log(chalk.yellow("No usage data found."));
				return;
			}

			const weeklyUsage = getCurrentWeekUsage(entries);

			console.log(formatHeader("Current Week Summary"));
			console.log(formatWeeklySummary(weeklyUsage));
		} catch (error) {
			console.error(chalk.red("Error loading usage data:"), error);
			process.exit(1);
		}
	});

program
	.command("check-limits")
	.description("Check rate limit status for all plans")
	.action(async () => {
		try {
			console.log(chalk.blue("Loading usage data..."));
			const entries = await loadUsageData();

			if (entries.length === 0) {
				console.log(chalk.yellow("No usage data found."));
				return;
			}

			const weeklyUsage = getCurrentWeekUsage(entries);

			const plans: PlanType[] = ["Pro", "$100 Max", "$200 Max"];

			for (const plan of plans) {
				const rateLimitInfo = getRateLimitInfo(weeklyUsage, plan);
				console.log(formatHeader(`Rate Limits - ${plan} Plan`));
				console.log(formatRateLimitStatus(rateLimitInfo));
			}
		} catch (error) {
			console.error(chalk.red("Error loading usage data:"), error);
			process.exit(1);
		}
	});

program
	.command("insights")
	.description(
		"Show detailed efficiency insights and optimization recommendations",
	)
	.option("-d, --days <days>", "Number of days to analyze", "30")
	.action(async (options) => {
		try {
			console.log(chalk.dim("Loading usage data..."));
			const entries = await loadUsageData();

			if (entries.length === 0) {
				console.log(
					chalk.yellow(
						"No usage data found. Make sure Claude Code has been used and data is available.",
					),
				);
				return;
			}

			// Filter to specified number of days
			const days = parseInt(options.days);
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - days);

			const filteredEntries = entries.filter(
				(entry) => new Date(entry.timestamp) >= cutoffDate,
			);

			const insights = getEfficiencyInsights(filteredEntries);
			console.log(formatEfficiencyInsights(insights));
		} catch (error) {
			console.error(chalk.red("Error loading usage data:"), error);
			process.exit(1);
		}
	});

program
	.command("recommend")
	.description("Get model recommendation for a specific task or prompt")
	.argument(
		"[prompt]",
		"The task or prompt to analyze (optional - will prompt interactively)",
	)
	.action(async (promptArg) => {
		const advisor = new ModelAdvisor();

		let prompt = promptArg;

		if (!prompt) {
			// Interactive mode
			const readline = await import("node:readline");
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout,
			});

			console.log(chalk.blue.bold("🤖 Model Advisor - Interactive Mode\n"));
			console.log(chalk.gray("Describe your task or paste your prompt below:"));
			console.log(chalk.gray("(Press Ctrl+C to exit)\n"));

			prompt = await new Promise<string>((resolve) => {
				rl.question(chalk.cyan("Your task: "), (answer) => {
					rl.close();
					resolve(answer);
				});
			});

			if (!prompt.trim()) {
				console.log(chalk.yellow("No prompt provided. Exiting."));
				return;
			}
		}

		console.log(); // Add spacing

		const classification = advisor.classifyTask(prompt);
		const recommendation = advisor.getModelRecommendation(classification);

		console.log(advisor.formatRecommendation(classification, recommendation));

		// Show cost savings potential
		if (recommendation.costSavings && recommendation.costSavings > 0) {
			console.log(chalk.green.bold(`💡 Daily Savings Potential:`));
			console.log(
				chalk.green(
					`If you have 10 similar conversations: $${(recommendation.costSavings * 10).toFixed(2)}`,
				),
			);
			console.log(
				chalk.green(
					`Monthly potential: $${(recommendation.costSavings * 10 * 30).toFixed(0)}\n`,
				),
			);
		}
	});

program
	.command("watch")
	.description("Live monitoring of Claude usage with real-time cost tracking")
	.action(async () => {
		const watcher = new UsageWatcher();

		// Handle graceful shutdown
		process.on("SIGINT", () => {
			watcher.stopWatching();
			console.log(chalk.yellow("\n👋 Monitoring stopped. Goodbye!"));
			process.exit(0);
		});

		process.on("SIGTERM", () => {
			watcher.stopWatching();
			process.exit(0);
		});

		try {
			await watcher.startWatching((stats, recentConversations) => {
				const display = watcher.formatLiveDisplay(stats, recentConversations);
				console.log(display);
			});

			// Keep the process running
			await new Promise(() => {}); // Infinite promise
		} catch (error) {
			console.error(chalk.red("Error starting live monitor:"), error);
			process.exit(1);
		}
	});

// Default command
if (process.argv.length === 2) {
	program.parse(["node", "cli.js", "status"]);
} else {
	program.parse(process.argv);
}
