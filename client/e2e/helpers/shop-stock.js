import { expect } from "@playwright/test";

// Navigate the visible catalog using its normal page controls.
export async function findStockRow(page, shop, name) {
  const row = shop.locator(".shop-stock-row").filter({
    has: page.locator(".shop-stock-name", {
      hasText: new RegExp(`^${name}(?:$|black|white)`),
    }),
  });
  const previous = shop.getByRole("button", { name: /^Previous page/ });
  const next = shop.getByRole("button", { name: /^Next page/ });
  if (await row.count()) return row;
  while (await previous.isEnabled()) await previous.click();
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await row.count()) return row;
    if (!(await next.isEnabled())) break;
    await next.click();
  }
  await expect(row, `catalog contains ${name}`).toBeVisible();
  return row;
}
