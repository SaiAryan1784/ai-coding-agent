interface Props {
  url: string
}

export default function ProjectLink({ url }: Props) {
  return (
    <div className="rounded-xl border border-violet-500/40 bg-violet-950/30 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">✨</span>
        <span className="text-violet-300 font-semibold text-sm">Your app is ready!</span>
      </div>
      <p className="text-gray-500 text-[11px] font-mono mb-3 break-all">{url}</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-violet-500/15"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        Open App
      </a>
    </div>
  )
}
