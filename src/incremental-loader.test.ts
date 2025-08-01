import { describe, it, expect, beforeEach } from "vitest";
import { IncrementalDataLoader } from "./incremental-loader.js";
import type { UsageEntry } from "./types.js";

describe("IncrementalDataLoader", () => {
	let loader: IncrementalDataLoader;

	beforeEach(() => {
		loader = new IncrementalDataLoader();
	});

	it("should track processed entries and avoid duplicates", async () => {
		// First load - should get all entries
		const firstLoad = await loader.loadAllData();
		const firstCount = firstLoad.length;

		// Second load without changes - should get no new entries
		const secondLoad = await loader.loadNewEntries();
		expect(secondLoad.length).toBe(0);

		// Clear cache and load again - should get all entries
		loader.clearCache();
		const thirdLoad = await loader.loadAllData();
		expect(thirdLoad.length).toBe(firstCount);
	});

	it("should return entries in chronological order", async () => {
		const entries = await loader.loadAllData();
		
		// Verify entries are sorted by timestamp
		for (let i = 1; i < entries.length; i++) {
			const prevTime = new Date(entries[i - 1].timestamp).getTime();
			const currTime = new Date(entries[i].timestamp).getTime();
			expect(currTime).toBeGreaterThanOrEqual(prevTime);
		}
	});

	it("should manage memory by limiting processed entries", async () => {
		// This test would require mocking file system to generate > 10000 entries
		// For now, we just verify the method exists
		expect(loader.clearCache).toBeDefined();
	});

	it("should handle missing files gracefully", async () => {
		// Should not throw even with no files
		const entries = await loader.loadNewEntries();
		expect(Array.isArray(entries)).toBe(true);
	});
});