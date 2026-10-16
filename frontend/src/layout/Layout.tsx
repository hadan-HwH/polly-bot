import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useAppSelector } from '@slices/hooks'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const { layoutMode, layoutType, sidebarSize, contentWidth, sidebarColor, direction, dataColor } =
    useAppSelector((s) => s.layout)

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev)
  }, [])

  useEffect(() => {
    const handleResize = () => setIsSidebarOpen(window.innerWidth >= 1024)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const html = document.documentElement
    html.setAttribute('data-mode', layoutMode)
    html.setAttribute('data-layout', layoutType)
    html.setAttribute('data-sidebar', sidebarSize)
    html.setAttribute('data-content-width', contentWidth)
    html.setAttribute('data-sidebar-colors', sidebarColor)
    html.setAttribute('data-colors', dataColor)
    html.setAttribute('dir', direction)
  }, [layoutMode, layoutType, sidebarSize, contentWidth, sidebarColor, dataColor, direction])

  return (
    <>
      <Topbar onToggleSidebar={toggleSidebar} />
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="relative min-h-screen">
        <div className="page-wrapper !pt-16">{children}</div>
      </div>
    </>
  )
}
