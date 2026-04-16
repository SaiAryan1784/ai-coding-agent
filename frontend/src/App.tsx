import { useState, useRef, useCallback } from 'react'
import ChatInput from './components/ChatInput'
import AgentLog from './components/AgentLog'
import ProjectLink from './components/ProjectLink'
import type { AgentEvent } from './types'

// In production the Vite proxy doesn't exist — use the Railway URL directly.
// Set VITE_BACKEND_URL in Vercel env vars to your Railway backend URL.
const BACKEND = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export default function App() {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  /** The prompt the user submitted — shown in a card while running/done */
  const [submittedPrompt, setSubmittedPrompt] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  /** Number of thinking iterations received so far (for the live step counter) */
  const currentStep = events.filter(e => e.type === 'thinking').length
  const isDone = !isRunning && events.length > 0

  const handleReset = useCallback(() => {
    esRef.current?.close()
    setSubmittedPrompt(null)
    setEvents([])
    setServerUrl(null)
    setErrorMsg(null)
    setIsRunning(false)
  }, [])

  const handleSubmit = useCallback(async (prompt: string) => {
    // Save the prompt FIRST so it shows in the card immediately
    setSubmittedPrompt(prompt)
    setEvents([])
    setServerUrl(null)
    setErrorMsg(null)
    setIsRunning(true)
    esRef.current?.close()

    let sessionId: string
    try {
      const res = await fetch(`${BACKEND}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to start agent')
      }
      const data = await res.json()
      sessionId = data.sessionId
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error')
      setIsRunning(false)
      return
    }

    // Open SSE stream for real-time events
    const es = new EventSource(`${BACKEND}/api/stream/${sessionId}`)
    esRef.current = es

    es.onmessage = (e: MessageEvent) => {
      const event: AgentEvent = JSON.parse(e.data)
      setEvents(prev => [...prev, event])

      if (event.type === 'server_ready') setServerUrl(event.url)
      if (event.type === 'error') setErrorMsg(event.message)
      if (event.type === 'done') {
        setIsRunning(false)
        es.close()
      }
    }

    es.onerror = () => {
      setIsRunning(prev => {
        if (prev) setErrorMsg('Connection to agent stream lost.')
        return false
      })
      es.close()
    }
  }, [])

  return (
    <div className="h-screen bg-gray-950 text-gray-100 flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <header className="flex-shrink-0 border-b border-gray-800/80 px-6 py-3.5 flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-violet-500/20 flex-shrink-0">
          AI
        </div>
        <div>
          <h1 className="text-white font-semibold text-[15px] leading-none">AI Coding Agent</h1>
          <p className="text-gray-500 text-[11px] mt-0.5">Powered by Nemotron via OpenRouter</p>
        </div>

        {/* Live status badge */}
        {isRunning && (
          <div className="ml-auto flex items-center gap-2 text-xs text-blue-400">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping" />
            <span>Running — Step {currentStep}</span>
          </div>
        )}
        {isDone && !isRunning && (
          <div className="ml-auto flex items-center gap-2 text-xs text-emerald-400">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
            <span>Completed</span>
          </div>
        )}
      </header>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">

        {/* ── Left panel ── */}
        <div className="lg:w-[380px] flex-shrink-0 flex flex-col border-r border-gray-800/80 h-full">

          {/* Scrollable inner content */}
          <div className="flex-1 flex flex-col gap-4 p-5 overflow-y-auto min-h-0">

            {/* State: submitted (show prompt card + status) */}
            {submittedPrompt ? (
              <>
                {/* Prompt card */}
                <div className="rounded-xl border border-violet-500/20 bg-violet-950/40 p-4">
                  <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-widest mb-2">
                    Your prompt
                  </p>
                  <p className="text-gray-200 text-sm leading-relaxed">{submittedPrompt}</p>
                </div>

                {/* Building indicator */}
                {isRunning && (
                  <div className="flex items-center gap-3 px-1">
                    <span className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <span className="text-sm text-gray-400">
                      Building{' '}
                      {currentStep > 0 && (
                        <span className="text-blue-400 font-medium">step {currentStep}</span>
                      )}
                      <span className="text-gray-600">…</span>
                    </span>
                  </div>
                )}

                {/* Error */}
                {errorMsg && (
                  <div className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3">
                    <p className="text-red-400 text-xs font-semibold mb-1">Error</p>
                    <p className="text-red-300 text-xs leading-relaxed">{errorMsg}</p>
                  </div>
                )}

                {/* Build again — only when done */}
                {isDone && (
                  <button
                    onClick={handleReset}
                    className="w-full px-4 py-2.5 border border-gray-700 hover:border-gray-600 bg-transparent hover:bg-gray-800/50 text-gray-400 hover:text-gray-200 text-sm font-medium rounded-xl transition-all cursor-pointer"
                  >
                    ↩ Build something else
                  </button>
                )}
              </>
            ) : (
              /* State: idle (show input + examples) */
              <>
                <div>
                  <h2 className="text-sm font-semibold text-gray-300 mb-1">What do you want to build?</h2>
                  <p className="text-xs text-gray-500 mb-3">
                    Describe a project and the agent will scaffold, code, and run it for you.
                  </p>
                  <ChatInput onSubmit={handleSubmit} disabled={isRunning} />
                </div>

                {/* Example prompts */}
                {!isRunning && events.length === 0 && (
                  <div>
                    <p className="text-[10px] text-gray-600 mb-2 font-semibold uppercase tracking-widest">
                      Try an example
                    </p>
                    <div className="space-y-1.5">
                      {[
                        'Build a todo app with add, complete, and delete features',
                        'Create a simple calculator app',
                        'Build a countdown timer with start/stop/reset',
                        'Make a color palette generator',
                      ].map(example => (
                        <button
                          key={example}
                          onClick={() => handleSubmit(example)}
                          className="w-full text-left text-xs text-gray-400 hover:text-gray-200 bg-gray-900/60 hover:bg-gray-800/80 border border-gray-800 hover:border-gray-700 rounded-lg px-3 py-2.5 transition-all cursor-pointer"
                        >
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error when idle */}
                {errorMsg && (
                  <div className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3">
                    <p className="text-red-400 text-xs font-semibold mb-1">Error</p>
                    <p className="text-red-300 text-xs leading-relaxed">{errorMsg}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Project link — pinned to bottom, never clipped */}
          {serverUrl && (
            <div className="flex-shrink-0 p-5 border-t border-gray-800/80">
              <ProjectLink url={serverUrl} />
            </div>
          )}
        </div>

        {/* ── Right panel — Agent Activity log ── */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-5 py-3 border-b border-gray-800/80 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
              Agent Activity
            </span>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <AgentLog events={events} isRunning={isRunning} />
          </div>
        </div>
      </div>
    </div>
  )
}
