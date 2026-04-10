/**
 * NeshBesh Debugger Helper
 * Usage: npx ts-node scripts/debug.ts "Your Error Message"
 */

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
