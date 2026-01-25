// ============================================================================
// PATH UTILITIES - Centralized path resolution for memory system
// ============================================================================

import { join } from 'path'
import { homedir, tmpdir } from 'os'
import { existsSync } from 'fs'

// ============================================================================
// TEMP PATHS - For Gemini CLI system prompt injection
// ============================================================================

/**
 * Get temp file path for curator system prompt
 * Used by Gemini CLI via GEMINI_SYSTEM_MD env var
 */
export function getCuratorPromptPath(): string {
  return join(tmpdir(), '.gemini-curator-prompt.md')
}

/**
 * Get temp file path for manager system prompt
 * Used by Gemini CLI via GEMINI_SYSTEM_MD env var
 */
export function getManagerPromptPath(): string {
  return join(tmpdir(), '.gemini-manager-prompt.md')
}

// ============================================================================
// STORAGE PATHS - Where memories are stored
// ============================================================================

/**
 * Get central storage path (default location for all memory data)
 * ~/.local/share/memory
 */
export function getCentralStoragePath(): string {
  return join(homedir(), '.local', 'share', 'memory')
}

/**
 * Get global storage path (shared across all projects)
 * ~/.local/share/memory/global
 */
export function getGlobalStoragePath(): string {
  return join(getCentralStoragePath(), 'global')
}

/**
 * Get global memories path
 * ~/.local/share/memory/global/memories
 */
export function getGlobalMemoriesPath(): string {
  return join(getGlobalStoragePath(), 'memories')
}

/**
 * Get personal primer path
 * ~/.local/share/memory/global/primer/personal-primer.md
 */
export function getPersonalPrimerPath(): string {
  return join(getGlobalStoragePath(), 'primer', 'personal-primer.md')
}

/**
 * Get project storage path based on storage mode
 *
 * Central mode: ~/.local/share/memory/{projectId}
 * Local mode: {projectPath}/.memory/{projectId}
 */
export function getProjectStoragePath(
  projectId: string,
  storageMode: 'central' | 'local' = 'central',
  projectPath?: string,
  localFolder: string = '.memory'
): string {
  if (storageMode === 'local' && projectPath) {
    return join(projectPath, localFolder, projectId)
  }
  return join(getCentralStoragePath(), projectId)
}

/**
 * Get project memories path
 */
export function getProjectMemoriesPath(
  projectId: string,
  storageMode: 'central' | 'local' = 'central',
  projectPath?: string,
  localFolder: string = '.memory'
): string {
  return join(getProjectStoragePath(projectId, storageMode, projectPath, localFolder), 'memories')
}

// ============================================================================
// MANAGER CWD - Working directory for manager agent
// ============================================================================

export interface StoragePaths {
  projectPath: string
  globalPath: string
  projectMemoriesPath: string
  globalMemoriesPath: string
  personalPrimerPath: string
  storageMode: 'central' | 'local'
}

/**
 * Get the storage mode from StoragePaths (defaults to 'central')
 */
export function getStorageMode(storagePaths?: StoragePaths): 'central' | 'local' {
  return storagePaths?.storageMode ?? 'central'
}

/**
 * Get the working directory for the manager agent
 *
 * Central mode: ~/.local/share/memory (parent of both project and global)
 * Local mode: project storage path (write access to project only)
 */
export function getManagerCwd(storagePaths?: StoragePaths): string {
  const storageMode = getStorageMode(storagePaths)

  if (storageMode === 'central') {
    // Central: run from parent directory to access both project and global
    return getCentralStoragePath()
  }

  // Local: run from project storage path
  return storagePaths?.projectPath ?? getCentralStoragePath()
}

/**
 * Resolve full storage paths from config
 * This mirrors engine.getStoragePaths() logic
 */
export function resolveStoragePaths(
  projectId: string,
  storageMode: 'central' | 'local' = 'central',
  projectPath?: string,
  localFolder: string = '.memory'
): StoragePaths {
  const globalPath = getGlobalStoragePath()
  const globalMemoriesPath = getGlobalMemoriesPath()
  const personalPrimerPath = getPersonalPrimerPath()

  const projectStoragePath = getProjectStoragePath(projectId, storageMode, projectPath, localFolder)
  const projectMemoriesPath = join(projectStoragePath, 'memories')

  return {
    projectPath: projectStoragePath,
    globalPath,
    projectMemoriesPath,
    globalMemoriesPath,
    personalPrimerPath,
    storageMode,
  }
}

// ============================================================================
// CLI DISCOVERY - Find Claude CLI command
// ============================================================================

/**
 * Get the Claude CLI command path
 * Uses `which` for universal discovery across installation methods
 *
 * Priority:
 * 1. CURATOR_COMMAND env var (explicit override)
 * 2. `which claude` (universal - works with native, homebrew, npm)
 * 3. ~/.claude/local/claude (legacy native install)
 * 4. 'claude' (last resort - assume in PATH)
 */
export function getClaudeCommand(): string {
  // 1. Check for explicit override
  const envCommand = process.env.CURATOR_COMMAND
  if (envCommand) return envCommand

  // 2. Use `which` to find claude in PATH
  const result = Bun.spawnSync(['which', 'claude'])
  if (result.exitCode === 0) {
    return result.stdout.toString().trim()
  }

  // 3. Legacy fallback - hardcoded native install path
  const claudeLocal = join(homedir(), '.claude', 'local', 'claude')
  if (existsSync(claudeLocal)) return claudeLocal

  // 4. Last resort
  return 'claude'
}
