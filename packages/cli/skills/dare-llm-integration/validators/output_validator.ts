/**
 * dare-llm-integration — OutputValidator
 * Validates LLM output against a JSON Schema.
 * Zero external dependencies — uses a minimal built-in schema checker.
 * License: MIT
 */

import type { OutputValidationResult, OutputValidationError } from '../types.js';

type JsonSchemaType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'integer';

export interface JsonSchema {
  type?: JsonSchemaType | JsonSchemaType[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
  format?: string;
  additionalProperties?: boolean | JsonSchema;
  [key: string]: unknown;
}

export class OutputValidator {
  /**
   * Parse the output string as JSON, then validate against schema.
   *
   * @param output - Raw string output from LLM
   * @param schema - JSON Schema object to validate against
   */
  validate(output: string, schema: JsonSchema): OutputValidationResult {
    // Step 1: Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch {
      return {
        ok: false,
        errors: [
          {
            field: '$root',
            message: `Output is not valid JSON: ${output.slice(0, 100)}`,
          },
        ],
      };
    }

    // Step 2: Validate against schema
    const errors: OutputValidationError[] = [];
    validateValue(parsed, schema, '$', errors);

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    return { ok: true, data: parsed, errors: [] };
  }

  /**
   * Validate a pre-parsed value (skip JSON.parse step).
   */
  validateParsed(value: unknown, schema: JsonSchema): OutputValidationResult {
    const errors: OutputValidationError[] = [];
    validateValue(value, schema, '$', errors);

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    return { ok: true, data: value, errors: [] };
  }
}

function validateValue(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: OutputValidationError[]
): void {
  // Type check
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = getJsonType(value);
    const matches = types.some((t) => {
      if (t === 'integer') return Number.isInteger(value);
      return t === actualType;
    });
    if (!matches) {
      errors.push({
        field: path,
        message: `Expected type ${types.join('|')}, got ${actualType}`,
        value,
      });
      return; // No point checking further if wrong type
    }
  }

  // Object-specific checks
  if (schema.type === 'object' || (schema.properties !== undefined && typeof value === 'object' && value !== null && !Array.isArray(value))) {
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

  // Array-specific checks
  if (schema.type === 'array' || (schema.items !== undefined && Array.isArray(value))) {
    const arr = value as unknown[];
    if (schema.items) {
      arr.forEach((item, idx) => {
        validateValue(item, schema.items!, `${path}[${idx}]`, errors);
      });
    }
  }

  // String constraints
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({
        field: path,
        message: `String length ${value.length} is less than minLength ${schema.minLength}`,
        value,
      });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({
        field: path,
        message: `String length ${value.length} exceeds maxLength ${schema.maxLength}`,
        value,
      });
    }
  }

  // Number constraints
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({
        field: path,
        message: `Value ${value} is less than minimum ${schema.minimum}`,
        value,
      });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({
        field: path,
        message: `Value ${value} exceeds maximum ${schema.maximum}`,
        value,
      });
    }
  }

  // Enum check
  if (schema.enum !== undefined) {
    const enumValues = schema.enum;
    const found = enumValues.some((e) => deepEqual(e, value));
    if (!found) {
      errors.push({
        field: path,
        message: `Value not in enum: ${JSON.stringify(enumValues)}`,
        value,
      });
    }
  }
}

function getJsonType(value: unknown): JsonSchemaType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value as JsonSchemaType;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object' && a !== null && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}
