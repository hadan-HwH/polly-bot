import { useCallback, useEffect, useState } from 'react'
import { Save, Loader2, Wallet, Link2Off, CheckCircle2, AlertTriangle, RefreshCw, X, ShieldOff, Zap, Star } from 'lucide-react'
import { StatCard } from '@components/ui'
import { getSettings, updateSettings, restartScanners, type AppSettings } from '@lib/api/settings'
import { getWalletStatus, validateWallet, disconnectWallet, type WalletStatus } from '@lib/api/wallet'
import { showToast } from '@components/ui/AppToast'
import { invalidateSettingsCache } from '@components/ui/ScannerInfoBanner'

interface FieldConfig {
  key: keyof AppSettings
  label: string
  type: 'number' | 'text' | 'toggle' | 'select'
  description?: string
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
  format?: (v: number) => string
  requiresRestart?: boolean
}

type ScopeTag = 'common' | 'pureArb' | 'negRisk'

interface TaggedField extends FieldConfig {
  scope: ScopeTag
}

const SCOPE_CHIP: Record<ScopeTag, { bg: string; text: string; label: string }> = {
  common: { bg: 'bg-gray-100 dark:bg-dark-700', text: 'text-gray-500 dark:text-dark-400', label: '공통' },
  pureArb: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', label: 'Pure Arb' },
  negRisk: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300', label: 'NegRisk' },
}

const SCAN_MODE_OPTIONS = [
  { value: 'all', label: '전체 (바이너리 + 다중 아웃컴)' },
  { value: 'binary_only', label: '바이너리만 (Pure Arb)' },
  { value: 'negrisk_only', label: '다중 아웃컴만 (NegRisk)' },
]

const TRADING_FIELDS: TaggedField[] = [
  { scope: 'common', key: 'scanMode', label: '스캔 모드', type: 'select', description: '어떤 유형의 마켓을 스캔할지 선택', options: SCAN_MODE_OPTIONS },
  { scope: 'common', key: 'maxPositionSize', label: '최대 포지션', type: 'number', min: 1, step: 10, description: '마켓당 최대 투자 금액 (USD)' },
  { scope: 'common', key: 'minLiquidityUsd', label: '최소 유동성', type: 'number', min: 0, step: 1000, description: '이 금액 이하 유동성의 마켓은 무시 (USD)' },
  { scope: 'common', key: 'maxDaysUntilResolution', label: '만기 필터', type: 'number', min: 1, max: 365, step: 1, description: '만기까지 N일 이내 마켓만 스캔' },
  { scope: 'pureArb', key: 'purearbAutoExecute', label: 'Pure Arb 자동 실행', type: 'toggle', description: '기회 탐지 시 자동으로 매수/매도 실행 (지갑 연결 + dry_run 해제 필요)' },
  { scope: 'pureArb', key: 'minProfitThreshold', label: '최소 수익률', type: 'number', min: 0, max: 0.1, step: 0.001, description: 'YES+NO 합산이 (1 − 이 값) 이하일 때 알림', format: (v) => `${(v * 100).toFixed(1)}%` },
  { scope: 'pureArb', key: 'purearbOrderType', label: '주문 유형', type: 'select', description: 'FOK = 즉시 전량 체결 or 취소 / GTC = 오더북에 걸어두고 대기', options: [{ value: 'FOK', label: 'FOK (Fill-or-Kill)' }, { value: 'GTC', label: 'GTC (대기 주문)' }] },
  { scope: 'pureArb', key: 'purearbGtcTimeoutSeconds', label: 'GTC 대기 시간', type: 'number', min: 5, max: 120, step: 5, description: 'GTC 주문의 최대 대기 시간 (초). 이 시간 후 미체결 주문 취소', format: (v) => `${v}초` },
  { scope: 'negRisk', key: 'negriskAutoExecute', label: 'NegRisk 자동 실행', type: 'toggle', description: '기회 탐지 시 자동으로 매수/매도 실행 (지갑 연결 + dry_run 해제 필요)' },
  { scope: 'negRisk', key: 'negriskMinOutcomes', label: '최소 아웃컴 수', type: 'number', min: 2, step: 1, description: '아웃컴이 N개 이상인 이벤트만 분석', requiresRestart: true },
  { scope: 'negRisk', key: 'negriskMaxOutcomes', label: '최대 아웃컴 수', type: 'number', min: 0, step: 1, description: '아웃컴이 N개 이하인 이벤트만 분석 (0 = 제한 없음). 값이 작을수록 100% 가격 커버리지 확률 증가', requiresRestart: true },
  { scope: 'negRisk', key: 'negriskSafetyMargin', label: '안전 마진', type: 'number', min: 0, step: 0.005, description: '슬리피지 + 수수료 + 버퍼', format: (v) => `${(v * 100).toFixed(1)}%` },
  { scope: 'negRisk', key: 'negriskMinRoi', label: '최소 ROI', type: 'number', min: 0, step: 0.005, description: '이 ROI 이상일 때만 기회로 표시', format: (v) => `${(v * 100).toFixed(1)}%` },
  { scope: 'negRisk', key: 'negriskMaxConcurrentEvents', label: '동시 실행 이벤트', type: 'number', min: 1, max: 10, step: 1, description: '동시에 실행할 수 있는 최대 이벤트 수 (1 = 순차 실행)' },
  { scope: 'negRisk', key: 'negriskMinOrderValue', label: '최소 주문 금액', type: 'number', min: 1, max: 100, step: 1, description: '아웃컴당 최소 주문 금액 (USD). 미달 시 j 자동 상향', format: (v) => `$${v}` },
  { scope: 'negRisk', key: 'negriskMaxCostPerEvent', label: '이벤트당 비용 한도', type: 'number', min: 5, step: 5, description: '단일 이벤트 실행 시 최대 비용 (USD). 초과 시 거부', format: (v) => `$${v}` },
  { scope: 'negRisk', key: 'negriskYesArbMaxExpiryDays', label: 'YES ARB 최대 정산일', type: 'number', min: 1, max: 365, step: 1, description: 'YES_ARB 전략에서 정산까지 최대 잔여일수. 이보다 먼 이벤트는 필터링됨', format: (v) => `${v}일` },
  { scope: 'negRisk', key: 'negriskYesArbMinMargin', label: 'YES ARB 최소 마진', type: 'number', min: 0, max: 0.5, step: 0.005, description: 'YES_ARB 전략의 최소 마진 (가격합 < 1 - 이 값). 자본 장기 잠금 리스크 보상', format: (v) => `${(v * 100).toFixed(1)}%` },
]

const AVAILABLE_CATEGORIES = [
  'Crypto', 'Esports', 'Weather', 'Sports', 'Geopolitics',
  'Politics', 'Business', 'Economics', 'Pop Culture', 'Science', 'Other',
]

const NOTIFICATION_FIELDS: FieldConfig[] = [
  { key: 'slackWebhookUrl', label: 'Slack Webhook URL', type: 'text', description: '비워두면 Slack 알림 비활성화' },
]

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [original, setOriginal] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null)
  const [privateKeyInput, setPrivateKeyInput] = useState('')
  const [walletConnecting, setWalletConnecting] = useState(false)
  const [walletDisconnecting, setWalletDisconnecting] = useState(false)

  const [wsConns, setWsConns] = useState<number | null>(null)
  const [wsOriginal, setWsOriginal] = useState<number | null>(null)
  const [negWsConns, setNegWsConns] = useState<number | null>(null)
  const [negWsOriginal, setNegWsOriginal] = useState<number | null>(null)
  const [wsConfirmOpen, setWsConfirmOpen] = useState(false)
  const [wsRestarting, setWsRestarting] = useState(false)

  const fetchWalletStatus = useCallback(async () => {
    try {
      const status = await getWalletStatus()
      setWalletStatus(status)
    } catch {
      // wallet status unavailable
    }
  }, [])

  const handleWalletConnect = async () => {
    if (!privateKeyInput.trim()) {
      showToast('error', 'Private key is required')
      return
    }
    setWalletConnecting(true)
    try {
      const result = await validateWallet(privateKeyInput.trim())
      showToast('success', `Wallet connected: ${result.walletAddress.slice(0, 6)}...${result.walletAddress.slice(-4)}`)
      setPrivateKeyInput('')
      await fetchWalletStatus()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to connect wallet')
    } finally {
      setWalletConnecting(false)
    }
  }

  const handleWalletDisconnect = async () => {
    setWalletDisconnecting(true)
    try {
      await disconnectWallet()
      showToast('success', 'Wallet disconnected')
      await fetchWalletStatus()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setWalletDisconnecting(false)
    }
  }

  const fetchSettings = useCallback(async () => {
    try {
      setError(null)
      const res = await getSettings()
      setSettings(res)
      setOriginal(res)
      setWsConns(res.numWsConnections)
      setWsOriginal(res.numWsConnections)
      setNegWsConns(res.negriskNumWsConnections ?? 0)
      setNegWsOriginal(res.negriskNumWsConnections ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
    fetchWalletStatus()
  }, [fetchSettings, fetchWalletStatus])

  const hasChanges = settings && original
    ? JSON.stringify(settings) !== JSON.stringify(original)
    : false

  const handleChange = (key: keyof AppSettings, value: unknown) => {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
  }

  const handleSave = async () => {
    if (!settings || !original) return

    const changed: Partial<AppSettings> = {}
    for (const key of Object.keys(settings) as (keyof AppSettings)[]) {
      if (key === 'numWsConnections' || key === 'negriskNumWsConnections') continue
      const cur = settings[key]
      const orig = original[key]
      const isDiff = Array.isArray(cur) && Array.isArray(orig)
        ? JSON.stringify(cur) !== JSON.stringify(orig)
        : cur !== orig
      if (isDiff) {
        (changed as Record<string, unknown>)[key] = cur
      }
    }

    if (Object.keys(changed).length === 0) return

    setSaving(true)
    try {
      const res = await updateSettings(changed)
      showToast('success', res.message)
      invalidateSettingsCache()
      setOriginal({ ...settings })
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (original) setSettings({ ...original })
  }

  const wsHasChanges = wsConns !== wsOriginal || negWsConns !== negWsOriginal

  const handleWsApply = async () => {
    if (!wsHasChanges) return
    setWsRestarting(true)
    try {
      const patch: Partial<AppSettings> = {}
      if (wsConns !== wsOriginal && wsConns !== null) patch.numWsConnections = wsConns
      if (negWsConns !== negWsOriginal && negWsConns !== null) patch.negriskNumWsConnections = negWsConns
      await updateSettings(patch)
      invalidateSettingsCache()
      await restartScanners()
      setWsOriginal(wsConns)
      setNegWsOriginal(negWsConns)
      if (settings) setOriginal({ ...settings, numWsConnections: wsConns ?? settings.numWsConnections, negriskNumWsConnections: negWsConns ?? settings.negriskNumWsConnections })
      showToast('success', '스캐너 재시작 완료')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '스캐너 재시작 실패')
    } finally {
      setWsRestarting(false)
      setWsConfirmOpen(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="spin-loader text-primary-500 size-8" />
      </div>
    )
  }

  if (error || !settings) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500 mb-4">{error || 'Failed to load settings'}</p>
        <button className="btn btn-outline-primary" onClick={fetchSettings}>Retry</button>
      </div>
    )
  }

  function renderGroupedFields() {
    const mode = settings!.scanMode
    const hiddenScopes = new Set<ScopeTag>()
    if (mode === 'binary_only') hiddenScopes.add('negRisk')
    if (mode === 'negrisk_only') hiddenScopes.add('pureArb')

    const groups: { scope: ScopeTag; fields: TaggedField[] }[] = []
    for (const f of TRADING_FIELDS) {
      if (hiddenScopes.has(f.scope)) continue
      const last = groups[groups.length - 1]
      if (last && last.scope === f.scope) {
        last.fields.push(f)
      } else {
        groups.push({ scope: f.scope, fields: [f] })
      }
    }

    return (
      <div className="space-y-6">
        {groups.map(({ scope, fields }) => {
          const s = SCOPE_CHIP[scope]
          return (
            <div key={scope}>
              <p className="text-xs font-medium tracking-wide uppercase mb-3 text-gray-400 dark:text-dark-500">
                {s.label}
              </p>
              <div className="border-l-2 border-gray-300 dark:border-dark-500 pl-4">
                {fields.map((f) => renderField(f))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function renderLabel(field: FieldConfig) {
    return (
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-dark-200">{field.label}</p>
        {field.description && <p className="text-xs text-gray-400 dark:text-dark-500 mt-0.5">{field.description}</p>}
        {field.requiresRestart && (
          <p className="text-[11px] text-amber-500 dark:text-amber-400 mt-0.5 flex items-center gap-1">
            <RefreshCw className="size-3 inline-block" />
            변경 시 스캐너 재시작 필요
          </p>
        )}
      </div>
    )
  }

  function renderField(field: FieldConfig) {
    const value = settings![field.key]

    if (field.type === 'toggle') {
      return (
        <div key={field.key} className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-dark-700 last:border-0">
          {renderLabel(field)}
          <button
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              value ? 'bg-primary-500' : 'bg-gray-300 dark:bg-dark-600'
            }`}
            onClick={() => handleChange(field.key, !value)}
          >
            <span
              className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
                value ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      )
    }

    if (field.type === 'select') {
      return (
        <div key={field.key} className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-dark-700 last:border-0">
          {renderLabel(field)}
          <select
            className="form-select text-sm py-1.5 w-32"
            value={value as string}
            onChange={(e) => handleChange(field.key, e.target.value)}
          >
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )
    }

    if (field.type === 'text') {
      return (
        <div key={field.key} className="py-3 border-b border-gray-100 dark:border-dark-700 last:border-0">
          <div className="mb-1.5">{renderLabel(field)}</div>
          <input
            type="text"
            className="form-input w-full text-sm"
            value={value as string}
            onChange={(e) => handleChange(field.key, e.target.value)}
          />
        </div>
      )
    }

    return (
      <div key={field.key} className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-dark-700 last:border-0">
        {renderLabel(field)}
        <div className="flex items-center gap-2">
          <input
            type="number"
            className="form-input w-28 text-sm text-right py-1.5"
            value={value as number}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={(e) => handleChange(field.key, parseFloat(e.target.value) || 0)}
          />
          {field.format && (
            <span className="text-xs text-gray-400 dark:text-dark-500 w-12">
              {field.format(value as number)}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h5 className="text-lg font-semibold text-gray-800 dark:text-dark-100">설정</h5>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-0.5">
            스캐너 및 봇 파라미터 관리
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button className="btn btn-sm btn-outline-gray" onClick={handleReset}>
              Reset
            </button>
          )}
          <button
            className="btn btn-sm btn-primary flex items-center gap-1.5"
            disabled={!hasChanges || saving}
            onClick={handleSave}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save Changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-5 mb-6">
        <StatCard title="Mode" value={settings.dryRun ? 'Dry Run' : 'Live'} />
        <StatCard
          title="스캔 모드"
          value={settings.scanMode === 'all' ? '전체' : settings.scanMode === 'binary_only' ? '바이너리' : 'NegRisk'}
        />
        <StatCard title="Min Profit" value={`${(settings.minProfitThreshold * 100).toFixed(1)}%`} />
        <StatCard title="Max Position" value={`$${settings.maxPositionSize}`} />
        <StatCard title="모니터링" value={`${(settings.numWsConnections * 250).toLocaleString()} 마켓`} />
      </div>

      <div className="card mb-6">
        <div className="card-body">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="size-5 text-primary-500" />
            <h6 className="text-sm font-semibold text-gray-700 dark:text-dark-200">
              지갑 & 거래 모드
            </h6>
          </div>

          <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-dark-700">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-dark-200">Dry Run 모드</p>
              <p className="text-xs text-gray-400 dark:text-dark-500 mt-0.5">활성화 시 실제 거래 없이 시뮬레이션만 실행</p>
            </div>
            <button
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                settings.dryRun ? 'bg-primary-500' : 'bg-gray-300 dark:bg-dark-600'
              }`}
              onClick={() => handleChange('dryRun', !settings.dryRun)}
            >
              <span
                className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
                  settings.dryRun ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="pt-4">
            {walletStatus?.connected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <CheckCircle2 className="size-5 text-green-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-700 dark:text-green-300">Connected</p>
                    <p className="text-xs text-green-600 dark:text-green-400 font-mono truncate">
                      {walletStatus.walletAddress}
                    </p>
                  </div>
                  <button
                    className="btn btn-sm btn-outline-red flex items-center gap-1.5"
                    onClick={handleWalletDisconnect}
                    disabled={walletDisconnecting}
                  >
                    {walletDisconnecting ? <Loader2 className="size-3.5 animate-spin" /> : <Link2Off className="size-3.5" />}
                    Disconnect
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                    <p className="text-xs text-gray-500 dark:text-dark-400">USDC</p>
                    <p className="text-lg font-semibold text-gray-800 dark:text-dark-100">${walletStatus.usdcBalance.toFixed(2)}</p>
                  </div>
                  <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                    <p className="text-xs text-gray-500 dark:text-dark-400">MATIC</p>
                    <p className={`text-lg font-semibold ${walletStatus.maticBalance < 0.05 ? 'text-amber-500' : 'text-gray-800 dark:text-dark-100'}`}>
                      {walletStatus.maticBalance.toFixed(4)}
                    </p>
                    {walletStatus.maticBalance < 0.05 && (
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <AlertTriangle className="size-3 text-amber-500" />
                        <span className="text-[10px] text-amber-500">Low gas</span>
                      </div>
                    )}
                  </div>
                  <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                    <p className="text-xs text-gray-500 dark:text-dark-400">Mode</p>
                    <p className={`text-lg font-semibold ${walletStatus.dryRun ? 'text-blue-500' : 'text-green-500'}`}>
                      {walletStatus.dryRun ? 'Dry Run' : 'Live'}
                    </p>
                  </div>
                  <div className="text-center p-3 rounded-md bg-gray-50 dark:bg-dark-800">
                    <p className="text-xs text-gray-500 dark:text-dark-400">API Keys</p>
                    <p className={`text-lg font-semibold ${walletStatus.hasApiKeys ? 'text-green-500' : 'text-red-500'}`}>
                      {walletStatus.hasApiKeys ? 'OK' : 'Missing'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-500 dark:text-dark-400">
                  Polygon 지갑의 프라이빗 키를 입력하여 거래 기능을 활성화합니다.
                  L2 API 자격증명이 자동 생성됩니다.
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    className="form-input flex-1 text-sm font-mono"
                    placeholder="0x..."
                    value={privateKeyInput}
                    onChange={(e) => setPrivateKeyInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleWalletConnect() }}
                  />
                  <button
                    className="btn btn-primary flex items-center gap-1.5"
                    onClick={handleWalletConnect}
                    disabled={walletConnecting || !privateKeyInput.trim()}
                  >
                    {walletConnecting ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
                    Connect
                  </button>
                </div>
                <p className="text-xs text-gray-400 dark:text-dark-600">
                  키는 로컬 서버 메모리에만 보관됩니다. HTTPS/로컬호스트 환경에서만 사용하세요.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="card">
          <div className="card-body">
            <h6 className="text-sm font-semibold text-gray-700 dark:text-dark-200 mb-4">
              거래 파라미터
            </h6>
            {renderGroupedFields()}
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="flex items-center gap-2 mb-2">
              <ShieldOff className="size-4 text-red-400" />
              <h6 className="text-sm font-semibold text-gray-700 dark:text-dark-200">
                제외 카테고리
              </h6>
            </div>
            <p className="text-xs text-gray-400 dark:text-dark-500 mb-4">
              선택한 카테고리의 마켓은 스캐너에서 제외되어 WS 구독 및 거래가 차단됩니다
            </p>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_CATEGORIES.map((cat) => {
                const isExcluded = settings.excludedCategories?.includes(cat)
                return (
                  <button
                    key={cat}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      isExcluded
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 ring-1 ring-red-300 dark:ring-red-700'
                        : 'bg-gray-100 dark:bg-dark-700 text-gray-500 dark:text-dark-400 hover:bg-gray-200 dark:hover:bg-dark-600'
                    }`}
                    onClick={() => {
                      const current = settings.excludedCategories ?? []
                      const next = isExcluded
                        ? current.filter((c) => c !== cat)
                        : [...current, cat]
                      handleChange('excludedCategories', next)
                    }}
                  >
                    {cat}
                    {isExcluded && <X className="size-3" />}
                  </button>
                )
              })}
            </div>
            {(settings.excludedCategories?.length ?? 0) > 0 && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-3">
                {settings.excludedCategories!.join(', ')} 카테고리의 마켓이 스캔에서 제외됩니다
              </p>
            )}
          </div>
        </div>

        {(settings.scanMode === 'all' || settings.scanMode === 'negrisk_only') && (
        <div className="card">
          <div className="card-body">
            <div className="flex items-center gap-2 mb-2">
              <Star className="size-4 text-emerald-400" />
              <h6 className="text-sm font-semibold text-gray-700 dark:text-dark-200">
                NegRisk 우선 탐색 카테고리
              </h6>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-300">
                재시작 필요
              </span>
            </div>
            <p className="text-xs text-gray-400 dark:text-dark-500 mb-4">
              선택한 카테고리의 이벤트가 WS 예산을 먼저 차지합니다.
              볼륨이 낮아도 우선 구독되어 실시간 가격을 받을 수 있습니다.
            </p>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_CATEGORIES.filter((cat) => !settings.excludedCategories?.includes(cat)).map((cat) => {
                const isPriority = settings.negriskPriorityCategories?.includes(cat)
                return (
                  <button
                    key={cat}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      isPriority
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-300 dark:ring-emerald-700'
                        : 'bg-gray-100 dark:bg-dark-700 text-gray-500 dark:text-dark-400 hover:bg-gray-200 dark:hover:bg-dark-600'
                    }`}
                    onClick={() => {
                      const current = settings.negriskPriorityCategories ?? []
                      const next = isPriority
                        ? current.filter((c) => c !== cat)
                        : [...current, cat]
                      handleChange('negriskPriorityCategories', next)
                    }}
                  >
                    {cat}
                    {isPriority && <Star className="size-3 fill-current" />}
                  </button>
                )
              })}
            </div>
            {(settings.negriskPriorityCategories?.length ?? 0) > 0 && (
              <p className="text-xs text-emerald-500 dark:text-emerald-400 mt-3">
                {settings.negriskPriorityCategories!.join(', ')} 카테고리가 WS 예산에서 우선 배분됩니다
              </p>
            )}
          </div>
        </div>
        )}

        <div className="card">
          <div className="card-body">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="size-4 text-amber-400" />
              <h6 className="text-sm font-semibold text-gray-700 dark:text-dark-200">
                즉시 Unwind 카테고리
              </h6>
            </div>
            <p className="text-xs text-gray-400 dark:text-dark-500 mb-4">
              선택한 카테고리의 마켓은 Partial Fill 시 즉시 -3% 매도합니다.
              5분짜리 단기 마켓처럼 자연 헤지가 불가능한 경우에 사용하세요.
            </p>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_CATEGORIES.filter((cat) => !settings.excludedCategories?.includes(cat)).map((cat) => {
                const isUnwind = settings.purearbUnwindCategories?.includes(cat)
                return (
                  <button
                    key={cat}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      isUnwind
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 ring-1 ring-amber-300 dark:ring-amber-700'
                        : 'bg-gray-100 dark:bg-dark-700 text-gray-500 dark:text-dark-400 hover:bg-gray-200 dark:hover:bg-dark-600'
                    }`}
                    onClick={() => {
                      const current = settings.purearbUnwindCategories ?? []
                      const next = isUnwind
                        ? current.filter((c) => c !== cat)
                        : [...current, cat]
                      handleChange('purearbUnwindCategories', next)
                    }}
                  >
                    {isUnwind && <Zap className="size-3" />}
                    {cat}
                  </button>
                )
              })}
            </div>
            {(settings.purearbUnwindCategories?.length ?? 0) > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
                {settings.purearbUnwindCategories!.join(', ')} → Partial Fill 시 즉시 매도 (Hold 대신 Unwind)
              </p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <h6 className="text-sm font-semibold text-gray-700 dark:text-dark-200 mb-4">
              스캐너 규모
            </h6>

            <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-dark-700">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-dark-200">Pure Arb</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">바이너리</span>
                </div>
                <p className="text-xs text-gray-400 dark:text-dark-500 mt-0.5">
                  WS 연결 × 250 마켓 · 변경 시 스캐너가 재시작됩니다
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    className="form-input w-20 text-sm text-right py-1.5"
                    value={wsConns ?? 6}
                    min={1}
                    max={20}
                    step={1}
                    onChange={(e) => setWsConns(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                  />
                  <span className="text-xs text-gray-400 dark:text-dark-500 w-16">
                    {((wsConns ?? 6) * 250).toLocaleString()}개
                  </span>
                </div>
                <button
                  className="btn btn-sm btn-primary flex items-center gap-1.5"
                  disabled={!wsHasChanges || wsRestarting}
                  onClick={() => setWsConfirmOpen(true)}
                >
                  <RefreshCw className={`size-3.5 ${wsRestarting ? 'animate-spin' : ''}`} />
                  적용
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-dark-200">NegRisk</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">다중 아웃컴</span>
                </div>
                <p className="text-xs text-gray-400 dark:text-dark-500 mt-0.5">
                  WS 연결 × 500 토큰 · 0 = 자동 (Pure Arb의 절반, 최소 2)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  className="form-input w-20 text-sm text-right py-1.5"
                  value={negWsConns ?? 0}
                  min={0}
                  max={20}
                  step={1}
                  onChange={(e) => setNegWsConns(Math.max(0, Math.min(20, parseInt(e.target.value) || 0)))}
                />
                {(() => {
                  const nw = (negWsConns ?? 0) > 0
                    ? (negWsConns ?? 0)
                    : Math.max(2, Math.floor((wsConns ?? 6) / 2))
                  return (
                    <span className="text-xs text-gray-400 dark:text-dark-500 w-24">
                      {(negWsConns ?? 0) === 0 ? `자동 ${nw}conn` : `${nw}conn`} · {(nw * 500).toLocaleString()}tok
                    </span>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>

        {wsConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white dark:bg-dark-800 rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
              <h6 className="text-base font-semibold text-gray-800 dark:text-dark-100 mb-2">
                스캐너 재시작
              </h6>
              {wsConns !== wsOriginal && (
              <>
                <p className="text-sm text-gray-500 dark:text-dark-400 mb-1">
                  Pure Arb WS: <strong>{wsOriginal}</strong> → <strong>{wsConns}</strong> 연결 ({((wsConns ?? 6) * 250).toLocaleString()} 마켓)
                </p>
              </>
              )}
              {negWsConns !== negWsOriginal && (
              <p className="text-sm text-gray-500 dark:text-dark-400 mb-1">
                NegRisk WS: <strong>{negWsOriginal}</strong> → <strong>{negWsConns}</strong> 연결 ({(() => { const nw = (negWsConns ?? 0) > 0 ? (negWsConns ?? 0) : Math.max(2, Math.floor((wsConns ?? 6) / 2)); return (nw * 500).toLocaleString() })()} 토큰)
              </p>
              )}
              <div className="mb-4" />
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-5">
                진행 중인 스캐너가 중단되고 새 설정으로 재시작됩니다. 재연결까지 10~20초 소요됩니다.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  className="btn btn-sm btn-outline-gray"
                  onClick={() => setWsConfirmOpen(false)}
                  disabled={wsRestarting}
                >
                  취소
                </button>
                <button
                  className="btn btn-sm btn-primary flex items-center gap-1.5"
                  onClick={handleWsApply}
                  disabled={wsRestarting}
                >
                  {wsRestarting ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  {wsRestarting ? '재시작 중...' : '재시작'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-body">
            <h6 className="text-sm font-semibold text-gray-700 dark:text-dark-200 mb-1">
              알림
            </h6>
            <p className="text-xs text-gray-400 dark:text-dark-500 mb-4">
              차익거래 기회 탐지 시 알림 채널
            </p>
            {NOTIFICATION_FIELDS.map((f) => renderField(f))}
          </div>
        </div>
      </div>
    </div>
  )
}
