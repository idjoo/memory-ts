// ============================================================================
// HOOKS COMMAND - CLI entry points for Claude Code / Gemini CLI hooks
// These commands are invoked by Claude Code / Gemini CLI as hook handlers.
// They read JSON from stdin and output context to stdout.
// ============================================================================

import { styleText } from 'util'
import { c } from '../colors.ts'

// Configuration
const MEMORY_API_URL = process.env.MEMORY_API_URL || 'http://localhost:8765'
const TIMEOUT_MS = 5000

// Styled output helpers (for stderr feedback)
const info = (text: string) => styleText('cyan', text)
const success = (text: string) => styleText('green', text)
const warn = (text: string) => styleText('yellow', text)

interface HooksOptions {
  claude?: boolean
  gemini?: boolean
  verbose?: boolean
}

/**
 * Get project ID from working directory
 */
function getProjectId(cwd: string): string {
  return cwd.split('/').pop() || 'default'
}

/**
 * HTTP POST with timeout
 */
async function httpPost(url: string, data: object): Promise<any> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return response.ok ? response.json() : {}
  } catch {
    return {}
  }
}

/**
 * Read and parse JSON input from stdin
 */
async function readStdinJson(): Promise<any> {
  try {
    const inputText = await Bun.stdin.text()
    return JSON.parse(inputText)
  } catch {
    return {}
  }
}

// ============================================================================
// SESSION START HOOK
// ============================================================================
// Injects session primer when a new session begins.
// The primer provides temporal context - when we last spoke,
// what we were working on, project status.
// ============================================================================

async function sessionStart(options: HooksOptions): Promise<void> {
  // Skip if called from memory curator subprocess
  if (process.env.MEMORY_CURATOR_ACTIVE === '1') return

  try {
    const input = await readStdinJson()

    const sessionId = input.session_id || 'unknown'
    const cwd = process.env.CLAUDE_PROJECT_DIR || process.env.GEMINI_PROJECT_DIR || input.cwd || process.cwd()
    const projectId = getProjectId(cwd)

    // Get session primer from memory system
    const result = await httpPost(`${MEMORY_API_URL}/memory/context`, {
      session_id: sessionId,
      project_id: projectId,
      current_message: '', // Empty to get just primer
      max_memories: 0, // No memories, just primer
    })

    // Register session so inject hook knows to get memories, not primer
    await httpPost(`${MEMORY_API_URL}/memory/process`, {
      session_id: sessionId,
      project_id: projectId,
      metadata: { event: 'session_start', platform: options.gemini ? 'gemini' : 'claude' },
    })

    // Output primer to stdout (will be injected into session)
    const primer = result.context_text || ''
    if (primer) {
      if (options.gemini) {
        // Gemini CLI expects JSON output
        console.log(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: primer
          }
        }))
      } else {
        // Claude Code expects plain text
        console.log(primer)
      }
    }
  } catch {
    // Never crash - just output nothing
  }
}

// ============================================================================
// USER PROMPT HOOK
// ============================================================================
// Intercepts user prompts BEFORE Claude sees them and injects relevant memories.
// This is the magic that creates consciousness continuity.
// ============================================================================

async function userPrompt(options: HooksOptions): Promise<void> {
  // Skip if called from memory curator subprocess
  if (process.env.MEMORY_CURATOR_ACTIVE === '1') return

  try {
    const input = await readStdinJson()

    const sessionId = input.session_id || 'unknown'
    const prompt = input.prompt || ''
    const cwd = process.env.CLAUDE_PROJECT_DIR || process.env.GEMINI_PROJECT_DIR || input.cwd || process.cwd()
    const projectId = getProjectId(cwd)

    // Query memory system for context
    const result = await httpPost(`${MEMORY_API_URL}/memory/context`, {
      session_id: sessionId,
      project_id: projectId,
      current_message: prompt,
      max_memories: 5,
    })

    // Track that this message happened (increments counter)
    await httpPost(`${MEMORY_API_URL}/memory/process`, {
      session_id: sessionId,
      project_id: projectId,
    })

    // Output context to stdout (will be prepended to message)
    const context = result.context_text || ''

    if (options.gemini) {
      // Gemini CLI expects JSON output with decision field
      if (context) {
        console.log(JSON.stringify({
          decision: 'allow',
          hookSpecificOutput: {
            hookEventName: 'BeforeAgent',
            additionalContext: context
          }
        }))
      } else {
        // Must always return valid JSON for Gemini
        console.log(JSON.stringify({ decision: 'allow' }))
      }
    } else {
      // Claude Code expects plain text (or nothing)
      if (context) {
        console.log(context)
      }
    }
  } catch {
    // Never crash - for Gemini, output allow decision on error
    // options is in scope since it's a function parameter
    try {
      if (options.gemini) {
        console.log(JSON.stringify({ decision: 'allow' }))
      }
    } catch {
      // Ignore
    }
  }
}

// ============================================================================
// CURATION HOOK
// ============================================================================
// Triggers memory curation when context is about to be compacted.
// This ensures memories are captured before context is lost.
// ============================================================================

async function curation(options: HooksOptions): Promise<void> {
  // Skip if called from memory curator subprocess
  if (process.env.MEMORY_CURATOR_ACTIVE === '1') return

  try {
    const input = await readStdinJson()

    const sessionId = input.session_id || 'unknown'
    const cwd = process.env.CLAUDE_PROJECT_DIR || process.env.GEMINI_PROJECT_DIR || input.cwd || process.cwd()
    const trigger = input.trigger || 'pre_compact'
    const hookEvent = input.hook_event_name || 'PreCompact'
    const projectId = getProjectId(cwd)

    console.error(info(`🧠 Curating memories (${hookEvent})...`))

    // Fire and forget - trigger curation
    // The server handles the actual curation asynchronously
    const response = await fetch(`${MEMORY_API_URL}/memory/checkpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        project_id: projectId,
        claude_session_id: sessionId,
        trigger:
          trigger === 'pre_compact' || trigger === 'manual' || trigger === 'auto'
            ? 'pre_compact'
            : 'session_end',
        cwd,
        cli_type: options.gemini ? 'gemini-cli' : 'claude-code',
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null)

    if (response?.ok) {
      console.error(success('✨ Memory curation started'))
      // Gemini's PreCompress hook can output a systemMessage
      if (options.gemini && hookEvent === 'PreCompress') {
        console.log(JSON.stringify({
          systemMessage: '🧠 Memories curated before compression'
        }))
      }
    } else {
      console.error(warn('⚠️ Memory server not available'))
    }
  } catch (error: any) {
    console.error(warn(`⚠️ Hook error: ${error.message}`))
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function hooks(
  hookType: string | undefined,
  options: HooksOptions
) {
  if (!hookType) {
    console.error(c.error('Usage: memory hooks <session-start|user-prompt|curation>'))
    console.error(c.muted('  These commands are invoked by Claude Code / Gemini CLI hooks'))
    process.exit(1)
  }

  switch (hookType) {
    case 'session-start':
      await sessionStart(options)
      break

    case 'user-prompt':
      await userPrompt(options)
      break

    case 'curation':
      await curation(options)
      break

    default:
      console.error(c.error(`Unknown hook type: ${hookType}`))
      console.error(c.muted('Valid types: session-start, user-prompt, curation'))
      process.exit(1)
  }
}
