import { calculateCost } from "./analyzer.js";
import type { UsageEntry } from "./types.js";

// Query Language Design:
// SELECT fields FROM conversations WHERE conditions GROUP BY field HAVING conditions ORDER BY field LIMIT n

export interface QueryResult {
	data: any[];
	metadata: {
		totalRows: number;
		executionTime: number;
		fields: string[];
	};
	explanation?: QueryExplanation;
}

export interface QueryExplanation {
	query: ParsedQuery;
	plan: {
		step: string;
		description: string;
		estimatedCost: number;
		rowsProcessed: number;
	}[];
	totalExecutionSteps: number;
	optimizationHints: string[];
}

export interface SelectField {
	field: string;
	alias?: string;
	aggregation?: "count" | "sum" | "avg" | "min" | "max";
}

export interface WhereCondition {
	field: string;
	operator: "=" | "!=" | ">" | "<" | ">=" | "<=" | "like" | "in";
	value: any;
	logical?: "and" | "or";
}

export interface OrderBy {
	field: string;
	direction: "asc" | "desc";
}

export interface ParsedQuery {
	select: SelectField[];
	from: "conversations" | "entries";
	where?: WhereCondition[];
	groupBy?: string[];
	having?: WhereCondition[];
	orderBy?: OrderBy[];
	limit?: number;
}

export class QueryEngine {
	constructor(private entries: UsageEntry[]) {}

	// Main query execution method
	async execute(
		queryString: string,
		explain: boolean = false,
	): Promise<QueryResult> {
		const startTime = Date.now();

		try {
			const query = this.parseQuery(queryString);

			let explanation: QueryExplanation | undefined;
			if (explain) {
				explanation = this.explainQuery(query);
			}

			const result = this.executeQuery(query);

			const executionTime = Date.now() - startTime;

			return {
				data: result,
				metadata: {
					totalRows: result.length,
					executionTime,
					fields: query.select.map((s) => s.alias || s.field),
				},
				explanation,
			};
		} catch (error) {
			throw new Error(
				`Query execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	// Parse SQL-like query string into structured query
	private parseQuery(queryString: string): ParsedQuery {
		const query = queryString.trim().toLowerCase();

		// Simple regex-based parser (we'll enhance this)
		const selectMatch = query.match(/select\s+(.*?)\s+from/);
		const fromMatch = query.match(/from\s+(conversations|entries)/);
		const whereMatch = query.match(
			/where\s+(.*?)(?:\s+group|\s+order|\s+limit|$)/,
		);
		const groupByMatch = query.match(
			/group\s+by\s+(.*?)(?:\s+having|\s+order|\s+limit|$)/,
		);
		const orderByMatch = query.match(/order\s+by\s+(.*?)(?:\s+limit|$)/);
		const limitMatch = query.match(/limit\s+(\d+)/);

		if (!selectMatch || !fromMatch) {
			throw new Error("Invalid query: SELECT and FROM clauses are required");
		}

		return {
			select: this.parseSelectFields(selectMatch[1]),
			from: fromMatch[1] as "conversations" | "entries",
			where: whereMatch ? this.parseWhereConditions(whereMatch[1]) : undefined,
			groupBy: groupByMatch
				? groupByMatch[1].split(",").map((f) => f.trim())
				: undefined,
			orderBy: orderByMatch ? this.parseOrderBy(orderByMatch[1]) : undefined,
			limit: limitMatch ? parseInt(limitMatch[1]) : undefined,
		};
	}

	private parseSelectFields(fieldsStr: string): SelectField[] {
		const fields = fieldsStr.split(",").map((f) => f.trim());

		return fields.map((field) => {
			// Handle aggregations: count(*), sum(cost), avg(tokens)
			const aggMatch = field.match(
				/^(count|sum|avg|min|max)\s*\(\s*(.*?)\s*\)(?:\s+as\s+(.+))?$/,
			);
			if (aggMatch) {
				return {
					field: aggMatch[2] === "*" ? "*" : aggMatch[2],
					aggregation: aggMatch[1] as any,
					alias: aggMatch[3],
				};
			}

			// Handle aliases: field as alias
			const aliasMatch = field.match(/^(.+?)\s+as\s+(.+)$/);
			if (aliasMatch) {
				return {
					field: aliasMatch[1],
					alias: aliasMatch[2],
				};
			}

			return { field };
		});
	}

	private parseWhereConditions(whereStr: string): WhereCondition[] {
		// Simple parser - we'll enhance this for complex conditions
		const conditions: WhereCondition[] = [];

		// Split by AND/OR (simple implementation)
		const parts = whereStr.split(/\s+(and|or)\s+/i);

		for (let i = 0; i < parts.length; i += 2) {
			const condition = parts[i].trim();
			const logical =
				i > 0 ? (parts[i - 1].toLowerCase() as "and" | "or") : undefined;

			// Parse condition: field operator value
			const match = condition.match(/^(\w+)\s*(=|!=|>=|<=|>|<|like)\s*(.+)$/);
			if (match) {
				conditions.push({
					field: match[1],
					operator: match[2] as any,
					value: this.parseValue(match[3]),
					logical,
				});
			}
		}

		return conditions;
	}

	private parseOrderBy(orderStr: string): OrderBy[] {
		return orderStr.split(",").map((item) => {
			const parts = item.trim().split(/\s+/);
			return {
				field: parts[0],
				direction: parts[1]?.toLowerCase() === "desc" ? "desc" : "asc",
			};
		});
	}

	private parseValue(valueStr: string): any {
		const trimmed = valueStr.trim();

		// Remove quotes
		if (
			(trimmed.startsWith("'") && trimmed.endsWith("'")) ||
			(trimmed.startsWith('"') && trimmed.endsWith('"'))
		) {
			return trimmed.slice(1, -1);
		}

		// Parse numbers
		if (/^\d+(\.\d+)?$/.test(trimmed)) {
			return parseFloat(trimmed);
		}

		// Parse dates
		if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
			return trimmed;
		}

		// Special keywords
		if (["today", "yesterday", "null"].includes(trimmed)) {
			return trimmed;
		}

		return trimmed;
	}

	// Execute the parsed query
	private executeQuery(query: ParsedQuery): any[] {
		let data = this.prepareData(query.from);

		// Apply WHERE conditions
		if (query.where) {
			data = this.applyWhere(data, query.where);
		}

		// Apply GROUP BY
		if (query.groupBy) {
			data = this.applyGroupBy(data, query.select, query.groupBy);
		} else {
			// Apply SELECT (without grouping)
			data = this.applySelect(data, query.select);
		}

		// Apply ORDER BY
		if (query.orderBy) {
			data = this.applyOrderBy(data, query.orderBy);
		}

		// Apply LIMIT
		if (query.limit) {
			data = data.slice(0, query.limit);
		}

		return data;
	}

	private prepareData(from: "conversations" | "entries"): any[] {
		if (from === "conversations") {
			// Group entries by conversation
			const conversations = new Map<string, UsageEntry[]>();

			for (const entry of this.entries) {
				if (!conversations.has(entry.conversationId)) {
					conversations.set(entry.conversationId, []);
				}
				conversations.get(entry.conversationId)!.push(entry);
			}

			// Convert to conversation objects
			return Array.from(conversations.entries()).map(
				([conversationId, entries]) => {
					const totalCost = entries.reduce(
						(sum, e) => sum + calculateCost(e),
						0,
					);
					const totalTokens = entries.reduce(
						(sum, e) =>
							sum + (e.prompt_tokens || 0) + (e.completion_tokens || 0),
						0,
					);
					const firstEntry = entries[0];

					return {
						conversation_id: conversationId,
						project: firstEntry.instanceId || "unknown",
						model: firstEntry.model || "unknown",
						message_count: entries.length,
						cost: totalCost,
						tokens: totalTokens,
						prompt_tokens: entries.reduce(
							(sum, e) => sum + (e.prompt_tokens || 0),
							0,
						),
						completion_tokens: entries.reduce(
							(sum, e) => sum + (e.completion_tokens || 0),
							0,
						),
						date: firstEntry.timestamp.split("T")[0],
						timestamp: firstEntry.timestamp,
						efficiency_score:
							totalTokens > 0 ? (totalCost / totalTokens) * 1000 : 0, // cost per 1k tokens
						duration_minutes: this.calculateDuration(entries),
						first_message: firstEntry.timestamp,
						last_message: entries[entries.length - 1].timestamp,
					};
				},
			);
		} else {
			// Return raw entries with computed fields
			return this.entries.map((entry) => ({
				...entry,
				cost: calculateCost(entry),
				date: entry.timestamp.split("T")[0],
				tokens: (entry.prompt_tokens || 0) + (entry.completion_tokens || 0),
				conversation_id: entry.conversationId,
				project: entry.instanceId || "unknown",
			}));
		}
	}

	private calculateDuration(entries: UsageEntry[]): number {
		if (entries.length < 2) return 0;

		const first = new Date(entries[0].timestamp);
		const last = new Date(entries[entries.length - 1].timestamp);

		return Math.round((last.getTime() - first.getTime()) / (1000 * 60)); // minutes
	}

	private applyWhere(data: any[], conditions: WhereCondition[]): any[] {
		return data.filter((row) => {
			let result = true;
			let currentResult = true;

			for (const condition of conditions) {
				const fieldValue = this.getFieldValue(row, condition.field);
				const conditionResult = this.evaluateCondition(
					fieldValue,
					condition.operator,
					condition.value,
				);

				if (condition.logical === "or") {
					result = result || conditionResult;
					currentResult = conditionResult;
				} else {
					// AND or first condition
					result = result && conditionResult;
					currentResult = conditionResult;
				}
			}

			return result;
		});
	}

	private getFieldValue(row: any, field: string): any {
		// Handle special date keywords
		if (field === "date" && ["today", "yesterday"].includes(row.date)) {
			const today = new Date().toISOString().split("T")[0];
			const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
				.toISOString()
				.split("T")[0];

			if (row.date === "today") return today;
			if (row.date === "yesterday") return yesterday;
		}

		return row[field];
	}

	private evaluateCondition(
		fieldValue: any,
		operator: string,
		conditionValue: any,
	): boolean {
		// Handle special date values
		if (conditionValue === "today") {
			conditionValue = new Date().toISOString().split("T")[0];
		} else if (conditionValue === "yesterday") {
			conditionValue = new Date(Date.now() - 24 * 60 * 60 * 1000)
				.toISOString()
				.split("T")[0];
		}

		switch (operator) {
			case "=":
				return fieldValue === conditionValue;
			case "!=":
				return fieldValue !== conditionValue;
			case ">":
				return fieldValue > conditionValue;
			case "<":
				return fieldValue < conditionValue;
			case ">=":
				return fieldValue >= conditionValue;
			case "<=":
				return fieldValue <= conditionValue;
			case "like":
				return String(fieldValue)
					.toLowerCase()
					.includes(String(conditionValue).toLowerCase());
			default:
				return false;
		}
	}

	private applySelect(data: any[], selectFields: SelectField[]): any[] {
		if (selectFields.length === 1 && selectFields[0].field === "*") {
			return data;
		}

		return data.map((row) => {
			const result: any = {};

			for (const field of selectFields) {
				const key = field.alias || field.field;
				result[key] = row[field.field];
			}

			return result;
		});
	}

	private applyGroupBy(
		data: any[],
		selectFields: SelectField[],
		groupByFields: string[],
	): any[] {
		const groups = new Map<string, any[]>();

		// Group data
		for (const row of data) {
			const groupKey = groupByFields.map((field) => row[field]).join("|");
			if (!groups.has(groupKey)) {
				groups.set(groupKey, []);
			}
			groups.get(groupKey)!.push(row);
		}

		// Apply aggregations
		return Array.from(groups.entries()).map(([groupKey, groupRows]) => {
			const result: any = {};

			// Add group by fields
			groupByFields.forEach((field, index) => {
				result[field] = groupKey.split("|")[index];
			});

			// Apply aggregations
			for (const field of selectFields) {
				const key = field.alias || field.field;

				if (field.aggregation) {
					result[key] = this.calculateAggregation(
						groupRows,
						field.field,
						field.aggregation,
					);
				} else if (groupByFields.includes(field.field)) {
					// Already added above
				} else {
					// Take first value for non-aggregated fields
					result[key] = groupRows[0][field.field];
				}
			}

			return result;
		});
	}

	private calculateAggregation(
		rows: any[],
		field: string,
		aggregation: string,
	): any {
		switch (aggregation) {
			case "count":
				return field === "*"
					? rows.length
					: rows.filter((r) => r[field] != null).length;
			case "sum":
				return rows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
			case "avg": {
				const values = rows.map((r) => Number(r[field]) || 0);
				return values.length > 0
					? values.reduce((sum, v) => sum + v, 0) / values.length
					: 0;
			}
			case "min":
				return Math.min(...rows.map((r) => Number(r[field]) || 0));
			case "max":
				return Math.max(...rows.map((r) => Number(r[field]) || 0));
			default:
				return null;
		}
	}

	private applyOrderBy(data: any[], orderBy: OrderBy[]): any[] {
		return [...data].sort((a, b) => {
			for (const order of orderBy) {
				const aVal = a[order.field];
				const bVal = b[order.field];

				let comparison = 0;
				if (aVal < bVal) comparison = -1;
				else if (aVal > bVal) comparison = 1;

				if (comparison !== 0) {
					return order.direction === "desc" ? -comparison : comparison;
				}
			}
			return 0;
		});
	}

	// Generate query explanation for optimization and debugging
	private explainQuery(query: ParsedQuery): QueryExplanation {
		const plan: QueryExplanation["plan"] = [];
		const optimizationHints: string[] = [];

		let estimatedRows = this.entries.length;
		let totalCost = 0;

		// Step 1: Data preparation
		if (query.from === "conversations") {
			const uniqueConversations = new Set(
				this.entries.map((e) => e.conversationId),
			).size;
			estimatedRows = uniqueConversations;
			plan.push({
				step: "Data Preparation",
				description: `Transform ${this.entries.length} entries into ${uniqueConversations} conversation aggregates`,
				estimatedCost: Math.ceil(this.entries.length / 1000),
				rowsProcessed: this.entries.length,
			});
			totalCost += Math.ceil(this.entries.length / 1000);
		} else {
			plan.push({
				step: "Data Preparation",
				description: `Load ${this.entries.length} raw entries`,
				estimatedCost: Math.ceil(this.entries.length / 10000),
				rowsProcessed: this.entries.length,
			});
			totalCost += Math.ceil(this.entries.length / 10000);
		}

		// Step 2: WHERE filtering
		if (query.where && query.where.length > 0) {
			const selectivity = this.estimateSelectivity(query.where);
			const filteredRows = Math.ceil(estimatedRows * selectivity);

			plan.push({
				step: "WHERE Filtering",
				description: `Apply ${query.where.length} condition(s), estimated selectivity: ${Math.round(selectivity * 100)}%`,
				estimatedCost: Math.ceil(estimatedRows / 5000),
				rowsProcessed: estimatedRows,
			});

			estimatedRows = filteredRows;
			totalCost += Math.ceil(estimatedRows / 5000);

			// Optimization hints
			if (query.where.some((w) => w.field === "date")) {
				optimizationHints.push(
					"Date filtering detected - consider using date range queries for better performance",
				);
			}
			if (query.where.length > 3) {
				optimizationHints.push(
					"Multiple WHERE conditions - consider combining related conditions",
				);
			}
		}

		// Step 3: GROUP BY aggregation
		if (query.groupBy && query.groupBy.length > 0) {
			const groupEstimate = Math.min(
				estimatedRows,
				Math.ceil(estimatedRows / 10),
			);

			plan.push({
				step: "GROUP BY Aggregation",
				description: `Group by ${query.groupBy.length} field(s), estimated ${groupEstimate} groups`,
				estimatedCost: Math.ceil(estimatedRows / 1000) + 2,
				rowsProcessed: estimatedRows,
			});

			estimatedRows = groupEstimate;
			totalCost += Math.ceil(estimatedRows / 1000) + 2;

			// Check for aggregation optimizations
			const hasAggregations = query.select.some((s) => s.aggregation);
			if (hasAggregations) {
				optimizationHints.push(
					"Using aggregations - results are automatically optimized for analysis",
				);
			}
		}

		// Step 4: SELECT projection
		if (
			query.select.length < 10 &&
			!query.select.some((s) => s.field === "*")
		) {
			plan.push({
				step: "SELECT Projection",
				description: `Project ${query.select.length} field(s)`,
				estimatedCost: Math.ceil(estimatedRows / 10000),
				rowsProcessed: estimatedRows,
			});
			totalCost += Math.ceil(estimatedRows / 10000);
		}

		// Step 5: ORDER BY sorting
		if (query.orderBy && query.orderBy.length > 0) {
			const sortCost =
				estimatedRows > 0
					? Math.ceil((estimatedRows * Math.log2(estimatedRows)) / 1000)
					: 0;

			plan.push({
				step: "ORDER BY Sorting",
				description: `Sort by ${query.orderBy.length} field(s)`,
				estimatedCost: Math.max(1, sortCost),
				rowsProcessed: estimatedRows,
			});
			totalCost += Math.max(1, sortCost);

			if (estimatedRows > 1000) {
				optimizationHints.push(
					"Large result set sorting - consider adding LIMIT clause for better performance",
				);
			}
		}

		// Step 6: LIMIT
		if (query.limit) {
			plan.push({
				step: "LIMIT",
				description: `Limit results to ${query.limit} rows`,
				estimatedCost: 0,
				rowsProcessed: Math.min(estimatedRows, query.limit),
			});

			if (query.limit < 100) {
				optimizationHints.push(
					"Small LIMIT detected - excellent for performance",
				);
			}
		}

		// General optimization hints
		if (this.entries.length > 10000 && !query.where) {
			optimizationHints.push(
				"Large dataset without filtering - consider adding WHERE conditions to improve performance",
			);
		}

		if (
			query.select.some((s) => s.field === "*") &&
			this.entries.length > 1000
		) {
			optimizationHints.push(
				"SELECT * on large dataset - specify only needed fields for better performance",
			);
		}

		return {
			query,
			plan,
			totalExecutionSteps: plan.length,
			optimizationHints,
		};
	}

	private estimateSelectivity(conditions: WhereCondition[]): number {
		// Simple heuristic for estimating how many rows will pass the filter
		let selectivity = 1.0;

		for (const condition of conditions) {
			let conditionSelectivity = 0.5; // Default 50%

			switch (condition.operator) {
				case "=":
					conditionSelectivity = 0.1; // Equality is typically selective
					break;
				case "!=":
					conditionSelectivity = 0.9;
					break;
				case ">":
				case "<":
					conditionSelectivity = 0.3;
					break;
				case ">=":
				case "<=":
					conditionSelectivity = 0.4;
					break;
				case "like":
					conditionSelectivity = 0.2;
					break;
			}

			// Adjust for specific fields
			if (condition.field === "date") {
				conditionSelectivity *= 0.5; // Date filters are often more selective
			} else if (condition.field === "model") {
				conditionSelectivity *= 0.3; // Model filters are typically selective
			}

			if (condition.logical === "or") {
				selectivity =
					selectivity +
					conditionSelectivity -
					selectivity * conditionSelectivity;
			} else {
				selectivity *= conditionSelectivity;
			}
		}

		return Math.max(0.01, Math.min(1.0, selectivity));
	}
}
