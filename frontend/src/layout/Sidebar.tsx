import { useCallback } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  TrendingUp,
  BarChart3,
  Zap,
  Settings,
  Briefcase,
  type LucideIcon,
} from 'lucide-react'

interface MenuItem {
  title: string
  path: string
  icon: LucideIcon
  badge?: string
  disabled?: boolean
}

const MENU_ITEMS: MenuItem[] = [
  { title: '대시보드', path: '/dashboard', icon: LayoutDashboard },
  { title: '전체 마켓', path: '/markets', icon: BarChart3 },
  { title: 'NegRisk 차익거래', path: '/negrisk', icon: TrendingUp },
  { title: 'Pure Arb', path: '/arb', icon: Zap },
  { title: '포트폴리오', path: '/portfolio', icon: Briefcase },
  { title: '설정', path: '/settings', icon: Settings },
]

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation()

  const isActive = useCallback(
    (path: string) => location.pathname === path || location.pathname.startsWith(path + '/'),
    [location.pathname],
  )

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`sidebar fixed top-0 left-0 z-50 h-full w-sidebar bg-sidebar dark:bg-dark-900 border-r border-sidebar-border dark:border-dark-800 transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-5 h-12 shrink-0 border-b border-gray-200 dark:border-dark-700">
            <TrendingUp className="size-7 text-primary-500" />
            <span className="text-lg font-semibold text-gray-800 dark:text-dark-100 sidebar-text">
              Polly Bot
            </span>
          </div>

          <nav className="flex-1 overflow-y-auto py-4 px-3">
            <ul className="space-y-1">
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon
                const active = isActive(item.path)
                return (
                  <li key={item.path}>
                    {item.disabled ? (
                      <span className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-gray-400 dark:text-dark-600 cursor-not-allowed">
                        <Icon className="size-5" />
                        <span className="sidebar-text">{item.title}</span>
                        {item.badge && (
                          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-dark-800 text-gray-400 dark:text-dark-500 sidebar-text">
                            {item.badge}
                          </span>
                        )}
                      </span>
                    ) : (
                      <NavLink
                        to={item.path}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                          active
                            ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 font-medium'
                            : 'text-gray-600 dark:text-dark-400 hover:bg-gray-100 dark:hover:bg-dark-800 hover:text-gray-800 dark:hover:text-dark-200'
                        }`}
                        onClick={() => {
                          if (window.innerWidth < 1024) onClose()
                        }}
                      >
                        <Icon className="size-5" />
                        <span className="sidebar-text">{item.title}</span>
                      </NavLink>
                    )}
                  </li>
                )
              })}
            </ul>
          </nav>

          <div className="px-4 py-3 border-t border-gray-200 dark:border-dark-700">
            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-dark-500 sidebar-text">
              <div className="size-2 rounded-full bg-green-500 animate-pulse" />
              Scanner Active
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
