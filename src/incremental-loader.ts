import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { glob } from "glob";
import { CLAUDE_DATA_PATHS } from "./config.js";
import type { UsageEntry } from "./types.js";
import { usageEntrySchema } from "./types.js";

interface FileState {
	path: string;
	lastModified: number;
	lastSize: number;
	lastPosition: number; // Track where we last read to
}

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

export class IncrementalDataLoader {
	private fileStates: Map<string, FileState> = new Map();
	private processedEntries: Set<string> = new Set(); // Track processed request IDs
	
	/**
	 * Load only new entries since the last check
	 */
	async loadNewEntries(): Promise<UsageEntry[]> {
		const newEntries: UsageEntry[] = [];
		
		for (const basePath of CLAUDE_DATA_PATHS) {
			if (!existsSync(basePath)) {
				continue;
			}
			
			const pattern = join(basePath, "**", "*.jsonl");
			const files = await glob(pattern);
			
			for (const file of files) {
				try {
					const stats = statSync(file);
					const fileState = this.fileStates.get(file);
					
					// Check if file is new or modified
					if (!fileState || 
						stats.mtime.getTime() > fileState.lastModified ||
						stats.size !== fileState.lastSize) {
						
						const entries = await this.readFileIncremental(file, fileState);
						newEntries.push(...entries);
						
						// Update file state
						this.fileStates.set(file, {
							path: file,
							lastModified: stats.mtime.getTime(),
							lastSize: stats.size,
							lastPosition: stats.size
						});
					}
				} catch (error) {
					console.error(`Error processing file ${file}:`, error);
				}
			}
		}
		
		return newEntries;
	}
	
	/**
	 * Read only the new portion of a file
	 */
	private async readFileIncremental(
		filePath: string, 
		previousState: FileState | undefined
	): Promise<UsageEntry[]> {
		const entries: UsageEntry[] = [];
		const content = readFileSync(filePath, "utf-8");
		const lines = content.trim().split("\n").filter(line => line);
		
		// If we have a previous state and the file is append-only (common for logs)
		// we can optimize by only processing new lines
		let startLine = 0;
		if (previousState && previousState.lastSize < statSync(filePath).size) {
			// Estimate where to start reading based on file size
			// This is approximate but helps skip already-processed lines
			const percentageRead = previousState.lastSize / content.length;
			startLine = Math.floor(lines.length * percentageRead);
		}
		
		for (let i = startLine; i < lines.length; i++) {
			try {
				const data: ClaudeMessage = JSON.parse(lines[i]);
				
				// Only process assistant messages with usage data
				if (data.type === "assistant" && 
					data.message?.usage && 
					data.message?.model) {
					
					const requestId = data.requestId || `${data.sessionId}-${data.timestamp}`;
					
					// Skip if we've already processed this entry
					if (this.processedEntries.has(requestId)) {
						continue;
					}
					
					const usage = data.message.usage;
					const rawEntry = {
						timestamp: data.timestamp || new Date().toISOString(),
						conversationId: data.sessionId || "unknown",
						model: data.message.model,
						requestId,
						prompt_tokens: usage.input_tokens || 0,
						completion_tokens: usage.output_tokens || 0,
						total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
						cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
						cache_read_input_tokens: usage.cache_read_input_tokens || 0,
						isBatchAPI: false,
					};
					
					// Validate with Zod schema
					const validationResult = usageEntrySchema.safeParse(rawEntry);
					if (validationResult.success) {
						entries.push(validationResult.data);
						this.processedEntries.add(requestId);
					}
				}
			} catch (error) {
				// Skip malformed lines silently
			}
		}
		
		return entries;
	}
	
	/**
	 * Load all historical data (for initial load)
	 */
	async loadAllData(): Promise<UsageEntry[]> {
		const entries: UsageEntry[] = [];
		
		for (const basePath of CLAUDE_DATA_PATHS) {
			if (!existsSync(basePath)) {
				continue;
			}
			
			const pattern = join(basePath, "**", "*.jsonl");
			const files = await glob(pattern);
			
			for (const file of files) {
				try {
					const stats = statSync(file);
					const fileEntries = await this.readFileIncremental(file, undefined);
					entries.push(...fileEntries);
					
					// Update file state
					this.fileStates.set(file, {
						path: file,
						lastModified: stats.mtime.getTime(),
						lastSize: stats.size,
						lastPosition: stats.size
					});
				} catch (error) {
					console.error(`Error reading file ${file}:`, error);
				}
			}
		}
		
		// Keep processed entries set size manageable
		if (this.processedEntries.size > 10000) {
			// Keep only the most recent 5000 entries
			const sortedEntries = entries
				.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
				.slice(0, 5000);
			
			this.processedEntries.clear();
			sortedEntries.forEach(entry => {
				this.processedEntries.add(entry.requestId);
			});
		}
		
		return entries.sort(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);
	}
	
	/**
	 * Clear the cache (useful for forcing a full reload)
	 */
	clearCache(): void {
		this.fileStates.clear();
		this.processedEntries.clear();
	}
}