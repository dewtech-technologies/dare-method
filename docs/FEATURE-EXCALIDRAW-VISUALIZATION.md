# Feature: Excalidraw Visualization for DARE DAG

> **Status:** Implementation Complete (Ready for v2.16.0)  
> **Date:** 2026-05-14  
> **Author:** Wanderson Leandro (Dewtech Technologies)  
> **License:** MIT (D-001)

---

## Overview

Added native Excalidraw visualization support to DARE CLI for interactive DAG (task graph) visualization.

### What Changed

```bash
# New command
dare dag viz --format excalidraw

# Generates
DARE/dag-graph.excalidraw

# Open in
https://excalidraw.com
```

---

## Implementation Details

### 1. Design Tokens
**File:** `docs/DESIGN-TOKENS-EXCALIDRAW.md`

- Color palette by complexity: LOW (blue) | MEDIUM (orange) | HIGH (pink)
- Color palette by status: PENDING | RUNNING | DONE | FAILED
- Typography, sizing, and layout algorithm
- Attribution and credits to original inspiration

### 2. Skills (3 IDEs)

#### Claude Code
**File:** `implementations/claude/.claude/commands/dare-dag-viz.md`
- Skill definition for `/dare-dag-viz` command
- Step-by-step instructions for agents
- Usage examples

#### Cursor
**File:** `implementations/cursor/.cursorrules` (added section)
- Documentation of `/dare-dag-viz` skill
- Integration with DARE workflow
- Tips for effective use

#### Antigravity
**File:** `implementations/antigravity/.cursor/skills/dare-dag-viz.md`
- Full skill definition
- Schema reference
- Example output

### 3. CLI Implementation

#### Renderer
**File:** `packages/cli/src/utils/excalidraw-renderer.ts` (new)

```typescript
export function renderDagExcalidraw(dag: Dag): ExcalidrawData
export function serializeExcalidraw(data: ExcalidrawData): string
```

Features:
- Converts DARE DAG to Excalidraw JSON
- Color-codes tasks by complexity (with status override)
- Positions tasks in swim lanes by rank
- Creates arrows for dependencies
- Proper handling of DONE/FAILED/RUNNING states

#### Command Integration
**File:** `packages/cli/src/commands/dag.ts` (modified)

Changes:
- Added `excalidraw` to `--format` option
- Added import for `excalidraw-renderer`
- Updated validation to accept `excalidraw`
- Default output: `DARE/dag-graph.excalidraw`
- User-friendly console message with link

### 4. Tests
**File:** `packages/cli/src/utils/excalidraw-renderer.test.ts` (new)

Coverage:
- ✅ Renders DAG to valid Excalidraw JSON
- ✅ Creates rectangle elements with correct dimensions
- ✅ Applies colors by complexity when PENDING
- ✅ Applies colors by status when not PENDING
- ✅ Creates arrows for dependencies
- ✅ Positions tasks correctly by rank
- ✅ Handles parallel tasks (same rank)
- ✅ Serializes to valid JSON

### 5. Example & Documentation
**File:** `packages/cli/templates/DARE-dag-example.yaml` (new)

Complete example with:
- 7 tasks demonstrating ranks and parallelism
- Annotations explaining each field
- Real-world scenario (API authentication)
- Usage instructions

---

## Usage

### Generate Excalidraw Diagram

```bash
dare dag viz --format excalidraw
```

Output:
```
✅ Generated Excalidraw diagram with 6 task(s) and 5 dependency arrow(s) → DARE/dag-graph.excalidraw
   Open in https://excalidraw.com or via File → Open
```

### View in Excalidraw

1. Go to https://excalidraw.com
2. File → Open
3. Select `DARE/dag-graph.excalidraw`
4. Edit interactively if needed
5. Export to PNG/SVG for presentations

### With Agent Skills

```
/dare-dag-viz

or (Cursor)

/dare-dag-viz
```

Agents can:
- Generate initial DAG
- Refine visualization
- Add annotations
- Export for reports

---

## Visual Features

### Task Elements
- **Complexity colors:** LOW (azure) | MEDIUM (orange) | HIGH (pink)
- **Status override:** DONE (green) | RUNNING (blue dashed) | FAILED (red) | PENDING (gray)
- **Size:** 120×60px per task
- **Layout:** Swim lanes by rank (automatic calculation)

### Dependencies
- **Arrows:** Connect task dependencies
- **Style:** Normal or dashed (for RUNNING)
- **Color:** Gray for normal, red for FAILED source

### Swim Lanes
- **Grouping:** Tasks by execution rank
- **Parallelism:** Tasks in same rank run in parallel
- **Spacing:** 140px horizontal, 160px vertical per rank

---

## Architecture

```
DARE DAG (YAML)
    ↓
dag-converter.ts (parses YAML)
    ↓
Dag object {tasks[], title}
    ↓
computeRanks() (calculates swim lane positions)
    ↓
renderDagExcalidraw() (creates visual elements)
    ↓
Excalidraw JSON
    ↓
File: DARE/dag-graph.excalidraw
    ↓
https://excalidraw.com (interactive viewing)
```

---

## Color Reference

### By Complexity (when status is PENDING)

```
LOW:    Background #e3f2fd, Stroke #1976d2 (Blue)
MEDIUM: Background #fff3e0, Stroke #e65100 (Orange)
HIGH:   Background #fce4ec, Stroke #c2185b (Pink)
```

### By Status (overrides complexity)

```
PENDING: Background #f5f5f5, Stroke #999   (Gray)
RUNNING: Background #e3f2fd, Stroke #1976  (Blue, dashed)
DONE:    Background #e8f5e9, Stroke #388e  (Green)
FAILED:  Background #ffebee, Stroke #d32f  (Red)
```

---

## Breaking Changes

None. This is **purely additive**:
- `dare dag viz --format mermaid` — unchanged
- `dare dag viz --format dot` — unchanged
- `dare dag viz --format excalidraw` — NEW

---

## References

### Documentation
- `/docs/DESIGN-TOKENS-EXCALIDRAW.md` — Full design specification
- `/docs/FEATURE-EXCALIDRAW-VISUALIZATION.md` — This file
- `/packages/cli/templates/DARE-dag-example.yaml` — Example DAG

### Skills
- `/implementations/claude/.claude/commands/dare-dag-viz.md`
- `/implementations/cursor/.cursorrules` (search for "dare-dag-viz")
- `/implementations/antigravity/.cursor/skills/dare-dag-viz.md`

### Code
- `/packages/cli/src/utils/excalidraw-renderer.ts` — Renderer
- `/packages/cli/src/commands/dag.ts` — CLI command
- `/packages/cli/src/utils/excalidraw-renderer.test.ts` — Tests

### External
- [Excalidraw App](https://excalidraw.com)
- [Original Inspiration: Cole Medin's Excalidraw Skill](https://github.com/coleam00/excalidraw-diagram-skill)

---

## Roadmap

### v2.16.0 (Current)
- ✅ Design tokens
- ✅ CLI command (`dare dag viz --format excalidraw`)
- ✅ Renderer (TypeScript)
- ✅ Agent skills (Claude Code, Cursor, Antigravity)
- ✅ Tests & documentation

### v2.17.0 (Future)
- Optional: PNG export via Playwright + headless Chromium
- Optional: Interactive refinement skill (agent improves layout)
- Optional: Real-time updates as tasks progress

---

## Testing

Run tests:
```bash
npm test -- excalidraw-renderer.test.ts
```

Expected: All tests pass ✅

Manual testing:
```bash
# Generate diagram
dare dag viz --format excalidraw

# Verify file exists
cat DARE/dag-graph.excalidraw | head -20

# Open in Excalidraw
https://excalidraw.com
# File → Open → DARE/dag-graph.excalidraw
```

---

## Credits & Attribution

**Design & Implementation:**
- Wanderson Leandro (Dewtech Technologies) — adapter and DARE integration

**Inspiration:**
- Cole Medin — [Excalidraw Diagram Skill](https://github.com/coleam00/excalidraw-diagram-skill)
- Excalidraw Team — [Excalidraw](https://excalidraw.com) (MIT license)

**Methodology:**
- Ralph Loop — original term (adapted in DARE)
- DARE Framework — Design → Architect → Review → Execute

---

## License

This feature is part of **DARE CLI** — **MIT** (D-001 — MIT permanent).

You can:
- ✅ Use in your DARE projects
- ✅ Modify for your needs
- ✅ Contribute improvements via PR
- ✅ Distribute and re-license derivatives per MIT terms

---

## Next Steps

1. ✅ Review and test `dare dag viz --format excalidraw`
2. ✅ Test with real projects (load their dare-dag.yaml)
3. ✅ Verify colors/layout match design tokens
4. ✅ Get feedback from users
5. ✅ v3.0.0 released under MIT (D-001)

---

## Version

- **Implemented:** 2026-05-14
- **CLI Version:** v2.16.0
- **Status:** Ready for review & testing

