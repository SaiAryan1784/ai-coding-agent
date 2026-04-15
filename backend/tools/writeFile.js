import path from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { BASE_SANDBOX_DIR } from './terminal.js';

export async function writeFile({ path: filePath, content }, sessionId) {
  const sandboxDir = sessionId
    ? path.join(BASE_SANDBOX_DIR, sessionId)
    : BASE_SANDBOX_DIR;
  mkdirSync(sandboxDir, { recursive: true });

  const resolved = path.resolve(sandboxDir, filePath);
  if (!resolved.startsWith(BASE_SANDBOX_DIR)) {
    return { error: 'Path traversal attempt blocked.' };
  }

  try {
    mkdirSync(path.dirname(resolved), { recursive: true });
    writeFileSync(resolved, content, 'utf-8');
    console.log(`[writeFile] Written: ${filePath} (${content.length} chars)`);
    return { success: true, path: filePath };
  } catch (err) {
    console.error(`[writeFile] Failed to write ${filePath}:`, err.message);
    return { error: `Failed to write file: ${err.message}` };
  }
}
