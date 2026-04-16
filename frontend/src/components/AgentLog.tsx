import { useEffect, useRef, useState, useMemo } from 'react'
import type { AgentEvent } from '../types'

interface Props {
  events: AgentEvent[]
  isRunning: boolean
}

// ── Segment types ─────────────────────────────────────────────────────────────

type ToolCallEvent = Extract<AgentEvent, { type: 'tool_call' }>
type ToolResultEvent = Extract<AgentEvent, { type: 'tool_result' }>
type StandaloneEvent = Extract<AgentEvent, { type: 'connected' | 'final' | 'server_ready' | 'error' }>

type ToolPair = {
  call: ToolCallEvent
  result: ToolResultEvent | null // null = still executing
}

type StepSegment = {
  kind: 'step'
  iteration: number
  toolPairs: ToolPair[]
  isLastStep: boolean
}

type StandaloneSegment = {
  kind: 'standalone'
  event: StandaloneEvent
}

type Segment = StepSegment | StandaloneSegment

// ── Parse the flat events array into structured segments ──────────────────────

function parseSegments(events: AgentEvent[]): Segment[] {
  const segments: Segment[] = []
  let i = 0

  while (i < events.length) {
    const ev = events[i]

    if (ev.type === 'thinking') {
      // Start a new step — collect all following tool pairs until next boundary
      const step: StepSegment = {
        kind: 'step',
        iteration: ev.iteration,
        toolPairs: [],
        isLastStep: false,
      }
      i++

      while (
        i < events.length &&
        events[i].type !== 'thinking' &&
        !['connected', 'final', 'server_ready', 'error', 'done'].includes(events[i].type)
      ) {
        if (events[i].type === 'tool_call') {
          const call = events[i++] as ToolCallEvent
          const result =
            i < events.length && events[i].type === 'tool_result'
              ? (events[i++] as ToolResultEvent)
              : null
          step.toolPairs.push({ call, result })
        } else {
          i++ // skip unexpected
        }
      }
      segments.push(step)
    } else if (ev.type === 'done') {
      i++ // no visible row for 'done'
    } else if (['connected', 'final', 'server_ready', 'error'].includes(ev.type)) {
      segments.push({ kind: 'standalone', event: ev as StandaloneEvent })
      i++
    } else {
      i++
    }
  }

  // Mark the last step so it knows whether to pulse
  for (let j = segments.length - 1; j >= 0; j--) {
    if (segments[j].kind === 'step') {
      ;(segments[j] as StepSegment).isLastStep = true
      break
    }
  }

  return segments
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TOOL_META: Record<string, { icon: string; label: string }> = {
  run_terminal:   { icon: '⚡', label: 'Terminal' },
  list_directory: { icon: '📂', label: 'List Directory' },
  read_file:      { icon: '📄', label: 'Read File' },
  write_file:     { icon: '✏️', label: 'Write File' },
  web_search:     { icon: '🔍', label: 'Web Search' },
}

function truncate(str: string, max = 600): string {
  if (str.length <= max) return str
  return str.slice(0, max) + `\n… [${str.length - max} chars truncated]`
}

function buildResultPreview(result: unknown): string {
  if (!result || typeof result !== 'object') return truncate(JSON.stringify(result), 400)
  const r = result as Record<string, unknown>
  let preview = ''
  if ('stdout' in r && r.stdout)    preview += truncate(String(r.stdout), 400)
  if ('stderr' in r && r.stderr)    preview += (preview ? '\n' : '') + `stderr: ${truncate(String(r.stderr), 200)}`
  if ('content' in r && r.content)  preview = truncate(String(r.content), 400)
  if ('tree' in r && r.tree)        preview = String(r.tree)
  if ('results' in r && Array.isArray(r.results)) {
    preview = (r.results as Array<{ title?: string; snippet?: string }>)
      .map(x => `• ${x.title ?? ''}: ${x.snippet ?? ''}`)
      .join('\n')
  }
  if ('error' in r) preview = `Error: ${r.error}`
  if ('success' in r && !preview)   preview = `✓ File written: ${String(r.path ?? '')}`
  return preview || truncate(JSON.stringify(r), 400)
}

// ── ToolPairCard ──────────────────────────────────────────────────────────────

function ToolPairCard({ pair }: { pair: ToolPair }) {
  const isPending = pair.result === null
  const [open, setOpen] = useState(isPending) // open while pending, closed once done
  const [userTouched, setUserTouched] = useState(false)

  // Auto-collapse when result arrives (unless user manually toggled)
  useEffect(() => {
    if (!isPending && !userTouched) setOpen(false)
  }, [isPending, userTouched])

  const handleToggle = () => {
    setUserTouched(true)
    setOpen(o => !o)
  }

  const meta = TOOL_META[pair.call.tool] ?? { icon: '🔧', label: pair.call.tool }
  const hasError =
    pair.result !== null &&
    pair.result.result !== null &&
    typeof pair.result.result === 'object' &&
    'error' in (pair.result.result as object)

  const resultPreview = pair.result ? buildResultPreview(pair.result.result) : ''

  return (
    <div
      className={`rounded-lg border my-1 overflow-hidden ${
        hasError
          ? 'border-red-500/25 bg-red-950/20'
          : 'border-gray-700/50 bg-gray-900/50'
      }`}
    >
      {/* Header — always visible */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/4 transition-colors"
      >
        <span className="text-base leading-none select-none">{meta.icon}</span>
        <span className="flex-1 text-xs font-medium text-gray-300 truncate">{meta.label}</span>

        {isPending ? (
          <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        ) : hasError ? (
          <span className="text-red-400 text-[10px] font-semibold flex-shrink-0">✗ Error</span>
        ) : (
          <span className="text-emerald-400 text-[10px] font-semibold flex-shrink-0">✓ Done</span>
        )}

        {/* Chevron */}
        <svg
          className={`w-3.5 h-3.5 text-gray-600 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expandable body */}
      {open && (
        <div className="px-3 pb-3 border-t border-gray-700/40 space-y-2.5">
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mt-2.5 mb-1">
              Arguments
            </p>
            <pre className="text-gray-300 text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">
              {truncate(JSON.stringify(pair.call.args, null, 2))}
            </pre>
          </div>
          {pair.result && (
            <div>
              <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${hasError ? 'text-red-400' : 'text-emerald-500'}`}>
                Output
              </p>
              <pre className={`text-xs font-mono whitespace-pre-wrap break-all leading-relaxed ${hasError ? 'text-red-300' : 'text-gray-300'}`}>
                {resultPreview || '(empty)'}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── StepCard ──────────────────────────────────────────────────────────────────

function StepCard({ step, isRunning }: { step: StepSegment; isRunning: boolean }) {
  // This step is "active" if it's the last step and the agent is still running
  const isActive = step.isLastStep && isRunning
  // Still in pure thinking phase (no tools called yet in this step)
  const isThinking = isActive && step.toolPairs.length === 0

  const [open, setOpen] = useState(true) // steps start expanded

  const toolCount = step.toolPairs.length

  return (
    <div
      className={`rounded-xl border my-1.5 overflow-hidden transition-colors duration-300 ${
        isActive ? 'border-blue-500/30 bg-blue-950/20' : 'border-gray-800/80 bg-gray-900/30'
      }`}
    >
      {/* Step header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-white/4 transition-colors"
      >
        {/* Status dot */}
        {isThinking ? (
          <span className="w-2 h-2 bg-blue-400 rounded-full animate-ping flex-shrink-0" />
        ) : isActive ? (
          <span className="w-2 h-2 border-[1.5px] border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        ) : (
          <span className="w-2 h-2 bg-emerald-600/70 rounded-full flex-shrink-0" />
        )}

        <span className={`text-xs font-semibold ${isActive ? 'text-blue-300' : 'text-gray-400'}`}>
          Step {step.iteration}
        </span>

        <span className="flex-1 text-xs text-gray-500">
          {isThinking
            ? 'Thinking…'
            : isActive
            ? `Running ${toolCount} tool${toolCount !== 1 ? 's' : ''}…`
            : toolCount > 0
            ? `${toolCount} tool${toolCount !== 1 ? 's' : ''} called`
            : 'Planning'}
        </span>

        {/* Chevron */}
        <svg
          className={`w-3.5 h-3.5 text-gray-600 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Step body */}
      {open && (
        <div className="px-3 pb-2 border-t border-gray-800/60">
          {/* Thinking placeholder — only while in pure think state */}
          {isThinking && (
            <p className="text-blue-400/70 text-xs py-2.5 animate-pulse">
              Planning next actions…
            </p>
          )}
          {step.toolPairs.map((pair, i) => (
            <ToolPairCard key={i} pair={pair} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Standalone event row ──────────────────────────────────────────────────────

function StandaloneRow({ event }: { event: StandaloneEvent }) {
  switch (event.type) {
    case 'connected':
      return (
        <div className="flex items-center gap-2 text-gray-500 text-xs py-1.5 px-1">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full flex-shrink-0" />
          Connected to agent
        </div>
      )

    case 'final':
      return (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/25 p-4 my-2">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold mb-2.5">
            <span>✓</span>
            <span>Agent completed</span>
          </div>
          <div className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
            {event.content}
          </div>
        </div>
      )

    case 'server_ready':
      return (
        <div className="rounded-xl border border-violet-500/35 bg-violet-950/30 p-3.5 my-2 flex items-center gap-3">
          <span className="text-xl select-none">✨</span>
          <div>
            <p className="text-violet-300 text-xs font-semibold">App built successfully</p>
            <p className="text-gray-500 text-[11px] mt-0.5 font-mono break-all">{event.url}</p>
          </div>
        </div>
      )

    case 'error':
      return (
        <div className="rounded-xl border border-red-500/30 bg-red-950/25 p-3.5 my-2">
          <div className="text-red-400 text-xs font-semibold mb-1">⚠ Error</div>
          <div className="text-red-300 text-xs leading-relaxed">{event.message}</div>
        </div>
      )

    default:
      return null
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function AgentLog({ events, isRunning }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  const segments = useMemo(() => parseSegments(events), [events])

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 select-none">
        <svg
          className="w-10 h-10 text-gray-700"
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path
            strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        <p className="text-gray-600 text-sm">Agent activity will appear here</p>
      </div>
    )
  }

  return (
    <div className="py-1">
      {segments.map((seg, i) =>
        seg.kind === 'step' ? (
          <StepCard key={i} step={seg} isRunning={isRunning} />
        ) : (
          <StandaloneRow key={i} event={seg.event} />
        )
      )}
      <div ref={bottomRef} />
    </div>
  )
}
