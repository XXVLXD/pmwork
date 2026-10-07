import { expect, test, type Page } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fromISO, toISO, type Roadmap, type Task } from '../src/model';

const start = fromISO('2026-10-05');
const chain: Roadmap = { version: 1, title: 'Тестова дорожня карта', description: 'Перевірка плану — Україна', baseline: null, deadline: null,
  tasks: Array.from({ length: 4 }, (_, i): Task => ({ id: String(i + 1), title: `Задача ${i + 1}`, owner: 'Олена', phase: 'development', status: 'planned', earliestStart: start, duration: 2, dependsOn: i ? [String(i)] : [] })) };
async function seed(page: Page, data: Roadmap = chain) {
  await page.addInitScript(data => { localStorage.setItem('roadly.project.v1', JSON.stringify(data)); localStorage.setItem('roadly.language', 'ru'); }, data);
  await page.goto('/');
  await page.getByRole('button', { name: 'Подробно', exact: true }).click();
  await page.locator('.task-bar').evaluateAll(async elements => { await Promise.all(elements.flatMap(el => el.getAnimations().map(animation => animation.finished))); });
}
test('inserting task 5 animates and shifts tasks 2, 3 and 4; undo and redo restore the chain', async ({ page }) => {
  await seed(page);
  const bar4 = page.getByTestId('bar-4');
  const before = await bar4.boundingBox();
  await page.getByRole('button', { name: 'Добавить задачу: Задача 1', exact: true }).focus();
  await page.getByRole('button', { name: 'Добавить задачу: Задача 1', exact: true }).click();
  await page.getByLabel('Название задачи', { exact: true }).fill('Задача 5');
  await page.getByLabel('Длительность, календарных дней', { exact: true }).fill('3');
  await page.evaluate(() => {
    const state = window as unknown as { movementSamples: number[]; movementDone: boolean };
    state.movementSamples = []; state.movementDone = false;
    const until = performance.now() + 1100;
    const sample = () => {
      state.movementSamples.push(document.querySelector('[data-testid="bar-4"]')!.getBoundingClientRect().x);
      if (performance.now() < until) requestAnimationFrame(sample); else state.movementDone = true;
    };
    requestAnimationFrame(sample);
  });
  await page.getByRole('button', { name: 'Добавить в план', exact: true }).click();
  for (const [id, offset] of [['2', 5], ['3', 7], ['4', 9]] as const) await expect(page.getByTestId(`bar-${id}`)).toHaveAttribute('data-start', toISO(start + offset));
  const transition = await bar4.evaluate(el => ({ duration: getComputedStyle(el).transitionDuration, property: getComputedStyle(el).transitionProperty, animations: el.getAnimations().map(a => a.playState) }));
  expect(transition.duration).toContain('0.65s'); expect(transition.property).toContain('left');
  await expect.poll(async () => Math.round((await bar4.boundingBox())!.x - before!.x)).toBe(90);
  await page.waitForFunction(() => (window as unknown as { movementDone: boolean }).movementDone);
  const samples = await page.evaluate(() => (window as unknown as { movementSamples: number[] }).movementSamples);
  expect(samples.some(x => x > before!.x + 2 && x < before!.x + 88)).toBe(true);
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(bar4).toHaveAttribute('data-start', '2026-10-11');
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(bar4).toHaveAttribute('data-start', '2026-10-14');
  await page.reload();
  // This test's init script deliberately reseeds the project; persistence is tested separately.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(chain.title);
});
test('dragging and keyboard movement propagate dates and survive reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(data => localStorage.setItem('roadly.project.v1', JSON.stringify(data)), chain);
  await page.reload();
  await page.getByRole('button', { name: 'Подробно', exact: true }).click();
  const bar = page.getByTestId('bar-1'); const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + 15, box.y + 15); await page.mouse.down();
  await page.mouse.move(box.x + 105, box.y + 15, { steps: 9 }); await page.mouse.up();
  await expect(page.getByTestId('bar-4')).toHaveAttribute('data-start', '2026-10-14');
  await bar.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('bar-4')).toHaveAttribute('data-start', '2026-10-15');
  await page.reload(); await expect(page.getByTestId('bar-4')).toHaveAttribute('data-start', '2026-10-15');
});
test('language switch updates controls, dialogs and document language', async ({ page }) => {
  await seed(page);
  await page.getByLabel('Язык', { exact: true }).selectOption('uk');
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  await expect(page.getByRole('heading', { name: 'План проєкту' })).toBeVisible();
  await page.getByRole('button', { name: 'Додати завдання', exact: true }).first().click();
  await expect(page.getByLabel('Назва завдання', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Скасувати', exact: true }).click();
  await page.getByLabel('Мова', { exact: true }).selectOption('en');
  await expect(page.getByRole('heading', { name: 'Project timeline' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(chain.title);
});
test('editing duration and deleting a middle task reconnects the chain; cycles are disabled', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Зафиксировать план', exact: true }).click();
  await page.getByTestId('bar-1').click();
  await expect(page.getByRole('checkbox', { name: 'Задача 2', exact: true })).toBeDisabled();
  await page.getByLabel('Длительность, календарных дней', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await expect(page.getByTestId('bar-4')).toHaveAttribute('data-start', '2026-10-14');
  await page.getByTestId('bar-2').click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Удалить задачу', exact: true }).click();
  await expect(page.getByTestId('bar-2')).toHaveCount(0);
  await expect(page.getByTestId('bar-4')).toHaveAttribute('data-start', '2026-10-12');
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(page.getByTestId('bar-2')).toHaveCount(1);
  await expect(page.getByTestId('bar-4')).toHaveAttribute('data-start', '2026-10-14');
});
test('PDF has readable Cyrillic text and PPTX contains editable shapes and all tasks', async ({ page }, testInfo) => {
  await seed(page);
  await page.getByLabel('Язык', { exact: true }).selectOption('uk');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const format of ['pdf', 'pptx'] as const) {
    await page.getByRole('button', { name: 'Експорт', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: format === 'pdf' ? /Документ PDF/ : /Презентація PowerPoint/ }).click();
    const download = await downloadPromise; const file = testInfo.outputPath(`roadmap.${format}`); await download.saveAs(file);
    expect((await readFile(file)).length).toBeGreaterThan(1000);
    if (format === 'pdf') {
      const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
      expect(text).toContain('Тестова дорожня карта'); expect(text).toContain('Перевірка плану'); expect(text).toContain('Олена');
      for (let i = 1; i <= 4; i++) expect(text).toContain(`Задача ${i}`);
    } else {
      const xml = execFileSync('unzip', ['-p', file, 'ppt/slides/slide1.xml'], { encoding: 'utf8' });
      expect(xml).toContain('Тестова дорожня карта'); expect(xml).toContain('uk-UA');
      for (let i = 1; i <= 4; i++) expect(xml).toContain(`Задача ${i}`);
      expect(xml).toContain('<p:sp>'); expect(xml).not.toContain('<p:pic>');
    }
  }
  expect(errors).toEqual([]);
});
test('project backup can be imported, and invalid data does not replace current work', async ({ page }, testInfo) => {
  await seed(page);
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Сохранить копию', exact: true }).click();
  const download = await promise; const path = testInfo.outputPath('backup.json'); await download.saveAs(path);
  expect(JSON.parse(await readFile(path, 'utf8')).title).toBe(chain.title);
  await page.getByLabel('Открыть копию', { exact: true }).setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1}') });
  await expect(page.getByRole('alert')).toContainText('Не удалось открыть файл');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(chain.title);
  page.once('dialog', dialog => dialog.accept());
  await page.getByLabel('Открыть копию', { exact: true }).setInputFiles({ name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...chain, title: 'Imported roadmap' })) });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Imported roadmap');
});
test('desktop and mobile layout stay usable without page overflow', async ({ page }) => {
  await page.goto('/'); await page.evaluate(() => document.fonts.ready);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/roadly-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Добавить задачу', exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/roadly-mobile.png', fullPage: true });
});
test('standalone HTML opens directly from disk where browser policy permits it', async ({ page }) => {
  try { await page.goto('file://' + resolve('dist/index.html')); }
  catch (error) {
    test.skip(String(error).includes('ERR_BLOCKED_BY_ADMINISTRATOR'), 'Cloud browser policy prohibits file:// navigation; the same standalone build is tested over HTTP and offline separately.');
    throw error;
  }
  await expect(page.getByRole('heading', { name: 'План проекта' })).toBeVisible();
});
test('standalone build runs and exports both formats without network access', async ({ page }) => {
  const html = await readFile(resolve('dist/index.html'), 'utf8');
  await page.route('**/pmwork/', route => route.fulfill({ contentType: 'text/html', body: html }));
  const external: string[] = [];
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().endsWith('/pmwork/')) external.push(request.url()); });
  await page.goto('/pmwork/');
  await expect(page.getByRole('heading', { name: 'План проекта' })).toBeVisible();
  await page.getByRole('button', { name: 'Добавить задачу', exact: true }).first().click();
  await page.getByLabel('Название задачи', { exact: true }).fill('Offline task');
  await page.getByRole('button', { name: 'Добавить в план', exact: true }).click();
  await expect(page.getByRole('button', { name: /Offline task/ }).first()).toBeVisible();
  await page.context().setOffline(true);
  for (const label of [/Документ PDF/, /Презентация PowerPoint/]) {
    await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
    const promise = page.waitForEvent('download'); await page.getByRole('button', { name: label }).click();
    expect(await (await promise).failure()).toBeNull();
  }
  expect(external).toEqual([]);
});
