'use strict';

// Live before/after screenshots for the readable-theme userscript.
// Writes readable-theme/docs/screenshots/.

const fs = require('node:fs');
const path = require('node:path');
const { launch, newPage, waitSettled, luminance, shotPixel } = require('./theme-harness');

const OUT = path.join(__dirname, '..', 'readable-theme', 'docs', 'screenshots');

const PAGES = [
    {
        slug: 'effect',
        url: 'https://effect.website/docs/v3/getting-started',
        presses: 1,
        expect: 'light',
    },
    {
        slug: 'python',
        url: 'https://docs.python.org/3/tutorial/index.html',
        presses: 2,
        expect: 'dark',
    },
];

async function sample(page) {
    const size = page.viewportSize();
    return shotPixel(page, size.width * 0.62, size.height * 0.42);
}

async function shoot(browser, spec, withScript) {
    const opened = await newPage(browser, { userscript: withScript, width: 1280, height: 800 });
    const page = opened.page;
    try {
        await page.goto(spec.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForSelector('h1', { timeout: 20000 });
        await page.waitForTimeout(400);
        if (withScript) {
            for (let i = 0; i < spec.presses; i++) {
                await page.keyboard.press('Alt+Shift+KeyL');
                await waitSettled(page);
            }
            await page.waitForTimeout(1200);
        }
        const buf = await page.screenshot({ type: 'png' });
        const pixel = await sample(page);
        let saved = null;
        if (withScript) {
            saved = await page.evaluate(() => {
                try { return GM_getValue('s:' + location.host); } catch (e) { return null; }
            });
        }
        return { buf, lum: luminance(pixel.px), pixel: pixel.px, saved };
    } finally {
        await opened.context.close();
    }
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await launch();
    const report = [];
    try {
        for (const spec of PAGES) {
            const before = await shoot(browser, spec, false);
            const after = await shoot(browser, spec, true);
            const beforePath = path.join(OUT, spec.slug + '-before.png');
            const afterPath = path.join(OUT, spec.slug + '-after.png');
            fs.writeFileSync(beforePath, before.buf);
            fs.writeFileSync(afterPath, after.buf);
            report.push({
                slug: spec.slug,
                url: spec.url,
                beforeLum: Number(before.lum.toFixed(3)),
                afterLum: Number(after.lum.toFixed(3)),
                afterPixel: after.pixel,
                saved: after.saved,
            });
            const becameLight = after.lum > before.lum + 0.25;
            const becameDark = after.lum + 0.25 < before.lum;
            if (spec.expect === 'light' && !becameLight) {
                throw new Error(spec.slug + ' did not get lighter ' + JSON.stringify(report.at(-1)));
            }
            if (spec.expect === 'dark' && !becameDark) {
                throw new Error(spec.slug + ' did not get darker ' + JSON.stringify(report.at(-1)));
            }
        }
    } finally {
        await browser.close();
    }
    console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
