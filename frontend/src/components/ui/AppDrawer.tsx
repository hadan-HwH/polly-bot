import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

type DrawerPosition = 'left' | 'right'
type DrawerSize = 'sm' | 'md' | 'lg' | 'half'

interface AppDrawerProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  position?: DrawerPosition
  size?: DrawerSize
  children: ReactNode
  footer?: ReactNode
}

const SIZE_MAP: Record<DrawerSize, string> = {
  sm: 'w-64',
  md: 'w-80',
  lg: 'w-96',
  half: 'w-1/2',
}

export function AppDrawer({
  isOpen,
  onClose,
  title,
  position = 'right',
  size = 'md',
  children,
  footer,
}: AppDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  useLayoutEffect(() => {
    if (isOpen) {
      setIsVisible(true)
      requestAnimationFrame(() => setIsAnimating(true))
      document.body.classList.add('overflow-hidden')
    } else {
      setIsAnimating(false)
      const id = setTimeout(() => setIsVisible(false), 300)
      return () => clearTimeout(id)
    }
  }, [isOpen])

  if (!isVisible) return null

  const positionClass = position === 'left' ? 'drawer-start start-0 translate-x-0' : 'drawer-end end-0'
  const translateHidden = position === 'left' ? '-translate-x-full' : 'translate-x-full'

  return (
    <>
      <div
        className={`backdrop-overlay backdrop-blur-xs transition-opacity duration-300 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`drawer ${positionClass} ${SIZE_MAP[size]} transition-transform duration-300 ease-in-out ${isAnimating ? 'translate-x-0' : translateHidden}`}
        ref={drawerRef}
      >
        <div className="flex flex-col h-full">
          {title && (
            <div className="drawer-header">
              <h6>{title}</h6>
              <button onClick={onClose} className="text-red-500">
                <X className="link link-red" />
              </button>
            </div>
          )}
          <div className="drawer-content flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="drawer-footer">{footer}</div>}
        </div>
      </div>
    </>
  )
}
