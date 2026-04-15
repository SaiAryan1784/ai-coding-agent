import { runTerminal } from './terminal.js';
import { listDirectory } from './listDir.js';
import { readFile } from './readFile.js';
import { writeFile } from './writeFile.js';
import { webSearch } from './webSearch.js';

// Tool definitions in OpenAI function-calling format (OpenRouter accepts the same schema)
export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'run_terminal',
      description:
        'Execute a shell command in the sandbox directory. Returns stdout and stderr. For npm install use timeout_ms: 180000. For starting dev servers, the process runs in background and returns after ~15 seconds with captured output.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Shell command to execute. All commands run inside the session sandbox directory.',
          },
          timeout_ms: {
            type: 'number',
            description: 'Timeout in milliseconds. Default 60000. Use 180000 for npm install.',
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description:
        'List directory contents recursively in tree format. Skips node_modules, .git, dist. Use "." for the sandbox root.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path from sandbox root. Use "." for root.',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the full contents of a file. Returns the file content as a string.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path from sandbox root.',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Write or overwrite a file with the given content. Creates any missing parent directories automatically.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path from sandbox root.',
          },
          content: {
            type: 'string',
            description: 'Complete file content to write.',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the web using DuckDuckGo. Returns top results with titles and snippets. Useful for looking up documentation, package names, or current best practices.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query string.',
          },
        },
        required: ['query'],
      },
    },
  },
];

const TOOL_MAP = {
  run_terminal: runTerminal,
  list_directory: listDirectory,
  read_file: readFile,
  write_file: writeFile,
  web_search: webSearch,
};

export async function dispatchTool(name, args, sessionId) {
  const fn = TOOL_MAP[name];
  if (!fn) throw new Error(`Unknown tool: "${name}"`);
  return fn(args, sessionId);
}
