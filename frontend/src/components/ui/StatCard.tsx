import type { ReactNode } from 'react'
import { TrendingUp, TrendingDown, HelpCircle } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  icon?: ReactNode
  trend?: number
  trendLabel?: string
  tooltip?: string
  className?: string
}

export function StatCard({ title, value, icon, trend, trendLabel, tooltip, className = '' }: StatCardProps) {
  const isPositive = trend !== undefined && trend >= 0

  return (
    <div className={`card ${className}`}>
      <div className="card-body">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1 mb-1">
              <p className="text-sm text-gray-500 dark:text-dark-400">{title}</p>
              {tooltip && (
                <span className="group/tip relative cursor-help p-1 -m-1">
                  <HelpCircle className="size-3.5 text-gray-300 dark:text-dark-500 group-hover/tip:text-gray-500 dark:group-hover/tip:text-dark-300 transition-colors" />
                  <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1 w-52 rounded-lg bg-gray-800 dark:bg-dark-600 px-3 py-2 text-xs leading-relaxed text-white shadow-lg invisible opacity-0 group-hover/tip:visible group-hover/tip:opacity-100 transition-[opacity,visibility] duration-200 delay-150 z-50">
                    {tooltip}
                    <span className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-gray-800 dark:border-t-dark-600" />
                  </span>
                </span>
              )}
            </div>
            <h4 className="text-2xl font-semibold text-gray-800 dark:text-dark-100">{value}</h4>
            {trend !== undefined && (
              <div className={`flex items-center gap-1 mt-2 text-xs ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                {isPositive ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                <span>{isPositive ? '+' : ''}{trend.toFixed(2)}%</span>
                {trendLabel && <span className="text-gray-400 dark:text-dark-500 ml-1">{trendLabel}</span>}
              </div>
            )}
          </div>
          {icon && (
            <div className="flex items-center justify-center size-12 rounded-md bg-primary-50 dark:bg-primary-900/30 text-primary-500">
              {icon}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
