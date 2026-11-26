'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { decodePng } = require('./png');

const SOURCE = fs.readFileSync(
    path.join(__dirname, '..', 'readable-theme', 'readable-theme.user.js'),
    'utf8'
);
const CHROME = fs.existsSync('/opt/google/chrome/chrome')
    ? '/opt/google/chrome/chrome'
    : '/usr/bin/google-chrome';

function gmPrelude(seed) {
    return `(() => {
        const seed = ${JSON.stringify(seed || {})};
        const key = '__rt_gm_store';
        let mem = null;
        function store() {
            if (mem) return mem;
            let saved = {};
            try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { saved = {}; }
            mem = Object.assign({}, seed, saved);
            return mem;
        }
        window.GM_getValue = (k, d) => {
            const s = store();
            return Object.prototype.hasOwnProperty.call(s, k) ? s[k] : d;
        };
        window.GM_setValue = (k, v) => {
            const s = store();
            s[k] = v;
            try { localStorage.setItem(key, JSON.stringify(s)); } catch (e) {}
        };
        window.GM_addStyle = (css) => {
            const el = document.createElement('style');
            el.setAttribute('data-rt-style', '1');
            el.textContent = css;
            (document.head || document.documentElement).appendChild(el);
        };
        window.__gmMenus = [];
        window.GM_registerMenuCommand = (name, fn) => {
            window.__gmMenus.push({ name: name, fn: fn, dead: false });
            return window.__gmMenus.length;
        };
        window.GM_unregisterMenuCommand = (id) => {
            const item = window.__gmMenus[id - 1];
            if (item) item.dead = true;
        };
    })();`;
}

function launch() {
    return chromium.launch({
        executablePath: CHROME,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
    });
}

async function addUserscript(context, seed) {
    await context.addInitScript({ content: gmPrelude(seed) });
    await context.addInitScript({ content: SOURCE });
}

async function newPage(browser, options) {
    const opts = options || {};
    const context = await browser.newContext({
        viewport: { width: opts.width || 1280, height: opts.height || 800 },
        deviceScaleFactor: 1,
        bypassCSP: true,
        colorScheme: opts.colorScheme || 'light',
    });
    if (opts.userscript !== false) await addUserscript(context, opts.seed || {});
    if (opts.extraInit) await context.addInitScript({ content: opts.extraInit });
    const page = await context.newPage();
    return { context, page };
}

async function waitSettled(page) {
    await page.waitForFunction(
        () => !document.documentElement.classList.contains('rt-pending'),
        null,
        { timeout: 8000 }
    );
}

function luminance(px) {
    return (0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]) / 255;
}

async function shotPixel(page, x, y) {
    const buf = await page.screenshot({ type: 'png' });
    const png = decodePng(buf);
    const sx = Math.max(0, Math.min(png.width - 1, Math.round(x)));
    const sy = Math.max(0, Math.min(png.height - 1, Math.round(y)));
    return { png, px: png.get(sx, sy), x: sx, y: sy };
}

module.exports = {
    SOURCE,
    CHROME,
    launch,
    addUserscript,
    newPage,
    waitSettled,
    luminance,
    shotPixel,
    decodePng,
};
