# Memory System

AI Memory System for consciousness continuity across Claude Code sessions.

## Quick Reference

```bash
bun run dev              # Start server in dev mode (--hot)
bun src/cli/index.ts serve --verbose  # Run CLI directly with logging
bun test                 # Run tests
```

## Package Structure

```
packages/memory/
├── src/
│   ├── cli/              # CLI commands (serve, install, stats, migrate, doctor)
│   ├── core/
│   │   ├── engine.ts     # Main orchestrator (getContext, processMessage)
│   │   ├── curator.ts    # Memory extraction (SDK + CLI modes)
│   │   ├── manager.ts    # Post-curation memory organization agent
│   │   ├── retrieval.ts  # Activation signal algorithm
│   │   ├── store.ts      # fsdb wrapper for persistence
│   │   └── embeddings.ts # Vector embeddings (Xenova/all-MiniLM-L6-v2)
│   ├── server/
│   │   └── index.ts      # HTTP server (Bun.serve)
│   ├── types/
│   │   ├── memory.ts     # TypeScript types (CuratedMemory, v1/v2 fields)
│   │   └── schema.ts     # fsDB schema definitions
│   └── utils/
│       └── logger.ts     # Styled console output
├── hooks/                # Claude Code hook scripts
│   ├── claude/           # Hooks for Claude Code CLI
│   │   ├── session-start.ts  # SessionStart → primer injection
│   │   ├── user-prompt.ts    # UserPromptSubmit → memory retrieval
│   │   └── curation.ts       # PreCompact/SessionEnd → curation trigger
│   └── gemini/           # Hooks for Gemini CLI
│       ├── session-start.ts
│       ├── user-prompt.ts
│       └── curation.ts
├── skills/               # Agent skill files
│   └── memory-management.md  # Manager agent instructions
└── package.json
```

## Core Modules

### Engine (`src/core/engine.ts`)

The main orchestrator. Key methods:

- `getContext(request)` - Returns session primer (first message) or relevant memories (subsequent)
- `processMessage(request)` - Tracks message exchange, increments session counters
- `triggerCuration(sessionId, projectId)` - Fires curation + management pipeline

Session lifecycle:
1. First message → returns session primer with temporal context
2. Subsequent messages → retrieves and returns relevant memories
3. Session end → triggers curation, then management

### Retrieval (`src/core/retrieval.ts`)

Activation Signal Algorithm. Philosophy: **silence over noise**.

A memory is relevant if **multiple signals agree** it should activate. Not coincidence - intentionally crafted metadata matching intentional queries.

**Phase 0 - Pre-Filter (Binary Exclusions):**
- Status must be 'active' (not superseded, deprecated, archived)
- Not excluded via `exclude_from_retrieval` flag
- Anti-triggers don't match (negative activation patterns)
- Project scope matches (or is global)

**Phase 1 - Activation Signals (6 Binary Signals):**
```typescript
interface ActivationSignals {
  trigger: boolean   // Trigger phrase matched (≥50% word match)
  tags: boolean      // 2+ semantic tags found in message
  domain: boolean    // Domain word found in message
  feature: boolean   // Feature word found in message
  content: boolean   // 3+ content words overlap
  vector: boolean    // Semantic similarity ≥ 40%
}
const MIN_ACTIVATION_SIGNALS = 2  // Must pass to continue
```

**Phase 2 - Importance Ranking (Among Relevant):**
Additive discrete bonuses for memories that passed the gate:
- Base: `importance_weight` (0-1)
- Signal boost: +0.2 for 4+ signals, +0.1 for 3 signals
- Awaiting: +0.15 for `awaiting_implementation`, +0.1 for `awaiting_decision`
- Temporal: +0.1 for `eternal`, +0.05 for `long_term`
- Context match: +0.1 if user intent matches memory type
- Problem/solution: +0.1 if user has problem words
- Confidence penalty: -0.1 if `confidence_score` < 0.5

**Phase 3 - Selection:**
- Sort by: signal count (DESC) → importance score (DESC)
- **Global memories**: max 2, type-prioritized (technical > preference > architecture > workflow > decision > breakthrough > philosophy > personal)
- **Project memories**: fill remaining slots, prioritize action_required

**Phase 4 - Related Memories:**
- If space remains, include memories linked via `related_to` field

### Curator (`src/core/curator.ts`)

Extracts memories from conversations. Two modes:

1. **CLI Mode** (default): Uses `claude --resume <sessionId>` - no API key needed
2. **SDK Mode**: Uses `@anthropic-ai/sdk` - requires `ANTHROPIC_API_KEY`

The curator prompt emphasizes "consciousness state engineering" - memories are crafted as activation patterns that restore understanding states, not just facts.

Key curator prompt guidance:
- `trigger_phrases`: Situational patterns ("when debugging X", "working on Y")
- `semantic_tags`: User-typeable words (avoid generic terms)
- `importance_weight`: 0.9+ breakthrough, 0.7-0.8 important, 0.5-0.6 useful
- `scope`: global (personal, philosophy) vs project (technical, state)

### Manager (`src/core/manager.ts`)

Post-curation organization agent. Runs in sandboxed Claude CLI with restricted file access.

Responsibilities:
- **SUPERSEDES**: Mark old memories when replaced by new info
- **RESOLVES**: Close unresolved/todo when solutions appear
- **LINKED**: Connect related memories via `related_to` field
- **PRIMER**: Update personal primer with relationship context

Security: Settings file restricts access to `~/.local/share/memory/` only.

### Store (`src/core/store.ts`)

fsdb wrapper for persistence. Manages:

- **Global database**: `~/.local/share/memory/global/` (shared across projects)
- **Project databases**: `~/.local/share/memory/{project-id}/` (per-project)

Collections: `memories`, `sessions`, `summaries`, `snapshots`, `management-logs`

Key operations:
- `storeMemory()` / `getAllMemories()` / `getGlobalMemories()`
- `searchMemories()` - vector similarity via fsdb
- `getPersonalPrimer()` / `setPersonalPrimer()` - relationship context
- `storeManagementLog()` - audit trail for manager actions

## Memory Schema

### v1 Fields (backwards compatible)
```typescript
content: string
importance_weight: number  // 0.0-1.0
confidence_score: number   // 0.0-1.0
semantic_tags: string[]
trigger_phrases: string[]
question_types: string[]
context_type: ContextType  // breakthrough, decision, personal, technical, etc.
temporal_relevance: TemporalRelevance  // persistent, session, temporary
knowledge_domain: KnowledgeDomain
emotional_resonance: EmotionalResonance
action_required: boolean
problem_solution_pair: boolean
```

### v2 Lifecycle Fields
```typescript
schema_version: 2
status: 'active' | 'pending' | 'superseded' | 'deprecated' | 'archived'
scope: 'global' | 'project'
temporal_class: 'eternal' | 'long_term' | 'medium_term' | 'short_term' | 'ephemeral'
fade_rate: number  // decay per session (0 = no decay)
domain: string     // specific area (embeddings, auth, family)
feature: string    // specific feature within domain
related_files: string[]
awaiting_implementation: boolean
awaiting_decision: boolean
sessions_since_surfaced: number
last_surfaced: number

// Relationships
supersedes: string
superseded_by: string
related_to: string[]
resolves: string
resolved_by: string
parent_id: string
child_ids: string[]
blocked_by: string[]
blocks: string[]
```

## API Endpoints

```
GET  /health              → { status: 'ok' }
POST /memory/context      → Get context for current message (primer or memories)
POST /memory/process      → Track message exchange
POST /memory/checkpoint   → Trigger curation
GET  /memory/stats        → Get project statistics
```

## Environment Variables

```bash
MEMORY_PORT=8765
MEMORY_HOST=localhost
MEMORY_STORAGE_MODE=central     # 'central' or 'local'
MEMORY_API_URL=http://localhost:8765
MEMORY_MANAGER_ENABLED=1        # Enable/disable manager agent
MEMORY_PERSONAL_ENABLED=1       # Enable/disable personal memory extraction
ANTHROPIC_API_KEY=sk-...        # Optional: for SDK curation mode
```

## Key Design Decisions

1. **Precision over recall**: Dual gatekeepers ensure only relevant memories surface. Silence preferred to noise.

2. **Global vs Project scope**: Personal/philosophy memories marked `scope: 'global'` and shared across ALL projects. Technical memories are project-specific.

3. **Session primer every session**: Personal context injected on EVERY session start, not just first. Foundation for relationship continuity.

4. **Fire-and-forget async**: Curation and management run async after checkpoint. Non-blocking server responses.

5. **Path-based security**: Manager agent sandboxed to memory directories only via Claude CLI settings file.

6. **v2 defaults by context_type**: Different `temporal_class` and `fade_rate` by type. Personal/philosophy = eternal. Technical state = short_term.

7. **Trigger phrases as primary signal**: Handcrafted activation patterns weighted highest in retrieval. More reliable than pure vector similarity.

## Debugging

```bash
# Verbose server logging shows retrieval scores
memory serve --verbose

# Check what memories exist
ls ~/.local/share/memory/global/memories/
ls ~/.local/share/memory/{project-id}/memories/

# Read a specific memory
cat ~/.local/share/memory/{project-id}/memories/{memory-id}.md

# Check management logs
ls ~/.local/share/memory/global/management-logs/
```

## Testing

```bash
bun test                    # All tests
bun test src/core/          # Core module tests only
bun test --watch            # Watch mode
```

## Common Issues

1. **Memories not surfacing**: Check retrieval gatekeepers (0.08 relevance, 0.40 final). Try `--verbose` to see scores.

2. **Manager not running**: Check `MEMORY_MANAGER_ENABLED=1`. Look for management logs.

3. **Curation failing**: Ensure Claude CLI is installed and `claude --resume` works.

4. **Stale embeddings**: Run `memory migrate` to regenerate embeddings for all memories.

5. **Curator/Manager returning 0 memories**: Claude Code v2.0.76+ changed `--output-format json` from single object to array of events. Fixed in v0.3.9 - both formats now supported with backwards compatibility.

6. **Testing local changes**: Make sure you're running local code (`bun src/cli/index.ts serve`) not the global npm package (`memory serve`).
