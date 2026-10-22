import { resolve } from "node:path";
import { openDatabase } from "../backend/database.mjs";
import { runWeeklyDigest } from "../backend/weekly-digest.mjs";

const recipientArg = process.argv.find(a => a.startsWith("--recipient="));
const db = openDatabase(resolve(process.env.NIKE_DB_PATH || "./data/nike-ai.db"));
try {
  const result = await runWeeklyDigest({db,dryRun:process.argv.includes("--dry-run"),recipient:recipientArg?.slice("--recipient=".length) || ""});
  console.log(JSON.stringify(result));
  if (result.failed) process.exitCode = 1;
} finally { db.close(); }