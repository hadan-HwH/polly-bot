import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export interface EventGroup<T> {
  key: string
  label: string
  items: T[]
  summary?: ReactNode
}

interface EventAccordionProps<T> {
  groups: EventGroup<T>[]
  renderGroup: (items: T[]) => ReactNode
  defaultExpanded?: boolean
  className?: string
}

export function EventAccordion<T>({
  groups,
  renderGroup,
  defaultExpanded = false,
  className = '',
}: EventAccordionProps<T>) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => {
    if (defaultExpanded) return new Set(groups.map((g) => g.key))
    return new Set<string>()
  })

  const toggle = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const expandAll = () => setExpandedKeys(new Set(groups.map((g) => g.key)))
  const collapseAll = () => setExpandedKeys(new Set())

  const someExpanded = expandedKeys.size > 0

  if (groups.length === 0) return null

  return (
    <div className={className}>
      <div className="flex justify-end mb-2">
        <button
          className="text-xs text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
          onClick={someExpanded ? collapseAll : expandAll}
        >
          {someExpanded ? '모두 접기' : '모두 펼치기'}
        </button>
      </div>
      <div className="space-y-2">
        {groups.map((group) => {
          const isExpanded = expandedKeys.has(group.key)
          return (
            <div
              key={group.key}
              className="border border-gray-200 dark:border-dark-700 rounded-lg overflow-hidden"
            >
              <button
                className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-dark-800 hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors text-left"
                onClick={() => toggle(group.key)}
              >
                {isExpanded ? (
                  <ChevronDown className="size-4 text-gray-400 shrink-0" />
                ) : (
                  <ChevronRight className="size-4 text-gray-400 shrink-0" />
                )}
                <span className="text-sm font-medium text-gray-700 dark:text-dark-200 truncate flex-1">
                  {group.label}
                </span>
                <span className="text-xs text-gray-400 dark:text-dark-500 shrink-0">
                  {group.items.length}건
                </span>
                {group.summary && (
                  <span className="shrink-0">{group.summary}</span>
                )}
              </button>
              {isExpanded && (
                <div className="border-t border-gray-200 dark:border-dark-700">
                  {renderGroup(group.items)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string,
  labelFn: (item: T) => string,
  summaryFn?: (items: T[]) => ReactNode,
): EventGroup<T>[] {
  const map = new Map<string, { label: string; items: T[] }>()
  for (const item of items) {
    const key = keyFn(item)
    const existing = map.get(key)
    if (existing) {
      existing.items.push(item)
    } else {
      map.set(key, { label: labelFn(item), items: [item] })
    }
  }
  return Array.from(map.entries()).map(([key, { label, items }]) => ({
    key,
    label,
    items,
    summary: summaryFn?.(items),
  }))
}
