/**
 * dare-layered-design — LayeredDesignGenerator
 * Scaffolds the 5-layer directory structure for a DARE project.
 * License: MIT
 */

import fs from 'fs';
import path from 'path';
import { Language, ScaffoldOptions, ScaffoldResult } from './types.js';

/** Per-language configuration for directory and file naming */
interface LayerConfig {
  dirName: string;
  description: string;
  exampleFile?: (entityName: string, ext: string) => { name: string; content: string };
}

const LAYERS: LayerConfig[] = [
  {
    dirName: 'handlers',
    description: 'HTTP/gRPC entry points — receives requests, validates input, calls services',
    exampleFile: (entity, ext) => ({
      name: `${toSnakeCase(entity)}_handler${ext}`,
      content: generateHandlerExample(entity, ext),
    }),
  },
  {
    dirName: 'services',
    description: 'Business logic — one operation per service class, no HTTP or DB concerns',
    exampleFile: (entity, ext) => ({
      name: `create_${toSnakeCase(entity)}_service${ext}`,
      content: generateServiceExample(entity, ext),
    }),
  },
  {
    dirName: 'repositories',
    description: 'Data access — abstractions over DB/cache/external APIs',
    exampleFile: (entity, ext) => ({
      name: `${toSnakeCase(entity)}_repository${ext}`,
      content: generateRepositoryExample(entity, ext),
    }),
  },
  {
    dirName: 'models',
    description: 'Domain objects — entities and value objects, no HTTP or DB concerns',
    exampleFile: (entity, ext) => ({
      name: `${toSnakeCase(entity)}${ext}`,
      content: generateModelExample(entity, ext),
    }),
  },
  {
    dirName: 'presenters',
    description: 'Serializers — converts Models to JSON/XML/DTO for responses',
    exampleFile: (entity, ext) => ({
      name: `${toSnakeCase(entity)}_presenter${ext}`,
      content: generatePresenterExample(entity, ext),
    }),
  },
];

export class LayeredDesignGenerator {
  /**
   * Scaffolds the layered directory structure inside the given project path.
   *
   * Creates:
   *  - {srcDir}/handlers/
   *  - {srcDir}/services/
   *  - {srcDir}/repositories/
   *  - {srcDir}/models/
   *  - {srcDir}/presenters/
   *
   * Each directory gets a README.md describing its contract, plus either
   * a .gitkeep (default) or example files (if withExamples: true).
   *
   * @param projectPath - Absolute path to the project root.
   * @param options - Scaffold options.
   * @returns ScaffoldResult with lists of created dirs and files.
   */
  scaffold(projectPath: string, options: ScaffoldOptions = {}): ScaffoldResult {
    const {
      srcDir = 'src',
      language = 'typescript',
      withExamples = false,
      exampleEntity = 'example',
    } = options;

    const ext = languageToExtension(language);
    const rootDir = path.join(projectPath, srcDir);

    const createdDirs: string[] = [];
    const createdFiles: string[] = [];

    // Ensure src dir exists
    if (!fs.existsSync(rootDir)) {
      fs.mkdirSync(rootDir, { recursive: true });
      createdDirs.push(rootDir);
    }

    for (const layer of LAYERS) {
      const layerDir = path.join(rootDir, layer.dirName);

      // Create directory
      if (!fs.existsSync(layerDir)) {
        fs.mkdirSync(layerDir, { recursive: true });
        createdDirs.push(layerDir);
      }

      // Create README.md with layer contract
      const readmePath = path.join(layerDir, 'README.md');
      if (!fs.existsSync(readmePath)) {
        fs.writeFileSync(readmePath, generateLayerReadme(layer.dirName, layer.description, language), 'utf-8');
        createdFiles.push(readmePath);
      }

      if (withExamples && layer.exampleFile) {
        // Create example file
        const { name, content } = layer.exampleFile(exampleEntity, ext);
        const examplePath = path.join(layerDir, name);
        if (!fs.existsSync(examplePath)) {
          fs.writeFileSync(examplePath, content, 'utf-8');
          createdFiles.push(examplePath);
        }
      } else {
        // Create .gitkeep so the directory is tracked by git
        const gitkeepPath = path.join(layerDir, '.gitkeep');
        if (!fs.existsSync(gitkeepPath) && !hasNonReadmeFiles(layerDir)) {
          fs.writeFileSync(gitkeepPath, '', 'utf-8');
          createdFiles.push(gitkeepPath);
        }
      }
    }

    // Create a top-level ARCHITECTURE.md in srcDir
    const archPath = path.join(rootDir, 'ARCHITECTURE.md');
    if (!fs.existsSync(archPath)) {
      fs.writeFileSync(archPath, generateArchitectureDoc(srcDir, language), 'utf-8');
      createdFiles.push(archPath);
    }

    return { createdDirs, createdFiles };
  }
}

// ── Layer README generator ──────────────────────────────────────────────────

function generateLayerReadme(dirName: string, description: string, _language: Language): string {
  const rules = LAYER_RULES[dirName] ?? [];
  const rulesText = rules.map((r) => `- ${r}`).join('\n');

  return `# ${capitalize(dirName)}

${description}

## Rules

${rulesText}

## Dependency Rule

\`\`\`
Handler → Service → Repository → Model
\`\`\`

This layer is: **${dirName.toUpperCase()}**

${LAYER_DEPENDENCY_TEXT[dirName] ?? ''}

---
*Generated by dare-layered-design v1.0.0 — DARE Method*
`;
}

const LAYER_RULES: Record<string, string[]> = {
  handlers: [
    'May call Services only — never call Repositories or Models directly',
    'Validate HTTP input (types, required fields, format) — do NOT validate business rules',
    'Return HTTP responses (status codes, headers) — the only layer that knows about HTTP',
    'Authenticate and authorize via middleware — do NOT inline auth logic',
    'Receive services via dependency injection — do NOT instantiate with new Service()',
  ],
  services: [
    'May call Repositories only — never call Handlers or HTTP concerns',
    'One class/module = one business operation (CreateUser, not UserService with 10 methods)',
    'Receive repositories via dependency injection — do NOT instantiate with new Repository()',
    'Return domain Models — do NOT return HTTP-specific DTOs',
    'No knowledge of HTTP status codes, headers, or request/response objects',
  ],
  repositories: [
    'May call Models only — no awareness of Handlers or Services above',
    'Abstract over storage: define an interface/trait, provide multiple implementations',
    'Never throw HTTP-specific exceptions (no 404 exceptions — return null or custom errors)',
    'Parameterized queries only — never raw string concatenation in SQL',
    'InMemory implementation required for unit tests (no real DB in unit tests)',
  ],
  models: [
    'Pure domain objects — no HTTP imports, no database imports, no framework imports',
    'Business rules that belong to the entity only (e.g., User#full_name)',
    'No side effects (no email sending, no DB writes) — leave those to Services',
    'Immutable preferred — use value objects for IDs, money, dates',
    'Serializers/Presenters are separate — Model does not know JSON format',
  ],
  presenters: [
    'Converts Models to serializable format (JSON, XML, CSV, gRPC message)',
    'No business logic — only formatting and field mapping',
    'May be called from Handlers only — not from Services or Repositories',
    'One presenter per output format (UserJSONPresenter, UserCSVPresenter)',
    'Handle date formatting, currency formatting, field renaming',
  ],
};

const LAYER_DEPENDENCY_TEXT: Record<string, string> = {
  handlers: 'Can call: **Services** only\nCannot call: Repositories, Models directly',
  services: 'Can call: **Repositories**\nCannot call: Handlers, HTTP concerns',
  repositories: 'Can call: **Models**\nCannot call: Services, Handlers',
  models: 'Can call: nothing external\nCannot call: any other layer',
  presenters: 'Can call: **Models** (read-only)\nCannot call: Services, Repositories',
};

// ── Architecture doc ─────────────────────────────────────────────────────────

function generateArchitectureDoc(srcDir: string, _language: Language): string {
  return `# Architecture — Layered Design

This project follows the **DARE Layered Design** pattern.

## Dependency Rule

\`\`\`
Handler → Service → Repository → Model
         ↑                       ↑
         └── Presenter ──────────┘
\`\`\`

Dependencies flow **downward only**. Upper layers call lower layers; lower layers never call up.

## Layer Responsibilities

| Layer | Directory | Responsibility |
|-------|-----------|----------------|
| Handlers | \`${srcDir}/handlers/\` | HTTP entry points; input validation; auth |
| Services | \`${srcDir}/services/\` | Business logic; one operation per class |
| Repositories | \`${srcDir}/repositories/\` | Data access; abstract over DB/cache |
| Models | \`${srcDir}/models/\` | Domain objects; no HTTP or DB concerns |
| Presenters | \`${srcDir}/presenters/\` | Serializers; Model → JSON/XML/DTO |

## Rules

1. **Handlers** never call Repositories directly — always through Services
2. **Services** never know about HTTP (status codes, request objects)
3. **Repositories** never throw HTTP-specific exceptions
4. **Models** are pure domain objects — no framework imports
5. **Dependency Injection** is used at every layer boundary

## CI Validation

Run \`dare metrics collect\` to check M-02 (0% Handler→Repository violations).

---
*Generated by dare-layered-design v1.0.0 — DARE Method*
`;
}

// ── Example file generators ──────────────────────────────────────────────────

function generateHandlerExample(entity: string, ext: string): string {
  const Name = capitalize(toCamelCase(entity));
  const snake = toSnakeCase(entity);

  if (ext === '.ts') {
    return `/**
 * ${Name}Handler — HTTP handler for ${entity} resource
 * Responsibility: receive requests, validate input, call service, return response
 *
 * RULE: Never call ${Name}Repository directly — always through ${Name}Service
 */
import { Request, Response } from 'express';

// Services injected — never instantiated here
interface ${Name}HandlerDeps {
  create${Name}Service: Create${Name}Service;
}

interface Create${Name}Service {
  execute(input: Create${Name}Input): Promise<${Name}>;
}

interface Create${Name}Input {
  name: string;
  email: string;
}

interface ${Name} {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export class ${Name}Handler {
  constructor(private readonly deps: ${Name}HandlerDeps) {}

  async create(req: Request, res: Response): Promise<void> {
    // Input validation (HTTP layer responsibility)
    const { name, email } = req.body as Record<string, string>;
    if (!name || !email) {
      res.status(422).json({
        type: '/errors/validation',
        title: 'Validation error',
        status: 422,
        detail: 'name and email are required',
      });
      return;
    }

    // Delegate to service (business logic)
    const result = await this.deps.create${Name}Service.execute({ name, email });

    // Return response (HTTP layer responsibility)
    res.status(201).json(result);
  }
}
`;
  }

  if (ext === '.rb') {
    return `# ${Name}Controller — HTTP controller for ${snake} resource
# Responsibility: receive requests, validate input, call service, return response
#
# RULE: Never call ${Name}Repository directly — always through ${Name}Service
class ${Name}Controller < ApplicationController
  # Services injected via constructor — never instantiated here
  def initialize(create_${snake}_service:)
    @create_${snake}_service = create_${snake}_service
  end

  def create
    result = @create_${snake}_service.call(
      name: params.require(:name),
      email: params.require(:email)
    )
    render json: result, status: :created
  rescue ActionController::ParameterMissing => e
    render json: { error: e.message }, status: :unprocessable_entity
  end
end
`;
  }

  return `# ${Name} handler — see README.md for rules\n# Language: ${ext}\n`;
}

function generateServiceExample(entity: string, ext: string): string {
  const Name = capitalize(toCamelCase(entity));
  const snake = toSnakeCase(entity);

  if (ext === '.ts') {
    return `/**
 * Create${Name}Service — creates a new ${entity}
 * Responsibility: business logic for ${entity} creation
 *
 * RULES:
 * - No HTTP imports (no Request, Response, status codes)
 * - Receive ${Name}Repository via dependency injection
 * - Return ${Name} domain model — not HTTP DTO
 */

export interface ${Name}Repository {
  findByEmail(email: string): Promise<${Name} | null>;
  save(${snake}: ${Name}): Promise<${Name}>;
}

export interface ${Name} {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface Create${Name}Input {
  name: string;
  email: string;
}

export class Create${Name}Service {
  constructor(private readonly ${snake}Repository: ${Name}Repository) {}

  async execute(input: Create${Name}Input): Promise<${Name}> {
    // Business rule validation (not HTTP validation)
    if (!input.email.includes('@')) {
      throw new Error('Invalid email format');
    }

    // Check uniqueness (business rule)
    const existing = await this.${snake}Repository.findByEmail(input.email);
    if (existing) {
      throw new Error('${Name} with this email already exists');
    }

    // Create and save domain object
    const ${snake}: ${Name} = {
      id: crypto.randomUUID(),
      name: input.name,
      email: input.email,
      createdAt: new Date(),
    };

    return this.${snake}Repository.save(${snake});
  }
}
`;
  }

  if (ext === '.rb') {
    return `# Create${Name}Service — creates a new ${snake}
# Responsibility: business logic for ${snake} creation
#
# RULES:
# - No HTTP concerns (no status codes, request objects)
# - Receive ${Name}Repository via constructor injection
class Create${Name}Service
  def initialize(${snake}_repository:)
    @${snake}_repository = ${snake}_repository
  end

  def call(name:, email:)
    raise ArgumentError, "Invalid email" unless email.include?("@")
    raise "${Name}AlreadyExists" if @${snake}_repository.find_by_email(email)

    @${snake}_repository.save(
      id: SecureRandom.uuid,
      name: name,
      email: email,
      created_at: Time.now
    )
  end
end
`;
  }

  return `# Create${Name} service — see README.md for rules\n# Language: ${ext}\n`;
}

function generateRepositoryExample(entity: string, ext: string): string {
  const Name = capitalize(toCamelCase(entity));
  const snake = toSnakeCase(entity);

  if (ext === '.ts') {
    return `/**
 * ${Name}Repository — interface and implementations for ${entity} data access
 * Responsibility: abstract over storage; multiple implementations
 *
 * RULES:
 * - Never throw HTTP-specific exceptions (no 404 — return null)
 * - Parameterized queries only (no raw string SQL concatenation)
 * - InMemory implementation for unit tests
 */

export interface ${Name} {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

// Repository interface (contract)
export interface ${Name}Repository {
  findById(id: string): Promise<${Name} | null>;
  findByEmail(email: string): Promise<${Name} | null>;
  save(${snake}: ${Name}): Promise<${Name}>;
  delete(id: string): Promise<void>;
}

// In-memory implementation (for unit tests)
export class InMemory${Name}Repository implements ${Name}Repository {
  private readonly store = new Map<string, ${Name}>();

  async findById(id: string): Promise<${Name} | null> {
    return this.store.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<${Name} | null> {
    for (const ${snake} of this.store.values()) {
      if (${snake}.email === email) return ${snake};
    }
    return null;
  }

  async save(${snake}: ${Name}): Promise<${Name}> {
    this.store.set(${snake}.id, ${snake});
    return ${snake};
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

// Database implementation stub
export class Postgres${Name}Repository implements ${Name}Repository {
  // TODO: inject db client via constructor
  async findById(_id: string): Promise<${Name} | null> {
    throw new Error('Not implemented — add your DB client');
  }

  async findByEmail(_email: string): Promise<${Name} | null> {
    throw new Error('Not implemented — add your DB client');
  }

  async save(_${snake}: ${Name}): Promise<${Name}> {
    throw new Error('Not implemented — add your DB client');
  }

  async delete(_id: string): Promise<void> {
    throw new Error('Not implemented — add your DB client');
  }
}
`;
  }

  if (ext === '.rb') {
    return `# ${Name}Repository — interface and implementations for ${snake} data access
# RULES:
# - Never raise HTTP-specific errors (no Not Found with status code)
# - Return nil for missing records, not exceptions
module ${Name}Repository
  def find_by_id(id)
    raise NotImplementedError
  end

  def find_by_email(email)
    raise NotImplementedError
  end

  def save(${snake})
    raise NotImplementedError
  end
end

# In-memory implementation (for unit tests)
class InMemory${Name}Repository
  include ${Name}Repository

  def initialize
    @store = {}
  end

  def find_by_id(id)
    @store[id]
  end

  def find_by_email(email)
    @store.values.find { |u| u[:email] == email }
  end

  def save(${snake})
    @store[${snake}[:id]] = ${snake}
  end
end
`;
  }

  return `# ${Name}Repository — see README.md for rules\n# Language: ${ext}\n`;
}

function generateModelExample(entity: string, ext: string): string {
  const Name = capitalize(toCamelCase(entity));

  if (ext === '.ts') {
    return `/**
 * ${Name} — domain model
 * Responsibility: represent the ${entity} entity with its business rules
 *
 * RULES:
 * - No HTTP imports (no Request, Response)
 * - No database imports (no ORM, no query builders)
 * - No framework imports
 * - Pure TypeScript data structure + business methods
 */

export interface ${Name} {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly createdAt: Date;
}

// Factory function for creating new instances
export function create${Name}(params: Omit<${Name}, 'createdAt'>): ${Name} {
  if (!params.email.includes('@')) {
    throw new Error('${Name}: invalid email format');
  }
  if (!params.name.trim()) {
    throw new Error('${Name}: name cannot be empty');
  }
  return {
    ...params,
    createdAt: new Date(),
  };
}

// Business rule: computed property
export function ${toCamelCase(entity)}DisplayName(${toCamelCase(entity)}: ${Name}): string {
  return \`\${${toCamelCase(entity)}.name} <\${${toCamelCase(entity)}.email}>\`;
}
`;
  }

  if (ext === '.rb') {
    return `# ${Name} — domain model
# RULES:
# - No ActiveRecord concerns — pure Ruby
# - No HTTP imports
# - Business rules only (not validation framework)
${Name} = Struct.new(:id, :name, :email, :created_at, keyword_init: true) do
  def display_name
    "\#{name} <\#{email}>"
  end

  def valid_email?
    email.include?("@")
  end
end
`;
  }

  return `# ${Name} model — see README.md for rules\n# Language: ${ext}\n`;
}

function generatePresenterExample(entity: string, ext: string): string {
  const Name = capitalize(toCamelCase(entity));
  const snake = toSnakeCase(entity);

  if (ext === '.ts') {
    return `/**
 * ${Name}Presenter — serializes ${Name} domain model to JSON
 * Responsibility: convert ${entity} to response format (no business logic)
 *
 * RULES:
 * - No business logic — only formatting and field mapping
 * - Called from Handlers only (not Services, not Repositories)
 */

export interface ${Name} {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface ${Name}JSON {
  id: string;
  name: string;
  email: string;
  created_at: string; // ISO 8601
}

export class ${Name}Presenter {
  static toJSON(${snake}: ${Name}): ${Name}JSON {
    return {
      id: ${snake}.id,
      name: ${snake}.name,
      email: ${snake}.email,
      created_at: ${snake}.createdAt.toISOString(),
    };
  }

  static toJSONList(${snake}s: ${Name}[]): ${Name}JSON[] {
    return ${snake}s.map((u) => this.toJSON(u));
  }
}
`;
  }

  if (ext === '.rb') {
    return `# ${Name}Presenter — serializes ${snake} domain model to JSON
# RULES:
# - No business logic — only formatting
# - Called from controllers/handlers only
class ${Name}Presenter
  def initialize(${snake})
    @${snake} = ${snake}
  end

  def as_json(*)
    {
      id: @${snake}.id,
      name: @${snake}.name,
      email: @${snake}.email,
      created_at: @${snake}.created_at.iso8601
    }
  end
end
`;
  }

  return `# ${Name}Presenter — see README.md for rules\n# Language: ${ext}\n`;
}

// ── String utilities ─────────────────────────────────────────────────────────

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (c: string) => c.toLowerCase());
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .replace(/[-\s]+/g, '_')
    .toLowerCase()
    .replace(/^_/, '');
}

function languageToExtension(language: Language): string {
  const map: Record<Language, string> = {
    typescript: '.ts',
    javascript: '.js',
    ruby: '.rb',
    rust: '.rs',
    python: '.py',
    go: '.go',
    php: '.php',
    unknown: '.ts',
  };
  return map[language] ?? '.ts';
}

function hasNonReadmeFiles(dir: string): boolean {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.some((e) => e.isFile() && e.name !== 'README.md');
  } catch {
    return false;
  }
}
