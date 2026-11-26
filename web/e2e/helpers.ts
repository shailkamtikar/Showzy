import { expect, type Page } from '@playwright/test'

export async function login(page: Page, who: 'CUSTOMER' | 'CUSTOMER2' | 'ADMIN' = 'CUSTOMER') {
  const email = process.env[`DEMO_${who}_EMAIL`]
  const password = process.env[`DEMO_${who}_PASSWORD`]
  if (!email || !password) throw new Error('Demo credentials missing: run api/scripts/create_demo_users.py')
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

/** Opens the first movie's show in the Standard/second hall and switches to the 2D map. */
export async function openFirstMovieShow(page: Page, index = 0) {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Movies' }).click()
  await page.getByRole('link', { name: /Thriller|Drama|Sci-fi/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Choose a show' })).toBeVisible()
  await page.locator('ul a[href^="/shows/"]').nth(index).click()
  await page.getByRole('tab', { name: '2D map' }).click()
  await expect(page.getByRole('group', { name: /^Row/ }).first()).toBeVisible()
}

/** Drops every active hold of a demo account (API call, no UI), so tests never leave seats stuck. */
export async function releaseHolds(who: 'CUSTOMER' | 'CUSTOMER2' | 'ADMIN' = 'CUSTOMER') {
  const env = process.env
  const r = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env[`DEMO_${who}_EMAIL`], password: env[`DEMO_${who}_PASSWORD`] }),
  })
  const { access_token } = (await r.json()) as { access_token: string }
  await fetch(`${env.VITE_API_BASE_URL}/api/me/holds`, { method: 'DELETE', headers: { Authorization: `Bearer ${access_token}` } })
}

export const availableSeats = (page: Page) => page.locator('button[aria-label$="available"]:not([disabled])')
