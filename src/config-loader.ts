import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Zod schemas for validation
const ModelConfigSchema = z.object({
	name: z.string(),
	input: z.number().positive(),
	output: z.number().positive(),
	cached: z.number().positive(),
});

const RateLimitSchema = z.object({
	min: z.number().positive(),
	max: z.number().positive(),
});

const PlanLimitsSchema = z.object({
	price: z.number().positive(),
	weekly: z.object({
		sonnet4: RateLimitSchema,
		opus4: RateLimitSchema,
	}),
});

const ConfigSchema = z.object({
	models: z.record(z.string(), ModelConfigSchema),
	rate_limits: z.record(z.string(), PlanLimitsSchema),
	token_estimates: z.object({
		sonnet4: z.object({
			min: z.number().positive(),
			max: z.number().positive(),
		}),
		opus4: z.object({
			min: z.number().positive(),
			max: z.number().positive(),
		}),
	}),
	batch_api_discount: z.number().min(0).max(1),
	data_paths: z.array(z.string()),
	recommendations: z.record(
		z.string(),
		z.object({
			model: z.string(),
			confidence: z.number().min(0).max(1),
		}),
	),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

let cachedConfig: AppConfig | null = null;
let testConfig: AppConfig | null = null;

export function loadConfig(configPath?: string): AppConfig {
	// In test environment, use test config if available
	if (process.env.NODE_ENV === "test" && !configPath) {
		const testConfig = getTestConfig();
		if (testConfig) {
			return testConfig;
		}
	}

	// Get config path from CLI if not explicitly provided
	if (!configPath && typeof process !== "undefined" && process.argv) {
		const configIndex = process.argv.findIndex(
			(arg) => arg === "-c" || arg === "--config",
		);
		if (configIndex !== -1 && process.argv[configIndex + 1]) {
			configPath = process.argv[configIndex + 1];
		}
	}

	if (cachedConfig && !configPath) {
		return cachedConfig;
	}

	const paths = [
		configPath,
		process.env.CLAUDE_USAGE_CONFIG,
		join(process.cwd(), "config", "local.yaml"),
		join(process.cwd(), "config", "default.yaml"),
		join(__dirname, "..", "config", "default.yaml"),
	].filter(Boolean) as string[];

	let configData: any = null;
	let usedPath: string | null = null;

	for (const path of paths) {
		if (existsSync(path)) {
			try {
				const content = readFileSync(path, "utf8");
				configData = yaml.load(content);
				usedPath = path;
				break;
			} catch (error) {
				console.warn(`Failed to load config from ${path}:`, error);
				continue;
			}
		}
	}

	if (!configData) {
		throw new Error(
			`No valid configuration file found. Searched paths: ${paths.join(", ")}`,
		);
	}

	try {
		const validatedConfig = ConfigSchema.parse(configData);
		cachedConfig = validatedConfig;

		if (process.env.NODE_ENV !== "test") {
			console.log(`📝 Loaded configuration from: ${usedPath}`);
		}

		return validatedConfig;
	} catch (error) {
		if (error instanceof z.ZodError) {
			throw new Error(
				`Configuration validation failed: ${error.errors
					.map((e) => `${e.path.join(".")}: ${e.message}`)
					.join(", ")}`,
			);
		}
		throw error;
	}
}

export function clearConfigCache(): void {
	cachedConfig = null;
}

function getTestConfig(): AppConfig | null {
	return testConfig;
}

export function setTestConfig(config: any): void {
	try {
		testConfig = ConfigSchema.parse(config);
	} catch (error) {
		console.warn("Invalid test config:", error);
		testConfig = null;
	}
}

export function clearTestConfig(): void {
	testConfig = null;
}

// Helper functions to access config values
export function getModelPricing() {
	const config = loadConfig();
	return config.models;
}

export function getRateLimits() {
	const config = loadConfig();
	return config.rate_limits;
}

export function getTokenEstimates() {
	const config = loadConfig();
	return config.token_estimates;
}

export function getDataPaths() {
	const config = loadConfig();
	return config.data_paths;
}

export function getBatchApiDiscount() {
	const config = loadConfig();
	return config.batch_api_discount;
}

export function getModelRecommendations() {
	const config = loadConfig();
	return config.recommendations;
}
