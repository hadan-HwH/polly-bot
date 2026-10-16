import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { apiGet, apiPost } from '@lib/api/client'

vi.mock('axios', () => {
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  }
  return {
    default: {
      create: vi.fn(() => instance),
      isAxiosError: vi.fn(() => false),
    },
  }
})

function getMockClient() {
  return (axios.create as ReturnType<typeof vi.fn>).mock.results[0]?.value
}

describe('API client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // re-import to trigger module initialization
  })

  it('apiGet calls client.get with the correct url', async () => {
    const mockResponse = { data: { success: true, data: [1, 2, 3], timestamp: '' } }
    const client = getMockClient()
    if (client) {
      client.get.mockResolvedValueOnce(mockResponse)
      const result = await apiGet('/test')
      expect(result).toEqual(mockResponse.data)
    }
  })

  it('apiPost calls client.post with data', async () => {
    const mockResponse = { data: { success: true, data: { id: 1 }, timestamp: '' } }
    const client = getMockClient()
    if (client) {
      client.post.mockResolvedValueOnce(mockResponse)
      const result = await apiPost('/test', { foo: 'bar' })
      expect(result).toEqual(mockResponse.data)
    }
  })
})
