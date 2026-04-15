import path from 'path';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { BASE_SANDBOX_DIR } from './terminal.js';

export async function readFile({ path: filePath }, sessionId) {
  const sandboxDir = sessionId
    ? path.join(BASE_SANDBOX_DIR, sessionId)
    : BASE_SANDBOX_DIR;
  mkdirSync(sandboxDir, { recursive: true });

  const resolved = path.resolve(sandboxDir, filePath);
  if (!resolved.startsWith(BASE_SANDBOX_DIR)) {
    return { error: 'Path traversal attempt blocked.' };
  }
  if (!existsSync(resolved)) {
    return { error: `File not found: ${filePath}` };
  }

  try {
    const content = readFileSync(resolved, 'utf-8');
    console.log(`[readFile] Read: ${filePath} (${content.length} chars)`);
    return { content };
  } catch (err) {
    console.error(`[readFile] Failed to read ${filePath}:`, err.message);
    return { error: `Failed to read file: ${err.message}` };
  }
}
