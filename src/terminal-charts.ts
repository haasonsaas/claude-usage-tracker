import chalk from "chalk";

export interface SparklineOptions {
	height?: number;
	min?: number;
	max?: number;
	color?: (value: number, max: number) => typeof chalk;
}

export class TerminalCharts {
	/**
	 * Create a sparkline chart for array of numbers
	 */
	static sparkline(
		data: number[],
		width: number,
		options: SparklineOptions = {},
	): string {
		if (data.length === 0) return "";

		const chars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
		const min = options.min ?? Math.min(...data);
		const max = options.max ?? Math.max(...data);
		const range = max - min || 1;

		// Resample data to fit width
		const resampled = this.resampleData(data, width);

		return resampled
			.map((value) => {
				const normalized = (value - min) / range;
				const index = Math.floor(normalized * (chars.length - 1));
				const char = chars[Math.max(0, Math.min(chars.length - 1, index))];

				if (options.color) {
					return options.color(value, max)(char);
				}
				return char;
			})
			.join("");
	}

	/**
	 * Create a horizontal bar chart
	 */
	static barChart(
		data: Array<{ label: string; value: number; color?: typeof chalk }>,
		maxWidth: number,
	): string[] {
		if (data.length === 0) return [];

		const maxValue = Math.max(...data.map((d) => d.value));
		const maxLabelLength = Math.max(...data.map((d) => d.label.length));
		const barWidth = maxWidth - maxLabelLength - 10; // Leave space for label and value

		return data.map(({ label, value, color = chalk.blue }) => {
			const barLength = Math.floor((value / maxValue) * barWidth);
			const bar = color("█".repeat(barLength));
			const padding = " ".repeat(maxLabelLength - label.length);
			const percentage = ((value / maxValue) * 100).toFixed(0);

			return `${label}${padding} ${bar} ${percentage}%`;
		});
	}

	/**
	 * Create a simple line chart using ASCII
	 */
	static lineChart(
		data: number[],
		width: number,
		height: number,
		options: { showAxes?: boolean; color?: typeof chalk } = {},
	): string[] {
		if (data.length === 0) return [];

		const { showAxes = true, color = chalk.blue } = options;
		const resampled = this.resampleData(data, width - (showAxes ? 2 : 0));
		const min = Math.min(...resampled);
		const max = Math.max(...resampled);
		const range = max - min || 1;

		// Create empty canvas
		const canvas: string[][] = Array(height)
			.fill(null)
			.map(() => Array(width).fill(" "));

		// Draw axes if requested
		if (showAxes) {
			// Y-axis
			for (let y = 0; y < height; y++) {
				canvas[y][0] = "│";
			}
			// X-axis
			for (let x = 0; x < width; x++) {
				canvas[height - 1][x] = "─";
			}
			canvas[height - 1][0] = "└";
		}

		// Plot data points
		const xOffset = showAxes ? 2 : 0;
		resampled.forEach((value, index) => {
			const x = index + xOffset;
			const y = height - 1 - Math.floor(((value - min) / range) * (height - 1));

			if (x < width && y >= 0 && y < height) {
				canvas[y][x] = color("●");

				// Draw vertical line to x-axis
				for (let yi = y + 1; yi < height - 1; yi++) {
					if (canvas[yi][x] === " ") {
						canvas[yi][x] = color("│");
					}
				}
			}
		});

		return canvas.map((row) => row.join(""));
	}

	/**
	 * Create a heat map for hourly usage
	 */
	static heatMap(
		hourlyData: number[],
		options: { width?: number; showLabels?: boolean } = {},
	): string[] {
		const { width = 24, showLabels = true } = options;
		const chars = [" ", "░", "▒", "▓", "█"];
		const colors = [
			chalk.gray,
			chalk.blue,
			chalk.cyan,
			chalk.yellow,
			chalk.red,
		];

		const max = Math.max(...hourlyData, 1);
		const result: string[] = [];

		if (showLabels) {
			// Hour labels
			const labels = Array.from({ length: 24 }, (_, i) =>
				i.toString().padStart(2, "0"),
			);
			result.push(
				"Hour: " +
					labels
						.map((l, i) => (i % 3 === 0 ? l : "  "))
						.join("")
						.substring(0, width * 2),
			);
		}

		// Heat map row
		const heatRow = hourlyData
			.slice(0, width)
			.map((value) => {
				const normalized = value / max;
				const index = Math.floor(normalized * (chars.length - 1));
				const char = chars[Math.max(0, Math.min(chars.length - 1, index))];
				const color = colors[index];
				return color(char.repeat(2)); // Double width for better visibility
			})
			.join("");

		result.push("Usage: " + heatRow);

		return result;
	}

	/**
	 * Create a progress bar
	 */
	static progressBar(
		current: number,
		total: number,
		width: number,
		options: {
			showPercentage?: boolean;
			color?: typeof chalk;
			bgColor?: typeof chalk;
		} = {},
	): string {
		const {
			showPercentage = true,
			color = chalk.green,
			bgColor = chalk.gray,
		} = options;

		const percentage = Math.min(100, (current / total) * 100);
		const filled = Math.floor((percentage / 100) * width);
		const empty = width - filled;

		const bar = color("█".repeat(filled)) + bgColor("░".repeat(empty));

		if (showPercentage) {
			return `${bar} ${percentage.toFixed(1)}%`;
		}

		return bar;
	}

	/**
	 * Resample data to fit a specific width
	 */
	private static resampleData(data: number[], targetWidth: number): number[] {
		if (data.length <= targetWidth) return data;

		const result: number[] = [];
		const bucketSize = data.length / targetWidth;

		for (let i = 0; i < targetWidth; i++) {
			const start = Math.floor(i * bucketSize);
			const end = Math.floor((i + 1) * bucketSize);
			const bucket = data.slice(start, end);

			// Average the bucket
			const avg = bucket.reduce((a, b) => a + b, 0) / bucket.length;
			result.push(avg);
		}

		return result;
	}
}