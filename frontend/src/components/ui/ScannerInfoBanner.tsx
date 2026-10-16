import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { getSettings, type AppSettings } from '@lib/api/settings'

interface ScannerInfoBannerProps {
  variant: 'pureArb' | 'negRisk' | 'markets'
}

interface Chip {
  label: string
  value: string
}

let cachedSettings: AppSettings | null = null

export function invalidateSettingsCache() {
  cachedSettings = null
}

export function ScannerInfoBanner({ variant }: ScannerInfoBannerProps) {
  const [settings, setSettings] = useState<AppSettings | null>(cachedSettings)

  useEffect(() => {
    getSettings()
      .then((s) => { cachedSettings = s; setSettings(s) })
      .catch(() => {})
  }, [])

  if (!settings) return null

  const chips = buildChips(variant, settings)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {chips.map((chip) => (
        <span
          key={chip.label}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-dark-800 text-gray-600 dark:text-dark-300 border border-gray-200 dark:border-dark-700"
        >
          <span className="text-gray-400 dark:text-dark-500">{chip.label}</span>
          <span className="font-semibold text-gray-700 dark:text-dark-200">{chip.value}</span>
        </span>
      ))}
      <Link
        to="/settings"
        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs text-gray-400 dark:text-dark-500 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
        title="설정 변경"
      >
        <Settings className="size-3" />
        <span>설정</span>
      </Link>
    </div>
  )
}

function buildChips(variant: ScannerInfoBannerProps['variant'], s: AppSettings): Chip[] {
  const liq = s.minLiquidityUsd >= 1000
    ? `$${(s.minLiquidityUsd / 1000).toFixed(0)}K+`
    : `$${s.minLiquidityUsd.toFixed(0)}+`

  if (variant === 'markets') {
    return [
      { label: '유동성', value: liq },
      { label: '만료', value: `${s.maxDaysUntilResolution}일 이내` },
      { label: '모드', value: s.dryRun ? 'Dry Run' : 'Live' },
    ]
  }

  if (variant === 'pureArb') {
    return [
      { label: '유동성', value: liq },
      { label: '만료', value: `${s.maxDaysUntilResolution}일` },
      { label: '모니터링', value: `${(250 * s.numWsConnections).toLocaleString()} 마켓` },
      { label: '최소 수익률', value: `${(s.minProfitThreshold * 100).toFixed(1)}%` },
      { label: '최대 포지션', value: `$${s.maxPositionSize}` },
      { label: '모드', value: s.dryRun ? 'Dry Run' : 'Live' },
    ]
  }

  const negWs = s.negriskNumWsConnections > 0
    ? s.negriskNumWsConnections
    : Math.max(2, Math.floor(s.numWsConnections / 2))
  const negTokenBudget = negWs * 500

  const chips: Chip[] = [
    { label: '유동성', value: liq },
    { label: '만료', value: `${s.maxDaysUntilResolution}일` },
    { label: 'WS 토큰', value: `${negTokenBudget.toLocaleString()} (${negWs}conn)` },
    { label: '아웃컴', value: s.negriskMaxOutcomes ? `${s.negriskMinOutcomes}~${s.negriskMaxOutcomes}개` : `${s.negriskMinOutcomes}개+` },
    { label: '안전마진', value: `${(s.negriskSafetyMargin * 100).toFixed(1)}%` },
    { label: '최소 ROI', value: `${(s.negriskMinRoi * 100).toFixed(1)}%` },
    { label: '모드', value: s.dryRun ? 'Dry Run' : 'Live' },
  ]
  if (s.negriskPriorityCategories?.length) {
    chips.splice(3, 0, { label: '우선', value: s.negriskPriorityCategories.join(', ') })
  }
  return chips
}
