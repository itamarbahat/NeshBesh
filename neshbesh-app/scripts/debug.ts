/**
 * NeshBesh Debugger Helper
 * Usage: npx ts-node scripts/debug.ts "Your Error Message"
 */

import { getShareUrl } from '../src/services/multiplayerService';

const errorInput = process.argv[2];

if (!errorInput) {
  console.log("❌ No error input provided.");
  process.exit(1);
}

console.log("🤖 DEBUGGER SUB-AGENT INITIALIZED");
console.log("----------------------------------");
console.log(`📥 Received Error: ${errorInput}`);
console.log("----------------------------------");
console.log("🔍 Analyzing project state...");
console.log("💡 Tip: Paste this error in our chat with '@Debugger' to trigger automated fix.");

// ── Sanity check: getShareUrl returns the canonical join URL ────────────────
const sampleId = 'AB12CD';
const expected = `https://nesh-besh.vercel.app/join/${sampleId}`;
const actual = getShareUrl(sampleId);
if (actual !== expected) {
  console.error(`❌ getShareUrl assertion failed: expected ${expected}, got ${actual}`);
  process.exit(1);
}
console.log(`✅ getShareUrl('${sampleId}') === '${actual}'`);
