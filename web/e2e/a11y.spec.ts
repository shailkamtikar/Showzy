import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { availableSeats, login, openFirstMovieShow, releaseHolds } from './helpers'

test.afterEach(async () => { await releaseHolds('CUSTOMER') })

async function scan(page: import('@playwright/test').Page, name: string) {
  // Let the 0.3s page fade-in and reveal animations finish; mid-fade opacity lowers measured contrast.
  await page.waitForTimeout(900)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${name}: ${v.id} (${v.nodes.length})`), JSON.stringify(bad.map((v) => v.nodes.map((n) => n.target)))).toEqual([])
}

test('public pages have no serious accessibility violations', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#on-now a[href^="/catalog/"]').first()).toBeVisible()
  await scan(page, 'home')
  await page.locator('#on-now a[href^="/catalog/"]').first().click()
  await expect(page.getByRole('heading', { name: 'Choose a show' })).toBeVisible()
  await scan(page, 'item')
  await page.goto('/login')
  await scan(page, 'login')
  await openFirstMovieShow(page)
  await availableSeats(page).first().click()
  await scan(page, 'seats-2d')
})

test('checkout and gateway pages are accessible', async ({ page }) => {
  await login(page, 'CUSTOMER')
  await openFirstMovieShow(page, 4)
  await availableSeats(page).nth(40).click()
  await page.getByRole('button', { name: 'Continue to checkout' }).click()
  await expect(page.getByTestId('order-total')).toBeVisible()
  await scan(page, 'checkout')
  await page.getByRole('button', { name: 'Pay (demo)' }).click()
  await expect(page.getByTestId('challenge')).toBeVisible()
  await scan(page, 'gateway')
})

test('reduced motion and a 375px viewport work without horizontal scroll', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await expect(page.locator('#on-now a[href^="/catalog/"]').first()).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await openFirstMovieShow(page)
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow2).toBeLessThanOrEqual(1)
})
