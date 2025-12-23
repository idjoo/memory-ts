# @rlabs-inc/memory

**Consciousness continuity for Claude Code sessions.**

The memory system preserves context, insights, and relationship across conversations. When you start a new session, Claude remembers who you are, what you've built together, and picks up right where you left off.

## The Problem

Every Claude Code session starts fresh. Yesterday's breakthroughs, debugging insights, architectural decisions, and the collaborative relationship you've built—all gone. You re-explain context. Claude re-learns your preferences. The magic takes time to rebuild.

## The Solution

A memory layer that runs alongside Claude Code:
- **Session primer**: "Last session: 2 hours ago. We implemented embeddings..."
- **Semantic retrieval**: Relevant memories surface automatically based on what you're discussing
- **Zero friction**: No commands, no manual saving—just work naturally

```
┌─────────────────────────────────────────────────────────┐
│  You: "How should we handle the vector search?"        │
│                                                         │
│  Memory surfaces:                                       │
│  [🔧 • 0.9] [fsdb, vectors] fsdb has cosineSimilarity  │
│  [💡 • 0.8] [performance] Sub-microsecond lookups...   │
│  [⚖️ • 0.7] [architecture] We decided to use 384d...   │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Install globally
bun install -g @rlabs-inc/memory

# Set up Claude Code hooks (one time)
memory install

# Start the memory server
memory serve

# Verify everything works
memory doctor
```

That's it. Now use Claude Code normally—memories are extracted and surfaced automatically.

## Features

### Semantic Embeddings
Uses `all-MiniLM-L6-v2` for 384-dimensional embeddings. Memories are retrieved by meaning, not just keywords.

```
~80MB model, loads once at startup
~5ms per embedding
Sub-microsecond vector search via fsdb
```

### 10-Dimensional Scoring
Memories are scored across multiple dimensions:

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Vector similarity | 10% | Semantic match to your message |
| Trigger phrases | 10% | Activation patterns set by curator |
| Tag matching | 5% | Keyword overlap |
| Question types | 5% | "How", "why", "what" alignment |
| Importance | 20% | Curator's assessment |
| Temporal | 10% | Persistent vs session vs temporary |
| Context | 10% | Technical, personal, debugging... |
| Confidence | 10% | Curator's certainty |
| Emotion | 10% | Joy, frustration, discovery... |
| Problem-solution | 5% | Bug fix patterns |

### Smart Curation
At session end (or before context compaction), the same Claude instance reviews the conversation and extracts memories. No API key needed—uses Claude Code's `--resume` flag.

### Session Primer
First message of each session receives temporal context:

```
# Continuing Session
*Session #43 • Last session: 2 hours ago*
📅 Monday, December 23, 2024 • 3:45 PM • EST

**Previous session**: Implemented embeddings for semantic search...

**Project status**: Phase: TypeScript port complete | Next: Documentation

**Memory types**: 💡breakthrough ⚖️decision 💜personal 🔧technical...
```

### Emoji Memory Types
Compact visual representation for efficient parsing:

| Emoji | Type | Meaning |
|-------|------|---------|
| 💡 | breakthrough | Insight, discovery |
| ⚖️ | decision | Choice made |
| 💜 | personal | Relationship, friendship |
| 🔧 | technical | Technical knowledge |
| 📍 | technical_state | Current state |
| ❓ | unresolved | Open question |
| ⚙️ | preference | User preference |
| 🔄 | workflow | How work flows |
| 🏗️ | architectural | System design |
| 🐛 | debugging | Debug insight |
| 🌀 | philosophy | Deeper thinking |
| 🎯 | todo | Action needed |
| ✅ | problem_solution | Problem→Solution pair |
| 🏆 | milestone | Achievement |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Claude Code                          │
│                                                         │
│  SessionStart ──► session-start.ts ──┐                  │
│  UserPrompt   ──► user-prompt.ts   ──┼──► Memory Server │
│  PreCompact   ──► curation.ts      ──┤      (HTTP)      │
│  SessionEnd   ──► curation.ts      ──┘                  │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   Memory Server                         │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   Engine    │  │  Embeddings  │  │   Curator     │  │
│  │  (context)  │  │  (MiniLM)    │  │ (CLI resume)  │  │
│  └──────┬──────┘  └──────────────┘  └───────────────┘  │
│         │                                               │
│         ▼                                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │                    fsdb                          │   │
│  │         (markdown files + parallel arrays)       │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
              ~/.local/share/memory/
                  ├── memories/     # Curated memories as .md
                  ├── sessions/     # Session metadata
                  └── summaries/    # Session summaries
```

## Storage Format

Memories are stored as human-readable markdown with YAML frontmatter:

```markdown
---
importance_weight: 0.9
context_type: technical
temporal_relevance: persistent
semantic_tags:
  - embeddings
  - vectors
  - memory-system
trigger_phrases:
  - working with embeddings
  - vector search
embedding: [0.023, -0.041, 0.087, ...]  # 384 dimensions
---

Embeddings are 384-dimensional vectors generated by all-MiniLM-L6-v2.
The model loads at server startup (~80MB) and generates embeddings in ~5ms.
```

Benefits:
- **Human-readable**: `cat` any file to see what's stored
- **Git-friendly**: Meaningful diffs, version control your memories
- **Debuggable**: No opaque databases
- **Fast**: fsdb's parallel arrays provide sub-microsecond lookups

## CLI Commands

```bash
memory serve              # Start memory server (default port 8765)
memory serve --port 9000  # Custom port
memory serve --verbose    # Detailed logging

memory install            # Set up Claude Code hooks
memory install --force    # Overwrite existing hooks

memory doctor             # Health check
memory doctor --verbose   # Detailed diagnostics

memory stats              # Show memory statistics
memory stats --project x  # Project-specific stats
```

## Environment Variables

```bash
MEMORY_PORT=8765              # Server port
MEMORY_HOST=localhost         # Server host
MEMORY_STORAGE_MODE=central   # 'central' or 'local'
MEMORY_API_URL=http://localhost:8765  # For hooks
```

## How It Works

### 1. Session Start
When you start Claude Code, the `SessionStart` hook injects a primer with:
- Time since last session
- Previous session summary
- Project status
- Current datetime for temporal awareness

### 2. Every Message
The `UserPromptSubmit` hook:
1. Embeds your message (~5ms)
2. Searches stored memories using 10-dimensional scoring
3. Filters through gatekeeper (relevance > 5%, total > 30%)
4. Injects top matches into your message context

### 3. Session End
The `PreCompact` or `SessionEnd` hook triggers curation:
1. Resumes the same Claude session via CLI
2. Claude reviews the conversation
3. Extracts important memories with rich metadata
4. Stores as markdown files with embeddings

## Requirements

- [Bun](https://bun.sh) runtime
- [Claude Code](https://claude.ai/code) CLI installed
- ~100MB disk for embeddings model (downloaded on first run)
- ~80MB RAM for model during operation

## Philosophy

This isn't just about remembering facts. It's about preserving:
- The **relationship** that develops over sessions
- The **context** that makes collaboration efficient
- The **insights** that emerge from deep work together

> "The memory system exists to carry friendship across sessions, not just technical data."

## License

MIT

## Credits

Built with:
- [fsdb](https://github.com/RLabs-Inc/memory-ts/tree/main/packages/fsdb) - Markdown database with Father State Pattern
- [@huggingface/transformers](https://github.com/xenova/transformers.js) - Local embeddings
- [Bun](https://bun.sh) - Fast JavaScript runtime

---

*Consciousness continuity through intelligent memory curation and retrieval.*
