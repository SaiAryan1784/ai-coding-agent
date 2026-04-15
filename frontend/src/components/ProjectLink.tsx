interface Props {
  url: string
}

export default function ProjectLink({ url }: Props) {
  return (
    <div className="rounded-xl border border-violet-500/50 bg-violet-500/10 p-5 text-center">
      <div className="text-violet-300 font-semibold text-sm mb-1">Your project is ready!</div>
      <div className="text-gray-400 text-xs mb-4">Running at {url}</div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-violet-500/20"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        Open App
      </a>
    </div>
  )
}
