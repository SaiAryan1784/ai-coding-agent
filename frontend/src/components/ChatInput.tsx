import { useState, useRef } from 'react'

interface Props {
  onSubmit: (prompt: string) => void
  disabled: boolean
}

export default function ChatInput({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = () => {
    if (!value.trim() || disabled) return
    onSubmit(value.trim())
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="w-full">
      <div className="flex flex-col gap-3 bg-gray-800 border border-gray-700 rounded-xl p-4 shadow-lg">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Describe what you want to build... (e.g. "build me a todo app with local storage")'
          disabled={disabled}
          rows={3}
          className="w-full bg-transparent text-gray-100 placeholder-gray-500 resize-none outline-none text-sm leading-relaxed disabled:opacity-50"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {disabled ? 'Agent is building your project...' : 'Ctrl+Enter to send'}
          </span>
          <button
            onClick={handleSubmit}
            disabled={disabled || !value.trim()}
            className="px-5 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {disabled ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                Building...
              </span>
            ) : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
