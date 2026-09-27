import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.SITE_URL || 'http://localhost:5183/demo-v2';
const output = process.env.ARTIFACT_DIR || 'artifacts';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir(output, { recursive: true });
const errors = [], external = [];
const collect = async page => {
  page.setDefaultTimeout(20000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
};
const ready = async page => {
  await page.waitForFunction(() => window.vakeLandscape && document.querySelector('canvas').dataset.rendered === 'true');
  await page.waitForFunction(() => !window.vakeLandscape.state.transitioning);
};
const settled = async page => {
  await page.waitForFunction(() => !window.vakeLandscape.state.transitioning);
  await page.waitForTimeout(150);
};
const distance = page => page.evaluate(() => window.vakeLandscape.camera.position.distanceTo(window.vakeLandscape.controls.target));
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); await collect(page);
  await page.goto(`${base}/?from=test`); await expect(page).toHaveURL(`${base}/?from=test`); await ready(page);
  await expect(page).toHaveTitle('VR Vake — A wider perspective');
  const stats = await page.evaluate(() => ({ ...window.vakeLandscape.stats, calls: window.vakeLandscape.renderer.info.render.calls, triangles: window.vakeLandscape.renderer.info.render.triangles }));
  assert(stats.buildings >= 300); assert(stats.trees >= 1800); assert(stats.roads >= 600);
  assert.equal(stats.contextWidth, 1000); assert.equal(stats.contextDepth, 940);
  assert.equal(await page.locator('[data-layer=boundary], #sources-open, .header .home-link').count(), 0);
  assert.equal(await page.evaluate(() => 'boundary' in window.vakeLandscape.groups), false);
  assert(stats.calls < 150, 'Static geometry should be batched'); assert(stats.triangles > 100000, 'Scene contains rendered geometry');
  assert(await page.evaluate(() => document.fonts.check('12px Manrope')), 'Local font loads');
  await page.screenshot({ path: `${output}/landscape-desktop.png` });
  const original = await distance(page); await page.locator('#zoom-in').click(); await settled(page); assert(await distance(page) < original * .9);
  await page.locator('#zoom-out').click(); await settled(page); assert(await distance(page) > original * .95);
  for (const name of ['buildings', 'vegetation']) {
    await page.locator(`[data-layer=${name}]`).uncheck();
    assert.equal(await page.evaluate(name => window.vakeLandscape.groups[name].visible, name), false);
    await page.locator(`[data-layer=${name}]`).check();
  }
  await page.locator('[data-layer=labels]').uncheck(); await expect(page.locator('#labels')).toBeHidden();
  await page.locator('[data-layer=labels]').check(); await expect(page.locator('#labels')).toBeVisible();
  await page.locator('[data-view=map]').click(); await settled(page);
  assert(await page.evaluate(() => window.vakeLandscape.controls.getPolarAngle()) < .05);
  await page.screenshot({ path: `${output}/landscape-map.png` });
  await page.locator('[data-layer=labels]').uncheck();
  const roof = await page.evaluate(() => {
    const p = window.vakeLandscape.camera.position.clone().set(56, 65, 63).project(window.vakeLandscape.camera);
    return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
  });
  await page.mouse.click(roof.x, roof.y);
  await expect.poll(() => page.evaluate(() => window.vakeLandscape.state.selected)).toBe('osm-1238414265');
  await expect(page.locator('#place-description')).toContainText('Mapped floor count');
  await page.locator('[data-layer=labels]').check();
  console.log('Checked map view and footprint selection');
  await page.locator('[data-place=stadium]').click(); await expect(page.locator('#place-name')).toHaveText('Mikheil Meskhi Stadium');
  await page.locator('#focus-place').click(); await settled(page); assert.equal(await page.evaluate(() => window.vakeLandscape.state.view), 'place');
  await page.locator('#reset').click(); await settled(page);
  console.log('Checked place focus and reset');
  // A pointer drag must orbit without selecting a different building.
  const before = await page.evaluate(() => window.vakeLandscape.camera.position.toArray());
  await page.mouse.move(910, 455); await page.mouse.down(); await page.mouse.move(1080, 490, { steps: 12 }); await page.mouse.up();
  await page.waitForTimeout(300); assert.notDeepEqual(await page.evaluate(() => window.vakeLandscape.camera.position.toArray()), before);
  assert.equal(await page.evaluate(() => window.vakeLandscape.state.selected), 'tower');
  await page.locator('#viewport').focus(); await page.keyboard.press('Home'); await settled(page);
  const angle = await page.evaluate(() => window.vakeLandscape.controls.getAzimuthalAngle()); await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.evaluate(() => window.vakeLandscape.controls.getAzimuthalAngle())).not.toBe(angle);
  await page.locator('#rotate').click(); assert(await page.evaluate(() => window.vakeLandscape.controls.autoRotate));
  await page.locator('#rotate').click(); assert.equal(await page.evaluate(() => window.vakeLandscape.controls.autoRotate), false);
  console.log('Checked zoom, drag, keyboard and auto orbit');
  for (const view of ['neighborhood', 'park', 'overview']) { await page.locator(`[data-view=${view}]`).click(); await settled(page); }
  // Canvas hit-testing uses real geometry, including the detached mapped-building pick meshes.
  const point = await page.evaluate(() => {
    const { scene, camera } = window.vakeLandscape;
    const tower = scene.getObjectByName('VR Vake Sky Tower • reference interpretation');
    const p = tower.position.clone().set(0, 180, 0).project(camera);
    return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
  });
  await page.mouse.click(point.x, point.y); await expect(page.locator('#place-name')).toHaveText('VR Vake Sky Tower');
  await page.locator('#reset').click(); await settled(page);
  await page.locator('[data-light=sunset]').click(); await expect(page.locator('#time-name')).toHaveText('Golden hour');
  await page.waitForFunction(() => !window.vakeLandscape.state.lightingTransitioning);
  await page.screenshot({ path: `${output}/landscape-sunset.png` });
  await page.locator('[data-light=night]').click(); await expect(page.locator('body')).toHaveAttribute('data-light', 'night');
  assert.equal(await page.evaluate(() => window.vakeLandscape.state.light), 'night');
  await page.waitForFunction(() => !window.vakeLandscape.state.lightingTransitioning);
  await page.screenshot({ path: `${output}/landscape-night.png` });
  await page.locator('[data-light=day]').click();
  await page.waitForFunction(() => !window.vakeLandscape.state.lightingTransitioning);
  const notes = await page.request.get(`${base}/SOURCES.md`); assert.equal(notes.status(), 200); assert((await notes.text()).includes('Floor exploration reference'));
  // Idle rendering pauses once OrbitControls damping has settled.
  await page.waitForTimeout(900); const frame = await page.evaluate(() => window.vakeLandscape.renderer.info.render.frame);
  await page.waitForTimeout(250); assert.equal(await page.evaluate(() => window.vakeLandscape.renderer.info.render.frame), frame);
  console.log('Checked presets, lighting, source notes and idle rendering');
  await page.close(); // Release the desktop WebGL context before software-rendered mobile checks.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const mobile = await context.newPage(); await collect(mobile); await mobile.goto(`${base}/`); await ready(mobile);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 390);
  await expect(mobile.locator('#place-body')).toBeHidden(); await expect(mobile.locator('#layer-options')).toBeHidden();
  await mobile.screenshot({ path: `${output}/landscape-mobile.png` });
  await mobile.locator('#layers-toggle').tap(); await expect(mobile.locator('#layer-options')).toBeVisible();
  await mobile.locator('[data-layer=vegetation]').uncheck(); assert.equal(await mobile.evaluate(() => window.vakeLandscape.groups.vegetation.visible), false);
  await mobile.locator('[data-layer=vegetation]').check(); await mobile.locator('#layers-toggle').tap();
  await mobile.locator('#place-toggle').tap(); await expect(mobile.locator('#place-body')).toBeVisible();
  await mobile.locator('#focus-place').tap(); await settled(mobile); assert.equal(await mobile.evaluate(() => window.vakeLandscape.state.view), 'tower');
  await mobile.locator('#place-toggle').tap();
  const cdp = await context.newCDPSession(mobile);
  const touchBefore = await mobile.evaluate(() => window.vakeLandscape.controls.getAzimuthalAngle());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 415 }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180 + i * 13, y: 415 + i * 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.waitForTimeout(300); assert.notEqual(await mobile.evaluate(() => window.vakeLandscape.controls.getAzimuthalAngle()), touchBefore);
  const pinchBefore = await distance(mobile);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 160, y: 430 }, { x: 220, y: 430 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 110, y: 430 }, { x: 270, y: 430 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.waitForTimeout(200); assert(await distance(mobile) < pinchBefore, 'Pinch-out zooms in');
  await mobile.setViewportSize({ width: 844, height: 390 }); await mobile.waitForTimeout(200);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 844);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollHeight), 390, 'Landscape phone must not scroll vertically');
  await expect(mobile.locator('#reset')).toBeInViewport();
  await mobile.locator('#reset').tap(); await settled(mobile);
  await expect(mobile.locator('#place-body')).toBeHidden();
  await mobile.locator('#layers-toggle').tap();
  await mobile.locator('[data-layer=buildings]').uncheck();
  await mobile.locator('[data-layer=buildings]').check();
  await mobile.locator('button[data-light=night]').tap();
  await expect(mobile.locator('body')).toHaveAttribute('data-light', 'night');
  await mobile.locator('button[data-light=day]').tap();
  await mobile.locator('#layers-toggle').tap();
  await mobile.screenshot({ path: `${output}/landscape-mobile-horizontal.png` });
  assert.deepEqual(errors, []); assert.deepEqual(external, [], 'Scene and references work without external requests');
  await writeFile(`${output}/landscape-validation.json`, JSON.stringify({ result: 'PASS', stats, externalRequests: external, errors, checks: ['WebGL scene', 'removed boundary and header links', 'map layers', 'camera presets', 'zoom/orbit/keyboard', 'place selection', 'lighting', 'local source notes', 'idle rendering', 'mobile disclosure', 'touch orbit/pinch', 'mobile landscape', 'reduced motion'] }, null, 2));
  console.log('PASS: VR Vake landscape — desktop/mobile, mapped context, layers, lighting, camera, picking, touch/pinch, references, offline assets, idle rendering.');
  console.log(stats);
} finally { await browser.close(); }
