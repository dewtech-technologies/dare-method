/**
 * dare-realtime — public API
 * License: MIT
 */

// Types
export type {
  ValidationResult,
  ValidationError,
  EventSchema,
  RegisteredEvent,
  RealtimeMetricsInput,
  MetricResult,
} from './types.js';

// Schema validator
export { SchemaValidator } from './schema_validator.js';

// Event registry
export { EventRegistry } from './event_registry.js';

// Reconnect strategy
export { ReconnectStrategy } from './reconnect_strategy.js';
export type { ReconnectStrategyConfig } from './reconnect_strategy.js';

// Subscription manager
export { SubscriptionManager } from './subscription_manager.js';

// Metrics
export { collectRealtimeMetrics } from './metrics.js';
