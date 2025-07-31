import { getModelRecommendations } from "./config-loader.js";
import type { TaskClassification } from "./model-advisor.js";

export const TASK_MODEL_MAPPING = new Proxy({} as any, {
	get(_target, prop) {
		const recommendations = getModelRecommendations();
		return recommendations[prop as string];
	},
	ownKeys(_target) {
		return Object.keys(getModelRecommendations());
	},
	has(_target, prop) {
		return prop in getModelRecommendations();
	},
}) as Record<
	TaskClassification["taskType"],
	{ model: string; confidence: number }
>;
