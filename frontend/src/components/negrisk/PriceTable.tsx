import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable, PriceChip } from '@components/ui'
import type { MarketPrice } from '@src/types/negrisk'

interface PriceTableProps {
  prices: MarketPrice[]
  retainMarketId?: string | null
}

export function PriceTable({ prices, retainMarketId }: PriceTableProps) {
  const columns = useMemo<ColumnDef<MarketPrice, unknown>[]>(
    () => [
      {
        accessorKey: 'question',
        header: 'Outcome',
        cell: ({ row }) => {
          const isRetain = row.original.marketId === retainMarketId
          return (
            <div className="flex items-center gap-2">
              <span className="text-sm">{row.original.question}</span>
              {isRetain && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                  RETAIN
                </span>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: 'yesBestAsk',
        header: 'YES Ask',
        cell: ({ getValue }) => {
          const v = getValue() as number | null
          return v != null ? <PriceChip price={v} /> : <span className="text-gray-400">—</span>
        },
      },
      {
        accessorKey: 'yesBestBid',
        header: 'YES Bid',
        cell: ({ getValue }) => {
          const v = getValue() as number | null
          return v != null ? <PriceChip price={v} /> : <span className="text-gray-400">—</span>
        },
      },
      {
        accessorKey: 'noBestAsk',
        header: 'NO Ask',
        cell: ({ getValue }) => {
          const v = getValue() as number | null
          return v != null ? <PriceChip price={v} /> : <span className="text-gray-400">—</span>
        },
      },
      {
        accessorKey: 'noBestBid',
        header: 'NO Bid',
        cell: ({ getValue }) => {
          const v = getValue() as number | null
          return v != null ? <PriceChip price={v} /> : <span className="text-gray-400">—</span>
        },
      },
      {
        accessorKey: 'yesDepth',
        header: 'YES Depth',
        cell: ({ getValue }) => (
          <span className="text-sm font-mono">{(getValue() as number).toLocaleString()}</span>
        ),
      },
      {
        accessorKey: 'noDepth',
        header: 'NO Depth',
        cell: ({ getValue }) => (
          <span className="text-sm font-mono">{(getValue() as number).toLocaleString()}</span>
        ),
      },
    ],
    [retainMarketId],
  )

  return (
    <DataTable
      columns={columns}
      data={prices}
      emptyMessage="No price data available"
      tableClassName="table-striped"
    />
  )
}
