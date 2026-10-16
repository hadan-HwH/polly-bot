import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Radio,
  Wifi,
  WifiOff,
  Wallet,
  BarChart3,
  TrendingUp,
  Zap,
  ArrowRight,
  RefreshCw,
} from 'lucide-react'
import { StatCard } from '@components/ui'
import ActivityFeed, { type FeedEntry } from '@components/dashboard/ActivityFeed'
import {
  getScannerStatus,
  getAlerts,
  type ScannerStatus,
  type ArbAlertItem,
} from '@lib/api/arb'
import { getNegRiskStats, getNegRiskArb } from '@lib/api/negrisk'
import type { ArbOpportunity, NegRiskStatsResponse } from '@src/types/negrisk'
import { getWalletStatus, type WalletStatus } from '@lib/api/wallet'

const POLL_INTERVAL = 10_000
const MAX_FEED = 100

let feedCounter = 0
function nextId() {
  return `f-${++feedCounter}`
}

function timeStr() {
  return new Date().toTimeString().slice(0, 8)
}

export default function Dashboard() {
  const [status, setStatus] = useState<ScannerStatus | null>(null)
  const [nrStats, setNrStats] = useState<NegRiskStatsResponse | null>(null)
  const [wallet, setWallet] = useState<WalletStatus | null>(null)
  const [recentAlerts, setRecentAlerts] = useState<ArbAlertItem[]>([])
  const [nrOpps, setNrOpps] = useState<ArbOpportunity[]>([])
  const [feed, setFeed] = useState<FeedEntry[]>([
    { id: nextId(), time: timeStr(), type: 'info', message: '대시보드 시작 — 시스템에 연결 중...' },
  ])
  const [loading, setLoading] = useState(true)

  const prevRef = useRef<{
    priceUpdates: number
    arbAlerts: number
    wsConnected: boolean
    alertTimestamps: Set<string>
    nrEventIds: Set<string>
  } | null>(null)

  const addFeed = useCallback((entries: FeedEntry[]) => {
    if (entries.length === 0) return
    setFeed((prev) => [...prev, ...entries].slice(-MAX_FEED))
  }, [])

  const fetchAll = useCallback(async () => {
    const newEntries: FeedEntry[] = []
    const now = timeStr()

    try {
      const [statusRes, alertsRes, nrStatsRes, nrArbRes, walletRes] = await Promise.allSettled([
        getScannerStatus(),
        getAlerts(5, 0),
        getNegRiskStats(),
        getNegRiskArb(),
        getWalletStatus(),
      ])

      if (statusRes.status === 'fulfilled') {
        const s = statusRes.value
        setStatus(s)

        const prev = prevRef.current
        if (prev) {
          const priceDelta = s.scanner.priceUpdates - prev.priceUpdates
          if (priceDelta > 0) {
            newEntries.push({
              id: nextId(), time: now, type: 'price',
              message: `${priceDelta.toLocaleString()}개 가격 업데이트 수신 (${s.scanner.markets} 마켓)`,
            })
          }
          const alertDelta = s.scanner.arbitrageAlerts - prev.arbAlerts
          if (alertDelta > 0) {
            newEntries.push({
              id: nextId(), time: now, type: 'alert',
              message: `새 Pure Arb 기회 ${alertDelta}건 감지`,
            })
          }
          if (s.scanner.wsConnected !== prev.wsConnected) {
            newEntries.push({
              id: nextId(), time: now,
              type: s.scanner.wsConnected ? 'info' : 'error',
              message: s.scanner.wsConnected
                ? 'Polymarket WebSocket 연결됨'
                : 'Polymarket WebSocket 연결 끊김',
            })
          }
        } else {
          newEntries.push({
            id: nextId(), time: now, type: 'info',
            message: `시스템 연결 완료 — ${s.scanner.markets} 마켓 모니터링 중${s.scanner.wsConnected ? ', WS 활성' : ''}`,
          })
        }

        prevRef.current = {
          priceUpdates: s.scanner.priceUpdates,
          arbAlerts: s.scanner.arbitrageAlerts,
          wsConnected: s.scanner.wsConnected,
          alertTimestamps: prevRef.current?.alertTimestamps ?? new Set(),
          nrEventIds: prevRef.current?.nrEventIds ?? new Set(),
        }
      }

      if (alertsRes.status === 'fulfilled') {
        const alerts = alertsRes.value.alerts
        setRecentAlerts(alerts)

        const prevTs = prevRef.current?.alertTimestamps ?? new Set<string>()
        for (const a of alerts) {
          if (!prevTs.has(a.timestamp)) {
            newEntries.push({
              id: nextId(), time: now, type: 'alert',
              message: `[Pure Arb] ${a.market} — ${(a.profitPct ?? 0).toFixed(2)}% 수익`,
            })
          }
        }
        if (prevRef.current) {
          prevRef.current.alertTimestamps = new Set(alerts.map((a) => a.timestamp))
        }
      }

      if (nrStatsRes.status === 'fulfilled') setNrStats(nrStatsRes.value)
      if (walletRes.status === 'fulfilled') setWallet(walletRes.value)

      if (nrArbRes.status === 'fulfilled') {
        const opps = nrArbRes.value.opportunities.slice(0, 5)
        setNrOpps(opps)

        const prevIds = prevRef.current?.nrEventIds ?? new Set<string>()
        for (const o of opps) {
          if (!prevIds.has(o.eventId)) {
            newEntries.push({
              id: nextId(), time: now, type: 'negrisk',
              message: `[NegRisk] ${(o.eventTitle ?? '').slice(0, 50)} — ROI ${(o.roiPct ?? 0).toFixed(2)}%`,
            })
          }
        }
        if (prevRef.current) {
          prevRef.current.nrEventIds = new Set(opps.map((o) => o.eventId))
        }
      }
    } catch {
      newEntries.push({
        id: nextId(), time: now, type: 'error',
        message: '서버 연결 실패 — 재시도 대기 중...',
      })
    } finally {
      setLoading(false)
    }

    addFeed(newEntries)
  }, [addFeed])

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, POLL_INTERVAL)
    return () => clearInterval(iv)
  }, [fetchAll])

  const wsConnected = status?.scanner.wsConnected ?? false

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-dark-100">대시보드</h2>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-0.5">
            시스템 상태 및 실시간 활동 모니터링
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setLoading(true); fetchAll() }}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-dark-700 text-gray-600 dark:text-dark-400 hover:bg-gray-100 dark:hover:bg-dark-800 transition-colors"
        >
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Pure Arb 스캐너"
          value={wsConnected ? '연결됨' : '끊김'}
          icon={wsConnected
            ? <Wifi className="size-5" />
            : <WifiOff className="size-5" />
          }
        />
        <StatCard
          title="NegRisk 스캐너"
          value={nrStats ? `${nrStats.opportunitiesInMemory}개 기회` : '로딩...'}
          icon={<Radio className="size-5" />}
        />
        <StatCard
          title="모니터링 마켓"
          value={status ? status.scanner.markets.toLocaleString() : '—'}
          icon={<BarChart3 className="size-5" />}
        />
        <StatCard
          title="지갑"
          value={wallet?.connected
            ? `$${(wallet.usdcBalance ?? 0).toFixed(2)}`
            : '미연결'
          }
          icon={<Wallet className="size-5" />}
        />
      </div>

      {/* Live Activity Feed */}
      <ActivityFeed entries={feed} maxHeight="340px" />

      {/* Recent alerts 2-col */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pure Arb Alerts */}
        <div className="card">
          <div className="card-body">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-dark-200 flex items-center gap-2">
                <Zap className="size-4 text-yellow-500" />
                Pure Arb 최근 알림
              </h3>
              <Link
                to="/arb"
                className="text-xs text-primary-500 hover:text-primary-600 flex items-center gap-1"
              >
                전체 보기 <ArrowRight className="size-3" />
              </Link>
            </div>
            {recentAlerts.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-dark-500 text-center py-6">
                감지된 알림이 없습니다
              </p>
            ) : (
              <div className="space-y-2">
                {recentAlerts.map((a, i) => (
                  <div
                    key={a.timestamp + i}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-dark-800/50 border-l-3 border-green-500"
                  >
                    <div className="min-w-0 flex-1 mr-3">
                      <p className="text-sm text-gray-700 dark:text-dark-200 truncate font-medium">
                        {a.market}
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-dark-500">
                        {new Date(a.timestamp).toLocaleTimeString()} · Yes {(a.yesAsk ?? 0).toFixed(2)}¢ + No {(a.noAsk ?? 0).toFixed(2)}¢
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-green-500 whitespace-nowrap">
                      +{(a.profitPct ?? 0).toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* NegRisk Opportunities */}
        <div className="card">
          <div className="card-body">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-dark-200 flex items-center gap-2">
                <TrendingUp className="size-4 text-cyan-500" />
                NegRisk 기회 Top 5
              </h3>
              <Link
                to="/negrisk"
                className="text-xs text-primary-500 hover:text-primary-600 flex items-center gap-1"
              >
                전체 보기 <ArrowRight className="size-3" />
              </Link>
            </div>
            {nrOpps.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-dark-500 text-center py-6">
                감지된 기회가 없습니다
              </p>
            ) : (
              <div className="space-y-2">
                {nrOpps.map((o) => (
                  <Link
                    key={o.eventId}
                    to={`/negrisk/${o.eventId}`}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-dark-800/50 border-l-3 border-cyan-500 hover:bg-gray-100 dark:hover:bg-dark-800 transition-colors"
                  >
                    <div className="min-w-0 flex-1 mr-3">
                      <p className="text-sm text-gray-700 dark:text-dark-200 truncate font-medium">
                        {o.eventTitle}
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-dark-500">
                        {o.strategy === 'YES_ARB' ? 'YES Arb' : 'NO Convert'} · {o.numOutcomes ?? 0} 아웃컴 · Score {(o.score ?? 0).toFixed(1)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-cyan-500 whitespace-nowrap">
                      +{(o.roiPct ?? 0).toFixed(2)}%
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
