import { lazy } from 'react'
import type { RouteObject } from 'react-router-dom'

const Dashboard = lazy(() => import('@pages/dashboard/Dashboard'))
const Opportunities = lazy(() => import('@pages/negrisk/Opportunities'))
const EventDetail = lazy(() => import('@pages/negrisk/EventDetail'))
const MarketList = lazy(() => import('@pages/markets/MarketList'))
const MarketDetail = lazy(() => import('@pages/markets/MarketDetail'))
const PureArbDashboard = lazy(() => import('@pages/arb/PureArbDashboard'))
const Portfolio = lazy(() => import('@pages/portfolio/Portfolio'))
const SettingsPage = lazy(() => import('@pages/settings/Settings'))

export const routes: RouteObject[] = [
  { index: true, element: <Dashboard /> },
  { path: 'dashboard', element: <Dashboard /> },
  { path: 'negrisk', element: <Opportunities /> },
  { path: 'negrisk/:eventId', element: <EventDetail /> },
  { path: 'markets', element: <MarketList /> },
  { path: 'markets/:slug', element: <MarketDetail /> },
  { path: 'arb', element: <PureArbDashboard /> },
  { path: 'portfolio', element: <Portfolio /> },
  { path: 'settings', element: <SettingsPage /> },
]
