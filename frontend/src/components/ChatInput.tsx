import { useState, useRef, useEffect } from 'react'

interface Props {
  onSubmit: (prompt: string) => void
  disabled: boolean
}

export default function ChatInput({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize the textarea as content grows/shrinks
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  const handleSubmit = () => {
    if (!value.trim() || disabled) return
    onSubmit(value.trim())
    setValue('')
    // Reset height after clearing
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="w-full">
      <div className="flex flex-col gap-3 bg-gray-900 border border-gray-700/80 hover:border-gray-600 focus-within:border-violet-500/60 rounded-xl p-4 shadow-lg transition-colors duration-150">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Describe what you want to build… e.g. "a todo app with local storage"'
          disabled={disabled}
          rows={3}
          style={{ resize: 'none', overflow: 'hidden' }}
          className="w-full bg-transparent text-gray-100 placeholder-gray-600 outline-none text-sm leading-relaxed disabled:opacity-40"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-600">
            {disabled ? 'Agent is building…' : '⌘↵ to send'}
          </span>
          <button
            onClick={handleSubmit}
            disabled={disabled || !value.trim()}
            className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {disabled ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                Building…
              </span>
            ) : (
              'Send'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
