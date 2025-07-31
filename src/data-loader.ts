import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { glob } from "glob";
import { CLAUDE_DATA_PATHS } from "./config.js";
import type { UsageEntry } from "./types.js";
import { usageEntrySchema } from "./types.js";
import { streamUsageData, shouldUseStreamingLoader } from "./streaming-loader.js";

interface ClaudeMessage {
	message?: {
		model?: string;
		usage?: {
			input_tokens?: number;
			cache_creation_input_tokens?: number;
			cache_read_input_tokens?: number;
			output_tokens?: number;
		};
	};
	sessionId?: string;
	requestId?: string;
	timestamp?: string;
	type?: string;
}

export async function loadUsageData(): Promise<UsageEntry[]> {
	// Use streaming loader for better performance on large datasets
	if (shouldUseStreamingLoader()) {
		try {
			return await streamUsageData();
		} catch (error) {
			console.warn("Streaming loader failed, falling back to synchronous loading:", error);
		}
	}

	const entries: UsageEntry[] = [];

	for (const basePath of CLAUDE_DATA_PATHS) {
		if (!existsSync(basePath)) {
			continue;
		}

		const pattern = join(basePath, "**", "*.jsonl");
		const files = await glob(pattern);

		for (const file of files) {
			try {
				const content = readFileSync(file, "utf-8");
				const lines = content
					.trim()
					.split("\n")
					.filter((line) => line);

				let validEntries = 0;
				let skippedLines = 0;

				for (const line of lines) {
					try {
						const data: ClaudeMessage = JSON.parse(line);

						// Only process assistant messages with usage data
						if (
							data.type === "assistant" &&
							data.message?.usage &&
							data.message?.model
						) {
							const usage = data.message.usage;
							const rawEntry = {
								timestamp: data.timestamp || new Date().toISOString(),
								conversationId: data.sessionId || "unknown",
								model: data.message.model,
								requestId: data.requestId || `${data.sessionId}-${Date.now()}`,
								prompt_tokens: usage.input_tokens || 0,
								completion_tokens: usage.output_tokens || 0,
								total_tokens:
									(usage.input_tokens || 0) + (usage.output_tokens || 0),
								cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
								cache_read_input_tokens: usage.cache_read_input_tokens || 0,
								isBatchAPI: false, // Default assumption
							};

							// Validate with Zod schema
							const validationResult = usageEntrySchema.safeParse(rawEntry);
							if (validationResult.success) {
								entries.push(validationResult.data);
								validEntries++;
							} else {
								console.warn(`Invalid usage entry in ${file}: ${validationResult.error.message}`);
								skippedLines++;
							}
						}
					} catch (error) {
						skippedLines++;
						if (process.env.NODE_ENV !== "production") {
							console.warn(`Malformed JSON line in ${file}: ${error}`);
						}
					}
				}

				if (process.env.NODE_ENV !== "production") {
					console.log(`📁 ${file}: ${validEntries} valid entries, ${skippedLines} skipped`);
				}
			} catch (error) {
				console.error(`Error reading file ${file}:`, error);
			}
		}
	}

	return entries.sort(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
	);
}
