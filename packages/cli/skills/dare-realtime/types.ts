/**
 * dare-realtime — shared types
 * License: MIT
 */

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface EventSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, EventSchema>;
  required?: string[];
  items?: EventSchema;
  [key: string]: unknown;
}

export interface RegisteredEvent {
  type: string;
  schema: EventSchema;
  registeredAt: number;
}

export interface RealtimeMetricsInput {
  /** M-01: number of event types with schema defined */
  eventTypesWithSchema: number;
  /** M-01: total event types in use */
  totalEventTypes: number;
  /** M-02: number of subscriptions that have auth checks */
  authorizedSubscriptions: number;
  /** M-02: total subscriptions */
  totalSubscriptions: number;
  /** M-03: known ghost listener count (should be 0) */
  ghostListenerCount: number;
  /** M-04: reconnect strategy is configured */
  reconnectConfigured: boolean;
}

export interface MetricResult {
  id: string;
  pass: boolean;
  description: string;
  detail?: string;
}
