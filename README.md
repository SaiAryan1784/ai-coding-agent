# AI Coding Agent

A full-stack AI agentic web app that builds React projects from natural language prompts. Describe what you want, and the agent autonomously scaffolds, codes, and launches it — giving you a live localhost link to test.

**Live Demo:** [ai-coding-agent-lilac-ten.vercel.app](https://ai-coding-agent-lilac-ten.vercel.app)

---

## What It Does

1. User types a prompt: *"build me a todo app with local storage"*
2. The AI agent (powered by OpenRouter) uses real tools to implement it:
   - Runs terminal commands (`npm create vite`, `npm install`, `npm run dev`)
   - Reads and writes files in an isolated sandbox
   - Searches the web for documentation when needed
3. Every tool call streams live to the UI in real time
4. When the dev server starts, a clickable **Open App** link appears

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vite + React + TypeScript + Tailwind CSS v4 |
| Backend | Node.js + Express (ES Modules) |
| AI | OpenRouter API — `nvidia/nemotron-3-super-120b-a12b:free` |
| Real-time | Server-Sent Events (SSE) |
| Deployment | Vercel (frontend) + Railway (backend) |

---

## Architecture

```
Browser (Vercel)
  │
  ├── POST /api/chat ──────────────────► Express Backend (Railway)
  │        returns { sessionId }              │
  │                                           ├── runAgent() [async]
  ├── EventSource /api/stream/:id ◄───────────│    │
  │        streams events in real-time        │    ├── OpenRouter API (LLM)
  │                                           │    │     tool_calls ↓
  │   Events:                                 │    ├── run_terminal
  │   • thinking (step N)                     │    ├── write_file
  │   • tool_call + args                      │    ├── read_file
  │   • tool_result                           │    ├── list_directory
  │   • server_ready + url                    │    └── web_search
  │   • final message                         │
  └── done                                    └── sandbox/{sessionId}/
                                                   └── user's built app
```

---

## Agent Tools

| Tool | What It Does |
|---|---|
| `run_terminal` | Runs shell commands in the sandbox. Detects and backgrounds dev servers. |
| `list_directory` | Recursive tree listing (skips node_modules, .git) |
| `read_file` | Reads any file inside the sandbox |
| `write_file` | Writes/overwrites files, auto-creates parent directories |
| `web_search` | DuckDuckGo search for documentation and package names |

---

## Local Development

### Prerequisites
- Node.js 18+
- An [OpenRouter](https://openrouter.ai) API key (free)

### Setup

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd ai-coding-agent

# 2. Backend
cd backend
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY
npm install
npm start        # runs on http://localhost:3001

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev      # runs on http://localhost:5173
```

Open `http://localhost:5173` and start building.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `OPENROUTER_API_KEY` | Your OpenRouter API key |
| `PORT` | Backend port (default: 3001) |
| `FRONTEND_URL` | Comma-separated allowed origins for CORS |
| `MODEL` | OpenRouter model ID (default: `nvidia/nemotron-3-super-120b-a12b:free`) |

### Frontend (Vercel env vars)

| Variable | Description |
|---|---|
| `VITE_BACKEND_URL` | Full URL of the deployed backend (e.g. `https://xxx.up.railway.app`) |

---

## Project Structure

```
ai-coding-agent/
├── backend/
│   ├── server.js          # Express app, SSE routes
│   ├── agent.js           # OpenRouter loop with retry logic
│   ├── sessionStore.js    # In-memory pub/sub per session
│   └── tools/
│       ├── index.js       # Tool registry + dispatcher
│       ├── terminal.js    # Shell execution + dev server detection
│       ├── listDir.js     # Recursive directory tree
│       ├── readFile.js    # File reader with path traversal guard
│       ├── writeFile.js   # File writer with path traversal guard
│       └── webSearch.js   # DuckDuckGo search scraper
└── frontend/
    └── src/
        ├── App.tsx              # State management + SSE lifecycle
        ├── types.ts             # AgentEvent discriminated union
        └── components/
            ├── ChatInput.tsx    # Prompt input
            ├── AgentLog.tsx     # Live event feed
            └── ProjectLink.tsx  # "Open App" button
```

---

## Security

- **Path traversal prevention** — all file paths are resolved against the sandbox directory and rejected if they escape it
- **Command blocklist** — dangerous shell patterns (`rm -rf /`, `sudo`, `curl | bash`, fork bombs) are blocked before execution
- **Per-session isolation** — each conversation gets its own `sandbox/{sessionId}/` directory
- **CORS** — backend only accepts requests from the configured frontend origin

---

## Deployment

| Service | Config |
|---|---|
| **Railway** (backend) | Root dir: `backend/`. Set env vars in Railway dashboard. Auto-detects Node.js. |
| **Vercel** (frontend) | Root dir: `frontend/`. Set `VITE_BACKEND_URL` env var. Build: `npm run build`. |
