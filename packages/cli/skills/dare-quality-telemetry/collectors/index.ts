/**
 * dare-quality-telemetry — collector registry
 * Maps skill names to their metric collector functions.
 * License: MIT
 */

import { collectDareAx } from './dare_ax_collector.js';
import { collectDareLayeredDesign } from './dare_layered_design_collector.js';
import { MetricResult } from '../types.js';

export { collectDareAx } from './dare_ax_collector.js';
export { collectDareLayeredDesign } from './dare_layered_design_collector.js';

/**
 * Registry of available metric collectors.
 * Key: skill name (e.g., "dare-ax")
 * Value: async function that receives a project path and returns MetricResult[]
 *
 * Extensible: add new collectors here when new skills are created.
 */
export const collectors: Record<string, (projectPath: string) => Promise<MetricResult[]>> = {
  'dare-ax': collectDareAx,
  'dare-layered-design': collectDareLayeredDesign,
};
