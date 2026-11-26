const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { solidPng } = require('./png');
const { launch, newPage, waitSettled, luminance, shotPixel } = require('./theme-harness');

const RED = solidPng(64, 64, 220, 20, 20);

function pageHtml(title, css, body, headExtra) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${css}</style>${headExtra || ''}</head><body>${body}</body></html>`;
}

const DARK_CSS = 'html,body{margin:0;background:#141414;color:#e8e8e8;}main{max-width:640px;margin:0 auto;padding:48px 24px;font:18px/1.6 Georgia,serif;}img{width:64px;height:64px;display:block;margin-top:16px;}';
const LIGHT_CSS = 'html,body{margin:0;background:#ffffff;color:#1a1a1a;}main{max-width:640px;margin:0 auto;padding:48px 24px;font:18px/1.6 Georgia,serif;}';
const NATIVE_CSS = 'html{background:#f7f7f5;color:#1b1b1b;}html[data-theme="dark"]{background:#141414;color:#eee;}body{margin:0;background:transparent;}main{padding:48px 24px;font:18px/1.6 Georgia,serif;}';
const NATIVE_SCRIPT = `<script>(function(){var saved=localStorage.getItem('theme');var mode=saved||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',mode);document.documentElement.classList.toggle('dark',mode==='dark');})();</script>`;

const PAGES = {
    '/dark.html': pageHtml('Dark docs', DARK_CSS, '<main><h1>Dark only guide</h1><p>No theme switch is offered.</p><img id="swatch" alt="" src="/red.png"></main>'),
    '/light.html': pageHtml('Light docs', LIGHT_CSS, '<main><h1>Light guide</h1><p>The page background is white.</p></main>'),
    '/native.html': pageHtml('Native docs', NATIVE_CSS, '<main><h1>Native theme guide</h1><p>The site has its own light and dark themes.</p></main>', NATIVE_SCRIPT),
    '/brand.html': pageHtml('Brand', 'html,body{margin:0;background:#101010;color:#eee;}main{padding:48px 24px;font:18px/1.6 Georgia,serif;}', '<main><h1>Brand theme</h1><p>The attribute is not a color scheme.</p></main>').replace('<html>', '<html data-theme="claude">'),
};

function startServer() {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname === '/red.png') {
            res.writeHead(200, { 'Content-Type': 'image/png' });
            res.end(RED);
            return;
        }
        const html = PAGES[url.pathname];
        if (!html) {
            res.writeHead(404);
            res.end('missing');
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({ server, origin: 'http://127.0.0.1:' + port, port });
        });
    });
}

async function sampleMain(page) {
    const box = await page.locator('main').boundingBox();
    return shotPixel(page, box.x + 12, box.y + 12);
}

let browser;
let origin;
let server;

before(async () => {
    browser = await launch();
    const started = await startServer();
    origin = started.origin;
    server = started.server;
});

after(async () => {
    if (browser) await browser.close();
    if (server) {
        await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    }
});

test('off leaves a dark page untouched', { timeout: 30000 }, async () => {
    const { context, page } = await newPage(browser);
    try {
        await page.goto(origin + '/dark.html', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('h1');
        const root = await page.evaluate(() => document.documentElement.className);
        assert.equal(root.includes('rt-'), false);
        const sample = await sampleMain(page);
        assert.ok(luminance(sample.px) < 0.25, 'untouched background ' + sample.px.join(','));
    } finally {
        await context.close();
    }
});

test('hotkey forces light on a dark page, keeps the image, and survives reload', { timeout: 30000 }, async () => {
    const { context, page } = await newPage(browser);
    try {
        await page.goto(origin + '/dark.html', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#swatch');
        await page.keyboard.press('Alt+Shift+KeyL');
        await waitSettled(page);
        await page.waitForFunction(() => document.documentElement.classList.contains('rt-filter'));
        const background = await sampleMain(page);
        assert.ok(luminance(background.px) > 0.6, 'filtered background ' + background.px.join(','));
        const box = await page.locator('#swatch').boundingBox();
        const swatch = await shotPixel(page, box.x + box.width / 2, box.y + box.height / 2);
        assert.ok(swatch.px[0] > 160 && swatch.px[1] < 90 && swatch.px[2] < 90, 'image pixel ' + swatch.px.join(','));
        const saved = await page.evaluate(() => GM_getValue('s:' + location.host));
        assert.equal(saved.mode, 'light');
        assert.equal(saved.strategy, 'filter');

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#swatch');
        await waitSettled(page);
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains('rt-filter')), true);
        const again = await sampleMain(page);
        assert.ok(luminance(again.px) > 0.6, 'reloaded background ' + again.px.join(','));
    } finally {
        await context.close();
    }
});

test('a second hotkey darkens a light page with the filter', { timeout: 30000 }, async () => {
    const { context, page } = await newPage(browser);
    try {
        await page.goto(origin + '/light.html', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('h1');
        await page.keyboard.press('Alt+Shift+KeyL');
        await waitSettled(page);
        await page.keyboard.press('Alt+Shift+KeyL');
        await waitSettled(page);
        await page.waitForFunction(() => document.documentElement.classList.contains('rt-want-dark'));
        const sample = await sampleMain(page);
        assert.ok(luminance(sample.px) < 0.35, 'darkened background ' + sample.px.join(','));
        const saved = await page.evaluate(() => GM_getValue('s:' + location.host));
        assert.equal(saved.mode, 'dark');
        assert.equal(saved.strategy, 'filter');
    } finally {
        await context.close();
    }
});

test('prefers-color-scheme emulation follows the site theme instead of inverting', { timeout: 30000 }, async () => {
    const host = new URL(origin).host;
    const { context, page } = await newPage(browser, {
        colorScheme: 'dark',
        seed: { ['s:' + host]: { mode: 'light', strategy: null, edits: [] } },
    });
    try {
        await page.goto(origin + '/native.html', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('h1');
        await waitSettled(page);
        const state = await page.evaluate(() => ({
            theme: document.documentElement.getAttribute('data-theme'),
            filter: document.documentElement.classList.contains('rt-filter'),
            strategy: GM_getValue('s:' + location.host).strategy,
        }));
        assert.equal(state.theme, 'light');
        assert.equal(state.filter, false);
        assert.notEqual(state.strategy, 'filter');
        const sample = await sampleMain(page);
        assert.ok(luminance(sample.px) > 0.6, 'native light background ' + sample.px.join(','));
    } finally {
        await context.close();
    }
});

test('a stored dark theme is switched with the site attribute, not the filter', { timeout: 30000 }, async () => {
    const { context, page } = await newPage(browser, {
        extraInit: "localStorage.setItem('theme','dark');",
        seed: {},
    });
    try {
        await page.goto(origin + '/native.html', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('h1');
        const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        assert.equal(before, 'dark');
        await page.evaluate(() => {
            window.__gmMenus.filter((entry) => entry && !entry.dead && entry.name.indexOf('Light') !== -1).pop().fn();
        });
        await waitSettled(page);
        const state = await page.evaluate(() => ({
            theme: document.documentElement.getAttribute('data-theme'),
            filter: document.documentElement.classList.contains('rt-filter'),
            stored: localStorage.getItem('theme'),
            darkClass: document.documentElement.classList.contains('dark'),
        }));
        assert.equal(state.theme, 'light');
        assert.equal(state.stored, 'light');
        assert.equal(state.darkClass, false);
        assert.equal(state.filter, false);
        const sample = await sampleMain(page);
        assert.ok(luminance(sample.px) > 0.6, 'switched background ' + sample.px.join(','));
    } finally {
        await context.close();
    }
});

test('a brand data-theme value is not rewritten', { timeout: 30000 }, async () => {
    const { context, page } = await newPage(browser);
    try {
        await page.goto(origin + '/brand.html', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('h1');
        await page.keyboard.press('Alt+Shift+KeyL');
        await waitSettled(page);
        await page.waitForFunction(() => document.documentElement.classList.contains('rt-filter'));
        const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        assert.equal(theme, 'claude');
        const sample = await sampleMain(page);
        assert.ok(luminance(sample.px) > 0.6, 'brand page filtered ' + sample.px.join(','));
    } finally {
        await context.close();
    }
});

test('the menu shows the floating button and shift-click hides it', { timeout: 30000 }, async () => {
    const { context, page } = await newPage(browser);
    try {
        await page.goto(origin + '/light.html', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('h1');
        assert.equal(await page.locator('#rt-btn').count(), 0);
        await page.evaluate(() => {
            window.__gmMenus.filter((entry) => entry && !entry.dead && entry.name.indexOf('floating') !== -1).pop().fn();
        });
        await page.waitForSelector('#rt-btn');
        await page.click('#rt-btn');
        await waitSettled(page);
        const mode = await page.evaluate(() => GM_getValue('s:' + location.host).mode);
        assert.equal(mode, 'light');
        await page.click('#rt-btn', { modifiers: ['Shift'] });
        await page.waitForSelector('#rt-btn', { state: 'detached' });
        assert.equal(await page.evaluate(() => GM_getValue('button')), false);
    } finally {
        await context.close();
    }
});
