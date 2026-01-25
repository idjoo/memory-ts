#!/usr/bin/env bun
/**
 * Test curation with session resumption
 */

import { createCurator } from "./src/core/curator.ts";

async function test(sessionId: string) {
  const curator = createCurator();

  console.log(`Testing curation for session: ${sessionId}`);
  console.log("Using curateWithSessionResume...\n");

  const result = await curator.curateWithSessionResume(sessionId, "session_end");

  console.log("\n=== RESULT ===");
  console.log(`Session summary: ${result.session_summary || "(none)"}`);
  console.log(`Interaction tone: ${result.interaction_tone || "(none)"}`);
  console.log(`Memories: ${result.memories.length}`);

  if (result.memories.length > 0) {
    console.log("\nMemories:");
    for (const mem of result.memories) {
      console.log(`  - [${mem.context_type}] ${mem.headline || mem.content.substring(0, 80)}...`);
    }
  }
}

const sessionId = process.argv[2];
if (!sessionId) {
  console.log("Usage: bun test-curation.ts <session-id>");
  process.exit(1);
}

test(sessionId).catch(console.error);
