import type { ReactNode } from 'react'
import { Info, AlertTriangle } from 'lucide-react'

interface InfoBannerProps {
  children: ReactNode
  variant?: 'info' | 'warning'
  icon?: ReactNode
}

const styles = {
  info: 'bg-blue-50 dark:bg-blue-900/15 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
  warning: 'bg-amber-50 dark:bg-amber-900/15 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
} as const

const defaultIcons = {
  info: <Info className="size-4 shrink-0 mt-0.5" />,
  warning: <AlertTriangle className="size-4 shrink-0 mt-0.5" />,
} as const

export function InfoBanner({ children, variant = 'info', icon }: InfoBannerProps) {
  return (
    <div className={`flex items-start gap-2.5 px-4 py-3 rounded-lg border text-sm leading-relaxed ${styles[variant]}`}>
      {icon ?? defaultIcons[variant]}
      <div>{children}</div>
    </div>
  )
}
