/**
 * dare-realtime — Metrics collector
 * Evaluates M-01 to M-04 for the dare-realtime skill.
 * License: MIT
 */

import type { MetricResult, RealtimeMetricsInput } from './types.js';

export function collectRealtimeMetrics(input: RealtimeMetricsInput): MetricResult[] {
  return [
    checkM01(input),
    checkM02(input),
    checkM03(input),
    checkM04(input),
  ];
}

/**
 * M-01: 100% of event types have JSON Schema defined.
 */
function checkM01(input: RealtimeMetricsInput): MetricResult {
  const pass = input.totalEventTypes === 0 || input.eventTypesWithSchema === input.totalEventTypes;

  return {
    id: 'M-01',
    pass,
    description: '100% of event types have JSON Schema defined',
    detail: input.totalEventTypes === 0
      ? 'No event types registered'
      : pass
        ? `All ${input.totalEventTypes} event type(s) have schemas`
        : `${input.totalEventTypes - input.eventTypesWithSchema} event type(s) missing schema`,
  };
}

/**
 * M-02: 100% of subscriptions are authorized.
 */
function checkM02(input: RealtimeMetricsInput): MetricResult {
  const pass = input.totalSubscriptions === 0 || input.authorizedSubscriptions === input.totalSubscriptions;

  return {
    id: 'M-02',
    pass,
    description: '100% of subscriptions are authorized',
    detail: input.totalSubscriptions === 0
      ? 'No subscriptions recorded'
      : pass
        ? `All ${input.totalSubscriptions} subscription(s) are authorized`
        : `${input.totalSubscriptions - input.authorizedSubscriptions} subscription(s) lack authorization check`,
  };
}

/**
 * M-03: 0% ghost listeners.
 */
function checkM03(input: RealtimeMetricsInput): MetricResult {
  const pass = input.ghostListenerCount === 0;

  return {
    id: 'M-03',
    pass,
    description: '0 ghost listeners after disconnect (no memory leaks)',
    detail: pass
      ? 'No ghost listeners detected'
      : `${input.ghostListenerCount} ghost listener(s) detected — call unsubscribeAll() on disconnect`,
  };
}

/**
 * M-04: Reconnection strategy configured.
 */
function checkM04(input: RealtimeMetricsInput): MetricResult {
  const pass = input.reconnectConfigured;

  return {
    id: 'M-04',
    pass,
    description: 'Reconnection strategy configured (exponential backoff)',
    detail: pass
      ? 'Reconnect strategy is configured'
      : 'No reconnect strategy configured — use ReconnectStrategy for exponential backoff',
  };
}
