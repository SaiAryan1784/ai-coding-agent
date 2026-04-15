import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BASE_SANDBOX_DIR = path.resolve(__dirname, '..', 'sandbox');

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,
  /sudo\s/,
  /curl[^|]*\|\s*(ba)?sh/,
  /wget[^|]*\|\s*(ba)?sh/,
  /chmod\s+[0-7]*7[0-7]*\s+\//,
  />\s*\/etc\//,
  /mkfs/,
  /dd\s+if=/,
  /:\(\)\s*\{.*:\|:.*\}/,  // fork bomb
];

export const runningServers = new Map();

function isDevServerCommand(cmd) {
  return /npm\s+run\s+dev|vite(\s|$)|next\s+dev|react-scripts\s+start/.test(cmd);
}

async function findFreePort(start = 5174) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(findFreePort(start + 1)));
    server.once('listening', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.listen(start);
  });
}

export async function runTerminal({ command, timeout_ms = 60000 }, sessionId) {
  const sid = sessionId?.slice(0, 8) ?? 'no-session';

  // Security: block dangerous patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      console.warn(`[terminal:${sid}] BLOCKED: "${command}"`);
      return { error: `Command blocked by security policy.` };
    }
  }

  const sandboxDir = sessionId
    ? path.join(BASE_SANDBOX_DIR, sessionId)
    : BASE_SANDBOX_DIR;
  mkdirSync(sandboxDir, { recursive: true });

  const isServer = isDevServerCommand(command);
  let effectiveCommand = command;

  if (isServer) {
    const freePort = await findFreePort(5174);
    console.log(`[terminal:${sid}] Dev server command detected — using port ${freePort}`);
    if (/--port\s+\d+/.test(effectiveCommand)) {
      effectiveCommand = effectiveCommand.replace(/--port\s+\d+/, `--port ${freePort}`);
    } else {
      effectiveCommand = effectiveCommand.replace(/(npm run dev)/, `$1 -- --port ${freePort}`);
      effectiveCommand = effectiveCommand.replace(/--\s+--\s+--port/, `-- --port`);
    }
  }

  const effectiveTimeout = isServer ? 15000 : timeout_ms;
  console.log(`[terminal:${sid}] Running: ${effectiveCommand}`);
  console.log(`[terminal:${sid}] cwd: ${sandboxDir} | timeout: ${effectiveTimeout}ms | isDevServer: ${isServer}`);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    const child = spawn('bash', ['-c', effectiveCommand], {
      cwd: sandboxDir,
      env: { ...process.env },
      detached: isServer,
      stdio: isServer ? ['ignore', 'pipe', 'pipe'] : 'pipe',
    });

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      if (isServer) {
        if (sessionId) runningServers.set(sessionId, child);
        child.unref();
        console.log(`[terminal:${sid}] Dev server timeout reached — returning captured output`);
        console.log(`[terminal:${sid}] stdout so far: ${stdout.slice(0, 400)}`);
        resolve({ stdout, stderr, note: 'Dev server started in background. Check stdout for URL.' });
      } else {
        child.kill();
        console.warn(`[terminal:${sid}] Command timed out after ${timeout_ms}ms`);
        resolve({ stdout, stderr, error: 'Command timed out after ' + timeout_ms + 'ms' });
      }
    }, effectiveTimeout);

    child.on('close', code => {
      clearTimeout(timer);
      console.log(`[terminal:${sid}] Process exited with code ${code}`);
      if (stderr) console.warn(`[terminal:${sid}] stderr: ${stderr.slice(0, 300)}`);
      resolve({ stdout, stderr, exit_code: code });
    });

    child.on('error', err => {
      clearTimeout(timer);
      console.error(`[terminal:${sid}] Spawn error:`, err.message);
      resolve({ error: err.message, stdout, stderr });
    });
  });
}
