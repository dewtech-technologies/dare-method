/**
 * dare-realtime — SchemaValidator
 * Validates a real-time event payload against a JSON Schema definition.
 * Zero external dependencies.
 * License: MIT
 */

import type { ValidationResult, ValidationError, EventSchema } from './types.js';

export class SchemaValidator {
  /**
   * Validate a payload against a schema.
   */
  validate(payload: unknown, schema: EventSchema): ValidationResult {
    const errors: ValidationError[] = [];
    validateValue(payload, schema, '$', errors);
    return { ok: errors.length === 0, errors };
  }
}

function validateValue(
  value: unknown,
  schema: EventSchema,
  path: string,
  errors: ValidationError[]
): void {
  // Type check
  if (schema.type !== undefined) {
    const actualType = getType(value);
    if (schema.type !== actualType) {
      errors.push({
        field: path,
        message: `Expected type "${schema.type}", got "${actualType}"`,
        value,
      });
      return; // No further checks if type is wrong
    }
  }

  // Object checks
  if (schema.type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;

    // Required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in obj) || obj[field] === undefined || obj[field] === null) {
          errors.push({
            field: `${path}.${field}`,
            message: `Required field "${field}" is missing`,
          });
        }
      }
    }

    // Properties
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          validateValue(obj[key], propSchema, `${path}.${key}`, errors);
        }
      }
    }
  }

  // Array checks
  if (schema.type === 'array' && Array.isArray(value)) {
    if (schema.items) {
      (value as unknown[]).forEach((item, i) => {
        validateValue(item, schema.items!, `${path}[${i}]`, errors);
      });
    }
  }
}

function getType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
