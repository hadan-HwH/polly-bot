import axios, { type AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios'
import type { ApiResponse, ErrorResponse } from '@src/types/api'

const DEFAULT_TIMEOUT = 15_000
const MAX_RETRIES = 3
const RETRY_DELAY_BASE = 1_000

function isRetryable(error: AxiosError): boolean {
  if (!error.response) return true
  const status = error.response.status
  return status === 429 || status >= 500
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: '/api',
    timeout: DEFAULT_TIMEOUT,
    headers: { 'Content-Type': 'application/json' },
  })

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<ErrorResponse>) => {
      const config = error.config as AxiosRequestConfig & { _retryCount?: number }
      if (!config) return Promise.reject(error)

      config._retryCount = config._retryCount ?? 0

      if (config._retryCount < MAX_RETRIES && isRetryable(error)) {
        config._retryCount += 1
        const backoff = RETRY_DELAY_BASE * Math.pow(2, config._retryCount - 1)
        await delay(backoff)
        return client(config)
      }

      return Promise.reject(error)
    },
  )

  return client
}

export const apiClient = createApiClient()

export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
  const response = await apiClient.get<ApiResponse<T>>(url, config)
  return response.data
}

export async function apiPost<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
  const response = await apiClient.post<ApiResponse<T>>(url, data, config)
  return response.data
}

export async function apiPut<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
  const response = await apiClient.put<ApiResponse<T>>(url, data, config)
  return response.data
}
