import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Search, BarChart3, RefreshCw, Droplets, Filter } from 'lucide-react'
import { DataTable, StatCard, PriceChip, StatusBadge } from '@components/ui'
import { getAllMarkets, getMarketCategories, type MarketListItem, type CategoryInfo } from '@lib/api/markets'
const LIQUIDITY_OPTIONS = [
  { label: '전체', value: 0 },
  { label: '$100+', value: 100 },
  { label: '$1K+', value: 1_000 },
  { label: '$10K+', value: 10_000 },
  { label: '$50K+', value: 50_000 },
  { label: '$100K+', value: 100_000 },
]

export default function MarketList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [markets, setMarkets] = useState<MarketListItem[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '')
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [category, setCategory] = useState(searchParams.get('cat') || 'All')
  const [sortBy, setSortBy] = useState<'volume' | 'liquidity'>((searchParams.get('sort') as 'volume' | 'liquidity') || 'volume')
  const [minLiquidity, setMinLiquidity] = useState(Number(searchParams.get('liq')) || 0)
  const [page, setPage] = useState(0)
  const pageSize = 50
  const [categories, setCategories] = useState<CategoryInfo[]>([])

  useEffect(() => {
    getMarketCategories()
      .then((res) => setCategories(res.categories))
      .catch(() => {})
  }, [])

  const fetchMarkets = useCallback(async () => {
    try {
      setError(null)
      const res = await getAllMarkets({
        limit: pageSize,
        offset: page * pageSize,
        sort_by: sortBy,
        category: category !== 'All' ? category : undefined,
        search: search || undefined,
        min_liquidity: minLiquidity,
      })
      setMarkets(res.markets)
      setHasMore(res.hasMore)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch markets')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, sortBy, category, search, minLiquidity])

  useEffect(() => {
    setLoading(true)
    fetchMarkets()
  }, [fetchMarkets])

  const submitSearch = useCallback(() => {
    setSearch(searchInput.trim())
    setPage(0)
  }, [searchInput])

  useEffect(() => {
    const params: Record<string, string> = {}
    if (search) params.q = search
    if (category !== 'All') params.cat = category
    if (sortBy !== 'volume') params.sort = sortBy
    if (minLiquidity > 0) params.liq = String(minLiquidity)
    setSearchParams(params, { replace: true })
  }, [search, category, sortBy, minLiquidity, setSearchParams])

  const stats = useMemo(() => {
    const totalVol = markets.reduce((s, m) => s + m.volume, 0)
    const totalLiq = markets.reduce((s, m) => s + m.liquidity, 0)
    const negRiskCount = markets.filter((m) => m.negRisk).length
    return { totalVol, totalLiq, negRiskCount }
  }, [markets])

  const columns = useMemo<ColumnDef<MarketListItem, unknown>[]>(
    () => [
      {
        accessorKey: 'question',
        header: 'Market',
        cell: ({ getValue }) => (
          <span className="text-sm font-medium truncate max-w-[300px] inline-block" title={getValue() as string}>
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'yesPrice',
        header: 'YES',
        cell: ({ getValue }) => <PriceChip price={getValue() as number} />,
        size: 90,
      },
      {
        accessorKey: 'noPrice',
        header: 'NO',
        cell: ({ getValue }) => <PriceChip price={getValue() as number} />,
        size: 90,
      },
      {
        accessorKey: 'spread',
        header: 'Spread',
        cell: ({ getValue }) => (
          <span className="font-mono text-sm text-gray-600 dark:text-dark-300">
            {((getValue() as number) * 100).toFixed(1)}¢
          </span>
        ),
        size: 80,
      },
      {
        accessorKey: 'volume',
        header: 'Volume',
        cell: ({ getValue }) => (
          <span className="font-mono text-sm">
            ${((getValue() as number) / 1000).toFixed(0)}k
          </span>
        ),
        size: 100,
      },
      {
        accessorKey: 'liquidity',
        header: 'Liquidity',
        cell: ({ getValue }) => (
          <span className="font-mono text-sm">
            ${((getValue() as number) / 1000).toFixed(0)}k
          </span>
        ),
        size: 100,
      },
      {
        accessorKey: 'endDate',
        header: 'Expires',
        cell: ({ getValue }) => {
          const d = getValue() as string | null
          if (!d) return <span className="text-gray-400">—</span>
          const dt = new Date(d)
          return <span className="text-sm text-gray-500 dark:text-dark-400">{dt.toLocaleDateString()}</span>
        },
        size: 100,
      },
      {
        accessorKey: 'negRisk',
        header: 'Type',
        cell: ({ getValue }) =>
          getValue() ? (
            <StatusBadge label="NegRisk" variant="info" />
          ) : (
            <StatusBadge label="Binary" variant="secondary" />
          ),
        size: 90,
      },
    ],
    [],
  )

  const handleRowClick = useCallback(
    (row: MarketListItem) => {
      navigate(`/markets/${row.slug}`)
    },
    [navigate],
  )

  if (loading && markets.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="spin-loader text-primary-500 size-8" />
      </div>
    )
  }


  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h5 className="text-lg font-semibold text-gray-800 dark:text-dark-100">전체 마켓</h5>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-0.5">
            Polymarket 활성 마켓 탐색
          </p>
        </div>
        <button
          className="btn btn-sm btn-outline-primary flex items-center gap-1.5"
          onClick={() => { setLoading(true); fetchMarkets() }}
          disabled={loading}
        >
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-2">
        <Filter className="size-3.5 text-gray-400" />
        <span className="text-xs text-gray-500 dark:text-dark-400">유동성</span>
        <div className="flex items-center gap-1">
          {LIQUIDITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`btn btn-xs ${minLiquidity === opt.value ? 'btn-primary' : 'btn-outline-gray'}`}
              onClick={() => { setMinLiquidity(opt.value); setPage(0) }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
          {error}
          <button className="ml-3 underline" onClick={fetchMarkets}>Retry</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-5 mb-6">
        <StatCard
          title="Page Volume"
          value={`$${(stats.totalVol / 1_000_000).toFixed(1)}M`}
          icon={<BarChart3 className="size-5" />}
        />
        <StatCard
          title="Page Liquidity"
          value={`$${(stats.totalLiq / 1_000_000).toFixed(1)}M`}
          icon={<Droplets className="size-5" />}
        />
        <StatCard title="NegRisk" value={stats.negRiskCount} icon={<BarChart3 className="size-5" />} />
      </div>

      <div className="card">
        <div className="card-body">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-xs flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                <input
                  type="text"
                  className="form-input pl-9 w-full"
                  placeholder="Search markets..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitSearch() }}
                />
              </div>
              <button
                className="btn btn-primary h-[38px] px-4 text-sm shrink-0"
                onClick={submitSearch}
              >
                검색
              </button>
            </div>

            <div className="flex items-center gap-1 flex-wrap">
              <button
                className={`btn btn-xs ${category === 'All' ? 'btn-primary' : 'btn-outline-gray'}`}
                onClick={() => { setCategory('All'); setPage(0) }}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.name}
                  className={`btn btn-xs ${category === cat.name ? 'btn-primary' : 'btn-outline-gray'}`}
                  onClick={() => { setCategory(cat.name); setPage(0) }}
                >
                  {cat.name}
                  <span className="ml-1 text-[10px] opacity-60">{cat.count}</span>
                </button>
              ))}
            </div>

            <select
              className="form-select text-sm py-1.5"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'volume' | 'liquidity')}
            >
              <option value="volume">Sort by Volume</option>
              <option value="liquidity">Sort by Liquidity</option>
            </select>
          </div>

          <DataTable
            columns={columns}
            data={markets}
            paginated
            pageSize={pageSize}
            emptyMessage="No markets found"
            onRowClick={handleRowClick}
          />

          {(page > 0 || hasMore) && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-dark-700">
              <span className="text-sm text-gray-500 dark:text-dark-400">
                Page {page + 1}
                {markets.length > 0 && ` · Showing ${page * pageSize + 1}–${page * pageSize + markets.length}`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-sm btn-outline-gray"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Prev
                </button>
                <button
                  className="btn btn-sm btn-outline-gray"
                  disabled={!hasMore}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
