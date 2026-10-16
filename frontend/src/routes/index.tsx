import { Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom'
import Layout from '@layout/Layout'
import { routes } from './allRoutes'

function LayoutWrapper() {
  return (
    <Layout>
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="spin-loader text-primary-500 size-8" />
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </Layout>
  )
}

const router = createBrowserRouter([
  {
    element: <LayoutWrapper />,
    children: [
      ...routes,
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
])

export default function Routing() {
  return <RouterProvider router={router} />
}
