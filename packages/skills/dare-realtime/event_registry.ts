/**
 * dare-realtime — EventRegistry
 * Central registry for real-time event types and their schemas.
 * License: MIT
 */

import type { EventSchema, RegisteredEvent, ValidationResult } from './types.js';
import { SchemaValidator } from './schema_validator.js';

export class EventRegistry {
  private readonly events: Map<string, RegisteredEvent> = new Map();
  private readonly validator: SchemaValidator = new SchemaValidator();

  /**
   * Register an event type with its schema.
   * Throws if the event type is already registered.
   */
  register(type: string, schema: EventSchema): void {
    if (this.events.has(type)) {
      throw new Error(`EventRegistry: event type "${type}" is already registered`);
    }
    this.events.set(type, {
      type,
      schema,
      registeredAt: Date.now(),
    });
  }

  /**
   * Register or overwrite an event type.
   */
  registerOrUpdate(type: string, schema: EventSchema): void {
    this.events.set(type, {
      type,
      schema,
      registeredAt: Date.now(),
    });
  }

  /**
   * Validate a payload against the schema for a given event type.
   * Returns an error if the event type is not registered.
   */
  validate(type: string, payload: unknown): ValidationResult {
    const event = this.events.get(type);
    if (!event) {
      return {
        ok: false,
        errors: [
          {
            field: '$type',
            message: `Unknown event type: "${type}". Register it first with registry.register().`,
          },
        ],
      };
    }
    return this.validator.validate(payload, event.schema);
  }

  /**
   * Get the schema for an event type, or null if not registered.
   */
  getSchema(type: string): EventSchema | null {
    return this.events.get(type)?.schema ?? null;
  }

  /**
   * Check if an event type is registered.
   */
  has(type: string): boolean {
    return this.events.has(type);
  }

  /**
   * List all registered event types.
   */
  listTypes(): string[] {
    return Array.from(this.events.keys());
  }

  /**
   * Number of registered event types.
   */
  get size(): number {
    return this.events.size;
  }

  /**
   * Remove an event type from the registry.
   */
  unregister(type: string): boolean {
    return this.events.delete(type);
  }

  /**
   * Clear all registered events.
   */
  clear(): void {
    this.events.clear();
  }
}
