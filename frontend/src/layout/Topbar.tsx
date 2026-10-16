import { useCallback, useEffect, useState } from 'react'
import { Moon, Sun, Menu, Wallet, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@slices/hooks'
import { setLayoutMode } from '@slices/layoutSlice'
import { getWalletStatus, type WalletStatus } from '@lib/api/wallet'

interface TopbarProps {
  onToggleSidebar: () => void
}

export default function Topbar({ onToggleSidebar }: TopbarProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const layoutMode = useAppSelector((s) => s.layout.layoutMode)
  const [wallet, setWallet] = useState<WalletStatus | null>(null)

  const toggleTheme = () => {
    dispatch(setLayoutMode(layoutMode === 'dark' ? 'light' : 'dark'))
  }

  const fetchWallet = useCallback(async () => {
    try {
      const status = await getWalletStatus()
      setWallet(status)
    } catch {
      // wallet status unavailable
    }
  }, [])

  useEffect(() => {
    fetchWallet()
    const interval = setInterval(fetchWallet, 30_000)
    return () => clearInterval(interval)
  }, [fetchWallet])

  const lowBalance = wallet?.connected && wallet.maticBalance < 0.05

  return (
    <header className="topbar fixed top-0 left-0 lg:left-sidebar right-0 z-30 flex items-center h-12 bg-white dark:bg-dark-900 border-b border-gray-200 dark:border-dark-700 px-4">
      <button
        className="lg:hidden p-2 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-800"
        onClick={onToggleSidebar}
      >
        <Menu className="size-5" />
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors hover:bg-gray-100 dark:hover:bg-dark-800"
          onClick={() => navigate('/settings')}
          title={wallet?.connected ? `${wallet.walletAddress} — $${wallet.usdcBalance.toFixed(2)} USDC` : 'Wallet not connected'}
        >
          {wallet?.connected ? (
            <>
              <Wallet className="size-4 text-green-500" />
              <span className="hidden sm:inline text-gray-600 dark:text-dark-300 font-mono text-xs">
                {wallet.walletAddress}
              </span>
              <span className="text-xs font-medium text-gray-700 dark:text-dark-200">
                ${wallet.usdcBalance.toFixed(2)}
              </span>
              {lowBalance && (
                <span title="Low MATIC balance">
                  <AlertTriangle className="size-3.5 text-amber-500" />
                </span>
              )}
            </>
          ) : (
            <>
              <Wallet className="size-4 text-gray-400 dark:text-dark-500" />
              <span className="hidden sm:inline text-xs text-gray-400 dark:text-dark-500">
                Not connected
              </span>
            </>
          )}
        </button>

        <button
          className="p-2 rounded-md text-gray-500 dark:text-dark-400 hover:bg-gray-100 dark:hover:bg-dark-800"
          onClick={toggleTheme}
          title={layoutMode === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {layoutMode === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>
      </div>
    </header>
  )
}
