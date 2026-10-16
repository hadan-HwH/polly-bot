type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'primary' | 'secondary'

interface StatusBadgeProps {
  label: string
  variant?: BadgeVariant
  dot?: boolean
  className?: string
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: 'badge-green',
  danger: 'badge-red',
  warning: 'badge-yellow',
  info: 'badge-cyan',
  primary: 'badge-primary',
  secondary: 'badge-gray',
}

const DOT_COLORS: Record<BadgeVariant, string> = {
  success: 'bg-green-500',
  danger: 'bg-red-500',
  warning: 'bg-yellow-500',
  info: 'bg-cyan-500',
  primary: 'bg-primary-500',
  secondary: 'bg-gray-500',
}

export function StatusBadge({ label, variant = 'primary', dot = false, className = '' }: StatusBadgeProps) {
  return (
    <span className={`badge ${VARIANT_CLASSES[variant]} ${className}`}>
      {dot && <span className={`inline-block size-1.5 rounded-full mr-1.5 ${DOT_COLORS[variant]}`} />}
      {label}
    </span>
  )
}
