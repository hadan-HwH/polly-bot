import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@components/ui/DataTable'

interface TestRow {
  id: number
  name: string
  value: number
}

const columns: ColumnDef<TestRow, unknown>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'value', header: 'Value' },
]

const data: TestRow[] = [
  { id: 1, name: 'Alpha', value: 100 },
  { id: 2, name: 'Beta', value: 200 },
  { id: 3, name: 'Gamma', value: 300 },
]

describe('DataTable', () => {
  it('renders rows and headers', () => {
    render(<DataTable columns={columns} data={data} />)

    expect(screen.getByText('ID')).toBeInTheDocument()
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Value')).toBeInTheDocument()

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Gamma')).toBeInTheDocument()
  })

  it('shows empty message when data is empty', () => {
    render(<DataTable columns={columns} data={[]} emptyMessage="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('calls onRowClick when a row is clicked', async () => {
    const user = userEvent.setup()
    const clicked: TestRow[] = []
    render(<DataTable columns={columns} data={data} onRowClick={(row) => clicked.push(row)} />)

    await user.click(screen.getByText('Alpha'))
    expect(clicked).toHaveLength(1)
    expect(clicked[0]?.name).toBe('Alpha')
  })

  it('filters rows when search is enabled', async () => {
    const user = userEvent.setup()
    render(<DataTable columns={columns} data={data} searchable />)

    const searchInput = screen.getByPlaceholderText('Search...')
    await user.type(searchInput, 'Beta')

    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    expect(screen.queryByText('Gamma')).not.toBeInTheDocument()
  })

  it('sorts columns on header click', async () => {
    const user = userEvent.setup()
    render(<DataTable columns={columns} data={data} />)

    const nameHeader = screen.getByText('Name')

    // First click on Name: ascending (Alpha, Beta, Gamma)
    await user.click(nameHeader)
    let rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Alpha')

    // Second click: descending (Gamma, Beta, Alpha)
    await user.click(nameHeader)
    rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Gamma')
  })
})
