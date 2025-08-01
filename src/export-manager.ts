import { writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { UsageEntry } from "./types.js";
import { calculateCost } from "./analyzer.js";
import { ConversationLengthAnalyzer } from "./conversation-length-analytics.js";
import { OptimizationAnalyzer } from "./optimization-analytics.js";
import { PredictiveAnalyzer } from "./predictive-analytics.js";

export interface ExportOptions {
	format: "csv" | "json" | "summary";
	output?: string;
	startDate?: string;
	endDate?: string;
	project?: string;
	template?: "billing" | "efficiency" | "analytics" | "raw";
	groupBy?: "day" | "week" | "month" | "project" | "conversation";
}

export interface ExportSummary {
	totalEntries: number;
	dateRange: { start: string; end: string };
	totalCost: number;
	totalTokens: number;
	projects: string[];
	exportedAt: string;
	fileSize: string;
}

export class ExportManager {
	constructor(private entries: UsageEntry[]) {}

	export(options: ExportOptions): ExportSummary {
		try {
			// Validate inputs
			this.validateExportOptions(options);
			
			const filteredEntries = this.filterEntries(options);
			
			if (filteredEntries.length === 0) {
				throw new Error("No data found matching the specified criteria");
			}

			const filename = this.generateFilename(options);

			switch (options.format) {
				case "csv":
					return this.exportCSV(filteredEntries, filename, options);
				case "json":
					return this.exportJSON(filteredEntries, filename, options);
				case "summary":
					return this.exportSummary(filteredEntries, filename, options);
				default:
					throw new Error(`Unsupported export format: ${options.format}`);
			}
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Export failed: ${error.message}`);
			}
			throw new Error("Export failed: Unknown error occurred");
		}
	}

	private validateExportOptions(options: ExportOptions): void {
		// Validate format
		const validFormats = ["csv", "json", "summary"];
		if (!validFormats.includes(options.format)) {
			throw new Error(`Invalid format '${options.format}'. Supported formats: ${validFormats.join(", ")}`);
		}

		// Validate template
		if (options.template) {
			const validTemplates = ["billing", "efficiency", "analytics", "raw", "detailed"];
			if (!validTemplates.includes(options.template)) {
				throw new Error(`Invalid template '${options.template}'. Supported templates: ${validTemplates.join(", ")}`);
			}
		}

		// Validate dates
		if (options.startDate && !this.isValidDate(options.startDate)) {
			throw new Error(`Invalid start date '${options.startDate}'. Use YYYY-MM-DD format`);
		}

		if (options.endDate && !this.isValidDate(options.endDate)) {
			throw new Error(`Invalid end date '${options.endDate}'. Use YYYY-MM-DD format`);
		}

		if (options.startDate && options.endDate) {
			const start = new Date(options.startDate);
			const end = new Date(options.endDate);
			if (start > end) {
				throw new Error("Start date cannot be after end date");
			}
		}

		// Validate groupBy
		if (options.groupBy) {
			const validGroupBy = ["day", "week", "month", "project", "conversation"];
			if (!validGroupBy.includes(options.groupBy)) {
				throw new Error(`Invalid groupBy '${options.groupBy}'. Supported options: ${validGroupBy.join(", ")}`);
			}
		}
	}

	private isValidDate(dateString: string): boolean {
		const regex = /^\d{4}-\d{2}-\d{2}$/;
		if (!regex.test(dateString)) {
			return false;
		}
		const date = new Date(dateString);
		return date instanceof Date && !isNaN(date.getTime());
	}

	private filterEntries(options: ExportOptions): UsageEntry[] {
		let filtered = [...this.entries];

		// Date filtering
		if (options.startDate) {
			const startDate = new Date(options.startDate);
			filtered = filtered.filter(entry => new Date(entry.timestamp) >= startDate);
		}

		if (options.endDate) {
			const endDate = new Date(options.endDate);
			filtered = filtered.filter(entry => new Date(entry.timestamp) <= endDate);
		}

		// Project filtering
		if (options.project) {
			filtered = filtered.filter(entry => 
				entry.instanceId?.toLowerCase().includes(options.project!.toLowerCase())
			);
		}

		return filtered.sort((a, b) => 
			new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);
	}

	private generateFilename(options: ExportOptions): string {
		const timestamp = new Date().toISOString().split('T')[0];
		const template = options.template || 'export';
		const format = options.format;
		
		if (options.output) {
			return options.output.endsWith(`.${format}`) ? 
				options.output : 
				`${options.output}.${format}`;
		}

		return `claude-usage-${template}-${timestamp}.${format}`;
	}

	private exportCSV(entries: UsageEntry[], filename: string, options: ExportOptions): ExportSummary {
		try {
			const csvData = this.generateCSVData(entries, options.template || "raw");
			writeFileSync(filename, csvData, 'utf8');
			return this.createSummary(entries, filename);
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Failed to write CSV file: ${error.message}`);
			}
			throw new Error("Failed to write CSV file: Unknown error");
		}
	}

	private exportJSON(entries: UsageEntry[], filename: string, options: ExportOptions): ExportSummary {
		try {
			const jsonData = this.generateJSONData(entries, options);
			writeFileSync(filename, JSON.stringify(jsonData, null, 2), 'utf8');
			return this.createSummary(entries, filename);
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Failed to write JSON file: ${error.message}`);
			}
			throw new Error("Failed to write JSON file: Unknown error");
		}
	}

	private exportSummary(entries: UsageEntry[], filename: string, options: ExportOptions): ExportSummary {
		try {
			const summaryData = this.generateSummaryReport(entries);
			writeFileSync(filename, summaryData, 'utf8');
			return this.createSummary(entries, filename);
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Failed to write summary file: ${error.message}`);
			}
			throw new Error("Failed to write summary file: Unknown error");
		}
	}

	private generateCSVData(entries: UsageEntry[], template: string): string {
		switch (template) {
			case "billing":
				return this.generateBillingCSV(entries);
			case "efficiency":
				return this.generateEfficiencyCSV(entries);
			case "analytics":
				return this.generateAnalyticsCSV(entries);
			default:
				return this.generateRawCSV(entries);
		}
	}

	private generateBillingCSV(entries: UsageEntry[]): string {
		const headers = [
			"Date",
			"Project",
			"Conversation ID",
			"Model",
			"Input Tokens",
			"Output Tokens",
			"Total Tokens",
			"Cost (USD)",
			"Duration (minutes)"
		];

		const rows = entries.map(entry => {
			const cost = calculateCost(entry);
			const totalTokens = (entry.prompt_tokens || 0) + (entry.completion_tokens || 0);
			
			// Calculate duration (simplified)
			const duration = entry.total_tokens ? Math.round(entry.total_tokens / 100) : 1;

			return [
				new Date(entry.timestamp).toISOString().split('T')[0],
				entry.instanceId || "unknown",
				entry.conversationId,
				entry.model || "unknown",
				entry.prompt_tokens || 0,
				entry.completion_tokens || 0,
				totalTokens,
				cost.toFixed(6),
				duration
			].join(",");
		});

		return [headers.join(","), ...rows].join("\n");
	}

	private generateEfficiencyCSV(entries: UsageEntry[]): string {
		const headers = [
			"Date",
			"Project",
			"Conversation ID",
			"Messages in Conversation",
			"Tokens per Message",
			"Cost per Message",
			"Efficiency Score",
			"Model"
		];

		// Group by conversation for efficiency metrics
		const conversations = new Map<string, UsageEntry[]>();
		for (const entry of entries) {
			if (!conversations.has(entry.conversationId)) {
				conversations.set(entry.conversationId, []);
			}
			conversations.get(entry.conversationId)!.push(entry);
		}

		const rows: string[] = [];
		for (const [convId, convEntries] of conversations) {
			const totalTokens = convEntries.reduce((sum, e) => 
				sum + (e.prompt_tokens || 0) + (e.completion_tokens || 0), 0);
			const totalCost = convEntries.reduce((sum, e) => sum + calculateCost(e), 0);
			const messageCount = convEntries.length;
			
			const tokensPerMessage = messageCount > 0 ? totalTokens / messageCount : 0;
			const costPerMessage = messageCount > 0 ? totalCost / messageCount : 0;
			const efficiencyScore = totalCost > 0 ? totalTokens / totalCost : 0;

			const firstEntry = convEntries[0];
			rows.push([
				new Date(firstEntry.timestamp).toISOString().split('T')[0],
				firstEntry.instanceId || "unknown",
				convId,
				messageCount,
				tokensPerMessage.toFixed(2),
				costPerMessage.toFixed(6),
				efficiencyScore.toFixed(2),
				firstEntry.model || "unknown"
			].join(","));
		}

		return [headers.join(","), ...rows].join("\n");
	}

	private generateAnalyticsCSV(entries: UsageEntry[]): string {
		const headers = [
			"Date",
			"Hour",
			"Project",
			"Model",
			"Conversation Count",
			"Total Tokens",
			"Total Cost",
			"Avg Tokens per Conversation",
			"Avg Cost per Conversation",
			"Peak Usage Indicator"
		];

		// Group by date, hour, project, and model
		const groups = new Map<string, {
			conversations: Set<string>;
			totalTokens: number;
			totalCost: number;
			entries: UsageEntry[];
		}>();

		for (const entry of entries) {
			const date = new Date(entry.timestamp);
			const key = `${date.toISOString().split('T')[0]}-${date.getHours()}-${entry.instanceId || 'unknown'}-${entry.model || 'unknown'}`;
			
			if (!groups.has(key)) {
				groups.set(key, {
					conversations: new Set(),
					totalTokens: 0,
					totalCost: 0,
					entries: []
				});
			}

			const group = groups.get(key)!;
			group.conversations.add(entry.conversationId);
			group.totalTokens += (entry.prompt_tokens || 0) + (entry.completion_tokens || 0);
			group.totalCost += calculateCost(entry);
			group.entries.push(entry);
		}

		const rows: string[] = [];
		for (const [key, group] of groups) {
			const [date, hour, project, model] = key.split('-');
			const conversationCount = group.conversations.size;
			const avgTokens = conversationCount > 0 ? group.totalTokens / conversationCount : 0;
			const avgCost = conversationCount > 0 ? group.totalCost / conversationCount : 0;
			
			// Simple peak detection (> 10 conversations in an hour)
			const isPeak = conversationCount > 10 ? "Yes" : "No";

			rows.push([
				date,
				hour,
				project,
				model,
				conversationCount,
				group.totalTokens,
				group.totalCost.toFixed(6),
				avgTokens.toFixed(2),
				avgCost.toFixed(6),
				isPeak
			].join(","));
		}

		return [headers.join(","), ...rows].join("\n");
	}

	private generateRawCSV(entries: UsageEntry[]): string {
		const headers = [
			"Timestamp",
			"Conversation ID", 
			"Instance ID",
			"Model",
			"Prompt Tokens",
			"Completion Tokens", 
			"Total Tokens",
			"Cost USD",
			"Cost",
			"Request Type"
		];

		const rows = entries.map(entry => [
			entry.timestamp,
			entry.conversationId,
			entry.instanceId || "",
			entry.model || "",
			entry.prompt_tokens || 0,
			entry.completion_tokens || 0,
			entry.total_tokens || 0,
			entry.costUSD || 0,
			entry.cost || 0,
			""
		].join(","));

		return [headers.join(","), ...rows].join("\n");
	}

	private generateJSONData(entries: UsageEntry[], options: ExportOptions): any {
		const baseData = {
			metadata: {
				exportedAt: new Date().toISOString(),
				totalEntries: entries.length,
				dateRange: this.getDateRange(entries),
				filters: {
					startDate: options.startDate,
					endDate: options.endDate,
					project: options.project,
					template: options.template
				}
			}
		};

		switch (options.template) {
			case "billing":
				return {
					...baseData,
					billing: this.generateBillingData(entries)
				};
			case "analytics":
				return {
					...baseData,
					analytics: this.generateAnalyticsData(entries)
				};
			default:
				return {
					...baseData,
					entries: entries
				};
		}
	}

	private generateBillingData(entries: UsageEntry[]) {
		const dailySummary = new Map<string, {
			date: string;
			totalCost: number;
			totalTokens: number;
			conversationCount: number;
			projects: Set<string>;
		}>();

		for (const entry of entries) {
			const date = new Date(entry.timestamp).toISOString().split('T')[0];
			if (!dailySummary.has(date)) {
				dailySummary.set(date, {
					date,
					totalCost: 0,
					totalTokens: 0,
					conversationCount: 0,
					projects: new Set()
				});
			}

			const summary = dailySummary.get(date)!;
			summary.totalCost += calculateCost(entry);
			summary.totalTokens += (entry.prompt_tokens || 0) + (entry.completion_tokens || 0);
			summary.projects.add(entry.instanceId || "unknown");
		}

		// Count unique conversations per day
		const conversationsByDate = new Map<string, Set<string>>();
		for (const entry of entries) {
			const date = new Date(entry.timestamp).toISOString().split('T')[0];
			if (!conversationsByDate.has(date)) {
				conversationsByDate.set(date, new Set());
			}
			conversationsByDate.get(date)!.add(entry.conversationId);
		}

		return Array.from(dailySummary.values()).map(summary => ({
			...summary,
			conversationCount: conversationsByDate.get(summary.date)?.size || 0,
			projects: Array.from(summary.projects)
		}));
	}

	private generateAnalyticsData(entries: UsageEntry[]) {
		if (entries.length === 0) return null;

		const analyzer = new ConversationLengthAnalyzer();
		analyzer.loadConversations(entries);
		const lengthAnalysis = analyzer.analyzeConversationLengths();

		const optimizationAnalyzer = new OptimizationAnalyzer();
		const clusters = optimizationAnalyzer.clusterConversations(entries);

		return {
			conversationLengthAnalysis: lengthAnalysis,
			optimizationOpportunities: clusters.slice(0, 5)
		};
	}

	private generateSummaryReport(entries: UsageEntry[]): string {
		if (entries.length === 0) {
			return "No data found for the specified criteria.\n";
		}

		const totalCost = entries.reduce((sum, e) => sum + calculateCost(e), 0);
		const totalTokens = entries.reduce((sum, e) => 
			sum + (e.prompt_tokens || 0) + (e.completion_tokens || 0), 0);
		
		const dateRange = this.getDateRange(entries);
		const projects = new Set(entries.map(e => e.instanceId || "unknown"));
		const conversations = new Set(entries.map(e => e.conversationId));
		const models = new Set(entries.map(e => e.model || "unknown"));

		const avgCostPerConversation = conversations.size > 0 ? totalCost / conversations.size : 0;
		const avgTokensPerMessage = entries.length > 0 ? totalTokens / entries.length : 0;

		return `
CLAUDE USAGE SUMMARY REPORT
===========================

Export Date: ${new Date().toISOString()}
Data Period: ${dateRange.start} to ${dateRange.end}

OVERVIEW
--------
Total Messages: ${entries.length.toLocaleString()}
Total Conversations: ${conversations.size.toLocaleString()}
Total Cost: $${totalCost.toFixed(4)}
Total Tokens: ${totalTokens.toLocaleString()}

AVERAGES
--------
Cost per Conversation: $${avgCostPerConversation.toFixed(4)}
Tokens per Message: ${avgTokensPerMessage.toFixed(0)}
Messages per Conversation: ${(entries.length / conversations.size).toFixed(1)}

BREAKDOWN
---------
Projects: ${projects.size} (${Array.from(projects).join(", ")})
Models Used: ${Array.from(models).join(", ")}

DAILY BREAKDOWN
---------------
${this.generateDailyBreakdown(entries)}

TOP CONVERSATIONS BY COST
--------------------------
${this.generateTopConversations(entries)}
`;
	}

	private generateDailyBreakdown(entries: UsageEntry[]): string {
		const daily = new Map<string, { cost: number; messages: number; conversations: Set<string> }>();
		
		for (const entry of entries) {
			const date = new Date(entry.timestamp).toISOString().split('T')[0];
			if (!daily.has(date)) {
				daily.set(date, { cost: 0, messages: 0, conversations: new Set() });
			}
			const day = daily.get(date)!;
			day.cost += calculateCost(entry);
			day.messages++;
			day.conversations.add(entry.conversationId);
		}

		return Array.from(daily.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([date, data]) => 
				`${date}: $${data.cost.toFixed(4)} (${data.messages} messages, ${data.conversations.size} conversations)`)
			.join('\n');
	}

	private generateTopConversations(entries: UsageEntry[]): string {
		const conversations = new Map<string, { cost: number; messages: number; project: string }>();
		
		for (const entry of entries) {
			if (!conversations.has(entry.conversationId)) {
				conversations.set(entry.conversationId, { 
					cost: 0, 
					messages: 0, 
					project: entry.instanceId || "unknown" 
				});
			}
			const conv = conversations.get(entry.conversationId)!;
			conv.cost += calculateCost(entry);
			conv.messages++;
		}

		return Array.from(conversations.entries())
			.sort(([, a], [, b]) => b.cost - a.cost)
			.slice(0, 10)
			.map(([id, data], index) => 
				`${index + 1}. ${id.substring(0, 8)}... - $${data.cost.toFixed(4)} (${data.messages} messages, ${data.project})`)
			.join('\n');
	}

	private getDateRange(entries: UsageEntry[]): { start: string; end: string } {
		if (entries.length === 0) {
			const today = new Date().toISOString().split('T')[0];
			return { start: today, end: today };
		}

		let minTime = Number.MAX_SAFE_INTEGER;
		let maxTime = Number.MIN_SAFE_INTEGER;

		for (const entry of entries) {
			const time = new Date(entry.timestamp).getTime();
			if (time < minTime) minTime = time;
			if (time > maxTime) maxTime = time;
		}

		const start = new Date(minTime);
		const end = new Date(maxTime);

		return {
			start: start.toISOString().split('T')[0],
			end: end.toISOString().split('T')[0]
		};
	}

	private createSummary(entries: UsageEntry[], filename: string): ExportSummary {
		const stats = statSync(filename);
		const totalCost = entries.reduce((sum, e) => sum + calculateCost(e), 0);
		const totalTokens = entries.reduce((sum, e) => 
			sum + (e.prompt_tokens || 0) + (e.completion_tokens || 0), 0);
		const projects = Array.from(new Set(entries.map(e => e.instanceId || "unknown")));
		const dateRange = this.getDateRange(entries);

		return {
			totalEntries: entries.length,
			dateRange,
			totalCost,
			totalTokens,
			projects,
			exportedAt: new Date().toISOString(),
			fileSize: this.formatFileSize(stats.size)
		};
	}

	private formatFileSize(bytes: number): string {
		if (bytes === 0) return "0 Bytes";
		const k = 1024;
		const sizes = ["Bytes", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
	}
}
