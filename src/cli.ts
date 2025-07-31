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
import { DeepAnalyzer } from "./deep-analysis.js";
import { ModelAdvisor } from "./model-advisor.js";
import { OptimizationAnalyzer } from "./optimization-analytics.js";
import { PatternAnalyzer } from "./pattern-analysis.js";
import { PredictiveAnalyzer } from "./predictive-analytics.js";
import { ResearchAnalyzer } from "./research-analytics.js";
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

program
	.command("predict")
	.description("Predictive analytics: budget burn, anomalies, model suggestions")
	.option("--json", "Output as JSON")
	.action(async (options) => {
		try {
			const entries = await loadUsageData();
			if (entries.length === 0) {
				if (options.json) {
					console.log(JSON.stringify({ error: "No usage data found" }, null, 2));
				} else {
					console.log(chalk.yellow("No usage data found."));
				}
				return;
			}

			const analyzer = new PredictiveAnalyzer();
			const budgetPrediction = analyzer.predictBudgetBurn(entries);
			const anomalies = analyzer.detectUsageAnomalies(entries);
			const modelSuggestions = analyzer.generateModelSuggestions(entries);

			if (options.json) {
				console.log(JSON.stringify({
					budgetPrediction,
					anomalies,
					modelSuggestions: modelSuggestions.slice(0, 5)
				}, null, 2));
			} else {
				console.log(formatHeader("🔮 Predictive Analytics"));
				
				// Budget prediction
				console.log(chalk.blue.bold("💰 Budget Prediction"));
				console.log(`Current spend: ${chalk.green(`$${budgetPrediction.currentSpend.toFixed(2)}`)}`);
				console.log(`Projected monthly: ${chalk.yellow(`$${budgetPrediction.projectedMonthlySpend.toFixed(2)}`)}`);
				console.log(`Days until budget exhausted: ${budgetPrediction.daysUntilBudgetExhausted > 0 ? chalk.red(budgetPrediction.daysUntilBudgetExhausted) : chalk.green("N/A")}`);
				console.log(`Trend: ${budgetPrediction.trendDirection === "increasing" ? chalk.red("📈") : budgetPrediction.trendDirection === "decreasing" ? chalk.green("📉") : "📊"} ${budgetPrediction.trendDirection}`);
				console.log(`Confidence: ${chalk.cyan(`${(budgetPrediction.confidenceLevel * 100).toFixed(0)}%`)}\n`);

				// Recommendations
				if (budgetPrediction.recommendations.length > 0) {
					console.log(chalk.yellow.bold("💡 Recommendations:"));
					budgetPrediction.recommendations.forEach(rec => console.log(`  ${rec}`));
					console.log();
				}

				// Anomalies
				if (anomalies.length > 0) {
					console.log(chalk.red.bold("⚠️  Usage Anomalies"));
					anomalies.forEach(anomaly => {
						const severityIcon = anomaly.severity === "high" ? "🔴" : anomaly.severity === "medium" ? "🟡" : "🟢";
						console.log(`${severityIcon} ${anomaly.description}`);
					});
					console.log();
				}

				// Model suggestions
				if (modelSuggestions.length > 0) {
					console.log(chalk.blue.bold("🎯 Model Optimization Suggestions"));
					modelSuggestions.slice(0, 3).forEach(suggestion => {
						const savingsText = suggestion.potentialSavings > 0 ? 
							chalk.green(`+$${suggestion.potentialSavings.toFixed(3)}`) : 
							chalk.red(`$${Math.abs(suggestion.potentialSavings).toFixed(3)}`);
						console.log(`${suggestion.conversationContext}: ${suggestion.reasoning} (${savingsText})`);
					});
				}
			}
		} catch (error) {
			handleError(error, options.json);
		}
	});

program
	.command("optimize")
	.description("Cost optimization analytics: clustering, batch processing, model switching")
	.option("--json", "Output as JSON")
	.action(async (options) => {
		try {
			const entries = await loadUsageData();
			if (entries.length === 0) {
				if (options.json) {
					console.log(JSON.stringify({ error: "No usage data found" }, null, 2));
				} else {
					console.log(chalk.yellow("No usage data found."));
				}
				return;
			}

			const analyzer = new OptimizationAnalyzer();
			const summary = analyzer.generateOptimizationSummary(entries);
			const clusters = analyzer.clusterConversations(entries);
			const batchOpportunities = analyzer.identifyBatchProcessingOpportunities(entries);

			if (options.json) {
				console.log(JSON.stringify({
					summary,
					clusters: clusters.slice(0, 5),
					batchOpportunities: batchOpportunities.opportunities.slice(0, 5)
				}, null, 2));
			} else {
				console.log(formatHeader("⚡ Optimization Analytics"));
				
				// Summary
				console.log(chalk.green.bold(`💰 Total Potential Savings: $${summary.totalPotentialSavings.toFixed(2)}`));
				console.log(`  • Batch Processing: ${chalk.cyan(`$${summary.batchProcessingSavings.toFixed(2)}`)}`);
				console.log(`  • Model Switching: ${chalk.cyan(`$${summary.modelSwitchingSavings.toFixed(2)}`)}`);
				console.log(`  • Efficiency Improvements: ${chalk.cyan(`$${summary.efficiencyImprovements.toFixed(2)}`)}\n`);

				// Top recommendations
				console.log(chalk.yellow.bold("🎯 Top Recommendations"));
				summary.recommendations.forEach((rec, i) => {
					const effortIcon = rec.effort === "low" ? "🟢" : rec.effort === "medium" ? "🟡" : "🔴";
					console.log(`${i + 1}. ${rec.description} (${chalk.green(`$${rec.savings.toFixed(2)}`)} ${effortIcon})`);
				});
				console.log();

				// Conversation clusters
				console.log(chalk.blue.bold("📊 Conversation Clusters"));
				clusters.slice(0, 3).forEach(cluster => {
					console.log(`${cluster.type}: ${cluster.conversations.length} conversations, avg $${cluster.avgCost.toFixed(2)}, potential savings: $${cluster.optimizationPotential.toFixed(2)}`);
					if (cluster.recommendations.length > 0) {
						console.log(`  💡 ${cluster.recommendations[0]}`);
					}
				});
			}
		} catch (error) {
			handleError(error, options.json);
		}
	});

program
	.command("patterns")
	.description("Usage pattern analysis: conversation patterns, learning curves, task switching")
	.option("--json", "Output as JSON")
	.action(async (options) => {
		try {
			const entries = await loadUsageData();
			if (entries.length === 0) {
				if (options.json) {
					console.log(JSON.stringify({ error: "No usage data found" }, null, 2));
				} else {
					console.log(chalk.yellow("No usage data found."));
				}
				return;
			}

			const analyzer = new PatternAnalyzer();
			const lengthPatterns = analyzer.analyzeConversationLengthPatterns(entries);
			const completionAnalysis = analyzer.analyzeTimeToCompletion(entries);
			const switchingPatterns = analyzer.analyzeTaskSwitchingPatterns(entries);
			const learningCurve = analyzer.analyzeLearningCurve(entries);
			const usagePatterns = analyzer.identifyUsagePatterns(entries);

			if (options.json) {
				console.log(JSON.stringify({
					lengthPatterns,
					completionAnalysis,
					switchingPatterns,
					learningCurve,
					usagePatterns
				}, null, 2));
			} else {
				console.log(formatHeader("📈 Pattern Analysis"));
				
				// Conversation length patterns
				console.log(chalk.blue.bold("💬 Conversation Length Patterns"));
				console.log(`Quick Questions: ${lengthPatterns.conversationTypes.quickQuestions.count} conversations (avg ${lengthPatterns.avgLengthByType.quickQuestions} messages)`);
				console.log(`Detailed Discussions: ${lengthPatterns.conversationTypes.detailedDiscussions.count} conversations (avg ${lengthPatterns.avgLengthByType.detailedDiscussions} messages)`);
				console.log(`Deep Dives: ${lengthPatterns.conversationTypes.deepDives.count} conversations (avg ${lengthPatterns.avgLengthByType.deepDives} messages)`);
				console.log(`Most Efficient: ${chalk.green(lengthPatterns.efficiencyInsights.mostEfficientType)}`);
				if (lengthPatterns.recommendations?.length > 0) {
					console.log(chalk.yellow("💡 Recommendations:"));
					lengthPatterns.recommendations.forEach(rec => {
						console.log(`  • ${rec}`);
					});
				}
				console.log();

				// Learning curve
				console.log(chalk.green.bold("📚 Learning Progress"));
				console.log(`Skill Area: ${learningCurve.skillArea}`);
				console.log(`Learning Phase: ${chalk.cyan(learningCurve.learningPhase)}`);
				console.log(`Improvement Rate: ${learningCurve.improvementRate > 0 ? chalk.green(`+${learningCurve.improvementRate.toFixed(1)}%/week`) : chalk.red(`${learningCurve.improvementRate.toFixed(1)}%/week`)}`);
				console.log(`Current Efficiency: ${chalk.white(learningCurve.currentEfficiency.toFixed(0))} tokens/$`);
				if (learningCurve.plateauDetected) {
					console.log(chalk.yellow("⚠️  Learning plateau detected"));
				}
				console.log(`Next Milestone: ${chalk.cyan(learningCurve.nextMilestone)}\n`);

				// Task switching
				console.log(chalk.yellow.bold("🔄 Task Switching"));
				console.log(`Switch Frequency: ${switchingPatterns.switchFrequency.toFixed(1)} switches/day`);
				console.log(`Avg Time Between Switches: ${switchingPatterns.avgTimeBetweenSwitches.toFixed(0)} minutes`);
				console.log(`Switching Cost: $${switchingPatterns.costOfSwitching.toFixed(2)}`);
				if (switchingPatterns.recommendations.length > 0) {
					console.log(`💡 ${switchingPatterns.recommendations[0]}`);
				}
				console.log();

				// Usage patterns
				if (usagePatterns.length > 0) {
					console.log(chalk.magenta.bold("🎯 Usage Patterns"));
					usagePatterns.slice(0, 3).forEach(pattern => {
						const strengthBar = "█".repeat(Math.floor(pattern.strength * 10));
						console.log(`${pattern.description} (${strengthBar} ${(pattern.strength * 100).toFixed(0)}%)`);
						if (pattern.recommendation) {
							console.log(`  💡 ${pattern.recommendation}`);
						}
					});
				}
			}
		} catch (error) {
			handleError(error, options.json);
		}
	});

program
	.command("research")
	.description("Advanced research analytics: conversation success, project ROI, correlations")
	.option("--json", "Output as JSON")
	.action(async (options) => {
		try {
			const entries = await loadUsageData();
			if (entries.length === 0) {
				if (options.json) {
					console.log(JSON.stringify({ error: "No usage data found" }, null, 2));
				} else {
					console.log(chalk.yellow("No usage data found."));
				}
				return;
			}

			const analyzer = new ResearchAnalyzer();
			const insights = analyzer.generateAdvancedInsights(entries);

			if (options.json) {
				console.log(JSON.stringify({
					conversationSuccess: insights.conversationSuccess.slice(0, 10),
					projectAnalysis: insights.projectAnalysis.slice(0, 5),
					timeSeriesData: insights.timeSeriesData.slice(-30), // Last 30 days
					cacheOptimization: insights.cacheOptimization,
					promptingPatterns: insights.promptingPatterns,
					correlationInsights: insights.correlationInsights
				}, null, 2));
			} else {
				console.log(formatHeader("🔬 Research Analytics"));
				
				// Top performing conversations
				console.log(chalk.blue.bold("🏆 Top Performing Conversations"));
				insights.conversationSuccess.slice(0, 5).forEach((conv, i) => {
					console.log(`${i + 1}. Success: ${(conv.successScore * 100).toFixed(1)}% | Efficiency: ${conv.efficiency.toFixed(0)} tokens/$ | ${conv.messageCount} msgs | ${conv.duration.toFixed(0)}min`);
				});
				console.log();

				// Project ROI analysis
				if (insights.projectAnalysis.length > 0) {
					console.log(chalk.green.bold("📊 Project ROI Analysis"));
					insights.projectAnalysis.slice(0, 3).forEach(project => {
						console.log(`${project.projectPath}: ROI ${project.roi.toFixed(2)} | $${project.totalCost.toFixed(2)} | ${project.conversationCount} conversations | ${project.timeSpent.toFixed(1)}hrs`);
						if (project.topics.length > 0) {
							console.log(`  Topics: ${project.topics.join(", ")}`);
						}
					});
					console.log();
				}

				// Cache optimization
				console.log(chalk.cyan.bold("💾 Cache Optimization"));
				console.log(`Cache hit rate: ${(insights.cacheOptimization.cacheHitRate * 100).toFixed(1)}%`);
				console.log(`Cache savings: $${insights.cacheOptimization.cacheSavings.toFixed(2)}`);
				if (insights.cacheOptimization.underutilizedConversations.length > 0) {
					console.log(`Underutilized conversations: ${insights.cacheOptimization.underutilizedConversations.length}`);
					const topMissed = insights.cacheOptimization.underutilizedConversations[0];
					console.log(`  Top opportunity: $${topMissed.missedCachingOpportunity.toFixed(2)} potential savings`);
				}
				insights.cacheOptimization.recommendations.forEach(rec => console.log(`  💡 ${rec}`));
				console.log();

				// Prompting patterns
				console.log(chalk.magenta.bold("📝 Prompting Insights"));
				console.log(`Average prompt length: ${insights.promptingPatterns.avgPromptLength.toFixed(0)} tokens`);
				if (insights.promptingPatterns.effectivePromptPatterns.length > 0) {
					const best = insights.promptingPatterns.effectivePromptPatterns[0];
					console.log(`Most effective pattern: ${best.pattern} prompts (${(best.successRate * 100).toFixed(1)}% success rate)`);
				}
				insights.promptingPatterns.optimalPromptingGuidelines.slice(0, 3).forEach(guideline => {
					console.log(`  💡 ${guideline}`);
				});
				console.log();

				// Correlation insights
				if (insights.correlationInsights.length > 0) {
					console.log(chalk.yellow.bold("🔗 Key Correlations"));
					insights.correlationInsights.forEach(insight => {
						const strength = Math.abs(insight.correlation);
						const strengthText = strength > 0.5 ? "Strong" : strength > 0.3 ? "Moderate" : "Weak";
						console.log(`${strengthText} correlation (${insight.correlation.toFixed(2)}): ${insight.insight}`);
					});
				}
			}
		} catch (error) {
			handleError(error, options.json);
		}
	});

// Default command
if (process.argv.length === 2) {
	program.parse(["node", "cli.js", "status"]);
} else {
	program.parse(process.argv);
}
