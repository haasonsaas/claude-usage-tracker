import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { glob } from "glob";
import { CLAUDE_DATA_PATHS } from "./config.js";
import type { UsageEntry } from "./types.js";
import { usageEntrySchema } from "./types.js";

interface ClaudeMessage {
	type?: string;
	timestamp?: string;
	sessionId?: string;
	requestId?: string;
	message?: {
		model?: string;
		usage?: {
			input_tokens?: number;
			output_tokens?: number;
			cache_creation_input_tokens?: number;
			cache_read_input_tokens?: number;
		};
	};
}

export async function streamUsageData(): Promise<UsageEntry[]> {
	const entries: UsageEntry[] = [];
	const allFiles: string[] = [];

	// Collect all files first
	for (const dataPath of CLAUDE_DATA_PATHS) {
		try {
			const pattern = join(dataPath, "**", "*.jsonl");
			const files = await glob(pattern, { 
				nodir: true,
				maxDepth: 3
			});
			allFiles.push(...files);
		} catch (error) {
			console.warn(`Failed to scan directory ${dataPath}:`, error);
		}
	}

	console.log(`🔍 Found ${allFiles.length} data files to process`);

	// Process files in batches to avoid memory issues
	const BATCH_SIZE = 10;
	for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
		const batch = allFiles.slice(i, i + BATCH_SIZE);
		const batchEntries = await Promise.all(
			batch.map(file => processFileStream(file))
		);
		
		for (const fileEntries of batchEntries) {
			entries.push(...fileEntries);
		}

		// Log progress for large datasets
		if (allFiles.length > 20) {
			const progress = Math.round((i + batch.length) / allFiles.length * 100);
			console.log(`📊 Progress: ${progress}% (${i + batch.length}/${allFiles.length} files)`);
		}
	}

	// Sort by timestamp
	entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

	console.log(`✅ Loaded ${entries.length} usage entries`);
	return entries;
}

async function processFileStream(filePath: string): Promise<UsageEntry[]> {
	const entries: UsageEntry[] = [];
	let lineNumber = 0;
	let validEntries = 0;
	let skippedLines = 0;

	return new Promise((resolve, reject) => {
		try {
			const fileStream = createReadStream(filePath, { 
				encoding: 'utf8',
				highWaterMark: 64 * 1024 // 64KB chunks
			});
			
			const rl = createInterface({
				input: fileStream,
				crlfDelay: Infinity
			});

			rl.on('line', (line) => {
				lineNumber++;
				
				if (!line.trim()) {
					return; // Skip empty lines
				}

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
							id: data.requestId || `${data.sessionId}-${lineNumber}`,
							timestamp: data.timestamp || new Date().toISOString(),
							conversationId: data.sessionId || "unknown",
							model: data.message.model,
							input_tokens: usage.input_tokens || 0,
							output_tokens: usage.output_tokens || 0,
							total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
							isBatchAPI: false, // Default assumption
						};

						// Validate with Zod schema
						const validationResult = usageEntrySchema.safeParse(rawEntry);
						if (validationResult.success) {
							entries.push(validationResult.data);
							validEntries++;
						} else {
							skippedLines++;
							if (process.env.NODE_ENV !== "production") {
								console.warn(`Invalid entry at line ${lineNumber} in ${filePath}: ${validationResult.error.message}`);
							}
						}
					}
				} catch (error) {
					skippedLines++;
					if (process.env.NODE_ENV !== "production") {
						console.warn(`Malformed JSON at line ${lineNumber} in ${filePath}`);
					}
				}
			});

			rl.on('close', () => {
				if (process.env.NODE_ENV !== "production") {
					console.log(`📁 ${filePath}: ${validEntries} valid, ${skippedLines} skipped from ${lineNumber} lines`);
				}
				resolve(entries);
			});

			rl.on('error', (error) => {
				console.error(`Error reading ${filePath}:`, error);
				reject(error);
			});

			fileStream.on('error', (error) => {
				console.error(`Error opening ${filePath}:`, error);
				reject(error);
			});

		} catch (error) {
			console.error(`Failed to process ${filePath}:`, error);
			resolve([]); // Return empty array rather than failing entirely
		}
	});
}

// Fallback function for when streaming fails
export function shouldUseStreamingLoader(): boolean {
	// Use streaming for large datasets or when explicitly enabled
	return process.env.CLAUDE_USAGE_STREAMING === "true" || 
		   process.env.NODE_ENV === "production";
}
