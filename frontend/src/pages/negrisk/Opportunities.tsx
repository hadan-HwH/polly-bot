import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import {
  TrendingUp, DollarSign, BarChart3, Target, RefreshCw, Play, Loader2,
  Eye, AlertTriangle, CheckCircle, Zap,
} from 'lucide-react'
import { DataTable, StatCard, StatusBadge, ScannerInfoBanner, AppModal, AppTabs, type TabItem, EventAccordion, groupBy } from '@components/ui'
import { showToast } from '@components/ui/AppToast'
import { StrategyBadge } from '@components/negrisk'
import { getNegRiskArb, getNegRiskEvents, getNegRiskNearMiss, getNegRiskExecutions, getNegRiskStats } from '@lib/api/negrisk'
import { getWalletStatus } from '@lib/api/wallet'
import { executeNegRisk, type NegRiskExecutionResult } from '@lib/api/execution'
import type {
  ArbOpportunity, NegRiskEvent, NegRiskEventsResponse, StrategyType,
  NegRiskNearMiss, NegRiskExecution, NegRiskStatsResponse,
} from '@src/types/negrisk'

const POLL_INTERVAL = 30_000

export default function Opportunities() {
  const navigate = useNavigate()
  const [opportunities, setOpportunities] = useState<ArbOpportunity[]>([])
  const [eventsData, setEventsData] = useState<NegRiskEventsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [strategyFilter, setStrategyFilter] = useState<StrategyType | 'ALL'>('ALL')
  const [groupByEvent, setGroupByEvent] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const [nearMisses, setNearMisses] = useState<NegRiskNearMiss[]>([])
  const [nearMissTotal, setNearMissTotal] = useState(0)
  const [executions, setExecutions] = useState<NegRiskExecution[]>([])
  const [executionsTotal, setExecutionsTotal] = useState(0)
  const [detectorStats, setDetectorStats] = useState<NegRiskStatsResponse | null>(null)

  const [walletConnected, setWalletConnected] = useState(false)
  const [executeModalOpen, setExecuteModalOpen] = useState(false)
  const [selectedOpp, setSelectedOpp] = useState<ArbOpportunity | null>(null)
  const [jQuantity, setJQuantity] = useState(10)
  const [slippageTolerance, setSlippageTolerance] = useState(0.02)
  const [executing, setExecuting] = useState(false)
  const [executionResult, setExecutionResult] = useState<NegRiskExecutionResult | null>(null)

  useEffect(() => {
    getWalletStatus().then((s) => setWalletConnected(s.connected)).catch(() => {})
  }, [])

  const openExecuteModal = (opp: ArbOpportunity) => {
    setSelectedOpp(opp)
    setJQuantity(Math.min(opp.jMax, 50))
    setExecutionResult(null)
    setExecuteModalOpen(true)
  }

  const handleExecute = async () => {
    if (!selectedOpp) return
    setExecuting(true)
    try {
      const result = await executeNegRisk({
        eventId: selectedOpp.eventId,
        strategy: selectedOpp.strategy,
        jQuantity,
        slippageTolerance,
      })
      setExecutionResult(result)
      if (result.status === 'filled' || result.status === 'simulated') {
        showToast('success', `Execution ${result.status}: $${result.netProfit.toFixed(4)} net profit`)
      } else {
        showToast('warning', `Execution ${result.status}`)
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Execution failed')
    } finally {
      setExecuting(false)
    }
  }

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const [arbRes, eventsRes, nearMissRes, execRes, statsRes] = await Promise.all([
        getNegRiskArb(),
        getNegRiskEvents(),
        getNegRiskNearMiss(),
        getNegRiskExecutions(),
        getNegRiskStats(),
      ])
      setOpportunities(arbRes.opportunities)
      setEventsData(eventsRes)
      setNearMisses(nearMissRes.nearMisses)
      setNearMissTotal(nearMissRes.count)
      setExecutions(execRes.executions)
      setExecutionsTotal(execRes.count)
      setDetectorStats(statsRes)
      setLastRefresh(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchData])

  const filtered = useMemo(
    () =>
      strategyFilter === 'ALL'
        ? opportunities
        : opportunities.filter((o) => o.strategy === strategyFilter),
    [opportunities, strategyFilter],
  )

  const stats = useMemo(() => {
    if (opportunities.length === 0) {
      return {
        total: 0,
        bestRoi: 0,
        avgProfit: 0,
        yesCount: 0,
        noCount: 0,
        totalEvents: eventsData?.count ?? 0,
      }
    }
    const bestRoi = Math.max(...opportunities.map((o) => o.roiPct))
    const avgProfit =
      opportunities.reduce((s, o) => s + o.netProfitUsd, 0) / opportunities.length
    const yesCount = opportunities.filter((o) => o.strategy === 'YES_ARB').length
    const noCount = opportunities.filter((o) => o.strategy === 'NO_CONVERT_ARB').length
    return {
      total: opportunities.length,
      bestRoi,
      avgProfit,
      yesCount,
      noCount,
      totalEvents: eventsData?.count ?? 0,
    }
  }, [opportunities, eventsData])

  const columns = useMemo<ColumnDef<ArbOpportunity, unknown>[]>(
    () => [
      {
        accessorKey: 'rank',
        header: '#',
        cell: ({ getValue }) => (
          <span className="font-mono text-gray-500 dark:text-dark-400">
            {getValue() as number}
          </span>
        ),
        size: 50,
      },
      {
        accessorKey: 'eventTitle',
        header: 'Event',
        cell: ({ row, getValue }) => (
          <Link
            to={`/negrisk/${row.original.eventId}`}
            className="text-sm font-medium truncate max-w-[250px] inline-block text-primary-600 dark:text-primary-400 hover:underline"
            title={getValue() as string}
            onClick={(e) => e.stopPropagation()}
          >
            {getValue() as string}
          </Link>
        ),
      },
      {
        accessorKey: 'strategy',
        header: 'Strategy',
        cell: ({ getValue }) => (
          <StrategyBadge strategy={getValue() as StrategyType} />
        ),
      },
      {
        accessorKey: 'numOutcomes',
        header: 'k',
        cell: ({ row }) => {
          const total = row.original.numOutcomes
          const active = row.original.activeOutcomes ?? total
          return (
            <span className="font-mono">
              {active < total ? (
                <span title={`${active} active / ${total} total`}>
                  <span className="text-green-600 dark:text-green-400">{active}</span>
                  <span className="text-gray-400">/{total}</span>
                </span>
              ) : (
                total
              )}
            </span>
          )
        },
        size: 70,
      },
      {
        accessorKey: 'priceSum',
        header: 'Σ Price',
        cell: ({ row }) => (
          <span className="font-mono text-sm">
            {row.original.priceSum.toFixed(4)} / {row.original.threshold.toFixed(2)}
          </span>
        ),
      },
      {
        accessorKey: 'margin',
        header: 'Margin',
        cell: ({ row }) => (
          <div>
            <span className="font-mono text-sm text-green-600 dark:text-green-400">
              ${row.original.margin.toFixed(4)}
            </span>
            <span className="text-xs text-gray-400 dark:text-dark-500 ml-1">
              ({(row.original.roiPct * 100).toFixed(1)}%)
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'roiPct',
        header: 'ROI',
        cell: ({ getValue }) => {
          const roi = getValue() as number
          const color =
            roi > 0.05
              ? 'text-green-600 dark:text-green-400'
              : roi > 0.02
                ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-gray-600 dark:text-dark-300'
          return (
            <span className={`font-mono text-sm font-semibold ${color}`}>
              {(roi * 100).toFixed(2)}%
            </span>
          )
        },
      },
      {
        accessorKey: 'jMax',
        header: 'j_max',
        cell: ({ getValue }) => (
          <span className="font-mono text-sm">
            {(getValue() as number).toLocaleString()}
          </span>
        ),
      },
      {
        id: 'estCost',
        header: 'Est. Cost',
        cell: ({ row }) => (
          <span className="font-mono text-sm text-blue-600 dark:text-blue-400">
            ${(row.original.jMax * row.original.priceSum).toFixed(2)}
          </span>
        ),
        size: 100,
      },
      {
        accessorKey: 'netProfitUsd',
        header: 'Net Profit',
        cell: ({ getValue }) => {
          const profit = getValue() as number
          return (
            <span
              className={`font-mono text-sm font-semibold ${
                profit > 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              ${profit.toFixed(2)}
            </span>
          )
        },
      },
      {
        accessorKey: 'endDate',
        header: '정산일',
        cell: ({ getValue }) => {
          const endDate = getValue() as string | null
          if (!endDate) return <span className="text-gray-400">-</span>
          const end = new Date(endDate)
          const now = new Date()
          const diffMs = end.getTime() - now.getTime()
          const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
          const color =
            daysLeft <= 3
              ? 'text-green-600 dark:text-green-400'
              : daysLeft <= 7
                ? 'text-yellow-600 dark:text-yellow-400'
                : daysLeft <= 14
                  ? 'text-orange-600 dark:text-orange-400'
                  : 'text-gray-500 dark:text-dark-400'
          return (
            <div className="text-xs">
              <span className={`font-semibold ${color}`}>
                D-{daysLeft > 0 ? daysLeft : 0}
              </span>
              <div className="text-gray-400 dark:text-dark-500">
                {end.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
              </div>
            </div>
          )
        },
        size: 80,
      },
      {
        accessorKey: 'score',
        header: 'Score',
        cell: ({ getValue }) => {
          const score = getValue() as number
          return (
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 bg-gray-200 dark:bg-dark-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary-500"
                  style={{ width: `${Math.min(score * 100, 100)}%` }}
                />
              </div>
              <span className="text-xs font-mono text-gray-500 dark:text-dark-400">
                {(score * 100).toFixed(0)}
              </span>
            </div>
          )
        },
      },
      {
        accessorKey: 'isSafe',
        header: 'Status',
        cell: ({ getValue }) =>
          getValue() ? (
            <StatusBadge label="Safe" variant="success" dot />
          ) : (
            <StatusBadge label="Risky" variant="warning" dot />
          ),
      },
      {
        id: 'execute',
        header: '',
        cell: ({ row }) => (
          <button
            className="btn btn-xs btn-primary flex items-center gap-1"
            disabled={!walletConnected}
            onClick={(e) => {
              e.stopPropagation()
              openExecuteModal(row.original)
            }}
            title={walletConnected ? 'Execute trade' : 'Connect wallet first'}
          >
            <Play className="size-3" />
            Execute
          </button>
        ),
        size: 90,
      },
    ],
    [walletConnected],
  )

  const handleRowClick = useCallback(
    (row: ArbOpportunity) => {
      navigate(`/negrisk/${row.eventId}`)
    },
    [navigate],
  )

  const handleEventRowClick = useCallback(
    (row: NegRiskEvent) => {
      navigate(`/negrisk/${row.eventId}`)
    },
    [navigate],
  )

  const CoverageBar = ({ pct, label }: { pct: number; label: string }) => {
    const color = pct >= 1 ? 'bg-green-500' : pct >= 0.5 ? 'bg-yellow-500' : 'bg-red-400'
    return (
      <div className="flex items-center gap-2">
        <div className="w-12 h-1.5 bg-gray-200 dark:bg-dark-700 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct * 100}%` }} />
        </div>
        <span className={`text-xs font-mono ${pct >= 1 ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-500 dark:text-dark-400'}`}>
          {label}
        </span>
      </div>
    )
  }

  const eventColumns = useMemo<ColumnDef<NegRiskEvent, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Event',
        cell: ({ row, getValue }) => (
          <Link
            to={`/negrisk/${row.original.eventId}`}
            className="text-sm font-medium truncate max-w-[280px] inline-block text-primary-600 dark:text-primary-400 hover:underline"
            title={getValue() as string}
            onClick={(e) => e.stopPropagation()}
          >
            {getValue() as string}
          </Link>
        ),
      },
      {
        accessorKey: 'numOutcomes',
        header: 'k',
        cell: ({ row }) => {
          const total = row.original.numOutcomes
          const activeNo = row.original.activeOutcomesNo ?? total
          const hasResolved = activeNo < total
          return (
            <span className="font-mono">
              {hasResolved ? (
                <span title={`${activeNo} active / ${total} total`}>
                  <span className="text-green-600 dark:text-green-400">{activeNo}</span>
                  <span className="text-gray-400">/{total}</span>
                </span>
              ) : (
                total
              )}
            </span>
          )
        },
        size: 70,
      },
      {
        id: 'noCoverage',
        header: 'NO Ask',
        cell: ({ row }) => (
          <CoverageBar pct={row.original.noCoveragePct} label={row.original.noCoverage} />
        ),
      },
      {
        id: 'yesCoverage',
        header: 'YES Ask',
        cell: ({ row }) => (
          <CoverageBar pct={row.original.yesCoveragePct} label={row.original.yesCoverage} />
        ),
      },
      {
        id: 'noSumActive',
        header: 'Σ NO (active)',
        cell: ({ row }) => {
          const sum = row.original.noPriceSumActive ?? row.original.noPriceSum
          const kActive = row.original.activeOutcomesNo ?? row.original.numOutcomes
          if (sum === null || kActive < 2) return <span className="text-xs text-gray-400">—</span>
          const threshold = kActive - 1
          const isMet = sum < threshold
          return (
            <span className={`font-mono text-xs ${isMet ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-500 dark:text-dark-400'}`}>
              {sum.toFixed(3)} / {threshold}
            </span>
          )
        },
      },
      {
        id: 'yesSumActive',
        header: 'Σ YES (active)',
        cell: ({ row }) => {
          const sum = row.original.yesPriceSumActive ?? row.original.yesPriceSum
          if (sum === null) return <span className="text-xs text-gray-400">—</span>
          const isMet = sum < 1
          return (
            <span className={`font-mono text-xs ${isMet ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-500 dark:text-dark-400'}`}>
              {sum.toFixed(3)} / 1.00
            </span>
          )
        },
      },
      {
        id: 'status',
        header: 'Arb',
        cell: ({ row }) => {
          const noSum = row.original.noPriceSumActive ?? row.original.noPriceSum
          const kActiveNo = row.original.activeOutcomesNo ?? row.original.numOutcomes
          const yesSum = row.original.yesPriceSumActive ?? row.original.yesPriceSum
          const noMet = noSum !== null && kActiveNo > 1 && noSum < kActiveNo - 1
          const yesMet = yesSum !== null && yesSum < 1
          if (noMet && yesMet) return <StatusBadge label="BOTH" variant="info" dot />
          if (noMet) return <StatusBadge label="NO" variant="success" dot />
          if (yesMet) return <StatusBadge label="YES" variant="primary" dot />
          return <span className="text-xs text-gray-400">—</span>
        },
        size: 70,
      },
    ],
    [],
  )

  const nearMissColumns = useMemo<ColumnDef<NegRiskNearMiss, unknown>[]>(
    () => [
      {
        accessorKey: 'timestamp',
        header: 'Time',
        cell: ({ getValue }) => (
          <span className="text-xs text-gray-500 dark:text-dark-400 whitespace-nowrap">
            {new Date(getValue() as string).toLocaleTimeString()}
          </span>
        ),
        size: 90,
      },
      {
        accessorKey: 'eventTitle',
        header: 'Event',
        cell: ({ row, getValue }) => (
          <Link
            to={`/negrisk/${row.original.eventId}`}
            className="text-sm font-medium truncate max-w-[220px] inline-block text-primary-600 dark:text-primary-400 hover:underline"
            title={getValue() as string}
            onClick={(e) => e.stopPropagation()}
          >
            {getValue() as string}
          </Link>
        ),
      },
      {
        accessorKey: 'strategy',
        header: 'Strategy',
        cell: ({ getValue }) => (
          <StrategyBadge strategy={getValue() as StrategyType} />
        ),
      },
      {
        accessorKey: 'numOutcomes',
        header: 'k',
        cell: ({ getValue }) => <span className="font-mono">{getValue() as number}</span>,
        size: 50,
      },
      {
        id: 'priceInfo',
        header: 'Σ Price / Threshold',
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.priceSum.toFixed(4)} / {row.original.threshold.toFixed(2)}
          </span>
        ),
      },
      {
        accessorKey: 'margin',
        header: 'Margin',
        cell: ({ getValue }) => (
          <span className="font-mono text-sm text-yellow-600 dark:text-yellow-400">
            ${(getValue() as number).toFixed(4)}
          </span>
        ),
      },
      {
        accessorKey: 'reason',
        header: 'Reason',
        cell: ({ getValue }) => (
          <StatusBadge label={(getValue() as string).replace(/_/g, ' ')} variant="warning" />
        ),
      },
    ],
    [],
  )

  const executionColumns = useMemo<ColumnDef<NegRiskExecution, unknown>[]>(
    () => [
      {
        accessorKey: 'timestamp',
        header: 'Time',
        cell: ({ getValue }) => (
          <span className="text-xs text-gray-500 dark:text-dark-400 whitespace-nowrap">
            {new Date(getValue() as string).toLocaleString()}
          </span>
        ),
        size: 130,
      },
      {
        accessorKey: 'market',
        header: 'Event',
        cell: ({ getValue }) => (
          <span className="text-sm font-medium truncate max-w-[250px] inline-block" title={getValue() as string}>
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const s = getValue() as string
          const variant = s === 'filled' || s === 'simulated'
            ? 'success'
            : s === 'partial' || s === 'partial_hold' || s === 'partial_merge'
              ? 'warning'
              : s === 'failed' || s === 'conversion_failed'
                ? 'danger'
                : 'secondary'
          return <StatusBadge label={s} variant={variant} dot />
        },
        size: 110,
      },
      {
        accessorKey: 'totalCost',
        header: 'Cost',
        cell: ({ getValue }) => (
          <span className="font-mono text-sm">${((getValue() as number) ?? 0).toFixed(2)}</span>
        ),
        size: 90,
      },
      {
        accessorKey: 'expectedProfit',
        header: 'Profit',
        cell: ({ getValue }) => {
          const p = (getValue() as number) ?? 0
          return (
            <span className={`font-mono text-sm ${p > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              ${p.toFixed(4)}
            </span>
          )
        },
        size: 100,
      },
      {
        accessorKey: 'profitPct',
        header: 'ROI',
        cell: ({ getValue }) => (
          <span className="font-mono text-sm">{((getValue() as number) ?? 0).toFixed(2)}%</span>
        ),
        size: 80,
      },
    ],
    [],
  )

  const tabs: TabItem[] = useMemo(
    () => [
      {
        key: 'opportunities',
        label: `기회 (${filtered.length})`,
        icon: <Zap className="size-4" />,
        content: (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {(['ALL', 'YES_ARB', 'NO_CONVERT_ARB'] as const).map((f) => (
                  <button
                    key={f}
                    className={`btn btn-xs ${
                      strategyFilter === f ? 'btn-primary' : 'btn-outline-gray'
                    }`}
                    onClick={() => setStrategyFilter(f)}
                  >
                    {f === 'ALL' ? 'All' : f === 'YES_ARB' ? 'YES ARB' : 'NO CONVERT'}
                  </button>
                ))}
              </div>
              <button
                className={`btn btn-xs ${groupByEvent ? 'btn-primary' : 'btn-outline-gray'}`}
                onClick={() => setGroupByEvent(!groupByEvent)}
              >
                {groupByEvent ? '이벤트 그룹' : '플랫 리스트'}
              </button>
            </div>
            {groupByEvent && filtered.length > 0 ? (
              <EventAccordion
                groups={groupBy(
                  filtered,
                  (o) => o.eventId,
                  (o) => o.eventTitle,
                  (items) => {
                    const bestRoi = Math.max(...items.map((o) => o.roiPct))
                    const totalProfit = items.reduce((s, o) => s + o.netProfitUsd, 0)
                    return (
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-green-600 dark:text-green-400">
                          {(bestRoi * 100).toFixed(1)}% ROI
                        </span>
                        <span className="text-xs font-mono text-gray-500 dark:text-dark-400">
                          ${totalProfit.toFixed(2)}
                        </span>
                      </div>
                    )
                  },
                )}
                renderGroup={(items) => (
                  <div className="divide-y divide-gray-100 dark:divide-dark-700">
                    {items.map((opp) => (
                      <div
                        key={`${opp.eventId}-${opp.strategy}`}
                        className={`flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-800 transition-colors ${
                          !opp.isSafe ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : ''
                        }`}
                        onClick={() => handleRowClick(opp)}
                      >
                        <span className="text-xs text-gray-400 dark:text-dark-500 whitespace-nowrap" title={new Date(opp.timestamp).toLocaleString()}>
                          {new Date(opp.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>

                        <StrategyBadge strategy={opp.strategy} />

                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-gray-400 dark:text-dark-500">Σ</span>
                          <span className="font-mono">{opp.priceSum.toFixed(4)}</span>
                          <span className="text-gray-400">/</span>
                          <span className="font-mono">{opp.threshold.toFixed(2)}</span>
                        </div>

                        <span className={`font-mono text-sm font-semibold ${
                          opp.roiPct > 0.05
                            ? 'text-green-600 dark:text-green-400'
                            : opp.roiPct > 0.02
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-gray-600 dark:text-dark-300'
                        }`}>
                          {(opp.roiPct * 100).toFixed(2)}% ROI
                        </span>

                        <span className="font-mono text-xs text-gray-500 dark:text-dark-400">
                          j≤{opp.jMax.toLocaleString()}
                        </span>

                        <span className="font-mono text-xs text-blue-600 dark:text-blue-400" title="Estimated cost at j_max">
                          Cost ${(opp.jMax * opp.priceSum).toFixed(2)}
                        </span>

                        {opp.endDate ? (() => {
                          const daysLeft = Math.ceil((new Date(opp.endDate).getTime() - Date.now()) / 86_400_000)
                          const color =
                            daysLeft <= 3 ? 'text-green-600 dark:text-green-400'
                            : daysLeft <= 7 ? 'text-yellow-600 dark:text-yellow-400'
                            : daysLeft <= 14 ? 'text-orange-600 dark:text-orange-400'
                            : 'text-gray-500 dark:text-dark-400'
                          return (
                            <span className={`text-xs font-semibold ${color}`} title={new Date(opp.endDate).toLocaleDateString()}>
                              D-{Math.max(daysLeft, 0)}
                            </span>
                          )
                        })() : (
                          <span className="text-xs text-gray-400">—</span>
                        )}

                        <span className={`font-mono text-sm font-semibold ${
                          opp.netProfitUsd > 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          ${opp.netProfitUsd.toFixed(2)}
                        </span>

                        {opp.isSafe ? (
                          <StatusBadge label="Safe" variant="success" dot />
                        ) : (
                          <StatusBadge label="Risky" variant="warning" dot />
                        )}

                        <button
                          className="btn btn-xs btn-primary flex items-center gap-1 ml-auto"
                          disabled={!walletConnected}
                          onClick={(e) => {
                            e.stopPropagation()
                            openExecuteModal(opp)
                          }}
                          title={walletConnected ? 'Execute trade' : 'Connect wallet first'}
                        >
                          <Play className="size-3" />
                          Execute
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                defaultExpanded
              />
            ) : (
              <DataTable
                columns={columns}
                data={filtered}
                searchable
                paginated
                pageSize={25}
                searchPlaceholder="Search events..."
                emptyMessage="No arbitrage opportunities detected"
                onRowClick={handleRowClick}
                getRowClassName={(row) =>
                  !row.isSafe ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : ''
                }
              />
            )}
          </div>
        ),
      },
      {
        key: 'near-miss',
        label: `Near Miss (${nearMissTotal})`,
        icon: <AlertTriangle className="size-4" />,
        content: (
          <div>
            <p className="text-xs text-gray-400 dark:text-dark-500 mb-3">
              Threshold 조건은 충족했지만 안전 마진 / ROI / 유동성 등으로 탈락한 기회
            </p>
            <DataTable
              columns={nearMissColumns}
              data={nearMisses}
              paginated
              pageSize={20}
              emptyMessage="No near-miss events"
            />
          </div>
        ),
      },
      {
        key: 'executions',
        label: `실행 내역 (${executionsTotal})`,
        icon: <CheckCircle className="size-4" />,
        content: (
          <DataTable
            columns={executionColumns}
            data={executions}
            paginated
            pageSize={20}
            emptyMessage="No NegRisk executions yet"
          />
        ),
      },
      {
        key: 'diagnostics',
        label: '분석/진단',
        icon: <Eye className="size-4" />,
        content: (
          <div className="space-y-6">
            {detectorStats && (
              <div>
                <h6 className="text-sm font-semibold text-gray-700 dark:text-dark-200 mb-3">
                  탐지기 통계
                </h6>
                <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-5 gap-3">
                  {Object.entries(detectorStats.detector).map(([key, val]) => (
                    <div key={key} className="p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                      <p className="text-xs text-gray-500 dark:text-dark-400 truncate" title={key}>
                        {key.replace(/_/g, ' ')}
                      </p>
                      <p className="text-lg font-semibold font-mono">{val}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {eventsData && eventsData.events.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Eye className="size-4 text-gray-500 dark:text-dark-400" />
                  <h6 className="text-sm font-semibold text-gray-700 dark:text-dark-200">
                    모니터링 이벤트 — 가격 커버리지
                  </h6>
                  <span className="text-xs text-gray-400 dark:text-dark-500">
                    {eventsData.count} events
                  </span>
                </div>
                <p className="text-xs text-gray-400 dark:text-dark-500 mb-3">
                  Resolved 아웃컴(가격 0/None)은 자동 제외되며 k_active 기준으로 차익거래 조건을 평가합니다
                </p>
                <DataTable
                  columns={eventColumns}
                  data={eventsData.events}
                  searchable
                  paginated
                  pageSize={15}
                  searchPlaceholder="Search events..."
                  emptyMessage="No events being monitored"
                  onRowClick={handleEventRowClick}
                  getRowClassName={(row) => {
                    const noFull = row.noCoveragePct >= 1
                    const yesFull = row.yesCoveragePct >= 1
                    if (noFull || yesFull) return 'bg-green-50/50 dark:bg-green-900/10'
                    return ''
                  }}
                />
              </div>
            )}
          </div>
        ),
      },
    ],
    [
      filtered, columns, strategyFilter, handleRowClick, groupByEvent,
      nearMisses, nearMissTotal, nearMissColumns,
      executions, executionsTotal, executionColumns,
      eventsData, eventColumns, handleEventRowClick, detectorStats,
      walletConnected, navigate,
    ],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="spin-loader text-primary-500 size-8" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h5 className="text-lg font-semibold text-gray-800 dark:text-dark-100">
            NegRisk 차익거래 기회
          </h5>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-0.5">
            실시간 NegRisk 이벤트 차익거래 기회 탐지 &middot;{' '}
            {stats.totalEvents} events tracked
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-gray-400 dark:text-dark-500">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            className="btn btn-sm btn-outline-primary flex items-center gap-1.5"
            onClick={fetchData}
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </button>
        </div>
      </div>

      <ScannerInfoBanner variant="negRisk" />

      {error && (
        <div className="mt-4 mb-6 p-4 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
          {error}
          <button className="ml-3 underline" onClick={fetchData}>
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mt-5 mb-6">
        <StatCard
          title="Total Opportunities"
          value={stats.total}
          icon={<Target className="size-5" />}
        />
        <StatCard
          title="Best ROI"
          value={stats.total > 0 ? `${(stats.bestRoi * 100).toFixed(2)}%` : '—'}
          icon={<TrendingUp className="size-5" />}
        />
        <StatCard
          title="Avg Net Profit"
          value={stats.total > 0 ? `$${stats.avgProfit.toFixed(2)}` : '—'}
          icon={<DollarSign className="size-5" />}
        />
        <StatCard
          title="Strategy Mix"
          value={`${stats.yesCount}Y / ${stats.noCount}N`}
          icon={<BarChart3 className="size-5" />}
        />
      </div>

      <div className="card">
        <div className="card-body">
          <AppTabs tabs={tabs} />
        </div>
      </div>

      <AppModal
        isOpen={executeModalOpen}
        onClose={() => setExecuteModalOpen(false)}
        title="Execute NegRisk Arbitrage"
        size="lg"
        footer={
          executionResult ? (
            <button className="btn btn-primary" onClick={() => setExecuteModalOpen(false)}>
              Close
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button className="btn btn-outline-gray" onClick={() => setExecuteModalOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary flex items-center gap-1.5"
                onClick={handleExecute}
                disabled={executing}
              >
                {executing ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                {executing ? 'Executing...' : 'Confirm Execute'}
              </button>
            </div>
          )
        }
      >
        {selectedOpp && !executionResult && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-dark-800">
              <p className="text-sm font-medium text-gray-700 dark:text-dark-200 mb-1">{selectedOpp.eventTitle}</p>
              <div className="flex items-center gap-3 mt-2">
                <StrategyBadge strategy={selectedOpp.strategy} />
                <span className="text-xs text-gray-500">k = {selectedOpp.numOutcomes}</span>
                <span className="text-xs text-green-600 dark:text-green-400 font-mono">
                  ROI: {(selectedOpp.roiPct * 100).toFixed(2)}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">
                  Quantity (j)
                </label>
                <input
                  type="number"
                  className="form-input w-full text-sm"
                  value={jQuantity}
                  min={1}
                  max={selectedOpp.jMax}
                  onChange={(e) => setJQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <p className="text-xs text-gray-400 mt-1">Max: {selectedOpp.jMax.toLocaleString()}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">
                  Slippage Tolerance
                </label>
                <input
                  type="number"
                  className="form-input w-full text-sm"
                  value={slippageTolerance}
                  min={0.001}
                  max={0.1}
                  step={0.005}
                  onChange={(e) => setSlippageTolerance(parseFloat(e.target.value) || 0.02)}
                />
                <p className="text-xs text-gray-400 mt-1">{(slippageTolerance * 100).toFixed(1)}%</p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Est. Cost</p>
                  <p className="text-sm font-semibold font-mono">
                    ${(jQuantity * selectedOpp.priceSum).toFixed(4)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Est. Revenue</p>
                  <p className="text-sm font-semibold font-mono">
                    ${(jQuantity * selectedOpp.threshold).toFixed(4)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-green-600 dark:text-green-400">Est. Profit</p>
                  <p className="text-sm font-semibold font-mono text-green-600 dark:text-green-400">
                    ${(jQuantity * selectedOpp.margin).toFixed(4)}
                  </p>
                </div>
              </div>
            </div>

            {!selectedOpp.isSafe && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
                This opportunity is marked as Risky — margin is close to safety threshold.
              </div>
            )}
          </div>
        )}

        {executionResult && (
          <div className="space-y-4">
            <div className={`p-4 rounded-lg border ${
              executionResult.status === 'filled' || executionResult.status === 'simulated'
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : executionResult.status === 'partial'
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <StatusBadge
                  label={executionResult.status.toUpperCase()}
                  variant={executionResult.status === 'filled' || executionResult.status === 'simulated' ? 'success' : executionResult.status === 'partial' ? 'warning' : 'danger'}
                />
                {executionResult.dryRun && (
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400">
                    DRY RUN
                  </span>
                )}
                <span className="text-xs text-gray-400 ml-auto">{executionResult.timingMs}ms</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center mt-3">
                <div>
                  <p className="text-xs text-gray-500">Cost</p>
                  <p className="text-sm font-semibold font-mono">${executionResult.totalCost.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Gas</p>
                  <p className="text-sm font-semibold font-mono">${executionResult.gasCost.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-xs text-green-600 dark:text-green-400">Net Profit</p>
                  <p className="text-sm font-semibold font-mono text-green-600 dark:text-green-400">
                    ${executionResult.netProfit.toFixed(4)}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h6 className="text-xs font-medium text-gray-500 dark:text-dark-400 mb-2">Orders</h6>
              <div className="space-y-1.5">
                {executionResult.orders.map((o, i) => (
                  <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-gray-50 dark:bg-dark-800">
                    <span className="font-mono text-gray-500">{o.tokenId}</span>
                    <span>${o.price.toFixed(4)} x {o.size}</span>
                    <StatusBadge
                      label={o.status}
                      variant={o.status === 'filled' || o.status === 'simulated' ? 'success' : o.status === 'failed' ? 'danger' : 'warning'}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </AppModal>
    </div>
  )
}
