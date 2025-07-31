import chalk from "chalk";
import { MODEL_PRICING } from "./config.js";
import { TASK_MODEL_MAPPING } from "./recommendation-config.js";

export interface TaskClassification {
	taskType:
		| "code_generation"
		| "debugging"
		| "code_review"
		| "documentation"
		| "architecture"
		| "complex_analysis"
		| "simple_query"
		| "refactoring";
	confidence: number;
	reasoning: string;
}

export interface ModelRecommendation {
	recommendedModel: keyof typeof MODEL_PRICING;
	confidence: number;
	costSavings?: number;
	reasoning: string;
	alternativeModel?: {
		model: keyof typeof MODEL_PRICING;
		tradeoffs: string;
	};
}

export class ModelAdvisor {
	private taskPatterns = {
		code_generation: [
			/write\s+(a\s+)?function/i,
			/create\s+(a\s+)?(class|component|module)/i,
			/implement\s+/i,
			/generate\s+(code|script)/i,
			/build\s+(a\s+)?(feature|api|endpoint)/i,
			/make\s+(a\s+)?(function|class|component)/i,
		],
		debugging: [
			/debug/i,
			/fix\s+(this\s+)?(bug|error|issue)/i,
			/why\s+(is|isn't|does|doesn't)/i,
			/what's\s+wrong/i,
			/not\s+working/i,
			/error/i,
			/exception/i,
			/stack\s+trace/i,
		],
		code_review: [
			/review\s+(this\s+)?code/i,
			/look\s+at\s+(this\s+)?code/i,
			/check\s+(this\s+)?implementation/i,
			/feedback\s+on/i,
			/improve\s+(this\s+)?code/i,
			/optimize\s+(this\s+)?code/i,
		],
		documentation: [
			/document/i,
			/write\s+(a\s+)?readme/i,
			/explain\s+(how\s+)?this/i,
			/add\s+comments/i,
			/write\s+docs/i,
			/create\s+documentation/i,
		],
		architecture: [
			/architecture/i,
			/design\s+pattern/i,
			/system\s+design/i,
			/structure\s+(this\s+)?project/i,
			/best\s+practices/i,
			/organize\s+(the\s+)?code/i,
		],
		complex_analysis: [
			/analyze\s+(this\s+)?(complex|large|entire)/i,
			/understand\s+(this\s+)?(complex|large|entire)/i,
			/reverse\s+engineer/i,
			/performance\s+analysis/i,
			/security\s+analysis/i,
			/comprehensive\s+review/i,
		],
		simple_query: [
			/what\s+is/i,
			/how\s+do\s+i/i,
			/can\s+you\s+tell\s+me/i,
			/quick\s+question/i,
			/simple\s+question/i,
			/just\s+wondering/i,
		],
		refactoring: [
			/refactor/i,
			/clean\s+up/i,
			/reorganize/i,
			/restructure/i,
			/improve\s+structure/i,
			/make\s+(this\s+)?cleaner/i,
		],
	};

	private modelRecommendations = TASK_MODEL_MAPPING;

	classifyTask(prompt: string): TaskClassification {
		let bestMatch: TaskClassification = {
			taskType: "simple_query",
			confidence: 0.1,
			reasoning: "Default classification - no strong pattern match",
		};

		for (const [taskType, patterns] of Object.entries(this.taskPatterns)) {
			let matches = 0;
			const matchDetails: string[] = [];

			for (const pattern of patterns) {
				if (pattern.test(prompt)) {
					matches++;
					matchDetails.push(pattern.source);
				}
			}

			if (matches > 0) {
				const confidence = Math.min(0.95, 0.3 + matches * 0.2);
				if (confidence > bestMatch.confidence) {
					bestMatch = {
						taskType: taskType as TaskClassification["taskType"],
						confidence,
						reasoning: `Matched ${matches} pattern(s): ${matchDetails.slice(0, 2).join(", ")}`,
					};
				}
			}
		}

		// Additional context analysis
		const wordCount = prompt.split(/\s+/).length;
		const hasCodeBlocks = /```/.test(prompt);
		const hasMultipleQuestions = (prompt.match(/\?/g) || []).length > 2;

		// Adjust confidence based on context
		if (wordCount > 200 && bestMatch.taskType === "simple_query") {
			bestMatch.taskType = "complex_analysis";
			bestMatch.confidence = 0.6;
			bestMatch.reasoning += " (adjusted for length)";
		}

		if (hasCodeBlocks && bestMatch.confidence < 0.7) {
			bestMatch.confidence = Math.min(0.9, bestMatch.confidence + 0.2);
			bestMatch.reasoning += " (code context boost)";
		}

		if (hasMultipleQuestions && bestMatch.taskType === "simple_query") {
			bestMatch.taskType = "complex_analysis";
			bestMatch.confidence = Math.min(0.8, bestMatch.confidence + 0.1);
			bestMatch.reasoning += " (multiple questions detected)";
		}

		return bestMatch;
	}

	getModelRecommendation(
		classification: TaskClassification,
	): ModelRecommendation {
		const baseRec = this.modelRecommendations[classification.taskType];
		const recommendedModelPricing = MODEL_PRICING[baseRec.model];

		const alternativeModel = Object.keys(MODEL_PRICING).find(
			(m) => m !== baseRec.model,
		) as keyof typeof MODEL_PRICING;
		const alternativeModelPricing = MODEL_PRICING[alternativeModel];

		// Estimate token usage (rough approximation)
		const estimatedTokens = this.estimateTokenUsage(classification.taskType);

		const recommendedModelCost =
			(estimatedTokens.input / 1_000_000) * recommendedModelPricing.input +
			(estimatedTokens.output / 1_000_000) * recommendedModelPricing.output;
		const alternativeModelCost =
			(estimatedTokens.input / 1_000_000) * alternativeModelPricing.input +
			(estimatedTokens.output / 1_000_000) * alternativeModelPricing.output;

		const costSavings = alternativeModelCost - recommendedModelCost;

		const reasoning = this.getReasoningForTask(
			classification.taskType,
			baseRec.model,
		);

		// Alternative model suggestion
		const alternativeTradeoffs = this.getAlternativeTradeoffs(
			classification.taskType,
			alternativeModel,
		);

		return {
			recommendedModel: baseRec.model,
			confidence: Math.min(
				0.95,
				baseRec.confidence * classification.confidence,
			),
			costSavings: costSavings > 0 ? costSavings : undefined,
			reasoning,
			alternativeModel: {
				model: alternativeModel,
				tradeoffs: alternativeTradeoffs,
			},
		};
	}

	private estimateTokenUsage(taskType: TaskClassification["taskType"]): {
		input: number;
		output: number;
	} {
		const estimates = {
			code_generation: { input: 2000, output: 3000 },
			debugging: { input: 3000, output: 2000 },
			code_review: { input: 4000, output: 2500 },
			documentation: { input: 1500, output: 2000 },
			architecture: { input: 2500, output: 4000 },
			complex_analysis: { input: 5000, output: 3500 },
			simple_query: { input: 500, output: 800 },
			refactoring: { input: 3000, output: 3500 },
		};

		return estimates[taskType] || estimates.simple_query;
	}

	private getReasoningForTask(
		taskType: TaskClassification["taskType"],
		model: keyof typeof MODEL_PRICING,
	): string {
		const reasons = {
			code_generation: {
				sonnet:
					"Sonnet 4 excels at code generation with 78% cost savings. Quality is excellent for most coding tasks.",
				opus: "Opus 4 for the most complex algorithms or when you need the highest code quality.",
			},
			debugging: {
				sonnet:
					"Sonnet 4 can handle most debugging tasks effectively with significant cost savings.",
				opus: "Opus 4 recommended for complex debugging - better at understanding intricate code relationships.",
			},
			code_review: {
				sonnet:
					"Sonnet 4 provides thorough code reviews with excellent cost efficiency.",
				opus: "Opus 4 for critical code reviews where you need the deepest analysis.",
			},
			documentation: {
				sonnet:
					"Sonnet 4 is perfect for documentation - clear writing with major cost savings.",
				opus: "Opus 4 overkill for most documentation tasks.",
			},
			architecture: {
				sonnet:
					"Sonnet 4 can handle many architecture discussions cost-effectively.",
				opus: "Opus 4 recommended for complex system design - better strategic thinking.",
			},
			complex_analysis: {
				sonnet: "Sonnet 4 may miss nuances in complex analysis.",
				opus: "Opus 4 essential for deep analysis - superior reasoning and context understanding.",
			},
			simple_query: {
				sonnet:
					"Sonnet 4 perfect for straightforward questions - massive cost savings.",
				opus: "Opus 4 wasteful for simple queries.",
			},
			refactoring: {
				sonnet:
					"Sonnet 4 excellent for refactoring with great cost efficiency.",
				opus: "Opus 4 for complex refactoring of large codebases.",
			},
		};

		const taskReasons = reasons[taskType];
		return taskReasons
			? taskReasons[model]
			: `${model === "sonnet" ? "Sonnet 4 for cost efficiency" : "Opus 4 for maximum capability"}`;
	}

	private getAlternativeTradeoffs(
		_taskType: TaskClassification["taskType"],
		alternativeModel: keyof typeof MODEL_PRICING,
	): string {
		if (alternativeModel === "opus") {
			return "Higher cost but maximum reasoning capability and nuance detection";
		} else {
			return "78% cost savings but may miss some nuances in very complex tasks";
		}
	}

	formatRecommendation(
		classification: TaskClassification,
		recommendation: ModelRecommendation,
	): string {
		let output = "";

		output += chalk.blue.bold("🤖 Model Recommendation\n");
		output += `${chalk.gray("─".repeat(50))}
`;

		// Task classification
		output +=
			chalk.cyan("Task Type: ") +
			chalk.white(classification.taskType.replace("_", " ")) +
			chalk.gray(
				` (${(classification.confidence * 100).toFixed(0)}% confidence)\n`,
			);
		output += chalk.gray(`Reasoning: ${classification.reasoning}\n\n`);

		// Recommendation
		const modelName = recommendation.recommendedModel;
		const confidenceColor =
			recommendation.confidence > 0.8
				? chalk.green
				: recommendation.confidence > 0.6
					? chalk.yellow
					: chalk.red;

		output += chalk.green.bold(`✅ Recommended: ${modelName}\n`);
		output += confidenceColor(
			`Confidence: ${(recommendation.confidence * 100).toFixed(0)}%\n`,
		);

		if (recommendation.costSavings) {
			output += chalk.green(
				`💰 Estimated savings: $${recommendation.costSavings.toFixed(4)} per conversation\n`,
			);
		}

		output += chalk.white(`${recommendation.reasoning}\n\n`);

		// Alternative
		if (recommendation.alternativeModel) {
			const altName = recommendation.alternativeModel.model;
			output += chalk.yellow(`⚡ Alternative: ${altName}
`);
			output += chalk.gray(`${recommendation.alternativeModel.tradeoffs}\n`);
		}

		return output;
	}
}
