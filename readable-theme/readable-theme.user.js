// ==UserScript==
// @name         Readable Theme
// @namespace    https://github.com/aromaw/nga-code-agent-disguise
// @version      1.0.0
// @description  Force a readable light or dark appearance per site. Uses the site's own theme when it has one, otherwise inverts the page and restores images. Default off.
// @author       aromaw
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        unsafeWindow
// @updateURL    https://raw.githubusercontent.com/aromaw/nga-code-agent-disguise/main/readable-theme/readable-theme.user.js
// @downloadURL  https://raw.githubusercontent.com/aromaw/nga-code-agent-disguise/main/readable-theme/readable-theme.user.js
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = '1.0.0';
    const HOST_PREFIX = 's:';
    const BUTTON_KEY = 'button';

    // Attributes whose value is a color scheme, not a brand name.
    // data-theme="claude" and MDN's data-theme="light dark" are left alone.
    const SCHEME_ATTRS = [
        'data-theme',
        'data-color-mode',
        'data-color-scheme',
        'data-bs-theme',
        'data-theme-mode',
        'data-color-theme',
    ];
    const MD_ATTR = 'data-md-color-scheme';
    const STORAGE_KEYS = [
        'theme',
        'color-theme',
        'color-mode',
        'colorMode',
        'color-scheme',
        'colorScheme',
        'theme-preference',
        'vitepress-theme-appearance',
        'docusaurus-theme',
        'starlight-theme',
        'chakra-ui-color-mode',
        'nextra-theme',
        'vueuse-color-scheme',
        'mantine-color-scheme',
        'docs-theme',
        'preferred-theme',
    ];
    const MKDOCS_KEYS = ['.__palette', '__palette'];
    const DARK_CLASSES = ['dark', 'theme-dark', 'dark-mode'];
    const LIGHT_CLASSES = ['light', 'theme-light', 'light-mode'];
    const THEME_CLASSES = DARK_CLASSES.concat(LIGHT_CLASSES);

    const CSS = [
        'html.rt-pending.rt-want-light{background:#f4f4f2!important;color-scheme:light!important;}',
        'html.rt-pending.rt-want-dark{background:#161616!important;color-scheme:dark!important;}',
        'html.rt-pending body{visibility:hidden!important;}',
        'html.rt-want-light{color-scheme:light;}',
        'html.rt-want-dark{color-scheme:dark;}',
        'html.rt-filter{min-height:100%;}',
        'html.rt-filter.rt-want-light{filter:invert(1) hue-rotate(180deg)!important;background:#111!important;color-scheme:dark!important;}',
        'html.rt-filter.rt-want-dark{filter:invert(1) hue-rotate(180deg)!important;background:#eee!important;color-scheme:light!important;}',
        'html.rt-filter img,html.rt-filter video,html.rt-filter canvas,html.rt-filter iframe,',
        'html.rt-filter embed,html.rt-filter object,html.rt-filter svg image,',
        'html.rt-filter [style*="background-image"],html.rt-filter #rt-btn,html.rt-filter #rt-toast{',
        'filter:invert(1) hue-rotate(180deg)!important;}',
        '#rt-btn{all:initial;position:fixed;right:12px;bottom:12px;z-index:2147483646;',
        'width:28px;height:28px;border-radius:999px;border:1px solid rgba(0,0,0,.22);',
        'background:rgba(255,255,255,.9);color:#222;font:14px/28px system-ui,sans-serif;',
        'text-align:center;cursor:pointer;opacity:.42;box-shadow:0 1px 3px rgba(0,0,0,.18);',
        'user-select:none;}',
        '#rt-btn:hover{opacity:1;}',
        '#rt-toast{all:initial;position:fixed;right:12px;bottom:48px;z-index:2147483646;',
        'background:rgba(20,20,20,.9);color:#fff;font:12px/1.2 system-ui,sans-serif;',
        'padding:6px 8px;border-radius:6px;}',
    ].join('');

    function nextMode(mode) {
        if (mode === 'light') return 'dark';
        if (mode === 'dark') return 'off';
        return 'light';
    }

    // light / dark / auto, plus day/night and MkDocs default/slate.
    function tokenMeans(value) {
        const c = String(value == null ? '' : value).trim().toLowerCase();
        if (c === 'light' || c === 'day' || c === 'default') return 'light';
        if (c === 'dark' || c === 'night' || c === 'slate') return 'dark';
        if (c === 'auto' || c === 'system') return 'auto';
        return null;
    }

    function desiredToken(current, mode) {
        const c = String(current == null ? '' : current).trim().toLowerCase();
        if (c === 'day' || c === 'night') return mode === 'dark' ? 'night' : 'day';
        if (c === 'light' || c === 'dark' || c === 'auto' || c === 'system') {
            return mode === 'dark' ? 'dark' : 'light';
        }
        return null;
    }

    function classEditFor(classes, scriptClasses, mode) {
        const present = new Set(classes || []);
        const known = new Set();
        for (const name of [].concat(classes || [], scriptClasses || [])) {
            if (THEME_CLASSES.indexOf(name) !== -1) known.add(name);
        }
        if (!known.size) return null;
        const add = [];
        const remove = [];
        if (mode === 'light') {
            for (const name of DARK_CLASSES) if (present.has(name)) remove.push(name);
            for (const name of LIGHT_CLASSES) if (known.has(name) && !present.has(name)) add.push(name);
        } else {
            for (const name of LIGHT_CLASSES) if (present.has(name)) remove.push(name);
            for (const name of DARK_CLASSES) if (known.has(name) && !present.has(name)) add.push(name);
        }
        if (!add.length && !remove.length) return null;
        return { add: add, remove: remove };
    }

    function plan(input, mode) {
        const edits = [];
        if (mode !== 'light' && mode !== 'dark') return { edits: edits };
        const source = input || {};
        for (const target of ['html', 'body']) {
            const node = source[target];
            if (!node) continue;
            const attrs = node.attrs || {};
            for (const name of Object.keys(attrs)) {
                const current = attrs[name];
                if (name === MD_ATTR) {
                    const raw = String(current).trim().toLowerCase();
                    if (raw !== 'default' && raw !== 'slate') continue;
                    if (tokenMeans(raw) === mode) continue;
                    edits.push({
                        op: 'attr',
                        target: target,
                        name: name,
                        value: mode === 'dark' ? 'slate' : 'default',
                        prev: current,
                    });
                    continue;
                }
                if (SCHEME_ATTRS.indexOf(name) === -1) continue;
                const next = desiredToken(current, mode);
                if (!next || tokenMeans(current) === mode) continue;
                edits.push({ op: 'attr', target: target, name: name, value: next, prev: current });
            }
            const classEdit = classEditFor(
                node.classes || [],
                target === 'html' ? source.scriptClasses || [] : [],
                mode
            );
            if (classEdit) {
                edits.push({
                    op: 'class',
                    target: target,
                    add: classEdit.add,
                    remove: classEdit.remove,
                });
            }
        }
        const storage = source.storage || {};
        for (const key of STORAGE_KEYS) {
            if (!Object.prototype.hasOwnProperty.call(storage, key)) continue;
            const current = storage[key];
            const next = desiredToken(current, mode);
            if (!next || tokenMeans(current) === mode) continue;
            edits.push({ op: 'storage', key: key, value: next, prev: String(current) });
        }
        if (Object.prototype.hasOwnProperty.call(storage, 'darkMode')) {
            const current = String(storage.darkMode);
            if (/^(true|false|1|0)$/i.test(current)) {
                const numeric = current === '1' || current === '0';
                const means = current === '1' || current.toLowerCase() === 'true' ? 'dark' : 'light';
                if (means !== mode) {
                    edits.push({
                        op: 'storage',
                        key: 'darkMode',
                        value: mode === 'dark' ? (numeric ? '1' : 'true') : (numeric ? '0' : 'false'),
                        prev: current,
                    });
                }
            }
        }
        for (const key of MKDOCS_KEYS) {
            if (!Object.prototype.hasOwnProperty.call(storage, key)) continue;
            const current = storage[key];
            let json;
            try { json = JSON.parse(current); } catch (err) { continue; }
            const scheme = json && json.color && json.color.scheme;
            if (scheme !== 'default' && scheme !== 'slate') continue;
            if (tokenMeans(scheme) === mode) continue;
            const copy = JSON.parse(current);
            copy.color.scheme = mode === 'dark' ? 'slate' : 'default';
            edits.push({ op: 'storage', key: key, value: JSON.stringify(copy), prev: current });
        }
        return { edits: edits };
    }

    function parseColor(str) {
        if (!str || str === 'transparent') return null;
        const match = String(str).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/i);
        if (!match) return null;
        return {
            r: Number(match[1]),
            g: Number(match[2]),
            b: Number(match[3]),
            a: match[4] == null ? 1 : Number(match[4]),
        };
    }

    function relLuminance(rgb) {
        const channel = (value) => {
            const s = value / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
    }

    // null when the sample is missing. Light and dark docs sit far from 0.4.
    function surfaceMatches(mode, luminance) {
        if (luminance == null || Number.isNaN(luminance)) return null;
        if (mode === 'light') return luminance >= 0.4;
        if (mode === 'dark') return luminance <= 0.4;
        return null;
    }

    // Keep the rest of a compound query. Only the scheme feature is rewritten,
    // so "(prefers-color-scheme: light) and (max-width: 1px)" stays narrow.
    function rewriteSchemeQuery(query, mode) {
        // Swap the feature in place. "(prefers-color-scheme: light)" becomes
        // "(min-width: 0px)" or "(min-width: 1000000px)", so surrounding
        // "and", "or", and "not" keep their meaning. A bare media type like
        // "all" cannot be parenthesized; browsers treat "(all)" as false.
        return String(query).replace(/prefers-color-scheme\s*:\s*(light|dark)/gi, (_, scheme) => {
            return String(scheme).toLowerCase() === mode ? 'min-width: 0px' : 'min-width: 1000000px';
        });
    }

    if (globalThis.__RT_TEST) {
        globalThis.__rt = {
            VERSION: VERSION,
            nextMode: nextMode,
            tokenMeans: tokenMeans,
            desiredToken: desiredToken,
            plan: plan,
            parseColor: parseColor,
            relLuminance: relLuminance,
            surfaceMatches: surfaceMatches,
            rewriteSchemeQuery: rewriteSchemeQuery,
            SCHEME_ATTRS: SCHEME_ATTRS,
            STORAGE_KEYS: STORAGE_KEYS,
        };
        return;
    }

    const pageWin = () => {
        try {
            if (typeof unsafeWindow !== 'undefined' && unsafeWindow && unsafeWindow.document) return unsafeWindow;
        } catch (err) { /* sandbox denied */ }
        return window;
    };

    let current = { mode: 'off', strategy: null, edits: [] };
    let generation = 0;
    let fights = 0;
    let observer = null;
    let hotkeyOn = false;
    let styled = false;
    let menuIds = [];
    let toastTimer = 0;
    let originalMatchMedia = null;

    function docEl() {
        const doc = pageWin().document;
        return doc && doc.documentElement;
    }

    function gmGet(key, fallback) {
        try {
            if (typeof GM_getValue === 'function') {
                const value = GM_getValue(key, fallback);
                return value == null ? fallback : value;
            }
        } catch (err) { /* use localStorage */ }
        try {
            const raw = pageWin().localStorage.getItem('readable-theme:' + key);
            if (raw == null) return fallback;
            return JSON.parse(raw);
        } catch (err) {
            return fallback;
        }
    }

    function gmSet(key, value) {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(key, value);
                return;
            }
        } catch (err) { /* use localStorage */ }
        try {
            pageWin().localStorage.setItem('readable-theme:' + key, JSON.stringify(value));
        } catch (err) { /* private mode */ }
    }

    function hostKey() {
        try {
            const loc = pageWin().location;
            return HOST_PREFIX + (loc.host || loc.href);
        } catch (err) {
            return HOST_PREFIX + 'unknown';
        }
    }

    function loadRec() {
        const raw = gmGet(hostKey(), null);
        if (!raw || typeof raw !== 'object') return { mode: 'off', strategy: null, edits: [] };
        const mode = raw.mode === 'light' || raw.mode === 'dark' ? raw.mode : 'off';
        const strategy = raw.strategy === 'filter' || raw.strategy === 'native' || raw.strategy === 'asis'
            ? raw.strategy
            : null;
        const edits = Array.isArray(raw.edits) ? raw.edits.filter((edit) => edit && edit.op) : [];
        return { mode: mode, strategy: strategy, edits: edits };
    }

    function save() {
        gmSet(hostKey(), {
            mode: current.mode,
            strategy: current.strategy,
            edits: current.edits || [],
        });
    }

    function buttonOn() {
        return gmGet(BUTTON_KEY, false) === true;
    }

    function ensureStyle() {
        if (styled) return true;
        const doc = pageWin().document;
        const parent = doc.head || doc.documentElement;
        if (!parent && typeof GM_addStyle !== 'function') return false;
        try {
            if (typeof GM_addStyle === 'function') {
                GM_addStyle(CSS);
                styled = true;
                return true;
            }
        } catch (err) { /* the document may not exist yet */ }
        if (!parent) return false;
        const el = doc.createElement('style');
        el.setAttribute('data-rt-style', '1');
        el.textContent = CSS;
        parent.appendChild(el);
        styled = true;
        return true;
    }

    // Tampermonkey's document-start has <html>. Playwright's init script can run earlier.
    function whenDocumentElement(fn) {
        const doc = pageWin().document;
        if (doc.documentElement) {
            fn();
            return;
        }
        const obs = new MutationObserver(() => {
            if (!doc.documentElement) return;
            obs.disconnect();
            fn();
        });
        obs.observe(doc, { childList: true, subtree: true });
    }

    function setWant(mode) {
        const root = docEl();
        if (!root) return;
        root.classList.toggle('rt-want-light', mode === 'light');
        root.classList.toggle('rt-want-dark', mode === 'dark');
    }

    function setPending(on) {
        const root = docEl();
        if (root) root.classList.toggle('rt-pending', on);
    }

    function setFilter(on) {
        const root = docEl();
        if (!root) return;
        root.classList.toggle('rt-filter', on);
        if (on) root.classList.remove('rt-native');
    }

    function clearVisual() {
        const root = docEl();
        if (!root) return;
        root.classList.remove('rt-filter', 'rt-pending', 'rt-native', 'rt-want-light', 'rt-want-dark');
    }

    function pageStorage() {
        try { return pageWin().localStorage; } catch (err) { return null; }
    }

    function applyEdits(edits) {
        let changed = 0;
        const doc = pageWin().document;
        const storage = pageStorage();
        for (const edit of edits || []) {
            if (edit.op === 'storage') {
                if (!storage || storage.getItem(edit.key) === edit.value) continue;
                storage.setItem(edit.key, edit.value);
                changed++;
                continue;
            }
            const el = edit.target === 'body' ? doc.body : doc.documentElement;
            if (!el) continue;
            if (edit.op === 'attr') {
                if (el.getAttribute(edit.name) === edit.value) continue;
                el.setAttribute(edit.name, edit.value);
                changed++;
            } else if (edit.op === 'class') {
                for (const name of edit.remove || []) {
                    if (!el.classList.contains(name)) continue;
                    el.classList.remove(name);
                    changed++;
                }
                for (const name of edit.add || []) {
                    if (el.classList.contains(name)) continue;
                    el.classList.add(name);
                    changed++;
                }
            }
        }
        return changed;
    }

    function revertEdits(edits) {
        const doc = pageWin().document;
        const storage = pageStorage();
        for (const edit of (edits || []).slice().reverse()) {
            if (edit.op === 'storage') {
                if (!storage) continue;
                if (edit.prev == null) storage.removeItem(edit.key);
                else storage.setItem(edit.key, edit.prev);
                continue;
            }
            const el = edit.target === 'body' ? doc.body : doc.documentElement;
            if (!el) continue;
            if (edit.op === 'attr') {
                if (edit.prev == null) el.removeAttribute(edit.name);
                else el.setAttribute(edit.name, edit.prev);
            } else if (edit.op === 'class') {
                for (const name of edit.add || []) el.classList.remove(name);
                for (const name of edit.remove || []) el.classList.add(name);
            }
        }
    }

    function collectScriptClasses(doc) {
        const found = [];
        const re = /classList\s*\.\s*(?:add|remove|toggle)\s*\(\s*['"]([a-zA-Z0-9_-]+)['"]/g;
        const scripts = doc.scripts || [];
        let seen = 0;
        for (let i = 0; i < scripts.length && seen < 30; i++) {
            const script = scripts[i];
            if (script.src) continue;
            seen++;
            const text = (script.textContent || '').slice(0, 4000);
            re.lastIndex = 0;
            let match;
            while ((match = re.exec(text))) {
                if (THEME_CLASSES.indexOf(match[1]) !== -1 && found.indexOf(match[1]) === -1) found.push(match[1]);
            }
        }
        return found;
    }

    function snap(el) {
        const attrs = {};
        const names = SCHEME_ATTRS.concat([MD_ATTR]);
        for (const name of names) {
            if (el.hasAttribute(name)) attrs[name] = el.getAttribute(name);
        }
        return { attrs: attrs, classes: [].slice.call(el.classList) };
    }

    function collectInput() {
        const doc = pageWin().document;
        const storage = {};
        const ls = pageStorage();
        if (ls) {
            for (const key of STORAGE_KEYS.concat(['darkMode']).concat(MKDOCS_KEYS)) {
                const value = ls.getItem(key);
                if (value != null) storage[key] = value;
            }
        }
        return {
            html: snap(doc.documentElement),
            body: doc.body ? snap(doc.body) : null,
            storage: storage,
            scriptClasses: collectScriptClasses(doc),
        };
    }

    function opaqueLuminance(el) {
        const bg = pageWin().getComputedStyle(el).backgroundColor;
        const color = parseColor(bg);
        if (!color || color.a < 0.5) return null;
        return relLuminance(color);
    }

    function readSurfaceNow() {
        const w = pageWin();
        const doc = w.document;
        const x = Math.max(1, Math.floor((w.innerWidth || doc.documentElement.clientWidth || 800) / 2));
        const y = Math.max(1, Math.floor((w.innerHeight || doc.documentElement.clientHeight || 600) / 3));
        let el = null;
        try { el = doc.elementFromPoint(x, y); } catch (err) { el = null; }
        const seen = new Set();
        while (el && !seen.has(el)) {
            seen.add(el);
            if (el.id !== 'rt-btn' && el.id !== 'rt-toast') {
                const luminance = opaqueLuminance(el);
                if (luminance != null) return luminance;
            }
            el = el.parentElement;
        }
        for (const node of [doc.body, doc.documentElement]) {
            if (!node) continue;
            const luminance = opaqueLuminance(node);
            if (luminance != null) return luminance;
        }
        return null;
    }

    // Drop our own background override while reading so the sample is the site's color.
    // Synchronous, so the browser does not paint the intermediate state.
    function readSurface() {
        const root = docEl();
        if (!root) return null;
        const removed = [];
        for (const name of ['rt-pending', 'rt-filter']) {
            if (!root.classList.contains(name)) continue;
            root.classList.remove(name);
            removed.push(name);
        }
        try {
            return readSurfaceNow();
        } finally {
            for (const name of removed) root.classList.add(name);
        }
    }

    function patchMatchMedia(mode) {
        const w = pageWin();
        if (typeof w.matchMedia !== 'function') return;
        if (!originalMatchMedia) originalMatchMedia = w.matchMedia.bind(w);
        const orig = originalMatchMedia;
        w.matchMedia = function (query) {
            const text = String(query);
            if (!/prefers-color-scheme\s*:/i.test(text)) return orig(text);
            const rewritten = rewriteSchemeQuery(text, mode);
            const mql = orig(rewritten);
            if (rewritten === text) return mql;
            return new Proxy(mql, {
                get(target, prop) {
                    if (prop === 'media') return text;
                    const value = Reflect.get(target, prop, target);
                    return typeof value === 'function' ? value.bind(target) : value;
                },
            });
        };
    }

    function systemMode() {
        try {
            const w = pageWin();
            const mq = w.matchMedia('(prefers-color-scheme: dark)');
            return mq && mq.matches ? 'dark' : 'light';
        } catch (err) {
            return null;
        }
    }

    function unpatchMatchMedia() {
        const w = pageWin();
        if (originalMatchMedia) w.matchMedia = originalMatchMedia;
    }

    function giveUp() {
        if (observer) observer.disconnect();
        observer = null;
        revertEdits(current.edits);
        current.edits = [];
        current.strategy = 'filter';
        setFilter(true);
        setWant(current.mode);
        save();
    }

    function onMutate() {
        if (current.mode === 'off') return;
        const root = docEl();
        if (!root) return;
        if (current.strategy === 'filter') {
            if (!root.classList.contains('rt-filter')) setFilter(true);
            setWant(current.mode);
            return;
        }
        if (current.strategy === 'native' && current.edits && current.edits.length) {
            if (applyEdits(current.edits) > 0) {
                fights++;
                if (fights > 8) giveUp();
            }
        }
    }

    function watch() {
        if (observer) return;
        const doc = pageWin().document;
        if (!doc.documentElement) return;
        observer = new MutationObserver(onMutate);
        observer.observe(doc.documentElement, { attributes: true });
        const armBody = () => {
            if (doc.body && observer) observer.observe(doc.body, { attributes: true });
        };
        if (doc.body) armBody();
        else doc.addEventListener('DOMContentLoaded', armBody, { once: true });
    }

    function decide() {
        const mode = current.mode;
        if (mode !== 'light' && mode !== 'dark') return;
        const root = docEl();
        if (!root) return;
        setWant(mode);
        const matched = surfaceMatches(mode, readSurface());
        if (matched === true) {
            setFilter(false);
            root.classList.remove('rt-filter');
            if (current.strategy === 'native' && current.edits && current.edits.length) {
                root.classList.add('rt-native');
            } else {
                current.strategy = 'asis';
                current.edits = [];
                root.classList.remove('rt-native');
            }
            save();
            return;
        }
        if (matched == null) return;
        if (current.strategy !== 'filter') {
            const edits = plan(collectInput(), mode).edits;
            if (edits.length) {
                applyEdits(edits);
                const ok = surfaceMatches(mode, readSurface()) === true;
                if (ok) {
                    current.edits = edits;
                    current.strategy = 'native';
                    root.classList.add('rt-native');
                    root.classList.remove('rt-filter');
                    save();
                    return;
                }
                revertEdits(edits);
            }
        }
        current.edits = [];
        current.strategy = 'filter';
        setFilter(true);
        save();
    }

    function stylesReady(doc) {
        const links = doc.querySelectorAll('link[rel~="stylesheet"]');
        for (const link of links) {
            if (link.disabled || link.media === 'print') continue;
            if (!link.sheet) return false;
        }
        return true;
    }

    function whenStylesReady() {
        return new Promise((resolve) => {
            const doc = pageWin().document;
            const start = Date.now();
            const tick = () => {
                if (stylesReady(doc) || Date.now() - start > 1500) resolve();
                else setTimeout(tick, 40);
            };
            if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', tick, { once: true });
            else tick();
        });
    }

    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function settle(gen) {
        await whenStylesReady();
        if (gen !== generation) return;
        await delay(80);
        if (gen !== generation) return;
        if (current.mode === 'off') {
            clearVisual();
            return;
        }
        // Body-targeted edits could not be applied before <body> existed.
        if (current.strategy === 'native' && current.edits && current.edits.length) applyEdits(current.edits);
        decide();
        if (gen !== generation) return;
        // A default white canvas can look "already light" before the site paints.
        // Sample once more, and only then fall back to the filter.
        if (current.strategy === 'asis' || current.strategy == null) {
            await delay(180);
            if (gen !== generation) return;
            const late = surfaceMatches(current.mode, readSurface());
            if (late !== true) {
                current.strategy = null;
                current.edits = [];
                decide();
                if (gen !== generation) return;
            }
        }
        if ((current.mode === 'light' || current.mode === 'dark') && current.strategy == null) {
            current.strategy = 'filter';
            current.edits = [];
            setFilter(true);
            save();
        }
        setPending(false);
        ensureButton();
        installMenu();
        watch();
    }

    function showToast(text) {
        const doc = pageWin().document;
        if (!doc.documentElement) return;
        let el = doc.getElementById('rt-toast');
        if (!el) {
            el = doc.createElement('div');
            el.id = 'rt-toast';
            doc.documentElement.appendChild(el);
        }
        el.textContent = text;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { if (el.parentNode) el.remove(); }, 900);
    }

    function ensureButton() {
        const doc = pageWin().document;
        const existing = doc.getElementById('rt-btn');
        if (!buttonOn()) {
            if (existing) existing.remove();
            return;
        }
        if (!doc.documentElement) return;
        ensureStyle();
        let btn = existing;
        if (!btn) {
            btn = doc.createElement('button');
            btn.id = 'rt-btn';
            btn.type = 'button';
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (event.shiftKey) setButton(false);
                else setMode(nextMode(current.mode));
            });
            doc.documentElement.appendChild(btn);
        }
        const mode = current.mode;
        btn.textContent = mode === 'light' ? '☀' : mode === 'dark' ? '☾' : '○';
        const hint = mode === 'off'
            ? 'Readable Theme is off. Click for light mode. Shift-click to hide.'
            : 'Readable Theme: ' + mode + '. Click to cycle. Shift-click to hide.';
        btn.title = hint;
        btn.setAttribute('aria-label', hint);
    }

    function setButton(on) {
        gmSet(BUTTON_KEY, on === true);
        if (on) ensureStyle();
        ensureButton();
        installMenu();
    }

    function mark(mode) {
        return current.mode === mode ? '✓ ' : '';
    }

    function installMenu() {
        if (typeof GM_registerMenuCommand !== 'function') return;
        if (menuIds.length && typeof GM_unregisterMenuCommand !== 'function') return;
        if (typeof GM_unregisterMenuCommand === 'function') {
            for (const id of menuIds) {
                try { GM_unregisterMenuCommand(id); } catch (err) { /* already gone */ }
            }
        }
        menuIds = [];
        const add = (title, fn) => {
            try {
                const id = GM_registerMenuCommand(title, fn);
                if (id != null) menuIds.push(id);
            } catch (err) { /* menu unavailable */ }
        };
        add(mark('light') + 'Light', () => setMode('light'));
        add(mark('dark') + 'Dark', () => setMode('dark'));
        add(mark('off') + 'Off', () => setMode('off'));
        add(buttonOn() ? 'Hide floating button' : 'Show floating button', () => setButton(!buttonOn()));
    }

    function onKey(event) {
        if (event.repeat || event.isComposing || event.keyCode === 229) return;
        if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
        if (event.code !== 'KeyL' && event.key !== 'L' && event.key !== 'l') return;
        event.preventDefault();
        event.stopPropagation();
        setMode(nextMode(current.mode));
    }

    function installHotkey() {
        if (hotkeyOn) return;
        hotkeyOn = true;
        pageWin().addEventListener('keydown', onKey, true);
    }

    function setMode(mode) {
        if (mode !== 'light' && mode !== 'dark' && mode !== 'off') return;
        const gen = ++generation;
        fights = 0;
        const previousMode = current.mode;
        const previousStrategy = current.strategy;
        if (current.edits && current.edits.length) revertEdits(current.edits);
        clearVisual();
        unpatchMatchMedia();
        current = { mode: mode, strategy: null, edits: [] };
        save();
        installMenu();
        ensureButton();
        if (mode === 'off') {
            // The site's own startup script may have painted this mode from the
            // patched media query without leaving an edit we can revert. Reload
            // so that script runs against the real preference.
            const drifted = previousStrategy === 'asis' && previousMode && previousMode !== systemMode();
            if (drifted) {
                try { pageWin().location.reload(); } catch (err) { /* ignore */ }
                return;
            }
            showToast('Off');
            return;
        }
        showToast(mode === 'light' ? 'Light' : 'Dark');
        ensureStyle();
        patchMatchMedia(mode);
        setWant(mode);
        setPending(true);
        settle(gen);
    }

    function boot() {
        current = loadRec();
        installHotkey();
        installMenu();
        // Patch before any page script reads prefers-color-scheme. This does not need <html>.
        if (current.mode === 'light' || current.mode === 'dark') patchMatchMedia(current.mode);
        whenDocumentElement(() => {
            if (buttonOn()) ensureButton();
            if (current.mode !== 'light' && current.mode !== 'dark') return;
            ensureStyle();
            setWant(current.mode);
            if (current.strategy === 'filter') setFilter(true);
            else if (current.strategy === 'native' && current.edits.length) {
                applyEdits(current.edits);
                const root = docEl();
                if (root) root.classList.add('rt-native');
            } else if (current.strategy !== 'asis') setPending(true);
            watch();
            settle(generation);
        });
    }

    try {
        boot();
    } catch (err) {
        console.error('[Readable Theme]', err);
    }
})();
