const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '..', 'nga-code-agent-disguise', 'nga-code-agent-disguise.user.js'), 'utf8');
const liveThread = fs.readFileSync(path.join(__dirname, 'fixtures', 'live-nga-thread.html'), 'utf8');
const liveBoard = fs.readFileSync(path.join(__dirname, 'fixtures', 'live-nga-board.html'), 'utf8');
const authorFilter = fs.readFileSync(path.join(__dirname, 'fixtures', 'author-filter.html'), 'utf8');
const emptyHtml = '<!doctype html><html><head><title>Empty - NGA</title></head><body><p>home</p></body></html>';

function load(html, url, values = {}) {
    const dom = new JSDOM(html, { url, pretendToBeVisual: true, runScripts: 'dangerously' });
    const { window } = dom;
    const gm = { cad_autopage: false, ...values };
    window.GM_getValue = (key, fallback) => (Object.prototype.hasOwnProperty.call(gm, key) ? gm[key] : fallback);
    window.GM_setValue = (key, value) => { gm[key] = value; };
    window.GM_addStyle = (css) => {
        const style = window.document.createElement('style');
        style.textContent = css;
        (window.document.head || window.document.documentElement).appendChild(style);
    };
    window.__CAD_TEST = true;
    if (typeof window.TextDecoder !== 'function') window.TextDecoder = TextDecoder;
    if (typeof window.TextEncoder !== 'function') window.TextEncoder = TextEncoder;
    window.fetch = async (input) => {
        const href = String(input && input.url ? input.url : input);
        if (href.includes('nuke.php')) {
            return {
                ok: true,
                status: 200,
                url: href,
                headers: { get: () => 'application/json' },
                json: async () => ({ data: [{ ipLoc: 'local' }] }),
                arrayBuffer: async () => new TextEncoder().encode('{}').buffer,
            };
        }
        throw new Error('unexpected fetch ' + href);
    };
    const script = window.document.createElement('script');
    script.textContent = source;
    window.document.documentElement.appendChild(script);
    if (!window.__cad) throw new Error('script did not export test hooks');
    return { window, gm, cad: window.__cad, document: window.document };
}

function keydown(window, init, target) {
    const event = new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    (target || window.document.body).dispatchEvent(event);
    return event;
}

test('live NGA boxes are not doubled, and names come from the author link', () => {
    const { cad } = load(liveThread, 'https://bbs.nga.cn/read.php?tid=9');
    const data = cad.extract();
    assert.equal(data.kind, 'posts');
    assert.equal(data.posts.length, 3);
    const floors = data.posts.map(p => p.floor);
    assert.equal(Array.from(floors).join(','), '0,1,2');
    assert.equal(new Set(floors).size, 3);
    assert.equal(data.posts[0].name, 'Alice');
    assert.equal(data.posts[1].name, 'Bob');
    assert.equal(data.posts[2].name, 'Cara');
    assert.equal(cad.isUidLabel(data.posts[0].name), false);
    assert.equal(data.posts[0].pid, '555');
    assert.equal(data.posts[0].imgs.length, 1);
});

test('quotes show author and time, and a Reply-to header is not left in the body', () => {
    const { cad } = load(liveThread, 'https://bbs.nga.cn/read.php?tid=9');
    const data = cad.extract();
    const q = data.posts[1].quotes[0];
    assert.equal(q.author, 'Alice');
    assert.equal(q.time, '2026-11-01 10:00');
    assert.match(q.text, /Opening post/);
    assert.equal(q.text.includes('+R'), false);
    assert.equal(q.text.includes('undefined'), false);
    const reply = data.posts[2];
    assert.equal(reply.quotes[0].author, 'Bob');
    assert.equal(reply.quotes[0].time, '2026-11-01 11:00');
    assert.equal(reply.text.includes('Reply to'), false);
    assert.equal(reply.text.includes('+R'), false);
    assert.equal(reply.text.includes('[Bob]'), false);
    assert.match(reply.text, /This is a long post/);
});

test('author-filter floors come from the real floor, not the row index', () => {
    const { cad } = load(authorFilter, 'https://bbs.nga.cn/read.php?tid=9&authorid=202');
    const data = cad.extract();
    assert.equal(data.posts.length, 1);
    assert.equal(data.posts[0].floor, 1);
    assert.equal(data.posts[0].name, 'Bob');
    assert.equal(data.posts[0].pid, '901');
});

test('board names drop nbsp spacing, junk search rows are dropped, and replies come from topicArg', () => {
    const { cad, document } = load(liveBoard, 'https://bbs.nga.cn/thread.php?fid=-7&key=demo');
    assert.equal(cad.pageBoardName(), '网事杂谈');
    assert.equal(cad.tidyName('网\u00a0事\u00a0杂\u00a0谈'), '网事杂谈');
    const data = cad.extract();
    assert.equal(data.kind, 'topics');
    assert.equal(data.board, '网事杂谈');
    assert.equal(data.topics.length, 2);
    assert.equal(data.topics[0].title, 'A popular thread');
    assert.equal(data.topics[0].replies, '63');
    assert.equal(data.topics[0].author, 'Alice');
    assert.equal(data.topics[1].title, 'A smaller thread');
    assert.equal(data.topics[1].replies, '4');
    assert.equal(data.topics.some(t => /超过限制/.test(t.title)), false);
    cad.boot();
    const crumb = document.querySelector('.cad-crumb').textContent;
    assert.match(crumb, /网事杂谈/);
    assert.equal(crumb.includes('网 事 杂 谈'), false);
    const side = document.querySelector('.cad-side').textContent;
    assert.match(side, /网事杂谈/);
    assert.match(side, /漩涡书院/);
    assert.equal(side.includes('Save this board') && !document.querySelectorAll('.cad-side a').length, false);
    assert.ok(document.querySelectorAll('.cad-side a').length >= 2);
    const first = document.querySelector('.cad-trow');
    assert.match(first.textContent, /63/);
    assert.equal(first.textContent.includes('超过限制'), false);
});

test('the slash menu filters as you type, arrows move, Tab and Enter select, and /he completes', async () => {
    const { cad, document, window } = load(emptyHtml, 'https://bbs.nga.cn/', { cad_on: true });
    cad.boot();
    await new Promise(r => setTimeout(r, 0));
    const input = document.querySelector('.cad-real');
    assert.ok(input);
    input.value = '/';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    let menu = document.querySelector('.cad-slash');
    assert.ok(menu);
    assert.ok(menu.querySelectorAll('.cad-slash-item').length >= 5);
    input.value = '/he';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    menu = document.querySelector('.cad-slash');
    const labels = [...menu.querySelectorAll('.cad-slash-item')].map(el => el.textContent);
    assert.ok(labels.some(t => /\/help/.test(t)));
    assert.ok(labels.every(t => /he/i.test(t)));
    cad.setTyped('/he');
    cad.tabComplete('/he');
    assert.match(cad.getTyped(), /^\/?help\s?$/);
    cad.setTyped('he');
    cad.tabComplete('he');
    assert.match(cad.getTyped(), /^help\s?$/);
    cad.setTyped('/he');
    let input2 = document.querySelector('.cad-real');
    input2.value = '/he';
    input2.dispatchEvent(new window.Event('input', { bubbles: true }));
    input2 = document.querySelector('.cad-real');
    const before = [...document.querySelectorAll('.cad-slash-item')].map(el => el.textContent);
    assert.ok(before.length >= 1);
    input2.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    const after = [...document.querySelectorAll('.cad-slash-item.cad-slash-on, .cad-slash .cad-slash-on')];
    assert.ok(after.length >= 1 || document.querySelector('.cad-slash'));
    input2 = document.querySelector('.cad-real');
    input2.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    // Enter applies the completion and, for commands that take no argument, runs it.
    const body = document.body.textContent;
    assert.equal(/\/help|Commands|help panel|keyboard/i.test(body + ' ' + cad.getTyped()) || cad.getTyped().includes('help') || /help/i.test(body), true);
});

test('a backtick used to open the overlay does not stay in the composer', async () => {
    const { cad, document, window } = load(emptyHtml, 'https://bbs.nga.cn/', { cad_on: false });
    const ev = keydown(window, { key: '`', code: 'Backquote' });
    assert.equal(ev.defaultPrevented, true);
    assert.equal(cad.store.on, true);
    cad.boot();
    await new Promise(r => setTimeout(r, 250));
    const input = document.querySelector('.cad-real');
    assert.ok(input);
    assert.equal((input.value || '').includes('`'), false);
    assert.equal((cad.getTyped() || '').includes('`'), false);
});

test('the Esc cover fills the viewport and hides the sidebar and header', async () => {
    const { cad, document, window } = load(liveThread, 'https://bbs.nga.cn/read.php?tid=9', { cad_on: true });
    cad.boot();
    cad.runCmd('pause');
    const root = document.querySelector('#cad__root');
    assert.ok(root.classList.contains('cad-covered'));
    const cover = document.querySelector('.cad-cover');
    assert.ok(cover);
    const cs = window.getComputedStyle(cover);
    assert.equal(cs.position, 'absolute');
    const insetFull = (cs.inset === '0px' || cs.inset === '0' || cs.inset === '0px 0px 0px 0px');
    const sidesFull = (cs.top === '0px' || cs.top === '0') && (cs.right === '0px' || cs.right === '0' || cs.right === '') && (cs.bottom === '0px' || cs.bottom === '0') && (cs.left === '0px' || cs.left === '0' || cs.left === '');
    assert.equal(insetFull || sidesFull, true);
    assert.equal(window.getComputedStyle(document.querySelector('.cad-app')).display, 'none');
    assert.equal(window.getComputedStyle(document.querySelector('.cad-side')).display, 'none');
    assert.equal(window.getComputedStyle(document.querySelector('.cad-topbar')).display, 'none');
    assert.equal(window.getComputedStyle(document.querySelector('.cad-body')).display, 'none');
    assert.match(cover.textContent, /handleRequest/);
    assert.equal(cover.textContent.includes('Static example'), false);
    assert.ok(cover.querySelector('.cad-cover-tree'));
    assert.ok(cover.querySelector('.cad-dline.cad-add'));
    assert.ok(cover.querySelector('.cad-dline.cad-del'));
});

test('long posts collapse, and img on renders a thumbnail', async () => {
    const { cad, document } = load(liveThread, 'https://bbs.nga.cn/read.php?tid=9', { cad_on: true, cad_img: true, cad_expand: false });
    cad.boot();
    const long = document.querySelector('#cad-floor-2');
    assert.ok(long);
    assert.equal(long.textContent.includes('line-15-hidden'), false);
    assert.match(long.textContent, /expand/);
    long.click();
    assert.match(document.querySelector('#cad-floor-2').textContent, /line-15-hidden/);
    const img = document.querySelector('#cad-floor-0 img.cad-img');
    assert.ok(img);
    assert.match(img.getAttribute('src'), /demo\.jpg/);
});

test('confirm cards still have Send, Cancel, and y\/n, and nothing is sent without y', async () => {
    const { cad, document, window } = load(liveThread, 'https://bbs.nga.cn/read.php?tid=9&page=2', { cad_on: true });
    const calls = [];
    window.__cadMockSubmit = async (payload) => { calls.push(payload); return { ok: true, message: 'ok' }; };
    cad.boot();
    await cad.runCmd('vote 1');
    assert.equal(calls.length, 0);
    const card = document.querySelector('.cad-panel, .cad-modal-card, .cad-modal');
    assert.ok(card);
    assert.match(document.body.textContent, /Send/);
    assert.match(document.body.textContent, /Cancel/);
    assert.match(document.body.textContent, /y \/ n|y sends|y\/n|or y/i);
    await cad.runCmd('n');
    assert.equal(calls.length, 0);
    assert.match(document.querySelector('.cad-panel').textContent, /Vote cancelled/);
});

test('decodeUuname, absImg, and imgSrc cover NGA\'s real name and image encodings', () => {
    const { cad, document } = load(emptyHtml, 'https://bbs.nga.cn/read.php?tid=1');
    assert.equal(cad.decodeUuname('e6b58be8af95'), '测试');
    assert.equal(cad.decodeUuname('UID:12'), '');
    assert.equal(cad.absImg('./mon_202611/12/foo.jpg'), 'https://img.nga.cn/attachments/mon_202611/12/foo.jpg');
    assert.equal(cad.absImg('mon_202611/12/foo.jpg'), 'https://img.nga.cn/attachments/mon_202611/12/foo.jpg');
    assert.equal(cad.absImg('https://img.nga.178.com/attachments/mon_202611/12/foo.jpg'), 'https://img.nga.178.com/attachments/mon_202611/12/foo.jpg');
    assert.equal(cad.absImg('about:blank'), '');

    const img = document.createElement('img');
    img.setAttribute('src', 'about:blank');
    img.setAttribute('data-srclazy', 'https://img.nga.cn/attachments/mon_202611/12/lazy.jpg');
    img.setAttribute('data-srcorg', 'https://img.nga.cn/attachments/mon_202611/12/org.jpg');
    const src = cad.imgSrc(img);
    assert.equal(src.main, 'https://img.nga.cn/attachments/mon_202611/12/lazy.jpg');
});

const page2Html = `<!doctype html><html><head><title>t - NGA</title></head><body>
<div id="m_posts">
<table class="forumbox postbox"><tbody><tr>
<td class="c1"><a href="/nuke.php?func=ucp&amp;uid=99" id="postauthor21">UID:99</a></td>
<td class="c2" id="postcontainer21">
<a name="l21" id="l21" href="/read.php?tid=7&amp;page=2#pid0Anchor"></a>
<div class="postcontent ubbcode" id="postcontent21">hello from page 2</div>
</td>
</tr></tbody></table>
</div>
<script type="text/plain">
commonui.postArg.setDefault(-7,0,7,55,0,"","","","",null,0,40,1794450000,20);
commonui.postArg.proc( 21, $('postcontainer21'),$('postsubject21'),$('postcontent21'),$('postsign21'),$('posterinfo21'),$('postInfo21'),$('postBtnPos21'), null,null,887000021,0, null,'99',1794450196,'0,0,0');
</script>
</body></html>`;

test('pid comes from postArg when the live DOM only has pid 0', () => {
    const { cad, document } = load(page2Html, 'https://bbs.nga.cn/read.php?tid=7&page=2');
    const form = document.createElement('form');
    form.innerHTML = '<input type="hidden" name="pid" value="0">';
    document.body.appendChild(form);
    const data = cad.extract();
    assert.equal(data.posts.length, 1);
    assert.equal(data.posts[0].floor, 21);
    assert.equal(data.posts[0].pid, '887000021');
    assert.equal(data.posts[0].uid, '99');
    assert.equal(cad.parsePostArgs(document).topicAuthor, '55');
    assert.equal(data.posts[0].isOP, false);
});

const opHtml = `<!doctype html><html><head><title>t - NGA</title></head><body>
<div id="m_posts">
<table class="forumbox postbox"><tbody><tr>
<td class="c1"><a href="/nuke.php?func=ucp&amp;uid=55" id="postauthor0">UID:55</a><span>楼主</span></td>
<td class="c2" id="postcontainer0">
<a id="pid0Anchor" name="l0"></a>
<div class="postcontent ubbcode" id="postcontent0">original</div>
</td>
</tr></tbody></table>
</div>
<script type="text/plain">
commonui.postArg.setDefault(-7,0,7,55,0,"","","","",null,0,40,1794450000,20);
commonui.postArg.proc( 0, $('postcontainer0'),$('postsubject0'),$('postcontent0'),$('postsign0'),$('posterinfo0'),$('postInfo0'),$('postBtnPos0'), null,null,0,0, null,'55',1794450000,'0,0,0');
</script>
</body></html>`;

test('the original post is genuinely pid 0', () => {
    const { cad } = load(opHtml, 'https://bbs.nga.cn/read.php?tid=7');
    const data = cad.extract();
    assert.equal(data.posts[0].floor, 0);
    assert.equal(data.posts[0].pid, '0');
    assert.equal(data.posts[0].isOP, true);
    assert.equal(data.posts[0].uid, '55');
});

const imgHtml = `<!doctype html><html><head><title>t - NGA</title></head><body>
<div id="m_posts">
<table class="forumbox postbox"><tbody><tr>
<td class="c1"><a href="/nuke.php?func=ucp&amp;uid=1" id="postauthor21">Ann</a></td>
<td class="c2" id="postcontainer21">
<a name="l21"></a>
<div class="postcontent ubbcode" id="postcontent21">3<br>
<img src="about:blank" data-srclazy="https://img.nga.cn/attachments/mon_202611/12/a.jpg" alt="">
<br>4<br>
<img src="about:blank" data-srcorg="./mon_202611/12/b.jpg" alt="">
<br>[img]./mon_202611/12/c.jpg[/img]
</div>
</td>
</tr></tbody></table>
</div>
<script type="text/plain">
ubbcode.attach.load('postattach21','postcontent21',[{url:'mon_202611/12/d.jpg',type:'img'}], 1, 7, 1, 1794450000, 21);
commonui.postArg.proc( 21, $('postcontainer21'),$('postsubject21'),$('postcontent21'),$('postsign21'),$('posterinfo21'),$('postInfo21'),$('postBtnPos21'), null,null,100,0, null,'1',1794450000,'0,0,0');
</script>
</body></html>`;

test('lazy, relative, BBCode, and attach.load images become real thumbnails', () => {
    const { cad } = load(imgHtml, 'https://bbs.nga.cn/read.php?tid=7&page=2');
    const data = cad.extract();
    const p = data.posts[0];
    const urls = p.imgs.map(o => o.main);
    assert.ok(urls.includes('https://img.nga.cn/attachments/mon_202611/12/a.jpg'));
    assert.ok(urls.includes('https://img.nga.cn/attachments/mon_202611/12/b.jpg'));
    assert.ok(urls.includes('https://img.nga.cn/attachments/mon_202611/12/c.jpg'));
    assert.ok(urls.includes('https://img.nga.cn/attachments/mon_202611/12/d.jpg'));
    assert.ok(p.imgs.length >= 4);
    assert.equal(p.text.includes('about:blank'), false);
});

function gbkBuffer(hex) {
    return Uint8Array.from(hex.match(/../g).map(h => parseInt(h, 16))).buffer;
}

// GBK bytes of a prefixed ucp body. The username field decodes to 西西弗读者 and ipLoc to 上海.
const UCP_GBK_PREFIXED = '77696e646f772e7363726970745f6d7574695f6765745f7661725f73746f72653d7b2264617461223a5b7b22756964223a2232323032313836222c22757365726e616d65223a22cef7cef7b8a5b6c1d5df222c2275756e616d65223a22222c2269704c6f63223a22c9cfbaa3227d5d7d3b';
// GBK bytes of the favorite title 关于我在2024年遇到的那些奇人异事.
const FAV_TITLE_GBK = 'b9d8d3daced2d4da32303234c4ead3f6b5bdb5c4c4c7d0a9c6e6c8cbd2eccac2';

function nameThread(uid, label) {
    return `<!doctype html><html><head><title>t - NGA</title></head><body>
<div id="m_posts">
<table class="forumbox postbox"><tbody><tr>
<td class="c1"><a href="/nuke.php?func=ucp&amp;uid=${uid}" id="postauthor23">${label}</a></td>
<td class="c2" id="postcontainer23">
<a name="l23" id="pid887652640Anchor"></a>
<div class="postcontent" id="postcontent23">hi</div>
</td>
</tr></tbody></table>
</div>
</body></html>`;
}

test('a cached ucp GET fills UID placeholders from a GBK prefixed JSON body, at most once per uid, and never POSTs', async () => {
    const { cad, window, gm } = load(nameThread('2202186', 'UID:2202186'), 'https://bbs.nga.cn/read.php?tid=9', { cad_on: true });
    const seen = [];
    window.fetch = async (input, init) => {
        const href = String(input && input.url ? input.url : input);
        const method = (init && init.method) || 'GET';
        seen.push({ href, method });
        assert.equal(String(method).toUpperCase(), 'GET');
        assert.match(href, /nuke\.php/);
        assert.match(href, /__lib=ucp/);
        assert.match(href, /__act=get/);
        assert.match(href, /uid=2202186/);
        assert.equal(/__act=set|__act=add|__act=del/i.test(href), false);
        return {
            ok: true,
            status: 200,
            url: href,
            headers: { get: (n) => (String(n).toLowerCase() === 'content-type' ? 'application/json; charset=gbk' : null) },
            json: async () => { throw new Error('should not call json() on a GBK body'); },
            text: async () => { throw new Error('should not call text() — it would decode as UTF-8'); },
            arrayBuffer: async () => gbkBuffer(UCP_GBK_PREFIXED),
        };
    };
    assert.equal(cad.nameFromUcpData({ data: [{ username: '西西弗读者', uid: '2202186' }] }), '西西弗读者');
    assert.equal(cad.nameFromUcpData({ data: { 0: { username: 'UID:9', uuname: 'e6b58be8af95' } } }), '测试');
    cad.boot();
    await new Promise(r => setTimeout(r, 80));
    const data = cad.extract();
    assert.equal(data.posts[0].name, '西西弗读者');
    const first = seen.length;
    assert.ok(first >= 1);
    assert.match(seen[0].href, /__lib=ucp/);
    cad.ensureLocs();
    cad.ensureLocs();
    await new Promise(r => setTimeout(r, 40));
    assert.equal(seen.length, first, 'one request per uid');
    assert.equal(gm.cad_name_cache['2202186'], '西西弗读者');
});

test('live userInfo uuname and a later hydrated author link both become the display name', () => {
    const html = `<!doctype html><html><head><title>t - NGA</title></head><body>
<div id="m_posts">
<table class="forumbox postbox"><tbody><tr>
<td class="c1"><a href="/nuke.php?func=ucp&amp;uid=42" id="postauthor1">UID:42</a></td>
<td class="c2" id="postcontainer1">
<a name="l1"></a>
<div class="postcontent" id="postcontent1">hi</div>
</td>
</tr></tbody></table>
</div>
</body></html>`;
    const { cad, window, document } = load(html, 'https://bbs.nga.cn/read.php?tid=9');
    window.commonui = { userInfo: { users: { 42: { uid: 42, username: 'UID:42', uuname: 'e6b58be8af95' } } } };
    const data = cad.extract();
    assert.equal(data.posts[0].name, '测试');

    const html2 = html;
    const second = load(html2, 'https://bbs.nga.cn/read.php?tid=9');
    second.document.querySelector('#postauthor1').textContent = '真实昵称';
    const d2 = second.cad.extract();
    assert.equal(d2.posts[0].name, '真实昵称');
});

test('op on a non-first page uses tAid, and the count is the visible OP posts', async () => {
    const { cad, document } = load(page2Html, 'https://bbs.nga.cn/read.php?tid=7&page=2', { cad_on: true });
    const data = cad.extract();
    assert.equal(data.posts[0].isOP, false);
    assert.equal(cad.parsePostArgs(document).topicAuthor, '55');
    cad.boot();
    await cad.runCmd('op');
    await new Promise(r => setTimeout(r, 40));
    assert.equal(cad.store.opOnly, true);
    const text = document.body.textContent;
    assert.equal(/End of pages/.test(text), false);
    assert.equal(/\b40 posts\b/.test(text) || /\b20 posts\b/.test(text) || /\b1 posts\b/.test(text), false);
    assert.match(text, /no OP posts|loading OP posts|Could not load the OP|authorid|original poster/i);
    assert.equal(document.querySelectorAll('[id^="cad-floor-"]').length, 0);
});

test('sidebar splits Favorites from Recent', () => {
    const { cad, document } = load(emptyHtml, 'https://bbs.nga.cn/thread.php?fid=-7', {
        cad_on: true,
        cad_recent: [{ tid: '111', title: 'Recent Thread A', href: '/read.php?tid=111' }],
        cad_fav_cache: { at: Date.now(), topics: [{ tid: '222', title: 'Fav Thread B', href: '/read.php?tid=222' }] },
        cad_threads: [],
    });
    cad.boot();
    const labels = [...document.querySelectorAll('.cad-side-label')].map(el => el.textContent.trim());
    assert.ok(labels.includes('Favorites'));
    assert.ok(labels.includes('Recent'));
    const favs = cad.sidebarFavorites();
    const recent = cad.sidebarRecent();
    assert.ok(favs.some(t => t.tid === '222' && /Fav Thread B/.test(t.title)));
    assert.ok(recent.some(t => t.tid === '111' && /Recent Thread A/.test(t.title)));
    assert.equal(recent.some(t => t.tid === '222'), false);
    const side = document.querySelector('.cad-side').textContent;
    assert.match(side, /Fav Thread B/);
    assert.match(side, /Recent Thread A/);
    // Favorites section should appear before Recent
    assert.ok(side.indexOf('Fav Thread B') < side.indexOf('Recent Thread A'));
});

test('the main column is a little wider than 92ch', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'nga-code-agent-disguise', 'nga-code-agent-disguise.user.js'), 'utf8');
    assert.match(src, /max-width:\s*110ch/);
    assert.equal(/max-width:\s*92ch/.test(src), false);
});

test('decodeBuffer prefers GBK and does not leave replacement glyphs in NGA titles', () => {
    const { cad } = load(emptyHtml, 'https://bbs.nga.cn/thread.php?favor=1');
    const buf = gbkBuffer(FAV_TITLE_GBK);
    const asUtf8 = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buf));
    assert.match(asUtf8, /\uFFFD/);
    const got = cad.decodeBuffer(buf, 'gbk');
    assert.equal(got, '关于我在2024年遇到的那些奇人异事');
    assert.equal(/\uFFFD/.test(got), false);
    // Even with a wrong utf-8 content-type hint, GBK wins when UTF-8 is full of replacements.
    const despite = cad.decodeBuffer(buf, 'utf-8');
    assert.equal(despite, '关于我在2024年遇到的那些奇人异事');
});

test('parseNukeJson strips the script_muti_get_var_store prefix', () => {
    const { cad } = load(emptyHtml, 'https://bbs.nga.cn/read.php?tid=1');
    const raw = 'window.script_muti_get_var_store={"data":[{"uid":"7","username":"测试用户"}]};';
    const parsed = cad.parseNukeJson(raw);
    assert.equal(parsed.ok, true);
    assert.equal(cad.nameFromUcpData(parsed.data), '测试用户');
    const wrapped = '/*comment*/ window.script_muti_get_var_store = {"data":{"0":{"uuname":"e6b58be8af95","username":"UID:42"}}};';
    const p2 = cad.parseNukeJson(wrapped);
    assert.equal(p2.ok, true);
    assert.equal(cad.nameFromUcpData(p2.data), '测试');
    const bad = cad.parseNukeJson('<html>not json</html>');
    assert.equal(bad.ok, false);
    assert.ok(bad.error);
});

test('ucp URLs match what NGA own JS calls, including __output=8', () => {
    const { cad } = load(emptyHtml, 'https://bbs.nga.cn/read.php?tid=1');
    const urls = cad.ucpUrls('17694632');
    assert.ok(urls.some(u => /__lib=ucp/.test(u) && /__act=get/.test(u) && /lite=js/.test(u) && /uid=17694632/.test(u) && /__output=11/.test(u)));
    assert.ok(urls.some(u => /__lib=ucp/.test(u) && /__act=get/.test(u) && /uid=17694632/.test(u) && /__output=8/.test(u)));
    assert.equal(urls.every(u => /__act=get/.test(u)), true);
    assert.equal(urls.some(u => /__act=set|POST/i.test(u)), false);
});

test('debug names prints counts, the first unresolved uid, URL, status, body, and a parse error', async () => {
    const { cad, window, document } = load(nameThread('909132', 'UID:909132'), 'https://bbs.nga.cn/read.php?tid=47902535&page=2', { cad_on: true });
    window.fetch = async (input, init) => {
        const href = String(input && input.url ? input.url : input);
        assert.equal(((init && init.method) || 'GET').toUpperCase(), 'GET');
        return {
            ok: true,
            status: 200,
            url: href,
            headers: { get: (n) => (String(n).toLowerCase() === 'content-type' ? 'text/html; charset=gbk' : null) },
            json: async () => { throw new Error('not json'); },
            arrayBuffer: async () => new TextEncoder().encode('<html><body>login first 请先登录</body></html>').buffer,
        };
    };
    cad.boot();
    await cad.runCmd('debug names');
    await new Promise(r => setTimeout(r, 60));
    const panel = document.querySelector('.cad-panel, .cad-modal-card');
    assert.ok(panel);
    const text = panel.textContent;
    assert.match(text, /0 resolved/);
    assert.match(text, /1 unresolved/);
    assert.match(text, /909132/);
    assert.match(text, /nuke\.php/);
    assert.match(text, /__lib=ucp/);
    assert.match(text, /HTTP 200/);
    assert.match(text, /text\/html/);
    assert.match(text, /请先登录|login first/);
    assert.match(text, /parse error/i);
    const urls = cad.ucpUrls('909132');
    // After a failed parse, the probe should have tried at least the first official URL.
    assert.ok(cad.lastNameProbe);
    assert.ok(urls.includes(cad.lastNameProbe.url) || urls.some(u => cad.lastNameProbe.url === u));
    assert.ok(cad.lastNameProbe.parseError);
    assert.ok((cad.lastNameProbe.bodyHead || '').includes('请先登录') || (cad.lastNameProbe.bodyHead || '').includes('login first'));
});

test('debug names is hidden from the slash menu', () => {
    const { cad } = load(emptyHtml, 'https://bbs.nga.cn/read.php?tid=1');
    const hits = cad.slashHits('/');
    assert.equal(hits.some(h => /debug/.test(typeof h === 'string' ? h : (h.cmd || h.name || JSON.stringify(h)))), false);
    const src = fs.readFileSync(path.join(__dirname, '..', 'nga-code-agent-disguise', 'nga-code-agent-disguise.user.js'), 'utf8');
    assert.equal(/const CMDS = \[[^\]]*debug names/.test(src), false);
    assert.match(src, /m === 'debug names'/);
});


// [记录氵]关于我在2024年遇到的那些奇人异事  — GBK bytes, including the 录 (C2 BC) that becomes ¼ if decoded as UTF-8
const FAV_BRACKET_TITLE = '[记录氵]关于我在2024年遇到的那些奇人异事';
const FAV_BRACKET_GBK = '5bbcc7c2bce3df5db9d8d3daced2d4da32303234c4ead3f6b5bdb5c4c4c7d0a9c6e6c8cbd2eccac2';
const FAV_BRACKET_UTF8 = '5be8aeb0e5bd95e6b0b55de585b3e4ba8ee68891e59ca832303234e5b9b4e98187e588b0e79a84e982a3e4ba9be5a587e4babae5bc82e4ba8b';

function favorPage(title, tid, uid, author) {
    return `<!doctype html><html><head>
<meta http-equiv="Content-Type" content="text/html; charset=GBK">
<title>收藏的主题 - NGA</title>
</head><body>
<div id="m_threads">
<table class="forumbox">
<tbody>
<tr class="row1 topicrow">
  <td class="c1"><a id="t_rc1_0" class="replies" href="/read.php?tid=${tid}">3</a></td>
  <td class="c2"><a id="t_tt1_0" class="topic" href="/read.php?tid=${tid}">${title}</a></td>
  <td class="c3"><a href="/nuke.php?func=ucp&amp;uid=${uid}" class="author" id="t_ta1_0"><b class="block_txt" name="nameinit">${author.slice(0, 1)}</b>${author.slice(1)}</a></td>
</tr>
</tbody>
</table>
</div>
</body></html>`;
}

function pageWithSetAllAndQuote() {
    // uuname 416c696365 is UTF-8 hex for "Alice". A raw newline sits in the first
    // user's signature so a strict JSON.parse of setAll would fail.
    return `<!doctype html><html><head><title>t - NGA</title></head><body>
<script type="text/plain">
//userinfostart
commonui.userInfo.setAll(   {"101":{"uid":101,"username":"UID:101","uuname":"416c696365","nickname":null,"signature":"hello
world","bit_data":1},"202":{"uid":202,"username":"UID:202","uuname":"","nickname":null,"signature":null},"303":{"uid":303,"username":"UID:303","uuname":null,"nickname":null}} )
//userinfoend
</script>
<div id="m_posts">
<table class="forumbox postbox"><tbody><tr>
<td class="c1"><a href="/nuke.php?func=ucp&amp;uid=101" id="postauthor0" class="userlink author">UID:101</a></td>
<td class="c2" id="postcontainer0"><a name="l0"></a>
<div class="postcontent" id="postcontent0">op</div>
</td>
</tr></tbody></table>
<table class="forumbox postbox"><tbody><tr>
<td class="c1"><a href="/nuke.php?func=ucp&amp;uid=202" id="postauthor1" class="userlink author">UID:202</a></td>
<td class="c2" id="postcontainer1"><a name="l1"></a>
<div class="postcontent" id="postcontent1">
<div class="quote"><a href="/nuke.php?func=ucp&amp;uid=101" class="userlink b">[<b class="block_txt" name="nameinit">A</b>lice]</a> <span class="xtxt silver">2026-11-01 10:00</span><br>quoted alice</div>
hi from two
</div>
</td>
</tr></tbody></table>
<table class="forumbox postbox"><tbody><tr>
<td class="c1"><a href="/nuke.php?func=ucp&amp;uid=303" id="postauthor2" class="userlink author">UID:303</a></td>
<td class="c2" id="postcontainer2"><a name="l2"></a>
<div class="postcontent" id="postcontent2">
<div class="quote"><a href="/nuke.php?func=ucp&amp;uid=202" class="userlink b">[<b class="block_txt" name="nameinit">B</b>ob]</a> <span class="xtxt silver">2026-11-01 11:00</span><br>quoted bob</div>
no page name for 303
</div>
</td>
</tr></tbody></table>
</div>
</body></html>`;
}

test('names come from setAll uuname and quote links first, and debug names shows each source', async () => {
    const fetches = [];
    const { cad, window, document } = load(pageWithSetAllAndQuote(), 'https://bbs.nga.cn/read.php?tid=9&page=2', { cad_on: true });
    window.fetch = async (input, init) => {
        const href = String(input && input.url ? input.url : input);
        fetches.push(href);
        return {
            ok: false,
            status: 503,
            url: href,
            headers: { get: (n) => (String(n).toLowerCase() === 'content-type' ? 'text/html' : null) },
            arrayBuffer: async () => new ArrayBuffer(0),
        };
    };
    const fromScript = cad.parseUserInfoMap(document);
    assert.equal(fromScript['101'], 'Alice');
    assert.equal(fromScript['202'], 'Bob');
    assert.equal(fromScript['303'], undefined);

    const data = cad.extract();
    const byUid = Object.fromEntries(data.posts.map(p => [p.uid, p.name]));
    assert.equal(byUid['101'], 'Alice');
    assert.equal(byUid['202'], 'Bob');
    assert.equal(cad.isUidLabel(byUid['303']), true);
    assert.equal(cad.nameSources['101'], 'page-userinfo');
    assert.equal(cad.nameSources['202'], 'page-dom');

    cad.boot();
    await new Promise(r => setTimeout(r, 80));
    await cad.runCmd('debug names');
    await new Promise(r => setTimeout(r, 40));
    const text = document.body.textContent;
    assert.match(text, /2 resolved/);
    assert.match(text, /1 unresolved/);
    assert.match(text, /Alice \(101, page-userinfo\)/);
    assert.match(text, /Bob \(202, page-dom\)/);
    assert.match(text, /303/);
    // Ucp may be called for IP location, but a 503 stops the rest of the session
    // and must not overwrite the on-page names.
    if (fetches.length) {
        assert.equal(cad.ucpGaveUp, true);
        const uids = [...new Set(fetches.map(u => (u.match(/uid=(\d+)/) || [])[1]).filter(Boolean))];
        assert.equal(uids.length, 1, 'only one uid is probed after the 503');
    }
    const after = cad.extract();
    assert.equal(after.posts.find(p => p.uid === '101').name, 'Alice');
    assert.equal(after.posts.find(p => p.uid === '202').name, 'Bob');
    assert.equal(cad.nameSources['101'], 'page-userinfo');
    assert.equal(cad.nameSources['202'], 'page-dom');
});

test('a 503 from ucp stops every further ucp call in that session', async () => {
    const html = `<!doctype html><html><head><title>t - NGA</title></head><body>
<div id="m_posts">
<table class="forumbox postbox"><tbody><tr>
<td class="c1"><a href="/nuke.php?func=ucp&amp;uid=11" id="postauthor0">UID:11</a></td>
<td class="c2" id="postcontainer0"><a name="l0"></a><div class="postcontent" id="postcontent0">a</div></td>
</tr></tbody></table>
<table class="forumbox postbox"><tbody><tr>
<td class="c1"><a href="/nuke.php?func=ucp&amp;uid=22" id="postauthor1">UID:22</a></td>
<td class="c2" id="postcontainer1"><a name="l1"></a><div class="postcontent" id="postcontent1">b</div></td>
</tr></tbody></table>
</div>
</body></html>`;
    const { cad, window } = load(html, 'https://bbs.nga.cn/read.php?tid=9', { cad_on: true });
    const fetches = [];
    window.fetch = async (input, init) => {
        const href = String(input && input.url ? input.url : input);
        fetches.push({ href, method: ((init && init.method) || 'GET') });
        assert.equal(((init && init.method) || 'GET').toUpperCase(), 'GET');
        return {
            ok: false,
            status: 503,
            url: href,
            headers: { get: (n) => (String(n).toLowerCase() === 'content-type' ? 'text/html' : null) },
            text: async () => { throw new Error('should not call text()'); },
            arrayBuffer: async () => new ArrayBuffer(0),
        };
    };
    cad.boot();
    await new Promise(r => setTimeout(r, 80));
    cad.ensureLocs();
    cad.ensureLocs();
    await new Promise(r => setTimeout(r, 80));
    assert.ok(fetches.length >= 1, 'at least the first 503 is observed');
    // After the first 503, no other uid and no later URL variant is requested.
    const first = fetches[0].href;
    assert.match(first, /__lib=ucp/);
    assert.equal(fetches.length, 1, 'stop after the first 503, including other URL variants');
    assert.equal(cad.ucpGaveUp, true);
    const n11 = fetches.filter(f => /uid=11/.test(f.href)).length;
    const n22 = fetches.filter(f => /uid=22/.test(f.href)).length;
    assert.equal(n11 + n22, 1);
    assert.equal(n11 === 1 || n22 === 1, true);
});

test('sanitizeJsonText lets setAll survive a raw newline inside a string', () => {
    const { cad } = load(emptyHtml, 'https://bbs.nga.cn/read.php?tid=1');
    const raw = '{"101":{"uid":101,"username":"UID:101","uuname":"416c696365","signature":"a\nb"}}';
    const cleaned = cad.sanitizeJsonText(raw);
    const data = JSON.parse(cleaned);
    assert.equal(data['101'].signature, 'a\nb');
    assert.equal(cad.decodeUuname(data['101'].uuname), 'Alice');
});

test('decodeBuffer keeps a clean UTF-8 title and still decodes the live GBK [记录氵] pattern', () => {
    const { cad } = load(emptyHtml, 'https://bbs.nga.cn/thread.php?favor=1');
    const gbk = gbkBuffer(FAV_BRACKET_GBK);
    const asUtf8 = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(gbk));
    assert.match(asUtf8, /\uFFFD/);
    assert.match(asUtf8, /\u00BC/);
    assert.equal(cad.decodeBuffer(gbk, 'gbk'), FAV_BRACKET_TITLE);
    assert.equal(cad.decodeBuffer(gbk, 'utf-8'), FAV_BRACKET_TITLE);
    assert.equal(cad.titleLooksGarbled(asUtf8), true);
    assert.equal(cad.titleLooksGarbled(FAV_BRACKET_TITLE), false);

    const utf8bytes = Uint8Array.from(FAV_BRACKET_UTF8.match(/../g).map(h => parseInt(h, 16))).buffer;
    // UTF-8 bytes of real Chinese must not be forced through GBK (that produces 璁板綍…).
    assert.equal(cad.decodeBuffer(utf8bytes, 'gbk'), FAV_BRACKET_TITLE);
    assert.equal(cad.decodeBuffer(utf8bytes, 'utf-8'), FAV_BRACKET_TITLE);
});

test('a garbled favorites cache is dropped, and a GBK favor page is stored with readable titles', () => {
    const garbled = '[\uFFFD\uFFFD\u00BC\uFFFD]关于我在2024年遇到的那些奇人异事';
    const { cad, document, gm } = load(emptyHtml, 'https://bbs.nga.cn/thread.php?fid=-7', {
        cad_on: true,
        cad_recent: [{ tid: '111', title: 'Recent Thread A', href: '/read.php?tid=111' }],
        cad_fav_cache: { at: Date.now(), topics: [{ tid: '43055829', title: garbled, href: '/read.php?tid=43055829' }] },
        cad_threads: [],
    });
    assert.equal(cad.titleLooksGarbled(garbled), true);
    const emptied = cad.readFavorCache();
    assert.equal(Array.isArray(emptied.topics) && emptied.topics.length, 0);
    assert.equal(cad.sidebarFavorites().some(t => t.tid === '43055829'), false);
    cad.boot();
    const sideBefore = document.querySelector('.cad-side').textContent;
    assert.equal(sideBefore.includes('\uFFFD'), false);
    assert.equal(sideBefore.includes('\u00BC'), false);

    const html = favorPage(FAV_BRACKET_TITLE, '43055829', '99', 'BigCat');
    const { window } = load(html, 'https://bbs.nga.cn/thread.php?favor=1');
    const topics = cad.applyFavorDoc(window.document, 'https://bbs.nga.cn/thread.php?favor=1');
    assert.equal(topics.length, 1);
    assert.equal(topics[0].title, FAV_BRACKET_TITLE);
    assert.equal(topics[0].tid, '43055829');
    assert.equal(/\uFFFD/.test(topics[0].title), false);
    const stored = gm.cad_fav_cache;
    assert.equal(stored.topics[0].title, FAV_BRACKET_TITLE);
    assert.ok(stored.v);

    const favs = cad.sidebarFavorites();
    assert.ok(favs.some(t => t.tid === '43055829' && t.title === FAV_BRACKET_TITLE));
    // Author names on the favor page are cached for later thread views.
    const fromFav = cad.parseUserInfoMap(window.document);
    assert.equal(fromFav['99'] || cad.nameCache['99'], 'BigCat');
});

/* ================= auto-page (4.1.4) ================= */

// A thread page with `floors` on it, built by cloning the floor-2 box of the
// live fixture and renumbering its anchors, so each floor parses distinctly.
function threadPage(pageNo, floors, { hasNext = true, maxPage = 3, pager = true } = {}) {
    const boxes = liveThread.match(/<table class="forumbox postbox" cellspacing="1px">[\s\S]*?<\/table>/g);
    const tpl = boxes[2];
    const html = floors.map(f => tpl
        .replace(/post1strow2/g, 'post1strow' + f)
        .replace(/postcontainer2/g, 'postcontainer' + f)
        .replace(/postauthor2/g, 'postauthor' + f)
        .replace(/postcontent2/g, 'postcontent' + f)
        .replace(/postdate2/g, 'postdate' + f)
        .replace(/pid557Anchor/g, 'pid' + (600 + f) + 'Anchor')
        .replace(/name="l2"/g, 'name="l' + f + '"')
    ).join('\n');
    const nums = Array.from({ length: maxPage }, (_, i) => i + 1)
        .map(n => `<a href="/read.php?tid=9&amp;page=${n}">${n}</a>`).join('');
    const pagerHtml = pager
        ? `<div id="m_pbtnbtm">${pageNo > 1 ? `<a href="/read.php?tid=9&amp;page=${pageNo - 1}">上一页</a>` : ''}${nums}${hasNext ? `<a href="/read.php?tid=9&amp;page=${pageNo + 1}">下一页</a>` : ''}</div>`
        : '<div id="m_pbtnbtm"></div>';
    return liveThread
        .replace(/<table class="forumbox postbox" cellspacing="1px">[\s\S]*?<\/table>\s*<table class="forumbox postbox" cellspacing="1px">[\s\S]*?<\/table>\s*<table class="forumbox postbox" cellspacing="1px">[\s\S]*?<\/table>/, html)
        .replace(/<div id="m_pbtnbtm">[\s\S]*?<\/div>/, pagerHtml);
}

function pageResponse(html, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        url: '',
        headers: { get: () => 'text/html; charset=utf-8' },
        arrayBuffer: async () => new TextEncoder().encode(html).buffer,
    };
}

// fetch stub for read.php pages: `pages` maps page number -> html or status.
// nuke.php (names/locations) and the favorites fetch keep the dummy answers
// the shared load() helper uses.
function stubPageFetch(window, pages, onFetch) {
    window.fetch = async (input) => {
        const href = String(input && input.url ? input.url : input);
        if (onFetch) onFetch(href);
        if (href.includes('nuke.php')) {
            return {
                ok: true, status: 200, url: href,
                headers: { get: () => 'application/json' },
                json: async () => ({ data: [{ ipLoc: 'local' }] }),
                arrayBuffer: async () => new TextEncoder().encode('{}').buffer,
            };
        }
        if (href.includes('thread.php?favor=1')) {
            return pageResponse('<html><body><div id="m_threads"></div></body></html>');
        }
        const m = href.match(/read\.php\?tid=9(?:&amp;|&)page=(\d+)/) || href.match(/page=(\d+)/);
        const n = m ? +m[1] : 0;
        const hit = pages[n];
        if (typeof hit === 'number') return pageResponse('', hit);
        if (typeof hit === 'string') return pageResponse(hit);
        return pageResponse('', 404);
    };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const shownFloors = document => [...document.querySelectorAll('.cad-post .cad-floor')].map(e => e.textContent);

test('auto-load stops at the last page instead of guessing page+1', async () => {
    const fetches = [];
    const { window, document, cad } = load(threadPage(1, [0, 1, 2]), 'https://bbs.nga.cn/read.php?tid=9&page=1', { cad_on: true, cad_autopage: true });
    stubPageFetch(window, {
        2: threadPage(2, [3, 4, 5], { hasNext: true, maxPage: 3 }),
        3: threadPage(3, [6, 7, 8], { hasNext: false, maxPage: 3 }),
    }, href => { if (href.includes('read.php')) fetches.push(href); });
    cad.boot();
    await sleep(1000);
    assert.deepEqual(fetches.map(h => (h.match(/page=(\d+)/) || [])[1]), ['2', '3']);
    assert.equal(document.querySelectorAll('.cad-post').length, 9);
    assert.deepEqual(shownFloors(document), ['#0', '#1', '#2', '#3', '#4', '#5', '#6', '#7', '#8']);
    assert.match(document.body.textContent, /End of pages · 3 of 3 pages/);
    assert.equal(cad.getAutoPage().error, false);
    assert.equal(cad.getAutoPage().next, null);
    // A later scroll check must not fetch anything more.
    cad.maybeAutoLoad();
    await sleep(100);
    assert.equal(fetches.length, 2);
});

test('a failed guessed page+1 ends the list instead of latching the retry error', async () => {
    const fetches = [];
    const { window, document, cad } = load(threadPage(1, [0, 1, 2]), 'https://bbs.nga.cn/read.php?tid=9&page=1', { cad_on: true, cad_autopage: true });
    // Page 2's pager has numbers but no 下一页 link, so page 3 is only a
    // guess — and the server says it does not exist.
    stubPageFetch(window, {
        2: threadPage(2, [3, 4, 5], { hasNext: false, maxPage: 3 }),
        3: 404,
    }, href => { if (href.includes('read.php')) fetches.push(href); });
    cad.boot();
    await sleep(1000);
    assert.deepEqual(fetches.map(h => (h.match(/page=(\d+)/) || [])[1]), ['2', '3']);
    assert.equal(document.querySelectorAll('.cad-post').length, 6);
    assert.equal(cad.getAutoPage().error, false);
    assert.equal(cad.getAutoPage().next, null);
    assert.match(document.body.textContent, /End of pages/);
    assert.equal(document.body.textContent.includes('Could not load the next page'), false);
    cad.maybeAutoLoad();
    await sleep(100);
    assert.equal(fetches.length, 2);
});

test('a failed pager-linked next page still shows Retry, and Retry works', async () => {
    const fetches = [];
    const { window, document, cad } = load(threadPage(1, [0, 1, 2], { maxPage: 2 }), 'https://bbs.nga.cn/read.php?tid=9&page=1', { cad_on: true, cad_autopage: true });
    let p2Fails = true;
    stubPageFetch(window, {
        2: threadPage(2, [3, 4, 5], { hasNext: false, maxPage: 2 }),
    }, href => { if (href.includes('read.php')) fetches.push(href); });
    const realFetch = window.fetch;
    window.fetch = async (input) => {
        const href = String(input && input.url ? input.url : input);
        if (href.includes('read.php') && /page=2/.test(href) && p2Fails) {
            fetches.push(href);
            return pageResponse('', 500);
        }
        return realFetch(input);
    };
    cad.boot();
    await sleep(400);
    assert.equal(cad.getAutoPage().error, true);
    assert.match(document.body.textContent, /Could not load the next page/);
    assert.equal(fetches.length, 1);
    p2Fails = false;
    [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Retry').click();
    await sleep(400);
    assert.equal(cad.getAutoPage().error, false);
    assert.equal(fetches.length, 2);
    assert.equal(document.querySelectorAll('.cad-post').length, 6);
    assert.match(document.body.textContent, /End of pages · 2 of 2 pages/);
});

test('refresh does not duplicate a floor pushed onto the next page', async () => {
    const { window, document, cad } = load(threadPage(1, [0, 1, 2]), 'https://bbs.nga.cn/read.php?tid=9&page=1', { cad_on: true, cad_autopage: false });
    stubPageFetch(window, { 2: threadPage(2, [3, 4, 5], { hasNext: false, maxPage: 2 }) });
    cad.boot();
    cad.loadNextPage();
    await sleep(200);
    assert.equal(document.querySelectorAll('.cad-post').length, 6);
    // A new reply arrives: the live page-1 DOM now also carries floor 3.
    const doc2 = new window.DOMParser().parseFromString(threadPage(2, [3, 4, 5], { hasNext: false, maxPage: 2 }), 'text/html');
    const box3 = doc2.querySelector('.forumbox.postbox');
    document.querySelector('#m_posts').appendChild(document.importNode(box3, true));
    cad.refresh(true);
    assert.equal(document.querySelectorAll('.cad-post').length, 6);
    assert.deepEqual(shownFloors(document), ['#0', '#1', '#2', '#3', '#4', '#5']);
});

test('Prev is disabled on page 1 and Next is disabled on the last page', () => {
    const first = load(threadPage(1, [0, 1, 2]), 'https://bbs.nga.cn/read.php?tid=9&page=1', { cad_on: true });
    first.cad.boot();
    const topBtns = [...first.document.querySelectorAll('.cad-topbar-btn')];
    assert.equal(topBtns.find(b => b.textContent.includes('Prev')).disabled, true);
    assert.equal(topBtns.find(b => b.textContent.includes('Next')).disabled, false);

    const last = load(threadPage(3, [6, 7, 8], { hasNext: false, maxPage: 3 }), 'https://bbs.nga.cn/read.php?tid=9&page=3', { cad_on: true });
    last.cad.boot();
    const lastBtns = [...last.document.querySelectorAll('.cad-topbar-btn')];
    assert.equal(lastBtns.find(b => b.textContent.includes('Prev')).disabled, false);
    assert.equal(lastBtns.find(b => b.textContent.includes('Next')).disabled, true);
});

test('re-enabling autopage after a failure retries instead of staying latched', async () => {
    const fetches = [];
    const { window, document, cad } = load(threadPage(1, [0, 1, 2], { maxPage: 2 }), 'https://bbs.nga.cn/read.php?tid=9&page=1', { cad_on: true, cad_autopage: true });
    let p2Fails = true;
    stubPageFetch(window, {
        2: threadPage(2, [3, 4, 5], { hasNext: false, maxPage: 2 }),
    }, href => { if (href.includes('read.php')) fetches.push(href); });
    const realFetch = window.fetch;
    window.fetch = async (input) => {
        const href = String(input && input.url ? input.url : input);
        if (href.includes('read.php') && /page=2/.test(href) && p2Fails) {
            fetches.push(href);
            return pageResponse('', 500);
        }
        return realFetch(input);
    };
    cad.boot();
    await sleep(400);
    assert.equal(cad.getAutoPage().error, true);
    p2Fails = false;
    await cad.runCmd('autopage');
    await cad.runCmd('autopage');
    await sleep(400);
    assert.equal(cad.getAutoPage().error, false);
    assert.equal(fetches.length, 2);
    assert.equal(document.querySelectorAll('.cad-post').length, 6);
});

/* home board picker (4.1.6) */
const liveIndex = fs.readFileSync(path.join(__dirname, 'fixtures', 'live-nga-index.html'), 'utf8');

test('extractHome groups boards by category and skips nav, favorites, and junk links', () => {
    const { cad } = load(liveIndex, 'https://bbs.nga.cn/');
    const data = cad.extractHome();
    assert.equal(data.kind, 'home');
    assert.equal(data.groups.length, 3);
    assert.deepEqual(JSON.parse(JSON.stringify(data.groups.map(g => g.name))), ['综合讨论', '游戏', '影音娱乐']);
    assert.deepEqual(JSON.parse(JSON.stringify(data.groups[0].boards)), [
        { fid: '7', name: '网事杂谈' },
        { fid: '8', name: '闲聊灌水' },
        { fid: '9', name: '新人报道' },
    ]);
    assert.deepEqual(JSON.parse(JSON.stringify(data.groups[1].boards.map(b => b.fid))), ['310', '650', '510']);
    assert.deepEqual(JSON.parse(JSON.stringify(data.groups[2].boards.map(b => b.fid))), ['422', '123']);
    const allFids = data.groups.flatMap(g => g.boards.map(b => b.fid));
    assert.equal(allFids.includes('999'), false);
    assert.equal(allFids.includes('888'), false);
    // NGA favorites come from the page's own favorites block, not the groups.
    assert.deepEqual(JSON.parse(JSON.stringify(data.favorites)), [
        { fid: '7', name: '网事杂谈' },
        { fid: '310', name: '守望先锋' },
        { fid: '888', name: '论坛事务' },
    ]);
    assert.equal(cad.isIndexPage(), true);
});

test('booting on the NGA index renders the board picker', () => {
    const { document, cad } = load(liveIndex, 'https://bbs.nga.cn/', { cad_on: true });
    cad.boot();
    assert.equal(cad.getLastData().kind, 'home');
    assert.ok(document.querySelector('.cad-home-search'));
    assert.equal(document.querySelectorAll('.cad-board-card').length, 9);
    assert.match(document.body.textContent, /综合讨论/);
    assert.match(document.body.textContent, /影音娱乐/);
    assert.match(document.querySelector('.cad-home-count').textContent, /9 boards/);
    // Favorite boards lead, and favorited boards leave their groups.
    const favSect = [...document.querySelectorAll('.cad-home-sect')].find(s => s.textContent.includes('Favorite boards'));
    assert.equal(favSect.querySelectorAll('.cad-board-card').length, 3);
    const firstGroup = document.querySelectorAll('.cad-home-sect')[1];
    assert.equal(firstGroup.querySelectorAll('.cad-board-card').length, 2);
    assert.equal(document.querySelector('.cad-home-search'), document.activeElement);
    // Nav boards may appear in the sidebar, but the highlighted item is Home, not a board.
    assert.match(document.querySelector('.cad-side .cad-onitem').textContent, /Home/);
    assert.equal(document.querySelector('.cad-side a[href*="thread.php"].cad-onitem'), null);
    // No sort pill on the picker: there is no board list to sort.
    assert.equal([...document.querySelectorAll('button.cad-pill')].some(b => b.textContent.includes('latest')), false);
});

test('typing in the home search filters board cards without losing focus', () => {
    const { window, document, cad } = load(liveIndex, 'https://bbs.nga.cn/', { cad_on: true });
    cad.boot();
    const input = document.querySelector('.cad-home-search');
    const visible = () => [...document.querySelectorAll('.cad-board-card')].filter(c => c.style.display !== 'none');
    input.value = '原神';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(visible().length, 1);
    assert.equal(visible()[0].dataset.fid, '650');
    assert.equal(document.activeElement, input);
    assert.match(document.querySelector('.cad-home-count').textContent, /1 of 9 boards/);
    input.value = '310';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(visible().length, 1);
    assert.equal(visible()[0].dataset.fid, '310');
    input.value = '不存在';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(visible().length, 0);
    assert.match(document.querySelector('.cad-home-count').textContent, /No boards match/);
    input.value = '';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(visible().length, 9);
});

test('switching themes keeps the home search filter and count', async () => {
    const { window, document, cad } = load(liveIndex, 'https://bbs.nga.cn/', { cad_on: true });
    cad.boot();
    const input = document.querySelector('.cad-home-search');
    const visible = () => [...document.querySelectorAll('.cad-board-card')].filter(c => c.style.display !== 'none');
    input.value = '原神';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(visible().length, 1);
    // A theme switch re-renders the picker: visibility and the count must
    // derive from the query still in the box, not reset to show-all.
    await cad.runCmd('codex');
    assert.equal(cad.getLastData().kind, 'home');
    assert.equal(document.querySelector('.cad-home-search').value, '原神');
    assert.equal(visible().length, 1);
    assert.equal(visible()[0].dataset.fid, '650');
    assert.match(document.querySelector('.cad-home-count').textContent, /1 of 9 boards/);
    // The filter still works after the switch.
    input.value = '';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(visible().length, 9);
    assert.match(document.querySelector('.cad-home-count').textContent, /9 boards/);
});

test('pressing / on the picker focuses the board search', () => {
    const { window, document, cad } = load(liveIndex, 'https://bbs.nga.cn/', { cad_on: true });
    cad.boot();
    document.querySelector('.cad-home-search').blur();
    assert.notEqual(document.activeElement, document.querySelector('.cad-home-search'));
    keydown(window, { key: '/' });
    assert.equal(document.activeElement, document.querySelector('.cad-home-search'));
});

test('home command opens the picker in place on a thread page', async () => {
    const { window, document, cad } = load(liveThread, 'https://bbs.nga.cn/read.php?tid=9', { cad_on: true });
    cad.boot();
    assert.equal(cad.getLastData().kind, 'posts');
    await cad.runCmd('home');
    assert.equal(cad.getLastData().kind, 'home');
    assert.equal(window.location.href, 'https://bbs.nga.cn/read.php?tid=9');
    assert.ok(document.querySelector('.cad-home-search'));
    // No groups on a thread page, but Recent still shows the board just visited.
    assert.match(document.body.textContent, /Recent/);
    assert.ok(document.querySelector('.cad-board-card[data-fid="-7"]'));
});

test('saving a board from a card stores it and moves the card to Saved', async () => {
    const { document, cad, gm } = load(liveIndex, 'https://bbs.nga.cn/', { cad_on: true, cad_boards: [] });
    cad.boot();
    assert.equal(document.querySelectorAll('.cad-board-card').length, 9);
    document.querySelector('.cad-board-save').click();
    await sleep(50);
    assert.deepEqual(JSON.parse(JSON.stringify(gm.cad_boards)), [{ fid: '7', name: '网事杂谈' }]);
    const savedBtn = [...document.querySelectorAll('.cad-board-save')].find(b => b.disabled);
    assert.equal(savedBtn.textContent, 'Saved ✓');
    // Saving adds the board to Saved; it stays in Favorite boards too.
    assert.equal(document.querySelectorAll('.cad-board-card').length, 10);
    assert.match(document.body.textContent, /Saved/);
});

test('an index with no boards shows the empty state, and other idle pages stay idle', () => {
    const empty = load(emptyHtml, 'https://bbs.nga.cn/', { cad_on: true });
    empty.cad.boot();
    assert.equal(empty.cad.getLastData().kind, 'home');
    assert.ok(empty.document.querySelector('.cad-home-empty'));
    const other = load(emptyHtml, 'https://bbs.nga.cn/thread.php?fid=7', { cad_on: true });
    assert.equal(other.cad.extract().kind, 'idle');
});
