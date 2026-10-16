import type { StrategyType } from '@src/types/negrisk'

const STRATEGY_CONFIG: Record<StrategyType, { label: string; className: string }> = {
  YES_ARB: {
    label: 'YES ARB',
    className:
      'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  NO_CONVERT_ARB: {
    label: 'NO CONVERT',
    className:
      'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
  },
}

interface StrategyBadgeProps {
  strategy: StrategyType
  className?: string
}

export function StrategyBadge({ strategy, className = '' }: StrategyBadgeProps) {
  const config = STRATEGY_CONFIG[strategy]
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${config.className} ${className}`}
    >
      {config.label}
    </span>
  )
}
