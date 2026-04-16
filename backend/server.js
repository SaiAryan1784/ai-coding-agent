import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { existsSync, readdirSync, statSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import * as sessionStore from './sessionStore.js';
import { runAgent } from './agent.js';
import { BASE_SANDBOX_DIR } from './tools/terminal.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// FRONTEND_URL can be a comma-separated list for multiple origins (e.g. local + Vercel)
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    console.warn(`[server] CORS blocked origin: ${origin}`);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json());

// ─── Preview: serve the agent-built app's dist/ folder ───────────────────────
// Scans sandbox/{sessionId}/ for the first project that has a dist/index.html
function findDistDir(sessionId) {
  const sessionDir = path.join(BASE_SANDBOX_DIR, sessionId);
  if (!existsSync(sessionDir)) return null;
  for (const entry of readdirSync(sessionDir)) {
    const candidate = path.join(sessionDir, entry, 'dist');
    if (existsSync(path.join(candidate, 'index.html'))) return candidate;
  }
  return null;
}

// Redirect /preview/:sessionId (no trailing slash) → /preview/:sessionId/
// Without the trailing slash the browser resolves ./assets/... one directory too high,
// landing at /preview/assets/... instead of /preview/:sessionId/assets/...
app.get('/preview/:sessionId', (req, res, next) => {
  if (!req.url.endsWith('/')) {
    return res.redirect(302, req.url + '/');
  }
  next();
});

// Serve built app: static assets if the file exists, index.html otherwise (SPA fallback).
// We use res.sendFile directly instead of express.static() to avoid issues with dynamic
// middleware invocation where express.static falls through to next() on missing files,
// causing the SPA fallback to return text/html for .css/.js assets (MIME type errors).
app.use('/preview/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const distDir = findDistDir(sessionId);
  if (!distDir) {
    console.warn(`[server] Preview not ready for ${sessionId.slice(0, 8)}`);
    return res.status(404).send('Preview not ready — build may still be running.');
  }

  // req.url has the /preview/:sessionId prefix stripped, e.g. '/' or '/assets/foo.css'
  const urlPath = req.url.split('?')[0]; // strip query string
  const relPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');

  // Path traversal guard
  const filePath = path.resolve(distDir, relPath);
  if (!filePath.startsWith(distDir + path.sep)) {
    return res.status(403).send('Forbidden');
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    console.log(`[server] ${sessionId.slice(0, 8)} → ${relPath}`);
    return res.sendFile(filePath);
  }

  // SPA fallback: client-side routes that aren't real files get index.html
  console.log(`[server] ${sessionId.slice(0, 8)} SPA fallback: ${urlPath}`);
  res.sendFile(path.join(distDir, 'index.html'));
});
// ─────────────────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: process.env.MODEL || 'nvidia/nemotron-3-super-120b-a12b:free' });
});

// POST /api/chat — start agent for a prompt
app.post('/api/chat', (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    console.warn('[server] Bad request: missing prompt');
    return res.status(400).json({ error: 'prompt is required' });
  }

  const sessionId = uuidv4();
  console.log(`[server] New session: ${sessionId}`);
  console.log(`[server] Prompt: "${prompt.trim().slice(0, 120)}"`);

  sessionStore.create(sessionId);
  res.json({ sessionId });

  runAgent(prompt.trim(), sessionId).catch(err => {
    console.error(`[server] Unhandled agent error (session ${sessionId}):`, err);
    sessionStore.emit(sessionId, { type: 'error', message: err.message });
    sessionStore.emit(sessionId, { type: 'done' });
  });
});

// GET /api/stream/:sessionId — SSE endpoint
app.get('/api/stream/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  console.log(`[server] SSE client connected: ${sessionId}`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

  const unsub = sessionStore.subscribe(sessionId, event => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (event.type === 'done') {
      console.log(`[server] SSE stream closed: ${sessionId}`);
      res.end();
      unsub();
      setTimeout(() => sessionStore.destroy(sessionId), 5 * 60 * 1000);
    }
  });

  req.on('close', () => {
    console.log(`[server] SSE client disconnected: ${sessionId}`);
    unsub();
  });
});

app.listen(PORT, () => {
  console.log(`\n[server] AI Agent backend running on http://localhost:${PORT}`);
  console.log(`[server] Model: ${process.env.MODEL || 'nvidia/nemotron-3-super-120b-a12b:free'}`);
  console.log(`[server] Backend URL: ${process.env.BACKEND_URL || 'http://localhost:' + PORT}`);
  console.log(`[server] Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('[server] WARNING: OPENROUTER_API_KEY is not set!');
  } else {
    console.log('[server] OPENROUTER_API_KEY: set\n');
  }
});
