import { homedir } from "node:os";
import { join } from "node:path";
import {
	getModelPricing,
	getRateLimits,
	getTokenEstimates,
	getDataPaths,
	getBatchApiDiscount,
} from "./config-loader.js";

// Legacy exports that use the new configuration system
export const CLAUDE_DATA_PATHS = new Proxy([] as string[], {
	get(_target, prop) {
		const paths = getDataPaths();
		if (typeof prop === "string" && !isNaN(Number(prop))) {
			const index = Number(prop);
			const path = paths[index];
			return path?.startsWith("~") 
				? join(homedir(), path.slice(1))
				: path;
		}
		if (prop === "length") return paths.length;
		if (prop === Symbol.iterator) {
			return function* () {
				for (const path of paths) {
					yield path.startsWith("~") 
						? join(homedir(), path.slice(1))
						: path;
				}
			};
		}
		return ([] as any)[prop];
	},
});

export const MODEL_PRICING = new Proxy({} as any, {
	get(_target, prop) {
		const pricing = getModelPricing();
		const model = pricing[prop as string];
		return model ? { 
			input: model.input, 
			output: model.output, 
			cached: model.cached 
		} : undefined;
	},
	ownKeys(_target) {
		return Object.keys(getModelPricing());
	},
	has(_target, prop) {
		return prop in getModelPricing();
	},
});

export const BATCH_API_DISCOUNT = (() => getBatchApiDiscount()) as any as number;

export const RATE_LIMITS = new Proxy({} as any, {
	get(_target, prop) {
		const limits = getRateLimits();
		return limits[prop as string];
	},
	ownKeys(_target) {
		return Object.keys(getRateLimits());
	},
	has(_target, prop) {
		return prop in getRateLimits();
	},
});

export type PlanType = keyof ReturnType<typeof getRateLimits>;

export const TOKENS_PER_HOUR_ESTIMATES = new Proxy({} as any, {
	get(_target, prop) {
		const estimates = getTokenEstimates();
		return estimates[prop as keyof typeof estimates];
	},
});

// Direct exports for new code that wants to use the config system directly
export { 
	loadConfig, 
	getModelPricing, 
	getRateLimits, 
	getTokenEstimates, 
	getDataPaths,
	getBatchApiDiscount 
} from "./config-loader.js";
