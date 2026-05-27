# DARE IDE Integration Analysis & VSCode Extension Strategy

> **Date:** 2026-05-14  
> **Status:** Research Complete  
> **Author:** Wanderson Leandro (Dewtech Technologies)

---

## Executive Summary

DARE is currently integrated into **3 IDE ecosystems**:
1. **Cursor** — Conversational agent with `.cursorrules` + commands
2. **Antigravity** — Autonomous agent with Planning Mode + skills
3. **Claude Code** — Conversational with MCP server context

**Finding:** All three share the same **architecture pattern**: Skills/Commands read DARE artifacts, invoke CLI when needed, orchestrate via DAG.

**Opportunity:** VSCode can follow the same pattern via:
- **Option A (Recommended):** Native extension (TypeScript) + standalone MCP server
- **Option B (Simple):** CLI wrapper + command palette
- **Option C (Advanced):** Full IDE integration plugin

---

## 1. Current Integration Patterns

### Pattern Overview

```
┌─────────────────────────────────────────────┐
│           IDE (Cursor/Antigravity/Claude)   │
├─────────────────────────────────────────────┤
│  Skills/Commands (.cursorrules, SKILL.md,   │
│  .claude/commands/*.md)                     │
├─────────────────────────────────────────────┤
│  Invokes: dare init, dare blueprint,        │
│  dare execute --next, etc.                  │
├─────────────────────────────────────────────┤
│           DARE CLI (packages/cli)            │
├─────────────────────────────────────────────┤
│  State Management:                          │
│  - DARE/dare-dag.yaml (source of truth)     │
│  - DARE/.canvas.md (live status)            │
│  - SQLite/JSON knowledge graph              │
├─────────────────────────────────────────────┤
│           Agent/Assistant Execution         │
│  (Builds, tests, lints, creates files)      │
└─────────────────────────────────────────────┘
```

### Cursor Integration

**Files:**
- `.cursorrules` — Global methodology rules
- `.cursor/commands/*.md` — Slash commands
- `.cursor/rules/*.mdc` — Stack-specific rules

**How It Works:**
```
User: "Let me design this feature"
       ↓
Agent reads .cursorrules + methodology
       ↓
User: "/generate-design"
       ↓
Agent executes steps from .cursor/commands/generate-design.md
       ↓
Agent calls: dare design "feature description"
       ↓
Artifact created: DARE/DESIGN.md
       ↓
Agent reads artifact, continues orchestration
```

**Strengths:**
- ✅ Simple markdown files
- ✅ No authentication needed (Cursor has API access)
- ✅ Conversational (user guides agent)
- ✅ Stack-specific rules built-in

**Limitations:**
- ❌ No parallelism (sequential execution)
- ❌ Commands are static markdown (hard to extend)
- ❌ No built-in DAG visualization

---

### Antigravity Integration

**Files:**
- `.agents/skills/<skill>/*.md` — Rich skill folders
- YAML frontmatter in each SKILL.md (auto-discovery)

**How It Works:**
```
User: "Implement the feature design from DESIGN.md"
       ↓
Agent activates Planning Mode
       ↓
Agent loads skills via YAML frontmatter matching
       ↓
Agent autonomously:
  1. Calls dare-blueprint skill → DARE/BLUEPRINT.md + dare-dag.yaml
  2. Creates Task Groups from DAG
  3. Executes tasks in parallel (respecting dependencies)
  4. Each task: dare execute --next → agent implements → dare execute --complete
       ↓
Final: Fully implemented feature with test coverage
```

**Strengths:**
- ✅ Autonomous execution (Planning Mode)
- ✅ Parallel task execution
- ✅ Rich skill folders with examples
- ✅ No user micromanagement needed
- ✅ Description-based auto-discovery

**Limitations:**
- ❌ Agent cost is high (autonomous execution)
- ❌ Only available in Antigravity IDE
- ❌ Complex to set up/debug

---

### Claude Code Integration

**Files:**
- `CLAUDE.md` — Methodology + Ralph Loop gates per stack
- `.claude/commands/*.md` — Slash commands
- `.claude/settings.example.json` — Permissions + hooks

**How It Works:**
```
User: "Implement task-001"
       ↓
User: "/dare-execute task-001"
       ↓
Agent reads .claude/commands/dare-execute.md
       ↓
Agent:
  1. Reads DARE/EXECUTION/task-001.md (spec)
  2. Reads CLAUDE.md for stack-specific Ralph Loop gates
  3. Implements code
  4. Runs Ralph Loop: build → test → lint → audit
  5. On success: calls dare execute --complete task-001 --output "..."
       ↓
CLI updates state, knowledge graph, canvas
```

**Strengths:**
- ✅ MCP server for 95% token savings
- ✅ Conversational (user in control)
- ✅ Clear Ralph Loop gates per stack
- ✅ Knowledge graph reduces context size
- ✅ Works with Claude API

**Limitations:**
- ❌ Manual orchestration (user must request tasks)
- ❌ No parallelism
- ❌ Requires Claude API access

---

## 2. Comparison Table

| Aspect | Cursor | Antigravity | Claude Code | VSCode (Proposed) |
|--------|--------|-------------|-------------|---|
| **UI Model** | Conversational | Autonomous Planning | Conversational | Conversational + Commands |
| **Skill Format** | `.mdc` files | Skill folders | `.md` files | TypeScript (native) |
| **Parallelism** | ❌ Sequential | ✅ Task Groups | ❌ Sequential | ✅ DAG-aware |
| **Context Efficiency** | 📊 Baseline | 📊 Medium | ✅ MCP (95% savings) | ✅ MCP (95% savings) |
| **Cost** | Low | High (autonomous) | Medium | Low (local) |
| **Ralph Loop** | Inline checks | Stack-aware gates | Explicit gates | Configurable |
| **DAG Visualization** | Mermaid via CLI | Planning Mode UI | Text table | Interactive panel |
| **Knowledge Graph** | Not used | Not used | SQLite/Neo4j | SQLite/Neo4j |
| **Best For** | Quick iterations | Large features | Team workflows | Local-first devs |

---

## 3. VSCode Extension Strategy

### Option A: Native Extension + Standalone MCP Server (Recommended)

**Architecture:**
```
┌──────────────────────────────────────────────┐
│         VSCode IDE                           │
├──────────────────────────────────────────────┤
│  DARE VSCode Extension (TypeScript)          │
│  ├─ Activity Bar Panel                       │
│  ├─ Command Palette (dare/*)                 │
│  ├─ DAG Visualizer (Webview)                 │
│  ├─ Task Status Monitor (Statusbar)          │
│  └─ Output Channel (logs)                    │
├──────────────────────────────────────────────┤
│  Local MCP Server (optional, for large projects)
│  ├─ /context/query (knowledge graph)         │
│  └─ /blueprint, /dag, /task-status           │
├──────────────────────────────────────────────┤
│         DARE CLI (local)                     │
├──────────────────────────────────────────────┤
│  State: DARE/dare-dag.yaml, knowledge graph  │
└──────────────────────────────────────────────┘
```

**Features:**
1. **Activity Bar Panel** (`DARE Explorer`)
   - Project structure (DESIGN.md, BLUEPRINT.md, dag visualization)
   - Task list with status (PENDING, RUNNING, DONE, FAILED)
   - Quick actions (Run next, Complete task, Retry failed)

2. **Command Palette Commands**
   - `DARE: Design` → Create DARE/DESIGN.md
   - `DARE: Blueprint` → Generate DARE/BLUEPRINT.md + DAG
   - `DARE: Execute Next` → Show next executable tasks
   - `DARE: Complete Task` → Mark task done + Ralph Loop
   - `DARE: View DAG` → Interactive DAG visualization
   - `DARE: Project Info` → Diagnostics

3. **DAG Visualizer (Webview)**
   - Interactive task graph
   - Color-coded by status (PENDING, RUNNING, DONE, FAILED)
   - Click to execute task
   - Dependency arrows with labels

4. **Integrated Terminal**
   - Runs `dare` CLI commands
   - Auto-refreshes on completion
   - Error logging to output channel

5. **Ralph Loop Gates (Configuration)**
   - Read from `DARE/ralph-loop.json` or auto-detect from CLAUDE.md
   - Show gates in task execution flow
   - Highlight failures with quick-fix suggestions

**Implementation Stack:**
- **Language:** TypeScript
- **Bundler:** esbuild (vscode-sample template)
- **Dependencies:** 
  - `vscode` API (native)
  - `dare-cli` (local binary or npm module)
  - `graphviz-js` (DAG visualization)
  - `yaml` (parse dare-dag.yaml)

**Estimated Effort:**
- Phase 1 (Basic): 40 hours (command palette, task list, CLI wrapper)
- Phase 2 (UI): 30 hours (DAG visualizer, activity panel)
- Phase 3 (MCP): 20 hours (knowledge graph integration)
- **Total: ~90 hours (~2 weeks)**

---

### Option B: Simple CLI Wrapper (Quick Start)

**What It Is:**
- Wrapper around `dare` CLI
- Command palette commands that invoke CLI
- No UI, minimal overhead

**Advantages:**
- ✅ Fast to build (10-15 hours)
- ✅ Minimal dependencies
- ✅ Can be extended later

**Disadvantages:**
- ❌ No visual feedback
- ❌ No DAG visualization
- ❌ Terminal-dependent

**Files:**
```
vscode-dare/
├── src/
│   ├── extension.ts          ← register commands
│   ├── cli-wrapper.ts        ← invoke dare CLI
│   └── commands/
│       ├── design.ts
│       ├── blueprint.ts
│       ├── execute.ts
│       └── ...
├── package.json              ← extension manifest
└── README.md
```

---

### Option C: Advanced IDE Integration (Future)

**Future Enhancements:**
- Code lens annotations (task completion status)
- Inline code snippets for task specs
- Debugging integration (Ralph Loop failures)
- Git integration (auto-commit DARE artifacts)
- Multi-workspace support

---

## 4. Implementation Roadmap

### Phase 1: MVP (Week 1-2)

**Goals:**
- Basic command palette integration
- List tasks from `dare-dag.yaml`
- Execute tasks (invoke `dare execute --next`)
- Show output in terminal

**Deliverables:**
- `vscode-dare` extension package
- Commands: `dare.design`, `dare.blueprint`, `dare.executeNext`, `dare.status`
- README with setup instructions

**Time:** 40 hours

---

### Phase 2: UI & Visualization (Week 3-4)

**Goals:**
- Activity bar panel (DARE Explorer)
- DAG interactive visualization
- Task status monitor
- Color-coded task list

**Deliverables:**
- Webview-based DAG viewer
- Activity panel with tree control
- Status bar item showing DAG progress

**Time:** 30 hours

---

### Phase 3: MCP Server & Knowledge Graph (Week 5-6)

**Goals:**
- Optional local MCP server
- Knowledge graph integration
- 95% token savings for LLM queries
- Architecture assistant

**Deliverables:**
- `dare-mcp-vscode` companion server
- Integration with Claude Code extension
- Context reduction via queries

**Time:** 20 hours

---

## 5. Technical Specifications

### Command Palette

```typescript
// Commands exposed
DARE: Design → dare design "<description>"
DARE: Blueprint → dare blueprint
DARE: Execute Next → Show tasks, user picks
DARE: Complete Task → dare execute --complete <id> --output "..."
DARE: Reset Task → dare execute --reset <id>
DARE: Project Status → dare execute --status
DARE: View DAG → Open DAG webview
DARE: Validate DAG → dare validate
DARE: Project Info → dare info
```

### Activity Panel Structure

```
DARE Explorer
├─ 📄 Design
│  └─ DARE/DESIGN.md (read-only link)
├─ 📋 Blueprint
│  ├─ DARE/BLUEPRINT.md
│  ├─ DARE/dare-dag.yaml
│  └─ Tasks (6)
│     ├─ [DONE] task-001: Setup database
│     ├─ [DONE] task-002: Create API
│     ├─ [RUNNING] task-003: Implement auth
│     ├─ [PENDING] task-004: Add UI
│     ├─ [PENDING] task-005: Tests
│     └─ [FAILED] task-006: Deploy (1 retry)
├─ 📊 DAG
│  └─ [Interactive Visualization]
└─ ⚙️ Settings
   ├─ Ralph Loop Gates (per stack)
   ├─ Knowledge Graph (SQLite/Neo4j)
   └─ MCP Server (enabled/disabled)
```

### DAG Visualization (Webview)

```
┌─────────────────────────────────────────┐
│  DARE DAG Visualization                 │
├─────────────────────────────────────────┤
│                                         │
│  Rank 1:  [Setup DB]──┐                │
│             (DONE)    │                │
│                       ├──→[Create API] │
│                       │     (DONE)     │
│           ┌───────────┤                │
│           │           │                │
│  Rank 2:  ↓           ↓                │
│       [Impl Auth]  [Add UI]             │
│        (RUNNING)   (PENDING)           │
│           │           │                │
│           └─→[Tests]←─┘                │
│              (PENDING)                 │
│                │                       │
│                ↓                       │
│           [Deploy]                     │
│           (FAILED)                     │
│                                         │
│  Legend: ●PENDING ●RUNNING ●DONE ●FAILED│
│  Zoom: Ctrl+ Ctrl- | Pan: Drag          │
│                                         │
└─────────────────────────────────────────┘
```

---

## 6. Integration with Claude Code

**Current Status:** Claude Code has its own implementation.

**VSCode Extension Can:**
1. **Share MCP Server** — Both Claude Code + VSCode extension query same knowledge graph
2. **Sync State** — `DARE/dare-dag.yaml` is source of truth for both
3. **Complement** — VSCode for local development, Claude for large refactors

**No Conflicts:**
- Both read from `DARE/` files
- Both invoke `dare` CLI
- No state conflicts (CLI is single source of truth)

---

## 7. Comparison: When to Use Each

| Use Case | Cursor | Antigravity | Claude Code | VSCode Extension |
|----------|--------|-------------|-------------|---|
| **Quick feature** | ✅ Best | ❌ Overkill | ✅ Good | ✅ Good |
| **Large refactor** | ⚠️ Slow | ✅ Best | ✅ Good | ⚠️ Slow |
| **Local-first dev** | ⚠️ Cloud | ⚠️ Cloud | ✅ Cloud | ✅ Local |
| **Team workflow** | ❌ 1 IDE | ❌ 1 IDE | ✅ Best | ✅ Good |
| **Minimal cost** | ❌ Cursor $$$ | ❌ Antigravity $$$ | ✅ Claude $$$ | ✅ **Free** |
| **Biggest teams** | ⚠️ Limited | ⚠️ Limited | ✅ Scalable | ✅ Scalable |

---

## 8. Risk Analysis

### VSCode Extension Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Fragmentation (multiple IDEs) | Medium | Single `DARE/` format is standard |
| Maintenance burden | Low | DARE CLI handles logic; extension is thin wrapper |
| Market fit (VSCode dominance) | Low | VSCode is #1 IDE, ~80% developer share |
| MCP server complexity | Low | Can be optional (Phase 3) |
| Plugin review delays | Low | Extension can be published to OpenVSX (no review) |

### Opportunity

- **Market:** VSCode is the #1 IDE globally (80% of developers)
- **DARE adoption:** Easy onboarding for VSCode users
- **Competitive:** Cursor/Antigravity require paid accounts; VSCode is free + open

---

## 9. Recommendations

### Short Term (Next 2 weeks)

1. **License: MIT** (D-001 — MIT permanent)
2. **Release v2.16.0** (Excalidraw) — May 26
3. **Plan VSCode Extension** — Option A (MVP + UI phases)
4. **Release v2.17.0, v2.18.0** — Jun 2-15

### Medium Term (June-July)

1. **Develop VSCode Extension Phase 1** (40h) — June
2. **Beta launch on OpenVSX** — Early July
3. **Gather feedback** — July-August
4. **Phase 2 UI improvements** — August

### Long Term (Q3 2026)

1. **Phase 3: MCP Server integration**
2. **Code lens annotations**
3. **Git integration**
4. **Multi-workspace support**

---

## 10. Next Steps

### Decision Points

**Q1: Should we build VSCode extension?**
- ✅ **YES** — Huge market (VSCode dominance), aligns with monetization (Desktop)
- ❌ **NO** — Focus on Ruby on Rails/Flutter features first

**Q2: Which implementation approach?**
- 🟢 **Option A** — Best long-term (interactive DAG, MCP, scalable)
- 🟡 **Option B** — Fast MVP if we want quick wins
- 🔴 **Option C** — Too complex for now

**Q3: Timeline?**
- After v3.0.0 release (mid-June)?
- In parallel with Ruby on Rails/Flutter?
- Post-monetization planning?

---

## 11. Files to Create/Modify

If we proceed with VSCode extension:

```
vscode-dare/                   ← New repo
├── src/
│   ├── extension.ts
│   ├── dare-runner.ts
│   ├── commands/
│   │   ├── design.ts
│   │   ├── blueprint.ts
│   │   ├── executeTask.ts
│   │   └── ...
│   ├── panels/
│   │   ├── dareExplorer.ts
│   │   ├── dagVisualizer.ts
│   │   └── taskMonitor.ts
│   └── mcp/
│       └── client.ts
├── media/                      ← Icons
├── package.json
├── README.md
└── .vscodeignore
```

---

## 12. Questions for Discussion

1. **Priority:** Should VSCode extension be part of v3.0.0 roadmap?
2. **Scope:** Start with Option A (MVP), add UI later?
3. **Team:** Who would lead implementation (estimated 90 hours)?
4. **Timeline:** June-July or post-summer?
5. **Monetization:** How does free VSCode extension fit Open Core model?

---

**End of Analysis**

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-14  
**License:** MIT (D-001)
