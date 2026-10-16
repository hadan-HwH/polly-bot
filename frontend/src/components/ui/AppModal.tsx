import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface AppModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: ReactNode
  footer?: ReactNode
}

export function AppModal({ isOpen, onClose, title, size = 'md', children, footer }: AppModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  const closeWithAnimation = useCallback(() => {
    setIsAnimating(true)
    setTimeout(() => {
      setIsAnimating(false)
      setIsVisible(false)
      onClose()
      document.body.classList.remove('overflow-hidden')
    }, 300)
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true)
      setIsAnimating(true)
      document.body.classList.add('overflow-hidden')
      const timeout = setTimeout(() => setIsAnimating(false), 300)
      return () => clearTimeout(timeout)
    }
  }, [isOpen])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) closeWithAnimation()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isVisible, closeWithAnimation])

  if (!isVisible) return null

  return (
    <div>
      <div
        className={`backdrop-overlay backdrop-blur-xs ${isAnimating ? 'show' : ''}`}
        onClick={closeWithAnimation}
      />
      <div className={`modal center ${isAnimating ? 'show' : ''}`}>
        <div className={`modal-wrap ${size} center`} ref={modalRef}>
          {title && (
            <div className="modal-header">
              <h6>{title}</h6>
              <button onClick={closeWithAnimation} className="link link-red">
                <X className="size-5" />
              </button>
            </div>
          )}
          <div className="modal-content">{children}</div>
          {footer && <div className="modal-footer">{footer}</div>}
        </div>
      </div>
    </div>
  )
}
