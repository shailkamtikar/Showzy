import { lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getEnv } from './lib/env'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import Layout from './components/Layout'
import Home from './pages/Home'
const Auth = lazy(() => import('./pages/Auth'))
import CatalogItem from './pages/CatalogItem'
import ShowSeats from './pages/ShowSeats'
const Checkout = lazy(() => import('./pages/Checkout'))
const Gateway = lazy(() => import('./pages/Gateway'))
const Bookings = lazy(() => import('./pages/Bookings'))
const Ticket = lazy(() => import('./pages/Ticket'))
const Status = lazy(() => import('./pages/Status'))
const SecurityDashboard = lazy(() => import('./pages/admin/SecurityDashboard'))
const CaseDetail = lazy(() => import('./pages/admin/CaseDetail'))
const AdminCatalog = lazy(() => import('./pages/admin/AdminCatalog'))

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } })

function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24">
      <p className="label">404</p>
      <h1 className="display mt-3 text-6xl">Nothing on this <em>screen.</em></h1>
    </div>
  )
}

export default function App() {
  const env = getEnv()
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="login" element={<Auth mode="login" />} />
              <Route path="signup" element={<Auth mode="signup" />} />
              <Route path="catalog/:id" element={<CatalogItem />} />
              <Route path="shows/:showId" element={<ShowSeats />} />
              <Route path="checkout/:orderId" element={<RequireAuth><Checkout /></RequireAuth>} />
              <Route path="pay/:attemptId" element={<RequireAuth><Gateway /></RequireAuth>} />
              <Route path="bookings" element={<RequireAuth><Bookings /></RequireAuth>} />
              <Route path="tickets/:ticketId" element={<RequireAuth><Ticket /></RequireAuth>} />
              <Route path="admin/security" element={<RequireAuth admin><SecurityDashboard /></RequireAuth>} />
              <Route path="admin/security/cases/:caseId" element={<RequireAuth admin><CaseDetail /></RequireAuth>} />
              <Route path="admin/catalog" element={<RequireAuth admin><AdminCatalog /></RequireAuth>} />
              <Route path="status" element={<Status supabaseHost={new URL(env.supabaseUrl).host} apiBaseUrl={env.apiBaseUrl} />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
