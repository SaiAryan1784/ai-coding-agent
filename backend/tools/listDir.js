import path from 'path';
import { readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { BASE_SANDBOX_DIR } from './terminal.js';

const IGNORE = new Set(['node_modules', '.git', 'dist', '.vite', '.cache', 'coverage']);

function buildTree(dir, prefix = '', depth = 0) {
  if (depth > 8) return prefix + '  ... (max depth reached)\n';
  let entries;
  try {
    entries = readdirSync(dir).filter(e => !IGNORE.has(e)).sort();
  } catch {
    return prefix + '  (unreadable)\n';
  }

  let result = '';
  entries.forEach((entry, i) => {
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    const fullPath = path.join(dir, entry);
    let stat;
    try { stat = statSync(fullPath); } catch { return; }
    result += prefix + connector + entry + '\n';
    if (stat.isDirectory()) {
      result += buildTree(fullPath, childPrefix, depth + 1);
    }
  });
  return result;
}

export async function listDirectory({ path: dirPath }, sessionId) {
  const sandboxDir = sessionId
    ? path.join(BASE_SANDBOX_DIR, sessionId)
    : BASE_SANDBOX_DIR;
  mkdirSync(sandboxDir, { recursive: true });

  const resolved = path.resolve(sandboxDir, dirPath || '.');
  if (!resolved.startsWith(BASE_SANDBOX_DIR)) {
    return { error: 'Path traversal attempt blocked.' };
  }
  if (!existsSync(resolved)) {
    return { error: `Directory not found: ${dirPath}` };
  }

  const tree = buildTree(resolved);
  console.log(`[listDir] Listed: ${dirPath} (${tree.split('\n').length} lines)`);
  return { tree: tree || '(empty directory)' };
}
