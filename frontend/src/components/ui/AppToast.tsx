import { useEffect, useState, type ReactNode } from 'react'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  variant: ToastVariant
  message: string
  duration?: number
}

const ICONS: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle className="size-5 text-green-500" />,
  error: <AlertCircle className="size-5 text-red-500" />,
  info: <Info className="size-5 text-primary-500" />,
  warning: <AlertCircle className="size-5 text-yellow-500" />,
}

const BG: Record<ToastVariant, string> = {
  success: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800',
  error: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800',
  info: 'bg-primary-50 dark:bg-primary-900/30 border-primary-200 dark:border-primary-800',
  warning: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800',
}

let toastListeners: Array<(toast: Toast) => void> = []

export function showToast(variant: ToastVariant, message: string, duration = 5_000): void {
  const toast: Toast = { id: crypto.randomUUID(), variant, message, duration }
  toastListeners.forEach((fn) => fn(toast))
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const handler = (toast: Toast) => setToasts((prev) => [...prev, toast])
    toastListeners.push(handler)
    return () => {
      toastListeners = toastListeners.filter((fn) => fn !== handler)
    }
  }, [])

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(onDismiss, toast.duration)
      return () => clearTimeout(timer)
    }
  }, [toast.duration, onDismiss])

  return (
    <div className={`flex items-center gap-3 p-3 rounded-md border shadow-lg ${BG[toast.variant]} animate-slide-in`}>
      {ICONS[toast.variant]}
      <span className="flex-1 text-sm">{toast.message}</span>
      <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600">
        <X className="size-4" />
      </button>
    </div>
  )
}
