import { useState, useRef, useCallback } from 'react'
import ChatInput from './components/ChatInput'
import AgentLog from './components/AgentLog'
import ProjectLink from './components/ProjectLink'
import type { AgentEvent } from './types'

export default function App() {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  const handleSubmit = useCallback(async (prompt: string) => {
    // Reset state for new run
    setEvents([])
    setServerUrl(null)
    setErrorMsg(null)
    setIsRunning(true)
    esRef.current?.close()

    let sessionId: string
    try {
      const res = await fetch('/api/chat', {
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
    const es = new EventSource(`/api/stream/${sessionId}`)
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
      // Only mark as not running if we haven't received done yet
      setIsRunning(prev => {
        if (prev) {
          setErrorMsg('Connection to agent stream lost.')
        }
        return false
      })
      es.close()
    }
  }, [])

  return (
    <div className="h-screen bg-gray-950 text-gray-100 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-gray-800 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center text-white font-bold text-sm">
          AI
        </div>
        <div>
          <h1 className="text-white font-semibold text-base leading-none">AI Coding Agent</h1>
          <p className="text-gray-500 text-xs mt-0.5">Powered by Nemotron via OpenRouter</p>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">

        {/* Left panel — fixed height, never scrolls */}
        <div className="lg:w-[400px] flex-shrink-0 flex flex-col gap-4 p-5 border-r border-gray-800 h-full overflow-hidden">
          <div>
            <h2 className="text-sm font-semibold text-gray-300 mb-1">What do you want to build?</h2>
            <p className="text-xs text-gray-500 mb-3">
              Describe a project and the agent will scaffold, code, and run it for you.
            </p>
            <ChatInput onSubmit={handleSubmit} disabled={isRunning} />
          </div>

          {/* Example prompts */}
          {!isRunning && events.length === 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-600 mb-2 font-medium uppercase tracking-wider">Try an example</p>
              <div className="space-y-2">
                {[
                  'Build a todo app with add, complete, and delete features',
                  'Create a simple calculator app',
                  'Build a countdown timer with start/stop/reset',
                  'Make a color palette generator',
                ].map(example => (
                  <button
                    key={example}
                    onClick={() => handleSubmit(example)}
                    className="w-full text-left text-xs text-gray-400 hover:text-gray-200 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-lg px-3 py-2.5 transition-colors cursor-pointer"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error message */}
          {errorMsg && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3">
              <p className="text-red-400 text-xs font-semibold">Error</p>
              <p className="text-red-300 text-xs mt-1">{errorMsg}</p>
            </div>
          )}

          {/* Project link — appears when dev server is ready */}
          {serverUrl && (
            <div className="mt-auto">
              <ProjectLink url={serverUrl} />
            </div>
          )}
        </div>

        {/* Right panel — scrollable log */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Agent Activity</span>
            {isRunning && (
              <span className="flex items-center gap-1.5 text-xs text-blue-400">
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-ping" />
                Running
              </span>
            )}
            {!isRunning && events.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                Done
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <AgentLog events={events} />
          </div>
        </div>
      </div>
    </div>
  )
}
