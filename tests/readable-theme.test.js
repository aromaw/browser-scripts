const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { solidPng, decodePng } = require('./png');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'readable-theme', 'readable-theme.user.js'),
    'utf8'
);

globalThis.__RT_TEST = true;
vm.runInThisContext(source);
const rt = globalThis.__rt;
assert.ok(rt, 'script exports test hooks');

test('cycles off, then light, then dark', () => {
    assert.equal(rt.nextMode('off'), 'light');
    assert.equal(rt.nextMode(undefined), 'light');
    assert.equal(rt.nextMode('light'), 'dark');
    assert.equal(rt.nextMode('dark'), 'off');
});

test('plans a light value for a dark data-theme and leaves brand themes alone', () => {
    const dark = rt.plan({ html: { attrs: { 'data-theme': 'dark' }, classes: [] } }, 'light');
    assert.deepEqual(dark.edits, [{
        op: 'attr', target: 'html', name: 'data-theme', value: 'light', prev: 'dark',
    }]);

    const claude = rt.plan({ html: { attrs: { 'data-theme': 'claude' }, classes: [] } }, 'light');
    assert.deepEqual(claude.edits, []);

    const mdn = rt.plan({ html: { attrs: { 'data-theme': 'light dark' }, classes: [] } }, 'light');
    assert.deepEqual(mdn.edits, []);
});

test('maps day/night, GitHub auto, and MkDocs schemes', () => {
    const night = rt.plan({ html: { attrs: { 'data-theme': 'night' }, classes: [] } }, 'light');
    assert.equal(night.edits[0].value, 'day');

    const github = rt.plan({ html: { attrs: { 'data-color-mode': 'auto' }, classes: [] } }, 'light');
    assert.equal(github.edits[0].name, 'data-color-mode');
    assert.equal(github.edits[0].value, 'light');

    const already = rt.plan({ html: { attrs: { 'data-color-mode': 'Dark' }, classes: [] } }, 'dark');
    assert.deepEqual(already.edits, []);

    const mk = rt.plan({
        body: { attrs: { 'data-md-color-scheme': 'slate' }, classes: [] },
    }, 'light');
    assert.equal(mk.edits[0].target, 'body');
    assert.equal(mk.edits[0].value, 'default');
});

test('toggles theme classes and only rewrites scheme-like storage', () => {
    const remove = rt.plan({ html: { attrs: {}, classes: ['dark', 'other'] } }, 'light');
    assert.deepEqual(remove.edits[0], { op: 'class', target: 'html', add: [], remove: ['dark'] });

    const keep = rt.plan({ html: { attrs: {}, classes: ['dark'] } }, 'dark');
    assert.deepEqual(keep.edits, []);

    const hinted = rt.plan({
        html: { attrs: {}, classes: [] },
        scriptClasses: ['dark'],
    }, 'dark');
    assert.deepEqual(hinted.edits[0].add, ['dark']);

    const storage = rt.plan({
        html: { attrs: {}, classes: [] },
        storage: { theme: 'auto', 'vitepress-theme-appearance': 'dark', accent: 'ocean' },
    }, 'light');
    const keys = storage.edits.map((edit) => edit.key).sort();
    assert.deepEqual(keys, ['theme', 'vitepress-theme-appearance']);
    assert.equal(storage.edits.find((edit) => edit.key === 'theme').value, 'light');

    const boolish = rt.plan({ html: { attrs: {}, classes: [] }, storage: { darkMode: 'true' } }, 'light');
    assert.equal(boolish.edits[0].value, 'false');

    const palette = rt.plan({
        html: { attrs: {}, classes: [] },
        storage: { '.__palette': JSON.stringify({ color: { scheme: 'slate', primary: 'indigo' } }) },
    }, 'light');
    assert.equal(JSON.parse(palette.edits[0].value).color.scheme, 'default');
    assert.equal(JSON.parse(palette.edits[0].value).color.primary, 'indigo');
});

test('luminance treats docs backgrounds as light or dark', () => {
    const dark = rt.parseColor('rgb(20, 20, 20)');
    const light = rt.parseColor('rgba(250, 250, 250, 1)');
    const clear = rt.parseColor('rgba(250, 250, 250, 0)');
    assert.equal(rt.parseColor('transparent'), null);
    assert.equal(rt.surfaceMatches('light', rt.relLuminance(dark)), false);
    assert.equal(rt.surfaceMatches('dark', rt.relLuminance(dark)), true);
    assert.equal(rt.surfaceMatches('light', rt.relLuminance(light)), true);
    assert.equal(rt.surfaceMatches('dark', rt.relLuminance(light)), false);
    assert.ok(clear.a < 0.5);
    assert.equal(rt.surfaceMatches('light', null), null);
});

test('scheme emulation keeps the other conditions in a compound query', () => {
    const narrow = rt.rewriteSchemeQuery('(prefers-color-scheme: light) and (max-width: 1px)', 'light');
    assert.equal(narrow, '(min-width: 0px) and (max-width: 1px)');

    const negated = rt.rewriteSchemeQuery('not (prefers-color-scheme: dark)', 'light');
    assert.equal(negated, 'not (min-width: 1000000px)');

    const opposite = rt.rewriteSchemeQuery('(prefers-color-scheme: dark) and (min-width: 1px)', 'light');
    assert.equal(opposite, '(min-width: 1000000px) and (min-width: 1px)');
});

test('png helper round-trips a solid color', () => {
    const decoded = decodePng(solidPng(2, 2, 255, 0, 0));
    assert.deepEqual(decoded.get(0, 0), [255, 0, 0, 255]);
    assert.deepEqual(decoded.get(1, 1), [255, 0, 0, 255]);
});
