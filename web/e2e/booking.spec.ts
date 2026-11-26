import { expect, test } from '@playwright/test'
import { availableSeats, login, openFirstMovieShow, releaseHolds } from './helpers'

test.beforeAll(async () => { await releaseHolds('CUSTOMER') })
test.afterEach(async () => { await releaseHolds('CUSTOMER') })

test.describe('browse as a guest', () => {
  test('landing page lists several items with prices', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /See the view/ })).toBeVisible()
    const cards = page.locator('#on-now a[href^="/catalog/"]')
    await expect(cards.first()).toBeVisible()
    expect(await cards.count()).toBeGreaterThanOrEqual(6)
    await expect(page.locator('#on-now').getByText(/₹/).first()).toBeVisible()
  })

  test('tabs filter the catalog', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('tab', { name: 'Sports' }).click()
    await expect(page.getByRole('heading', { name: /Mumbai Mavericks/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Midnight Express Run' })).toHaveCount(0)
  })

  test('different showtimes of a movie use different halls', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('tab', { name: 'Movies' }).click()
    await page.getByRole('link', { name: /Thriller/ }).first().click()
    await expect(page.locator('ul a[href^="/shows/"]').first()).toBeVisible()
    const halls = await page.locator('ul a[href^="/shows/"] .label').allTextContents()
    expect(new Set(halls.map((h) => h.split(' - ')[0])).size).toBeGreaterThanOrEqual(2)
  })

  test('guests are sent to sign in before holding seats', async ({ page }) => {
    await openFirstMovieShow(page)
    await availableSeats(page).first().click()
    await page.getByRole('button', { name: 'Sign in to continue' }).click()
    await expect(page).toHaveURL(/\/login\?next=/)
  })

  test('protected pages redirect to login', async ({ page }) => {
    await page.goto('/bookings')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('seat selection', () => {
  test('select, deselect, limit of 6, keyboard access', async ({ page }) => {
    await openFirstMovieShow(page)
    const seat = availableSeats(page).first()
    await seat.focus()
    await page.keyboard.press('Space')
    await expect(page.getByText('1/6')).toBeVisible()
    await expect(page.getByTestId('subtotal')).toContainText('₹')
    await page.keyboard.press('Space')
    await expect(page.getByText('0/6')).toBeVisible()
    for (let i = 0; i < 7; i++) await availableSeats(page).nth(i).click()
    await expect(page.getByText('6/6')).toBeVisible()
    await expect(page.getByText('Maximum 6 seats per booking.')).toBeVisible()
  })

  test('seat view preview shows the disclosure', async ({ page }) => {
    await openFirstMovieShow(page)
    await availableSeats(page).nth(3).click()
    await page.getByRole('button', { name: 'Preview view' }).click()
    await expect(page.getByTestId('viewer-3d')).toBeVisible()
    await expect(page.getByText(/Illustrative view generated from venue geometry/)).toBeVisible()
    await page.getByRole('button', { name: 'Exit view' }).click()
    await expect(page.getByText(/Illustrative view/)).toHaveCount(0)
  })

  test('3D viewer renders for a stadium and focuses a section', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('tab', { name: 'Sports' }).click()
    await page.getByRole('link', { name: /Cricket/ }).first().click()
    await page.locator('ul a[href^="/shows/"]').first().click()
    await expect(page.getByTestId('viewer-3d').locator('canvas')).toBeVisible()
    const label = page.getByRole('tab', { name: /^Focus / }).first()
    await expect(label).toBeVisible()
    await label.click()
    await expect(page.getByRole('button', { name: /Whole venue/ })).toBeVisible()
  })
})

test.describe('3D viewer', () => {
  test('selecting several seats in 3D flies to each and never loses the GPU context (black-screen regression)', async ({ page }) => {
    const warnings: string[] = []
    page.on('console', (m) => /Too many active WebGL contexts|CONTEXT_LOST/i.test(m.text()) && warnings.push(m.text()))
    await page.setViewportSize({ width: 1280, height: 860 })
    await page.goto('/')
    await page.getByRole('tab', { name: 'Movies' }).click()
    await page.getByRole('link', { name: /Thriller/ }).first().click()
    await page.locator('ul a[href^="/shows/"]').first().click()
    const viewer = page.getByTestId('viewer-3d')
    await viewer.locator('canvas').waitFor()
    await viewer.scrollIntoViewIfNeeded()
    await page.waitForTimeout(2300)
    const box = (await viewer.boundingBox())!
    const cam = () => page.evaluate(() => (window as any).__showzyState.get().camera.position.toArray().join(','))
    const positions: string[] = []
    for (const [fx, fy] of [[0.4, 0.62], [0.3, 0.8], [0.15, 0.75], [0.62, 0.6]]) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
      await page.waitForTimeout(1500)
      positions.push(await cam())
    }
    await expect(page.locator('aside').getByText('4/6')).toBeVisible()
    expect(new Set(positions).size).toBe(4) // camera flew to every newly selected seat
    await expect(page.getByRole('dialog')).toBeVisible() // seat card
    expect(warnings).toEqual([])
    // still rendering after all that
    const f0 = await page.evaluate(() => (window as any).__showzyGL.info.render.frame)
    await page.getByRole('button', { name: 'View from this seat' }).click()
    await expect(page.getByText(/Illustrative view generated/)).toBeVisible()
    expect(await page.evaluate(() => (window as any).__showzyGL.info.render.frame)).toBeGreaterThan(f0)
    // switch to another selected seat's view from the pills
    const before = await cam()
    const pills = viewer.locator('button', { hasText: /^[A-Z]\d+$/ })
    await expect(pills).toHaveCount(4)
    const current = (await viewer.getByText(/View from Row/).textContent())!.match(/Row (\S+), Seat (\S+)/)!
    const currentId = `${current[1]}${current[2]}`
    const labels = await pills.allTextContents()
    await pills.nth(labels.findIndex((l) => l.trim() !== currentId)).click()
    await page.waitForTimeout(1400)
    expect(await cam()).not.toBe(before)
    // idle = no rendering (on-demand loop)
    const f1 = await page.evaluate(() => (window as any).__showzyGL.info.render.frame)
    await page.waitForTimeout(1200)
    expect(await page.evaluate(() => (window as any).__showzyGL.info.render.frame)).toBe(f1)
  })
})

test.describe('full booking journey', () => {
  test('hold, order, demo payment (wrong then right code), ticket', async ({ page }) => {
    await login(page, 'CUSTOMER')
    await openFirstMovieShow(page, 2)
    await availableSeats(page).nth(10).click()
    await availableSeats(page).nth(11).click()
    await page.getByRole('button', { name: 'Continue to checkout' }).click()

    await expect(page).toHaveURL(/\/checkout\//)
    await expect(page.getByTestId('hold-timer')).toHaveText(/[3-5]:\d\d/)
    await expect(page.getByTestId('order-total')).toContainText('₹')
    await page.getByRole('button', { name: 'Pay (demo)' }).click()

    await expect(page).toHaveURL(/\/pay\//)
    await expect(page.getByText(/no real money will be charged/i).first()).toBeVisible()
    const challenge = (await page.getByTestId('challenge').textContent())!.trim()
    expect(challenge).toMatch(/^DEMO-[A-Z2-9]{4}-[A-Z2-9]{4}$/)

    await page.getByLabel('Re-enter the code').fill('DEMO-ZZZZ-ZZZZ')
    await page.getByRole('button', { name: 'Confirm demo payment' }).click()
    await expect(page.getByRole('alert')).toContainText(/invalid or has expired/i)

    await page.getByLabel('Re-enter the code').fill(challenge)
    await page.getByRole('button', { name: 'Confirm demo payment' }).click()
    await expect(page.getByRole('heading', { name: /Booking confirmed/ })).toBeVisible()
    await expect(page.getByTestId('reference')).toHaveText(/^DEMO_TXN_/)

    await page.getByRole('link', { name: 'View demo ticket' }).first().click()
    await expect(page.getByText(/not valid for entry/i).first()).toBeVisible()
    await page.goto('/bookings')
    await expect(page.getByText('Confirmed (simulated)').first()).toBeVisible()
  })

  test('opening the gateway fresh issues a new code and the old one is dead', async ({ page }) => {
    await login(page, 'CUSTOMER')
    await openFirstMovieShow(page, 3)
    await availableSeats(page).nth(20).click()
    await page.getByRole('button', { name: 'Continue to checkout' }).click()
    await page.getByRole('button', { name: 'Pay (demo)' }).click()
    const first = (await page.getByTestId('challenge').textContent())!.trim()
    // A plain reload keeps the browser's history state, so the same (still valid) code is shown.
    await page.reload()
    await expect(page.getByTestId('challenge')).toHaveText(first)
    // Re-opening the URL without that state (new tab, bookmark): only the hash is stored server-side,
    // so the server issues a NEW code and the previous one stops working.
    const tab2 = await page.context().newPage()
    await tab2.goto(page.url())
    await expect(tab2.getByTestId('challenge')).toBeVisible()
    await expect(tab2.getByTestId('challenge')).not.toHaveText(first)
    const second = (await tab2.getByTestId('challenge').textContent())!.trim()
    expect(second).toMatch(/^DEMO-/)
    expect(second).not.toBe(first)
    await tab2.close()
    await page.getByLabel('Re-enter the code').fill(first)
    await page.getByRole('button', { name: 'Confirm demo payment' }).click()
    await expect(page.getByRole('alert')).toContainText(/invalid or has expired/i)
    // leave it tidy: cancel releases the seat
    await page.goBack()
  })

  test('another account cannot open someone else\'s ticket', async ({ page, browser }) => {
    await login(page, 'CUSTOMER')
    await page.goto('/bookings')
    const href = await page.getByRole('link', { name: 'View ticket' }).first().getAttribute('href')
    expect(href).toMatch(/^\/tickets\//)
    const ctx = await browser.newContext()
    const other = await ctx.newPage()
    await login(other, 'CUSTOMER2')
    await other.goto(href!)
    await expect(other.getByText('Ticket not found')).toBeVisible()
    await ctx.close()
  })
})

test.describe('admin area', () => {
  test('customers are blocked from the security dashboard', async ({ page }) => {
    await login(page, 'CUSTOMER')
    await page.goto('/admin/security')
    await expect(page.getByRole('heading', { name: 'Administrators only.' })).toBeVisible()
  })

  test('admin sees the security dashboard', async ({ page }) => {
    await login(page, 'ADMIN')
    await page.goto('/admin/security')
    await expect(page.getByRole('heading', { name: /Anti-scalping/ })).toBeVisible()
    await expect(page.getByText('gemini-3.5-flash-lite')).toBeVisible()
    await expect(page.getByText('Open cases')).toBeVisible()
  })
})
