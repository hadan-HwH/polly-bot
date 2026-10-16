import { useEffect, useRef, useState } from 'react'

interface PriceChipProps {
  price: number
  previousPrice?: number
  precision?: number
  prefix?: string
  suffix?: string
  className?: string
}

function baseColor(price: number): string {
  const cents = price * 100
  if (cents >= 60) return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
  if (cents >= 40) return 'bg-gray-100 dark:bg-dark-800 text-gray-700 dark:text-dark-200'
  return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
}

const FLASH_UP = 'bg-green-200 dark:bg-green-800/60 text-green-800 dark:text-green-200 ring-1 ring-green-300 dark:ring-green-700'
const FLASH_DOWN = 'bg-red-200 dark:bg-red-800/60 text-red-800 dark:text-red-200 ring-1 ring-red-300 dark:ring-red-700'

export function PriceChip({
  price,
  previousPrice,
  precision = 2,
  prefix = '',
  suffix = '¢',
  className = '',
}: PriceChipProps) {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const prevRef = useRef(previousPrice ?? price)

  useEffect(() => {
    if (price > prevRef.current) {
      setFlash('up')
    } else if (price < prevRef.current) {
      setFlash('down')
    }
    prevRef.current = price

    const timer = setTimeout(() => setFlash(null), 600)
    return () => clearTimeout(timer)
  }, [price])

  const colorClass = flash === 'up' ? FLASH_UP : flash === 'down' ? FLASH_DOWN : baseColor(price)

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-sm font-mono transition-colors duration-300 ${colorClass} ${className}`}>
      {prefix}{(price * 100).toFixed(precision)}{suffix}
    </span>
  )
}
