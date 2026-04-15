// In-memory session store: each session has a set of subscriber callbacks
// and a buffer of past events (for SSE reconnects).

const sessions = new Map(); // sessionId -> { subs: Set<fn>, buffer: Array }

export function create(sessionId) {
  sessions.set(sessionId, { subs: new Set(), buffer: [] });
}

export function subscribe(sessionId, cb) {
  const session = sessions.get(sessionId);
  if (!session) return () => {};
  // Replay buffered events to new subscriber
  session.buffer.forEach(event => cb(event));
  session.subs.add(cb);
  return () => session.subs.delete(cb);
}

export function emit(sessionId, event) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.buffer.push(event);
  session.subs.forEach(cb => cb(event));
}

export function destroy(sessionId) {
  sessions.delete(sessionId);
}
