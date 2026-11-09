import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function inViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}

test.beforeEach(async ({ context, page }) => {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" ? route.continue() : route.abort("blockedbyclient");
  });
  await page.goto("/");
});

for (const title of ["Ativos e saldo", "Meus robôs", "Estado e controles"]) {
  test(`${title}: conteúdo e ações permanecem dentro da tela`, async ({ page }, testInfo) => {
    const trigger = page.getByRole("button", { name: title, exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS("opacity", "1");
    await inViewport(page, dialog);
    const close = dialog.getByRole("button", { name: "Fechar modal", exact: true });
    const footer = dialog.getByRole("button", { name: "Fechar", exact: true });
    await inViewport(page, close);
    await inViewport(page, footer);
    const body = dialog.locator("[data-ux-dialog-body]");
    expect(await body.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await dialog.getByLabel("Valor de teste 12", { exact: true }).fill("0.01");
    await expect(dialog.getByLabel("Valor de teste 12", { exact: true })).toBeFocused();
    await inViewport(page, footer);
    await inViewport(page, close);
    await body.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    const lastInput = await dialog.getByLabel("Valor de teste 12", { exact: true }).boundingBox();
    const bodyBox = (await body.boundingBox())!;
    expect(lastInput!.y + lastInput!.height).toBeLessThanOrEqual(bodyBox.y + bodyBox.height + 1);
    await page.screenshot({ path: testInfo.outputPath("modal.png"), animations: "disabled" });
    await footer.click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

test("Escape, Tab e Shift+Tab mantêm e devolvem o foco", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Ativos e saldo", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Ativos e saldo", exact: true });
  for (let index = 0; index < 18; index++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  for (let index = 0; index < 18; index++) {
    await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("seletor aninhado fecha somente o modal superior", async ({ page }) => {
  await page.getByRole("button", { name: "Outras ferramentas", exact: true }).click();
  const outer = page.getByRole("dialog", { name: "Outras ferramentas", exact: true });
  const walletTrigger = outer.getByRole("button", { name: /Escolher carteira:/ });
  await walletTrigger.click();
  const inner = page.getByRole("dialog", { name: "Escolher carteira", exact: true });
  await expect(inner).toBeVisible();
  await inViewport(page, inner);
  await inner.getByRole("button", { name: /Carteira B/ }).click();
  await expect(inner).toHaveCount(0);
  await expect(outer).toBeVisible();
  await expect(walletTrigger).toBeFocused();
  await expect(walletTrigger).toContainText("Carteira B");
  await page.keyboard.press("Escape");
  await expect(outer).toHaveCount(0);
});

test("alvos de toque, texto ampliado e movimento reduzido", async ({ page }) => {
  const controls = page.getByTestId("toolbar").getByRole("button");
  for (const control of await controls.all()) {
    await inViewport(page, control);
    if (page.viewportSize()!.width < 640) {
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({ content: "html { font-size: 24px; }" });
  await page.getByRole("button", { name: "Estado e controles", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Estado e controles", exact: true });
  await inViewport(page, dialog);
  await inViewport(page, dialog.getByRole("button", { name: "Fechar", exact: true }));
  expect(await dialog.evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
});

test("modais passam na análise automática de acessibilidade", async ({ page }) => {
  await page.getByRole("button", { name: "Ativos e saldo", exact: true }).click();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

for (const theme of ["dark", "light"]) {
  test(`percentual escolhido fica destacado no tema ${theme}`, async ({ page }, testInfo) => {
    await page.evaluate((value) => {
      document.documentElement.dataset["theme"] = value;
    }, theme);
    await page.getByRole("button", { name: "Escolher porcentagem", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Escolher porcentagem", exact: true });
    await inViewport(page, dialog);
    await expect(dialog.getByText("50% selecionado")).toBeVisible();
    for (const name of ["25%", "50%", "75%", "Máximo 100%"]) {
      const button = dialog.getByRole("button", { name, exact: true });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await inViewport(page, button);
      const percentage = name === "Máximo 100%" ? "100%" : name;
      await expect(dialog.getByText(`${percentage} selecionado`)).toBeVisible();
      const selectedColor = await button.evaluate((node) => getComputedStyle(node).backgroundColor);
      const unselected = dialog.getByRole("button", {
        name: name === "25%" ? "50%" : "25%",
        exact: true,
      });
      expect(selectedColor).not.toBe(
        await unselected.evaluate((node) => getComputedStyle(node).backgroundColor),
      );
    }
    await dialog.getByRole("button", { name: "25%", exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath(`percentual-${theme}.png`),
      animations: "disabled",
    });
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await dialog.getByLabel("Valor para a atividade").fill("0.037");
    await expect(dialog.getByText("Valor personalizado")).toBeVisible();
    await expect(dialog.getByRole("button", { pressed: true })).toHaveCount(0);
  });
}
