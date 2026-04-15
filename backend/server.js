import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import * as sessionStore from './sessionStore.js';
import { runAgent } from './agent.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

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
  console.log(`[server] Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('[server] WARNING: OPENROUTER_API_KEY is not set!');
  } else {
    console.log('[server] OPENROUTER_API_KEY: set\n');
  }
});
