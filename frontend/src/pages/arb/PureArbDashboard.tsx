import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Zap, Activity, AlertTriangle, BarChart3, RefreshCw, CheckCircle, XCircle, Play, Loader2 } from 'lucide-react'
import { DataTable, StatCard, AppTabs, StatusBadge, ScannerInfoBanner, AppModal, type TabItem } from '@components/ui'
import { showToast } from '@components/ui/AppToast'
import {
  getScannerStatus,
  getAlerts,
  getNearMissAlerts,
  getOrders,
  getDailyAlertsChart,
  getArbWindowStats,
  type ScannerStatus,
  type ArbAlertItem,
  type NearMissItem,
  type OrderExecution,
  type DailyAlertsChart,
  type ArbWindowStats,
} from '@lib/api/arb'
import { getWalletStatus } from '@lib/api/wallet'
import { executePureArb, type PureArbExecutionResult } from '@lib/api/execution'
import ReactApexChart from 'react-apexcharts'

const POLL_INTERVAL = 15_000

export default function PureArbDashboard() {
  const [status, setStatus] = useState<ScannerStatus | null>(null)
  const [alerts, setAlerts] = useState<ArbAlertItem[]>([])
  const [alertsTotal, setAlertsTotal] = useState(0)
  const [nearMiss, setNearMiss] = useState<NearMissItem[]>([])
  const [nearMissTotal, setNearMissTotal] = useState(0)
  const [executions, setExecutions] = useState<OrderExecution[]>([])
  const [execStats, setExecStats] = useState<{ totalAttempts: number; successful: number; failed: number; successRate: number }>({ totalAttempts: 0, successful: 0, failed: 0, successRate: 0 })
  const [dailyChart, setDailyChart] = useState<DailyAlertsChart | null>(null)
  const [windowStats, setWindowStats] = useState<ArbWindowStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [walletConnected, setWalletConnected] = useState(false)
  const [executeModalOpen, setExecuteModalOpen] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState<ArbAlertItem | null>(null)
  const [tradeSize, setTradeSize] = useState(50)
  const [executing, setExecuting] = useState(false)
  const [executionResult, setExecutionResult] = useState<PureArbExecutionResult | null>(null)

  useEffect(() => {
    getWalletStatus().then((s) => setWalletConnected(s.connected)).catch(() => {})
  }, [])

  const openExecuteModal = (alert: ArbAlertItem) => {
    setSelectedAlert(alert)
    setTradeSize(50)
    setExecutionResult(null)
    setExecuteModalOpen(true)
  }

  const handleExecute = async () => {
    if (!selectedAlert || !selectedAlert.conditionId) return
    setExecuting(true)
    try {
      const result = await executePureArb({
        conditionId: selectedAlert.conditionId,
        size: tradeSize,
      })
      setExecutionResult(result)
      if (result.status === 'filled' || result.status === 'simulated') {
        showToast('success', `Execution ${result.status}: $${result.expectedProfit?.toFixed(4) ?? '0'} profit`)
      } else {
        showToast('warning', `Execution ${result.status}`)
      }
      fetchAll()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Execution failed')
    } finally {
      setExecuting(false)
    }
  }

  const fetchAll = useCallback(async () => {
    try {
      setError(null)
      const [statusRes, alertsRes, nearMissRes, ordersRes, chartRes, windowRes] = await Promise.all([
        getScannerStatus(),
        getAlerts(20, 0),
        getNearMissAlerts(20, 0),
        getOrders(50, 0),
        getDailyAlertsChart(7),
        getArbWindowStats(),
      ])
      setStatus(statusRes)
      setAlerts(alertsRes.alerts)
      setAlertsTotal(alertsRes.total)
      setNearMiss(nearMissRes.alerts)
      setNearMissTotal(nearMissRes.total)
      setExecutions(ordersRes.recentExecutions)
      setExecStats(ordersRes.stats)
      setDailyChart(chartRes)
      setWindowStats(windowRes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchAll])

  const alertColumns = useMemo<ColumnDef<ArbAlertItem, unknown>[]>(
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
        accessorKey: 'market',
        header: 'Market',
        cell: ({ row, getValue }) => {
          const name = getValue() as string
          const slug = row.original.slug
          return slug ? (
            <Link
              to={`/markets/${slug}`}
              className="text-sm font-medium truncate max-w-[200px] inline-block text-primary-600 dark:text-primary-400 hover:underline"
              title={name}
              onClick={(e) => e.stopPropagation()}
            >
              {name}
            </Link>
          ) : (
            <span className="text-sm font-medium truncate max-w-[200px] inline-block" title={name}>
              {name}
            </span>
          )
        },
      },
      {
        accessorKey: 'yesAsk',
        header: 'YES Ask',
        cell: ({ getValue }) => <span className="font-mono text-sm">{(((getValue() as number) ?? 0) * 100).toFixed(1)}¢</span>,
        size: 80,
      },
      {
        accessorKey: 'noAsk',
        header: 'NO Ask',
        cell: ({ getValue }) => <span className="font-mono text-sm">{(((getValue() as number) ?? 0) * 100).toFixed(1)}¢</span>,
        size: 80,
      },
      {
        accessorKey: 'combined',
        header: 'Combined',
        cell: ({ getValue }) => <span className="font-mono text-sm">{(((getValue() as number) ?? 0) * 100).toFixed(1)}¢</span>,
        size: 90,
      },
      {
        accessorKey: 'profitPct',
        header: 'Profit %',
        cell: ({ getValue }) => (
          <span className="font-mono text-sm font-semibold text-green-600 dark:text-green-400">
            {(((getValue() as number) ?? 0) * 100).toFixed(2)}%
          </span>
        ),
        size: 90,
      },
      {
        accessorKey: 'yesLiquidity',
        header: 'YES Liq',
        cell: ({ getValue }) => <span className="font-mono text-xs">${((getValue() as number) ?? 0).toFixed(0)}</span>,
        size: 80,
      },
      {
        accessorKey: 'noLiquidity',
        header: 'NO Liq',
        cell: ({ getValue }) => <span className="font-mono text-xs">${((getValue() as number) ?? 0).toFixed(0)}</span>,
        size: 80,
      },
      {
        id: 'execute',
        header: '',
        cell: ({ row }) => (
          <button
            className="btn btn-xs btn-primary flex items-center gap-1"
            disabled={!walletConnected || !row.original.conditionId}
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

  const nearMissColumns = useMemo<ColumnDef<NearMissItem, unknown>[]>(
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
        accessorKey: 'market',
        header: 'Market',
        cell: ({ row, getValue }) => {
          const name = getValue() as string
          const slug = row.original.slug
          return slug ? (
            <Link
              to={`/markets/${slug}`}
              className="text-sm truncate max-w-[200px] inline-block text-primary-600 dark:text-primary-400 hover:underline"
              title={name}
              onClick={(e) => e.stopPropagation()}
            >
              {name}
            </Link>
          ) : (
            <span className="text-sm truncate max-w-[200px] inline-block" title={name}>
              {name}
            </span>
          )
        },
      },
      {
        accessorKey: 'profitPct',
        header: 'Profit %',
        cell: ({ getValue }) => (
          <span className="font-mono text-sm text-yellow-600 dark:text-yellow-400">
            {(((getValue() as number) ?? 0) * 100).toFixed(2)}%
          </span>
        ),
        size: 90,
      },
      {
        accessorKey: 'yesLiquidity',
        header: 'YES Liq',
        cell: ({ getValue }) => <span className="font-mono text-xs">${((getValue() as number) ?? 0).toFixed(0)}</span>,
        size: 80,
      },
      {
        accessorKey: 'noLiquidity',
        header: 'NO Liq',
        cell: ({ getValue }) => <span className="font-mono text-xs">${((getValue() as number) ?? 0).toFixed(0)}</span>,
        size: 80,
      },
      {
        accessorKey: 'minRequired',
        header: 'Min Required',
        cell: ({ getValue }) => <span className="font-mono text-xs">${((getValue() as number) ?? 0).toFixed(0)}</span>,
        size: 100,
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

  const executionColumns = useMemo<ColumnDef<OrderExecution, unknown>[]>(
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
        header: 'Market',
        cell: ({ row, getValue }) => {
          const name = getValue() as string
          const slug = row.original.slug
          return slug ? (
            <Link
              to={`/markets/${slug}`}
              className="text-sm truncate max-w-[180px] inline-block text-primary-600 dark:text-primary-400 hover:underline"
              title={name}
              onClick={(e) => e.stopPropagation()}
            >
              {name}
            </Link>
          ) : (
            <span className="text-sm truncate max-w-[180px] inline-block" title={name}>
              {name}
            </span>
          )
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const s = getValue() as string
          const variant = s === 'filled' ? 'success' : s === 'partial' ? 'warning' : s === 'failed' ? 'danger' : 'secondary'
          return <StatusBadge label={s} variant={variant} dot />
        },
        size: 100,
      },
      {
        accessorKey: 'totalCost',
        header: 'Cost',
        cell: ({ getValue }) => <span className="font-mono text-sm">${((getValue() as number) ?? 0).toFixed(2)}</span>,
        size: 90,
      },
      {
        accessorKey: 'expectedProfit',
        header: 'Exp. Profit',
        cell: ({ getValue }) => {
          const p = (getValue() as number) ?? 0
          return (
            <span className={`font-mono text-sm ${p > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              ${p.toFixed(2)}
            </span>
          )
        },
        size: 100,
      },
      {
        accessorKey: 'profitPct',
        header: 'Profit %',
        cell: ({ getValue }) => (
          <span className="font-mono text-sm">{(((getValue() as number) ?? 0) * 100).toFixed(2)}%</span>
        ),
        size: 80,
      },
    ],
    [],
  )

  const tabs: TabItem[] = useMemo(
    () => [
      {
        key: 'alerts',
        label: `실시간 알림 (${alertsTotal})`,
        icon: <Zap className="size-4" />,
        content: (
          <DataTable
            columns={alertColumns}
            data={alerts}
            paginated
            pageSize={20}
            emptyMessage="No arbitrage alerts detected"
          />
        ),
      },
      {
        key: 'near-miss',
        label: `Near Miss (${nearMissTotal})`,
        icon: <AlertTriangle className="size-4" />,
        content: (
          <DataTable
            columns={nearMissColumns}
            data={nearMiss}
            paginated
            pageSize={20}
            emptyMessage="No near-miss alerts"
          />
        ),
      },
      {
        key: 'executions',
        label: `실행 내역 (${executions.length})`,
        icon: <CheckCircle className="size-4" />,
        content: (
          <DataTable
            columns={executionColumns}
            data={executions}
            paginated
            pageSize={20}
            emptyMessage="No executions yet"
          />
        ),
      },
      {
        key: 'stats',
        label: '통계/차트',
        icon: <BarChart3 className="size-4" />,
        content: (
          <div className="space-y-6">
            {dailyChart && dailyChart.dates.length > 0 && (
              <div>
                <h6 className="text-sm font-semibold text-gray-700 dark:text-dark-200 mb-3">
                  일별 알림 추이
                </h6>
                <ReactApexChart
                  type="bar"
                  height={250}
                  options={{
                    chart: { toolbar: { show: false }, background: 'transparent' },
                    theme: { mode: 'dark' },
                    xaxis: { categories: dailyChart.dates },
                    colors: ['#6366f1'],
                    plotOptions: { bar: { borderRadius: 4 } },
                    dataLabels: { enabled: false },
                    grid: { borderColor: '#334155' },
                  }}
                  series={[{ name: 'Alerts', data: dailyChart.counts }]}
                />
              </div>
            )}

            {windowStats && (
              <div>
                <h6 className="text-sm font-semibold text-gray-700 dark:text-dark-200 mb-3">
                  기회 지속시간 통계
                </h6>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                    <p className="text-xs text-gray-500 dark:text-dark-400">Total Windows</p>
                    <p className="text-lg font-semibold">{windowStats.totalWindows}</p>
                  </div>
                  <div className="p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                    <p className="text-xs text-gray-500 dark:text-dark-400">Avg Duration</p>
                    <p className="text-lg font-semibold">{windowStats.avgDuration?.toFixed(1) ?? '—'}s</p>
                  </div>
                  <div className="p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                    <p className="text-xs text-gray-500 dark:text-dark-400">Median</p>
                    <p className="text-lg font-semibold">{windowStats.medianDuration?.toFixed(1) ?? '—'}s</p>
                  </div>
                  <div className="p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                    <p className="text-xs text-gray-500 dark:text-dark-400">Max Duration</p>
                    <p className="text-lg font-semibold">{windowStats.maxDuration?.toFixed(1) ?? '—'}s</p>
                  </div>
                </div>

                {windowStats.durationBuckets && Object.keys(windowStats.durationBuckets).length > 0 && (
                  <div className="mt-4">
                    <ReactApexChart
                      type="bar"
                      height={200}
                      options={{
                        chart: { toolbar: { show: false }, background: 'transparent' },
                        theme: { mode: 'dark' },
                        xaxis: { categories: Object.keys(windowStats.durationBuckets) },
                        colors: ['#f59e0b'],
                        plotOptions: { bar: { borderRadius: 4 } },
                        dataLabels: { enabled: false },
                        grid: { borderColor: '#334155' },
                        yaxis: { title: { text: 'Count' } },
                      }}
                      series={[{ name: 'Windows', data: Object.values(windowStats.durationBuckets) }]}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ),
      },
    ],
    [alerts, alertsTotal, nearMiss, nearMissTotal, executions, dailyChart, windowStats, alertColumns, nearMissColumns, executionColumns],
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
          <h5 className="text-lg font-semibold text-gray-800 dark:text-dark-100">Pure Arb Dashboard</h5>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-0.5">
            바이너리 마켓 차익거래 스캐너 모니터링
          </p>
        </div>
        <button className="btn btn-sm btn-outline-primary flex items-center gap-1.5" onClick={fetchAll}>
          <RefreshCw className="size-3.5" />
          Refresh
        </button>
      </div>

      <ScannerInfoBanner variant="pureArb" />

      {error && (
        <div className="mt-4 mb-6 p-4 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
          {error}
          <button className="ml-3 underline" onClick={fetchAll}>Retry</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
        <StatCard
          title="Scanner Status"
          value={status?.scanner.wsConnected ? 'Connected' : 'Disconnected'}
          icon={<Activity className={`size-5 ${status?.scanner.wsConnected ? 'text-green-500' : 'text-red-500'}`} />}
        />
        <StatCard
          title="Monitoring Markets"
          value={status?.scanner.markets ?? 0}
          icon={<BarChart3 className="size-5" />}
        />
        <StatCard
          title="Detected Opportunities"
          value={alertsTotal}
          icon={<Zap className="size-5" />}
        />
        <StatCard
          title="Success Rate"
          value={execStats.totalAttempts > 0 ? `${(execStats.successRate * 100).toFixed(1)}%` : '—'}
          icon={execStats.successRate > 0.5 ? <CheckCircle className="size-5 text-green-500" /> : <XCircle className="size-5" />}
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
        title="Execute Pure Arb Trade"
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
        {selectedAlert && !executionResult && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-dark-800">
              <p className="text-sm font-medium text-gray-700 dark:text-dark-200 mb-1">{selectedAlert.market}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-dark-400">
                <span>YES: {((selectedAlert.yesAsk ?? 0) * 100).toFixed(1)}¢</span>
                <span>NO: {((selectedAlert.noAsk ?? 0) * 100).toFixed(1)}¢</span>
                <span className="text-green-600 dark:text-green-400 font-semibold">
                  Profit: {((selectedAlert.profitPct ?? 0) * 100).toFixed(2)}%
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">
                Trade Size (shares)
              </label>
              <input
                type="number"
                className="form-input w-full text-sm"
                value={tradeSize}
                min={1}
                max={1000}
                onChange={(e) => setTradeSize(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <p className="text-xs text-gray-400 mt-1">
                Max: min(YES liq, NO liq) = ${Math.min(selectedAlert.yesLiquidity ?? 0, selectedAlert.noLiquidity ?? 0).toFixed(0)}
              </p>
            </div>

            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Est. Cost</p>
                  <p className="text-sm font-semibold font-mono">
                    ${(tradeSize * (selectedAlert.combined ?? 0)).toFixed(4)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Est. Revenue</p>
                  <p className="text-sm font-semibold font-mono">
                    ${tradeSize.toFixed(4)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-green-600 dark:text-green-400">Est. Profit</p>
                  <p className="text-sm font-semibold font-mono text-green-600 dark:text-green-400">
                    ${(tradeSize * (1 - (selectedAlert.combined ?? 1))).toFixed(4)}
                  </p>
                </div>
              </div>
            </div>
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
              </div>
              <div className="grid grid-cols-3 gap-3 text-center mt-3">
                <div>
                  <p className="text-xs text-gray-500">Cost</p>
                  <p className="text-sm font-semibold font-mono">${(executionResult.totalCost ?? 0).toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Profit %</p>
                  <p className="text-sm font-semibold font-mono">{(executionResult.profitPct ?? 0).toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-xs text-green-600 dark:text-green-400">Profit</p>
                  <p className="text-sm font-semibold font-mono text-green-600 dark:text-green-400">
                    ${(executionResult.expectedProfit ?? 0).toFixed(4)}
                  </p>
                </div>
              </div>
            </div>

            <div className="text-xs text-gray-500 dark:text-dark-400 space-y-1">
              <p>Market: {executionResult.market}</p>
              <p>YES: {((executionResult.yesPrice ?? 0) * 100).toFixed(1)}¢ / NO: {((executionResult.noPrice ?? 0) * 100).toFixed(1)}¢</p>
              <p>Size: {executionResult.size} shares</p>
            </div>
          </div>
        )}
      </AppModal>
    </div>
  )
}
