import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'

export type FeedType = 'info' | 'alert' | 'trade' | 'error' | 'price' | 'negrisk'

export interface FeedEntry {
  id: string
  time: string
  type: FeedType
  message: string
}

const TYPE_STYLES: Record<FeedType, string> = {
  info: 'text-blue-400',
  alert: 'text-green-400',
  trade: 'text-purple-400',
  error: 'text-red-400',
  price: 'text-yellow-400',
  negrisk: 'text-cyan-400',
}

const TYPE_LABELS: Record<FeedType, string> = {
  info: 'INFO',
  alert: 'ALERT',
  trade: 'TRADE',
  error: 'ERROR',
  price: 'PRICE',
  negrisk: 'NEGRSK',
}

interface ActivityFeedProps {
  entries: FeedEntry[]
  maxHeight?: string
}

export default function ActivityFeed({ entries, maxHeight = '360px' }: ActivityFeedProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [entries, autoScroll])

  return (
    <div className="rounded-xl border border-gray-200 dark:border-dark-700 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-100 dark:bg-dark-800 border-b border-gray-200 dark:border-dark-700">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="size-3 rounded-full bg-red-400" />
            <span className="size-3 rounded-full bg-yellow-400" />
            <span className="size-3 rounded-full bg-green-400" />
          </div>
          <span className="text-xs font-medium text-gray-500 dark:text-dark-400">
            Live Activity Feed
          </span>
        </div>
        <button
          type="button"
          onClick={() => setAutoScroll((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-dark-500 hover:text-gray-600 dark:hover:text-dark-300 transition-colors"
          title={autoScroll ? '자동 스크롤 일시정지' : '자동 스크롤 재개'}
        >
          {autoScroll ? <Pause className="size-3" /> : <Play className="size-3" />}
          {autoScroll ? 'Auto' : 'Paused'}
        </button>
      </div>

      <div
        ref={bodyRef}
        className="overflow-y-auto bg-gray-950 px-4 py-3 font-mono text-xs leading-relaxed"
        style={{ maxHeight }}
      >
        {entries.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            시스템에 연결 중...
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex gap-3 py-0.5">
              <span className="text-gray-500 shrink-0">{entry.time}</span>
              <span className={`shrink-0 w-14 font-semibold ${TYPE_STYLES[entry.type]}`}>
                {TYPE_LABELS[entry.type]}
              </span>
              <span className="text-gray-300">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
