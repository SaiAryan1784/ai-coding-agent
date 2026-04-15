import { useEffect, useRef } from 'react'
import type { AgentEvent } from '../types'

interface Props {
  events: AgentEvent[]
}

const TOOL_ICONS: Record<string, string> = {
  run_terminal: '⚡',
  list_directory: '📂',
  read_file: '📄',
  write_file: '✏️',
  web_search: '🔍',
}

function truncate(str: string, max = 400) {
  if (str.length <= max) return str
  return str.slice(0, max) + `... [${str.length - max} chars truncated]`
}

function EventRow({ event }: { event: AgentEvent }) {
  switch (event.type) {
    case 'connected':
      return (
        <div className="flex items-center gap-2 text-gray-500 text-xs py-1">
          <span className="w-2 h-2 bg-green-500 rounded-full" />
          Connected to agent stream
        </div>
      )

    case 'thinking':
      return (
        <div className="flex items-center gap-2 text-blue-400 text-xs py-1 animate-pulse">
          <span className="w-2 h-2 bg-blue-400 rounded-full animate-ping" />
          Thinking... (step {event.iteration})
        </div>
      )

    case 'tool_call': {
      const icon = TOOL_ICONS[event.tool] || '🔧'
      const argsStr = truncate(JSON.stringify(event.args, null, 2))
      return (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 my-1">
          <div className="flex items-center gap-2 text-yellow-400 text-xs font-semibold mb-2">
            <span>{icon}</span>
            <span>Calling: {event.tool}</span>
          </div>
          <pre className="text-gray-300 text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">
            {argsStr}
          </pre>
        </div>
      )
    }

    case 'tool_result': {
      const result = event.result as Record<string, unknown>
      const hasError = result && typeof result === 'object' && 'error' in result

      let preview = ''
      if (result && typeof result === 'object') {
        if ('stdout' in result && result.stdout) preview += `stdout: ${truncate(String(result.stdout), 300)}\n`
        if ('stderr' in result && result.stderr) preview += `stderr: ${truncate(String(result.stderr), 200)}\n`
        if ('content' in result && result.content) preview += truncate(String(result.content), 300)
        if ('tree' in result && result.tree) preview += String(result.tree)
        if ('results' in result && Array.isArray(result.results)) {
          preview += (result.results as Array<{title?: string; snippet?: string}>)
            .map(r => `• ${r.title || ''}: ${r.snippet || ''}`)
            .join('\n')
        }
        if ('error' in result) preview += `Error: ${result.error}`
        if ('success' in result && !preview) preview = `File written: ${result.path}`
      }
      if (!preview) preview = truncate(JSON.stringify(result), 300)

      return (
        <div className={`rounded-lg border p-3 my-1 ${hasError ? 'border-red-500/30 bg-red-500/5' : 'border-green-500/30 bg-green-500/5'}`}>
          <div className={`text-xs font-semibold mb-1 ${hasError ? 'text-red-400' : 'text-green-400'}`}>
            {hasError ? '✗' : '✓'} Result from {event.tool}
          </div>
          <pre className="text-gray-300 text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">
            {preview}
          </pre>
        </div>
      )
    }

    case 'server_ready':
      return (
        <div className="rounded-lg border border-violet-500/50 bg-violet-500/10 p-3 my-2">
          <div className="text-violet-300 text-xs font-semibold">
            Dev server detected at {event.url}
          </div>
        </div>
      )

    case 'error':
      return (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 my-1">
          <div className="text-red-400 text-xs font-semibold">Error</div>
          <div className="text-red-300 text-xs mt-1">{event.message}</div>
        </div>
      )

    case 'final':
      return (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 my-2">
          <div className="text-emerald-400 text-xs font-semibold mb-2">Agent completed</div>
          <div className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">{event.content}</div>
        </div>
      )

    default:
      return null
  }
}

export default function AgentLog({ events }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  if (events.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
        Agent activity will appear here...
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-1 py-2 space-y-0.5">
      {events.map((event, i) => (
        <EventRow key={i} event={event} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
