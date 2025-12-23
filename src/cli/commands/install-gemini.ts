// ============================================================================
// INSTALL GEMINI COMMAND - Set up Gemini CLI hooks
// ============================================================================

import { homedir } from 'os'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { c, symbols, fmt } from '../colors.ts'

interface InstallOptions {
  verbose?: boolean
  force?: boolean
}

export async function installGemini(options: InstallOptions) {
  console.log()
  console.log(c.header(`${symbols.brain} Memory - Install Gemini Hooks`))
  console.log()

  const geminiDir = join(homedir(), '.gemini')
  const settingsPath = join(geminiDir, 'settings.json')

  // Find the hooks directory (relative to this CLI)
  const cliPath = import.meta.dir
  const packageRoot = join(cliPath, '..', '..', '..')
  const hooksDir = join(packageRoot, 'gemini-hooks')

  console.log(`  ${fmt.kv('Gemini config', geminiDir)}`)
  console.log(`  ${fmt.kv('Hooks source', hooksDir)}`)
  console.log()

  // Check if hooks directory exists
  if (!existsSync(hooksDir)) {
    console.log(c.error(`  ${symbols.cross} Hooks directory not found at ${hooksDir}`))
    process.exit(1)
  }

  // Ensure .gemini directory exists
  if (!existsSync(geminiDir)) {
    try {
        mkdirSync(geminiDir, { recursive: true })
        console.log(`  ${c.success(symbols.tick)} Created ${geminiDir}`)
    } catch {
        console.log(`  ${c.warn(symbols.warning)} Could not create ${geminiDir} (sandbox restriction?)`)
        console.log(`  ${c.muted('Skipping config write, printing manual instructions instead.')}`)
    }
  }

  // Read existing settings or create new
  let settings: any = {}
  if (existsSync(settingsPath)) {
    try {
      const content = await Bun.file(settingsPath).text()
      settings = JSON.parse(content)
      console.log(`  ${c.success(symbols.tick)} Found existing settings.json`)
    } catch {
      console.log(`  ${c.warn(symbols.warning)} Could not parse settings.json`)
    }
  }

  // Build hooks configuration
  const sessionStartHook = join(hooksDir, 'session-start.ts')
  const userPromptHook = join(hooksDir, 'user-prompt.ts')
  const curationHook = join(hooksDir, 'curation.ts')

  // Based on Gemini CLI documentation
  const hooksConfig = {
    SessionStart: [
      {
        matcher: 'startup|resume',
        hooks: [
          {
            type: 'command',
            command: `bun "${sessionStartHook}"`,
            timeout: 10000
          }
        ]
      }
    ],
    BeforeAgent: [
      {
        hooks: [
          {
            type: 'command',
            command: `bun "${userPromptHook}"`,
            timeout: 10000
          }
        ]
      }
    ],
    PreCompress: [
      {
        matcher: 'auto|manual',
        hooks: [
          {
            type: 'command',
            command: `bun "${curationHook}"`,
            timeout: 120000
          }
        ]
      }
    ],
    SessionEnd: [
      {
        hooks: [
          {
            type: 'command',
            command: `bun "${curationHook}"`,
            timeout: 120000
          }
        ]
      }
    ]
  }

  // Merge hooks
  if (!settings.hooks) {
      settings.hooks = {}
  }
  
  settings.hooks = {
    ...settings.hooks,
    ...hooksConfig
  }

  // Write settings
  try {
    if (existsSync(geminiDir)) {
        await Bun.write(settingsPath, JSON.stringify(settings, null, 2))
        console.log(`  ${c.success(symbols.tick)} Updated ${settingsPath}`)
    } else {
        throw new Error("Gemini directory does not exist")
    }
  } catch (error: any) {
    console.log(c.error(`  ${symbols.cross} Failed to write settings: ${error.message}`))
    console.log()
    console.log(c.bold('Manual Installation Instructions:'))
    console.log('Add the following to your ~/.gemini/settings.json:')
    console.log()
    console.log(JSON.stringify({ hooks: hooksConfig }, null, 2))
    console.log()
  }

  console.log()
  console.log(c.success(`${symbols.sparkles} Gemini hooks configured!`))
}