import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type LayoutMode = 'light' | 'dark'
export type LayoutType = 'default' | 'horizontal' | 'semibox' | 'modern'
export type SidebarSize = 'default' | 'small' | 'medium'
export type ContentWidth = 'fluid' | 'boxed'

interface LayoutState {
  layoutMode: LayoutMode
  layoutType: LayoutType
  sidebarSize: SidebarSize
  contentWidth: ContentWidth
  sidebarColor: string
  direction: 'ltr' | 'rtl'
  dataColor: string
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const val = localStorage.getItem(key)
    return val ? (val as unknown as T) : fallback
  } catch {
    return fallback
  }
}

const initialState: LayoutState = {
  layoutMode: loadFromStorage<LayoutMode>('data-mode', 'light'),
  layoutType: loadFromStorage<LayoutType>('data-layout', 'default'),
  sidebarSize: loadFromStorage<SidebarSize>('data-sidebar', 'default'),
  contentWidth: loadFromStorage<ContentWidth>('data-content-width', 'fluid'),
  sidebarColor: loadFromStorage('data-sidebar-colors', 'light'),
  direction: loadFromStorage<'ltr' | 'rtl'>('dir', 'ltr'),
  dataColor: loadFromStorage('data-colors', 'default'),
}

const layoutSlice = createSlice({
  name: 'layout',
  initialState,
  reducers: {
    setLayoutMode(state, action: PayloadAction<LayoutMode>) {
      state.layoutMode = action.payload
      document.documentElement.setAttribute('data-mode', action.payload)
      localStorage.setItem('data-mode', action.payload)
    },
    setLayoutType(state, action: PayloadAction<LayoutType>) {
      state.layoutType = action.payload
      document.documentElement.setAttribute('data-layout', action.payload)
      localStorage.setItem('data-layout', action.payload)
    },
    setSidebarSize(state, action: PayloadAction<SidebarSize>) {
      state.sidebarSize = action.payload
      document.documentElement.setAttribute('data-sidebar', action.payload)
      localStorage.setItem('data-sidebar', action.payload)
    },
    setContentWidth(state, action: PayloadAction<ContentWidth>) {
      state.contentWidth = action.payload
      document.documentElement.setAttribute('data-content-width', action.payload)
      localStorage.setItem('data-content-width', action.payload)
    },
    setSidebarColor(state, action: PayloadAction<string>) {
      state.sidebarColor = action.payload
      document.documentElement.setAttribute('data-sidebar-colors', action.payload)
      localStorage.setItem('data-sidebar-colors', action.payload)
    },
  },
})

export const { setLayoutMode, setLayoutType, setSidebarSize, setContentWidth, setSidebarColor } = layoutSlice.actions
export default layoutSlice.reducer
