import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { glob } from "glob";
import { CLAUDE_DATA_PATHS } from "./config.js";
import type { UsageEntry } from "./types.js";

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
							const entry: UsageEntry = {
								timestamp: data.timestamp || new Date().toISOString(),
								conversationId: data.sessionId || "unknown",
								instanceId: data.requestId,
								model: data.message.model,
								requestId: data.requestId || "unknown",
								prompt_tokens: usage.input_tokens || 0,
								completion_tokens: usage.output_tokens || 0,
								total_tokens:
									(usage.input_tokens || 0) + (usage.output_tokens || 0),
								cache_creation_input_tokens: usage.cache_creation_input_tokens,
								cache_read_input_tokens: usage.cache_read_input_tokens,
							};
							entries.push(entry);
						}
					} catch {
						// Skip malformed lines
					}
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
