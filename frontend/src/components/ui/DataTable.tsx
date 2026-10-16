import { Fragment, useEffect, useState, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { rankItem } from '@tanstack/match-sorter-utils'

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  searchable?: boolean
  paginated?: boolean
  pageSize?: number
  searchPlaceholder?: string
  tableClassName?: string
  emptyMessage?: string
  onRowClick?: (row: T) => void
  getRowClassName?: (row: T) => string
  toolbar?: ReactNode
}

export function DataTable<T>({
  columns,
  data,
  searchable = false,
  paginated = false,
  pageSize: initialPageSize = 10,
  searchPlaceholder = 'Search...',
  tableClassName = '',
  emptyMessage = 'No matching records found',
  onRowClick,
  getRowClassName,
  toolbar,
}: DataTableProps<T>) {
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)

  const fuzzyFilter = (row: { getValue: (id: string) => unknown }, columnId: string, value: string, addMeta: (meta: { itemRank: { passed: boolean } }) => void) => {
    const itemRank = rankItem(String(row.getValue(columnId)), value)
    addMeta({ itemRank })
    return itemRank.passed
  }

  const table = useReactTable({
    columns,
    data,
    filterFns: { fuzzy: fuzzyFilter },
    state: { globalFilter, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    globalFilterFn: fuzzyFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  useEffect(() => {
    table.setPageSize(pageSize)
    setCurrentPage(1)
  }, [pageSize, table, globalFilter])

  const filteredRows = table.getFilteredRowModel()?.rows ?? []
  const totalPages = Math.ceil(filteredRows.length / pageSize)

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return
    setCurrentPage(page)
    table.setPageIndex(page - 1)
  }

  const showStart = (currentPage - 1) * pageSize + 1
  const showEnd = Math.min(currentPage * pageSize, filteredRows.length)

  return (
    <Fragment>
      {(searchable || toolbar) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {searchable && (
            <div className="justify-self-center md:justify-self-start">
              <select
                className="form-select inline-block w-auto ltr:mr-2 rtl:ml-2"
                value={pageSize}
                onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
              <span className="text-sm text-gray-500 dark:text-dark-500">entries per page</span>
            </div>
          )}
          <div className="md:col-start-2 justify-self-center md:justify-self-end flex items-center gap-3">
            {toolbar}
            {searchable && (
              <input
                type="search"
                value={globalFilter}
                className="form-input inline-block w-auto"
                placeholder={searchPlaceholder}
                onChange={(e) => setGlobalFilter(e.target.value)}
              />
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className={`table ${tableClassName}`}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      className={header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sorted === 'asc' && ' ↑'}
                      {sorted === 'desc' && ' ↓'}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {filteredRows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={[
                    onRowClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-800' : '',
                    getRowClassName?.(row.original) ?? '',
                  ].join(' ')}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="p-8 text-center text-gray-500 dark:text-dark-500">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {paginated && filteredRows.length > 0 && totalPages > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          <div className="justify-self-center md:justify-self-start text-sm text-gray-500 dark:text-dark-500">
            Showing {showStart} to {showEnd} of {filteredRows.length} entries
          </div>
          <div className="md:col-start-2 justify-self-center md:justify-self-end">
            <ul className="pagination pagination-primary">
              <li>
                <button className={`pagination-item ${currentPage === 1 ? 'disabled' : ''}`} onClick={() => handlePageChange(1)}>«</button>
              </li>
              <li>
                <button className={`pagination-item ${currentPage === 1 ? 'disabled' : ''}`} onClick={() => handlePageChange(currentPage - 1)}>‹</button>
              </li>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <li key={page}>
                  <button className={`pagination-item ${currentPage === page ? 'active' : ''}`} onClick={() => handlePageChange(page)}>{page}</button>
                </li>
              ))}
              <li>
                <button className={`pagination-item ${currentPage === totalPages ? 'disabled' : ''}`} onClick={() => handlePageChange(currentPage + 1)}>›</button>
              </li>
              <li>
                <button className={`pagination-item ${currentPage === totalPages ? 'disabled' : ''}`} onClick={() => handlePageChange(totalPages)}>»</button>
              </li>
            </ul>
          </div>
        </div>
      )}
    </Fragment>
  )
}
