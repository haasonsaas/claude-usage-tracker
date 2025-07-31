import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelAdvisor } from "./model-advisor.js";
import { setupTestConfig } from "./test-utils.js";

describe("ModelAdvisor", () => {
	let cleanup: () => void;

	beforeEach(() => {
		cleanup = setupTestConfig();
	});

	afterEach(() => {
		cleanup();
	});
	it("should recommend Sonnet for code generation tasks", () => {
		const advisor = new ModelAdvisor();
		const prompt = "Write a function to sort an array in TypeScript.";
		const classification = advisor.classifyTask(prompt);
		const recommendation = advisor.getModelRecommendation(classification);
		expect(recommendation.recommendedModel).toBe("claude-3.5-sonnet-20241022");
		expect(recommendation.reasoning).toContain(
			"Sonnet 4 excels at code generation",
		);
	});

	it("should recommend Opus for complex debugging tasks", () => {
		const advisor = new ModelAdvisor();
		const prompt = "Debug this complex memory leak in a large C++ codebase.";
		const classification = advisor.classifyTask(prompt);
		const recommendation = advisor.getModelRecommendation(classification);
		expect(recommendation.recommendedModel).toBe("claude-opus-4-20250514");
		expect(recommendation.reasoning).toContain(
			"Opus 4 recommended for complex debugging",
		);
	});

	it("should recommend Sonnet for simple queries", () => {
		const advisor = new ModelAdvisor();
		const prompt = "What is the syntax for a for loop in JavaScript?";
		const classification = advisor.classifyTask(prompt);
		const recommendation = advisor.getModelRecommendation(classification);
		expect(recommendation.recommendedModel).toBe("claude-3.5-sonnet-20241022");
		expect(recommendation.reasoning).toContain(
			"Sonnet 4 perfect for straightforward questions",
		);
	});

	it("should calculate cost savings correctly for Sonnet recommendation", () => {
		const advisor = new ModelAdvisor();
		const prompt = "Generate a simple HTML page.";
		const classification = advisor.classifyTask(prompt);
		const recommendation = advisor.getModelRecommendation(classification);
		expect(recommendation.recommendedModel).toBe("claude-3.5-sonnet-20241022");
		expect(recommendation.costSavings).toBeGreaterThan(0);
	});

	it("should have a higher confidence for well-matched tasks", () => {
		const advisor = new ModelAdvisor();
		const prompt = "Document the API endpoints for user authentication.";
		const classification = advisor.classifyTask(prompt);
		const recommendation = advisor.getModelRecommendation(classification);
		expect(recommendation.recommendedModel).toBe("claude-3.5-sonnet-20241022");
		expect(recommendation.confidence).toBeGreaterThan(0.4);
	});
});
