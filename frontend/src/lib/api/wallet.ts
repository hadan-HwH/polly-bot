import { apiClient } from './client'
import { transformKeys } from './transform'

async function get<T>(url: string): Promise<T> {
  const response = await apiClient.get(url)
  return transformKeys<T>(response.data)
}

export interface WalletStatus {
  connected: boolean
  walletAddress: string
  dryRun: boolean
  usdcBalance: number
  maticBalance: number
  hasApiKeys: boolean
}

export interface WalletValidateResponse {
  walletAddress: string
  usdcBalance: number
  maticBalance: number
  apiKeyGenerated: boolean
}

export function getWalletStatus(): Promise<WalletStatus> {
  return get<WalletStatus>('/wallet/status')
}

export async function validateWallet(privateKey: string): Promise<WalletValidateResponse> {
  const response = await apiClient.post('/wallet/validate', { private_key: privateKey })
  return transformKeys<WalletValidateResponse>(response.data)
}

export async function disconnectWallet(): Promise<{ disconnected: boolean }> {
  const response = await apiClient.post('/wallet/disconnect')
  return transformKeys<{ disconnected: boolean }>(response.data)
}
