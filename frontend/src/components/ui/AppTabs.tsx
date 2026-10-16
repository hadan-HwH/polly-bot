import { useState, type ReactNode } from 'react'

export interface TabItem {
  key: string
  label: string
  icon?: ReactNode
  content: ReactNode
}

interface AppTabsProps {
  tabs: TabItem[]
  defaultActiveKey?: string
  onChange?: (key: string) => void
  className?: string
  tabListClassName?: string
  activeTabClassName?: string
  inactiveTabClassName?: string
}

export function AppTabs({
  tabs,
  defaultActiveKey,
  onChange,
  className = '',
  tabListClassName = 'flex flex-wrap gap-2 border-b border-gray-200 dark:border-dark-700 mb-4',
  activeTabClassName = 'px-4 py-2 text-sm font-medium text-primary-500 border-b-2 border-primary-500',
  inactiveTabClassName = 'px-4 py-2 text-sm font-medium text-gray-500 dark:text-dark-400 hover:text-primary-500',
}: AppTabsProps) {
  const [activeKey, setActiveKey] = useState(defaultActiveKey ?? tabs[0]?.key ?? '')

  const handleTabClick = (key: string) => {
    setActiveKey(key)
    onChange?.(key)
  }

  const activeTab = tabs.find((t) => t.key === activeKey)

  return (
    <div className={className}>
      <ul className={tabListClassName}>
        {tabs.map((tab) => (
          <li key={tab.key}>
            <button
              className={activeKey === tab.key ? activeTabClassName : inactiveTabClassName}
              onClick={() => handleTabClick(tab.key)}
            >
              {tab.icon && <span className="inline-flex items-center mr-1.5">{tab.icon}</span>}
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
      <div>{activeTab?.content}</div>
    </div>
  )
}
