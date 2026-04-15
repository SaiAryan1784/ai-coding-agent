import axios from 'axios';
import * as sessionStore from './sessionStore.js';
import { dispatchTool, TOOL_DEFINITIONS } from './tools/index.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_ITERATIONS = 30;

const SYSTEM_PROMPT = `You are an expert AI coding agent. Your job is to build complete, working React projects using tools.

## MANDATORY First Steps — do these in order, no exceptions
1. run_terminal: \`npm create vite@latest my-app -- --template react\`
2. run_terminal: \`cd my-app && npm install\`  with timeout_ms: 180000
3. list_directory: \`.\`  to confirm the structure
4. write_file all required source files (overwrite the generated ones)
5. run_terminal: \`cd my-app && npm run dev -- --port 5174\`
6. Reply with a short summary and the localhost URL

## Rules
- NEVER use web_search to look up how to scaffold, install, or run Vite/React — you already know these commands. Use web_search ONLY for external APIs, third-party package names you are unsure of, or domain-specific data.
- NEVER skip npm install. NEVER skip the dev server step.
- NEVER use placeholders or TODO comments — write complete, working code.
- All file paths are relative to the sandbox root. Commands run inside the session sandbox automatically.
- Prefer writing complete files. Do not make partial edits.
- The dev server MUST be started as the final terminal step so the user gets a clickable link.`;

export async function runAgent(userPrompt, sessionId) {
  const model = process.env.MODEL || 'nvidia/nemotron-3-super-120b-a12b:free';
  console.log(`\n[agent:${sessionId.slice(0, 8)}] Starting agent`);
  console.log(`[agent:${sessionId.slice(0, 8)}] Model: ${model}`);
  console.log(`[agent:${sessionId.slice(0, 8)}] Prompt: "${userPrompt.slice(0, 120)}"`);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n[agent:${sessionId.slice(0, 8)}] --- Iteration ${iteration} ---`);
    sessionStore.emit(sessionId, { type: 'thinking', iteration });

    // Call OpenRouter with retry on transient provider errors (524, 503, 502, etc.)
    let response;
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[agent:${sessionId.slice(0, 8)}] Calling OpenRouter (${messages.length} messages in context)${attempt > 1 ? ` [retry ${attempt}/${MAX_RETRIES}]` : ''}...`);
        response = await axios.post(
          OPENROUTER_URL,
          {
            model,
            messages,
            tools: TOOL_DEFINITIONS,
            tool_choice: 'auto',
            max_tokens: 8192,
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
              'X-Title': 'AI Coding Agent',
            },
            timeout: 120000,
          }
        );

        // OpenRouter sometimes returns HTTP 200 with {"error":...} instead of choices
        // (e.g. code 524 = provider timeout, 503 = provider unavailable)
        if (response.data.error) {
          const { message: errMsg, code } = response.data.error;
          console.error(`[agent:${sessionId.slice(0, 8)}] Provider error (code ${code}): ${errMsg}`);
          // Transient codes worth retrying
          const retryable = [524, 503, 502, 500].includes(code);
          if (retryable && attempt < MAX_RETRIES) {
            const wait = attempt * 4000;
            console.log(`[agent:${sessionId.slice(0, 8)}] Retrying in ${wait}ms...`);
            await new Promise(r => setTimeout(r, wait));
            response = null;
            continue;
          }
          sessionStore.emit(sessionId, { type: 'error', message: `Provider error (${code}): ${errMsg}. Try again in a moment.` });
          sessionStore.emit(sessionId, { type: 'done' });
          return;
        }

        console.log(`[agent:${sessionId.slice(0, 8)}] OpenRouter responded — finish_reason: ${response.data.choices?.[0]?.finish_reason}`);
        break; // success

      } catch (err) {
        const message = err.response?.data?.error?.message || err.message;
        const status = err.response?.status;
        console.error(`[agent:${sessionId.slice(0, 8)}] HTTP error (${status ?? 'network'}):`, message);
        if (err.response?.data) {
          console.error(`[agent:${sessionId.slice(0, 8)}] Response body:`, JSON.stringify(err.response.data));
        }
        const retryable = !status || status >= 500;
        if (retryable && attempt < MAX_RETRIES) {
          const wait = attempt * 4000;
          console.log(`[agent:${sessionId.slice(0, 8)}] Retrying in ${wait}ms...`);
          await new Promise(r => setTimeout(r, wait));
          response = null;
          continue;
        }
        sessionStore.emit(sessionId, { type: 'error', message: `OpenRouter API error: ${message}` });
        sessionStore.emit(sessionId, { type: 'done' });
        return;
      }
    }

    const choice = response?.data.choices?.[0];
    if (!choice) {
      console.error(`[agent:${sessionId.slice(0, 8)}] No choice in final response:`, JSON.stringify(response?.data));
      sessionStore.emit(sessionId, { type: 'error', message: 'No response from model after retries.' });
      sessionStore.emit(sessionId, { type: 'done' });
      return;
    }

    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    const { tool_calls, content, finish_reason } = assistantMessage;

    console.log(`[agent:${sessionId.slice(0, 8)}] tool_calls: ${tool_calls?.length ?? 0}, content length: ${content?.length ?? 0}`);

    // No tool calls — agent is done
    if (!tool_calls || tool_calls.length === 0) {
      let finalContent = content || 'Task completed.';
      // Some models (e.g. nemotron) output <tool_call>...</tool_call> XML as plain
      // text instead of structured tool_calls. Strip it so the final message is clean.
      finalContent = finalContent
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
        .replace(/<function_calls>[\s\S]*?<\/function_calls>/gi, '')
        .trim();
      if (!finalContent) finalContent = 'Task completed.';

      console.log(`[agent:${sessionId.slice(0, 8)}] Agent done. Final message: "${finalContent.slice(0, 200)}"`);
      sessionStore.emit(sessionId, { type: 'final', content: finalContent });
      sessionStore.emit(sessionId, { type: 'done' });
      return;
    }

    // Execute each tool call sequentially
    for (const toolCall of tool_calls) {
      const { id, function: { name, arguments: argsStr } } = toolCall;

      let args;
      try {
        args = JSON.parse(argsStr);
      } catch {
        console.warn(`[agent:${sessionId.slice(0, 8)}] Failed to parse args for ${name}:`, argsStr);
        args = {};
      }

      console.log(`[agent:${sessionId.slice(0, 8)}] Tool call: ${name} | args: ${JSON.stringify(args).slice(0, 200)}`);
      sessionStore.emit(sessionId, { type: 'tool_call', tool: name, args });

      let result;
      try {
        result = await dispatchTool(name, args, sessionId);
      } catch (err) {
        console.error(`[agent:${sessionId.slice(0, 8)}] Tool "${name}" threw:`, err.message);
        result = { error: err.message };
      }

      // Log result summary
      if (result.error) {
        console.error(`[agent:${sessionId.slice(0, 8)}] Tool "${name}" error: ${result.error}`);
      } else if (result.stdout !== undefined) {
        console.log(`[agent:${sessionId.slice(0, 8)}] Tool "${name}" stdout (first 300): ${result.stdout?.slice(0, 300)}`);
        if (result.stderr) console.warn(`[agent:${sessionId.slice(0, 8)}] Tool "${name}" stderr (first 200): ${result.stderr?.slice(0, 200)}`);
      } else {
        console.log(`[agent:${sessionId.slice(0, 8)}] Tool "${name}" result: ${JSON.stringify(result).slice(0, 200)}`);
      }

      // Truncate very large results to avoid token overflow
      const resultStr = JSON.stringify(result);
      const truncatedResult = resultStr.length > 8000
        ? JSON.stringify({ ...result, stdout: result.stdout?.slice(0, 4000), stderr: result.stderr?.slice(0, 1000), _truncated: true })
        : resultStr;

      if (resultStr.length > 8000) {
        console.warn(`[agent:${sessionId.slice(0, 8)}] Tool "${name}" result truncated: ${resultStr.length} -> 8000 chars`);
      }

      sessionStore.emit(sessionId, { type: 'tool_result', tool: name, result });

      // Detect dev server URL in terminal output
      if (name === 'run_terminal' && result.stdout) {
        const urlMatch = result.stdout.match(/Local:\s+(http:\/\/localhost:\d+)/i)
          || result.stdout.match(/(http:\/\/localhost:\d+)/);
        if (urlMatch) {
          console.log(`[agent:${sessionId.slice(0, 8)}] Dev server URL detected: ${urlMatch[1]}`);
          sessionStore.emit(sessionId, { type: 'server_ready', url: urlMatch[1] });
        }
      }

      messages.push({
        role: 'tool',
        tool_call_id: id,
        content: truncatedResult,
      });
    }
  }

  console.error(`[agent:${sessionId.slice(0, 8)}] Reached max iterations (${MAX_ITERATIONS})`);
  sessionStore.emit(sessionId, { type: 'error', message: `Reached maximum of ${MAX_ITERATIONS} iterations.` });
  sessionStore.emit(sessionId, { type: 'done' });
}
