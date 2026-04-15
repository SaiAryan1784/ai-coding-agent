export type AgentEvent =
  | { type: 'connected'; sessionId: string }
  | { type: 'thinking'; iteration: number }
  | { type: 'tool_call'; tool: string; args: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; result: unknown }
  | { type: 'server_ready'; url: string }
  | { type: 'final'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done' };
