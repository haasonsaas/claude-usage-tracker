
import type { TaskClassification } from './model-advisor.js';
import { MODEL_PRICING } from './config.js';

export const TASK_MODEL_MAPPING: Record<TaskClassification['taskType'], { model: keyof typeof MODEL_PRICING; confidence: number }> = {
  code_generation: { model: 'claude-3.5-sonnet-20241022', confidence: 0.8 },
  debugging: { model: 'claude-opus-4-20250514', confidence: 0.7 },
  code_review: { model: 'claude-3.5-sonnet-20241022', confidence: 0.75 },
  documentation: { model: 'claude-3.5-sonnet-20241022', confidence: 0.9 },
  architecture: { model: 'claude-opus-4-20250514', confidence: 0.8 },
  complex_analysis: { model: 'claude-opus-4-20250514', confidence: 0.9 },
  simple_query: { model: 'claude-3.5-sonnet-20241022', confidence: 0.95 },
  refactoring: { model: 'claude-3.5-sonnet-20241022', confidence: 0.8 },
};
