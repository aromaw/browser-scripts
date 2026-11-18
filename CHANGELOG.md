# Changelog

## 4.1.7 — 2026-11-18

### Added: "Favorite boards" module on the home page

- The home page now leads with a **Favorite boards** section: the boards
  the viewer favorited on NGA itself, read from the page's own favorites
  block (`#favorite_forums` / `#favor_forums`). This is separate from
  Saved, which is the script's local list (`board add` / + Save).
- Favorited boards move out of their category groups (and out of Recent),
  the same way saved boards do, so each board shows once in the "mine"
  sections. A board that is both favorited and saved appears in both
  modules; its card shows "Saved ✓" either way.
- When the current page has no favorites block (e.g. `home` from a thread
  page, or logged out), the module is hidden instead of showing stale or
  invented data.

## 4.1.6 — 2026-11-18

### Added: Boards home page (NGA front page)

- The NGA front page (`/` and `/index.php`) now renders a board picker
  instead of the idle view. Boards are grouped by their category heading
  on the live index page; Saved boards and Recently visited boards get
  their own sections first.
- The page is a Codex-style centered home in both themes: a big "Boards"
  title, a centered search box (560px, composer-styled, autofocused),
  then grouped board cards. Search filters by name or fid as you type
  (no re-render, so the box keeps focus) and shows a "N of M boards"
  count; `/` focuses the search from anywhere on the page.
- Each card shows the board name and fid and links to
  `/thread.php?fid=…`. A "+ Save" button stores the board in the sidebar
  list (the same list `board list` manages); saved boards move out of
  their group into Saved, and the button becomes "Saved ✓".
- `home` opens the picker in place from any page (no navigation); the
  sidebar has a Home entry that links to `/`. On the picker the top-bar
  sort pill is hidden (there is no list to sort) and Next is disabled.
- The parser is defensive: it groups links by the last heading that
  precedes them, skips nav/user/favorites chrome, junk names, and
  parameterized links (favor/page/order_by/…), and never invents a board
  — an unknown board name stays as "fid N", and an index with no groups
  shows an empty state with the `board fid` fallback. The script's own
  rendered output (`#cad__root`) is excluded from the scan, so the
  picker cannot re-parse its own sidebar links as boards. The index page
  has no current board, so `pageFid()` returns empty there instead of
  promoting the last nav link.

## 4.1.5 — 2026-11-17

### Changed: themes now follow the real desktop apps (1:1 pass)

- **Codex theme follows Codex's shipped CSS tokens.** Dark: page `#0d0d0d`,
  primary surface `#212121`, secondary `#181818`, tertiary `#131313`, text
  `#dfdfdf`; light: page `#ffffff`, surfaces `#f9f9f9` / `#f3f3f3`, text
  `#1a1c1f`. Accent is now the Codex blue `#339cff` (dark) / `#0285ff`
  (light), used only for links, focus, and active states. Diff green is
  `#40c977` / `#00a240`. Sidebar is the token-preferred 275px.
- **Claude theme follows Claude's verified canvas/clay values.** Dark canvas
  `#151515`, light canvas `#fcfcfb`, light text `#0b0b0b`, secondary
  `#52514e`, muted `#898781`; brand clay `#c6613f` (light) / `#d97757`
  (dark); light links use the verified blue `#184f95`.
- **Both themes are flat flows now**, like the real apps: replies are
  separated by hairline rules, not cards or a left rail (Codex lost its
  2px left border). The OP post stays a card — the "user turn" — on the
  primary surface.
- **Composer matches the desktop pattern.** Claude's box is 14px radius,
  Codex's stays a squircle 18px; the footer is now a slim control row
  separated from the input by a hairline, with the model picker at the
  right. Codex's send button was already inverted monochrome
  (white bg/black text on dark, black bg/white text on light) and now
  matches the light token too.
- **Sidebar "New" button is a ghost button** in both themes, like the real
  apps' + New; sidebar items are 13px; the top-bar title is 14px/650.
- Hardcoded clay/green tints in the OP badge and bot avatar are now
  theme-aware (`color-mix` / `--band`), so they follow the active theme.
- Borders are hairlines (8% foreground opacity) in all four theme/mode
  combinations; the drawer follows the theme's sidebar width.

### Readability (deliberate deviations from the originals)

- Post text stays 14px / line-height 1.7 instead of Codex's 13px / 1.5.
- Secondary text never goes below `#8f8f8f` (dark) / `#5d5d5d` (light);
  the composer placeholder keeps its faint color at 0.75 opacity instead
  of the dim hint text the real Claude app was flagged for.
- Content column stays capped at 110ch.
- Brand fonts (anthropic-sans, OpenAI Sans) are not distributable, so the
  system font stack is kept.

## 4.1.4 — 2026-11-17

### Fixed: autopage (自动切页)

- **Stopped the runaway fetch past the last page.** `appendPage` used to
  synthesize `page+1` whenever the fetched page's pager had no 下一页 link —
  but the last page legitimately has no 下一页, so scrolling to the bottom of
  any multi-page thread fetched a nonexistent next page. Now `page+1` is only
  synthesized when the fetched page number is below a known page maximum
  (from either pager), or when both pagers are completely empty.
- **Guessed-page failures no longer latch the error state.** A failed
  `page+1` guess (HTTP error, network error, or 15s timeout) now ends the
  list silently ("End of pages") instead of showing "Could not load the next
  page. Retry" forever. Failures of a real pager-linked next page still show
  the Retry card.
- **Re-enabling autopage retries.** The `autopage` command now clears
  `autoPageError` when turning autopage back on.
- **Refresh no longer duplicates pushed posts.** The tail merge in `refresh()`
  now dedupes appended posts by post id, the same way topics were already
  deduped by href.
- **Manual Next/Prev respect page bounds.** `pageNav` returns early past the
  known first/last page; TopBar Prev/Next are disabled (with `aria-label`)
  on the first/last page.

### UI / animation / layout

- Loading state: "Loading page N…" plus two shimmer skeleton post cards
  (`.cad-skel`, `cad-shimmer`).
- Error state: a card with **Retry** and **Turn autopage off** buttons.
- End state: a footer "End of pages · X of Y pages" with a **Back to top ↑**
  smooth-scroll button.
- Page separators now carry counts ("page 2 · 25 posts") and fade in once
  (`cad-fade-up`); appended posts use `content-visibility: auto` so very long
  auto-loaded lists stay cheap to scroll.
- Smooth scrolling on the main column; all animation/smooth-scroll gated
  behind `@media (prefers-reduced-motion: no-preference)`.
- Responsive sidebar: ≤1100px collapses to a 64px icon rail (labels hidden);
  ≤760px hides the sidebar and exposes it as a 256px overlay drawer toggled
  by a ☰ button in the TopBar (visible only at that width).
- Disabled Prev/Next are visibly dimmed.

### Tests

- 6 new tests in `tests/fixes.test.js` ("auto-page (4.1.4)"): stops at the
  last page with exactly the expected fetches, guessed-page failure ends
  silently, pager-linked failure shows Retry and Retry works, refresh does
  not duplicate a pushed floor, Prev/Next disabled at the bounds,
  re-enabling autopage retries after a failure.
- Updated the pre-existing timed-out-page test in `tests/disguise.test.js`
  to click the new "Retry" button.

## 4.1.3

Author names on live read.php pages are stored as `UID:…` in both `commonui.userInfo.setAll` and `#postauthorN`. The ucp API that 4.1.2 used as a fallback returns HTTP 503. Favorite titles were still garbled because a previous GBK-as-UTF-8 cache (`[��¼��]…`) was kept.

### Fixed

- Names are taken from the page first: `userInfo.setAll` (including hex `uuname`, and JSON that contains raw newlines), quote and author `userlink`s, and board/favor author links. Those names are cached. The ucp GET is only a last fallback; after the first HTTP 503 in a session it is not called again.
- `debug names` prints the source of each resolved name (`page-userinfo`, `page-dom`, `cache`, or `ucp`) and reports when ucp has been stopped after a 503.
- Favorite titles are decoded with a UTF-8/GBK scorer that keeps a clean UTF-8 body and still prefers GBK when UTF-8 is full of replacement glyphs. A cached favorites list that contains U+FFFD or the `¼` mojibake from GBK `录` is dropped and refetched, and a garbled decode is not written back.

## 4.1.2

Favorite titles and author names were garbled or missing because NGA serves GBK, and some fetches decoded the body as UTF-8.

### Fixed

- Every fetch now decodes the body with `TextDecoder('gbk')` via `arrayBuffer`, using the response charset or an HTML meta tag as a hint. UTF-8 is only kept when it decodes cleanly. The favor-page fetch, ucp GETs, authorid pages, notifications, and next-page loads all share this path. Calling `response.text()` or `response.json()` is no longer used for NGA responses.
- The ucp name GET follows NGA's own `__API.userInfo`: `/nuke.php?__lib=ucp&__act=get&lite=js&uid=`, then `/nuke.php?__lib=ucp&__act=get&uid=&__output=8` if the first body does not parse. `__output=11` JSON may be prefixed with `window.script_muti_get_var_store=`; that prefix is stripped before `JSON.parse`. Requests are GET only, with `credentials: 'include'`, one at a time, and still at most one successful cache write per uid.

### Added

- Hidden command `debug names` (not in the slash menu). It prints how many authors are resolved vs. unresolved, then for the first unresolved uid: the attempted URL, HTTP status, content-type, the first 300 characters of the decoded body, and the parse error if any.

## 4.1.1

Fixes from a logged-in live test of 4.1.0. Parsing follows NGA's own `commonui.postArg`, attachment lists, and user-info data.

### Fixed

- Quote and vote cards no longer show `pid 0` on later pages. Reply pids come from `commonui.postArg.proc`, which survives NGA's hydration. A non-zero DOM pid is preferred over a parent form's `pid=0`. The original post is genuinely pid 0 and stays that way.
- Author names that the dump stores as `UID:…` are resolved from `commonui.userInfo` (including hex-encoded `uuname`), from a later hydrated `a.author` / `#postauthorN`, and, if those are still empty, from a read-only same-origin GET to NGA's ucp endpoint (`nuke.php?__act=get&__lib=ucp`). Names are cached; at most one GET is sent per uid; nothing is POSTed.
- With `img on`, floors that only showed leftover numerals ("3", "4") now show thumbnails. Sources are `data-srclazy` / `data-srcorg`, `[img]` BBCode (including `./mon_…` paths), and `ubbcode.attach.load`. Relative paths get the `https://img.nga.cn/attachments/` prefix.
- `op` on a page that has no original-poster posts uses `postArg.setDefault`'s topic-author uid (`tAid`) and fetches NGA's `authorid` view. The status counts visible OP posts only. It no longer shows an empty list, "End of pages", and a thread-wide count.
- The sidebar's Favorites list comes from a cached, read-only GET of `thread.php?favor=1`. Recent threads are labeled Recent, and are not mixed into Favorites.
- A quote shows the original time when that time is in the markup or in `postArg` on the same page. The main column is 110ch on wide screens (was 92ch).

### Added

- Tests for postArg pids after a hydrated DOM, ucp name fetching, lazy and BBCode images, `op` on page 2, and the Favorites / Recent split.

## 4.1.0

Parsing follows the live NGA DOM. The overlay was tested against saved logged-in pages, and the boss-key cover, slash menu, and sidebar are the ones those pages need.

### Fixed

- Posts were counted twice: the parser read both `table.forumbox.postbox` and the nested `td#postcontainerN`. It now keeps one box per floor.
- Author names are taken from the author link, quote `userlink`s, and `commonui.userInfo` when that object holds a real name. Bare numeric leftovers from a `UID:` label are not used as a display name. Names that NGA itself has not hydrated stay as `UID:…` until the page fills them in.
- Quote headers show the quoted author and the time when the page has one. A "Reply to + R by [name]" line that is not wrapped in `.quote` is treated as a quote. `+R`, empty brackets, a leftover timestamp, and a leading zero-width space are stripped from the body.
- The sidebar lists the current board, that board's sub-forums, saved boards, favorites from the favor page, and recent threads. It no longer picks up every forum link on the page. The board name drops NGA's spaced-out `&nbsp;` letters (`网事杂谈`, not `网 事 杂 谈`). Horizontal overflow is clipped.
- The Esc cover is a full-viewport editor: a file tree, tabs, a numbered diff, and a status bar. The sidebar and the top bar are hidden while it is up.
- Typing `/` opens a command menu that filters as you type. Arrow keys move, Enter selects (and runs a command that takes no argument), Tab completes `/he` to `/help`.
- Search drops the placeholder rows titled `帖子发布或回复时间超过限制`. Reply counts come from `commonui.topicArg.add`, not from the unhydrated `0` in the table cell.
- Author-filter floors come from `lN`, `postcontainerN`, and `postauthorN`, not from the row index, so floor 1 is `#1`.
- The backtick that opens the overlay is not inserted into the composer.
- Post text and metadata are larger and higher-contrast.

### Added

- jsdom tests for the live markup (`tests/fixes.test.js`, sanitized fixtures) and a dump harness (`tests/dumps.test.js`) that runs when `/workspace/nga-dom` is present.
- `npm run shots` takes Playwright screenshots of the overlay against those dumps.

## 4.0.0

The overlay is a desktop chat app, not a terminal. Parsing follows live NGA markup.

### Changed

- Left sidebar for boards and bookmarks, main pane for the thread, top bar for the board, title, page, and sort or filter pills, and a multi-line composer with a Send button.
- Slash chips insert real commands (`/help`, `/reply`, `/board`, and the rest). `boards` runs `board list`.
- Help and previews sit in the scrolling main pane. Confirm is a card with Send and Cancel, and `y` / `n` still work.
- The Esc cover is a dark code-review session. Backtick does not toggle while the composer is focused. Opening the overlay focuses the composer.
- Post text drops a leading indent. Quotes show author and time, not `+R` or `undefined`. Recommend scores keep a minus sign. Long posts collapse by line count and by length.

### Fixed

- Pid comes from `pid…Anchor` and `pid=` links, including links beside the post.
- `author` and `op` are separate. `author off` clears the author filter and turns `op` off.
- `user` shows the name from the page or from `nuke.php` ucp data, plus a profile link.
- `bookmark list` links open the thread. Bookmark actions ignore the favorites-list URL.
- Cancel copy names the action (`Bookmark cancelled`, `Vote cancelled`, `New thread cancelled`).

## 3.1.0

A cleaner terminal shell, and more of the forum inside it.

### Changed

- Reading text sits in a 92-character column. Posts are cards: floor, author, time, recommend count, a quote bar, and an expand row. Click a collapsed post to open it.
- A hint row above the prompt lists `help`, `reply`, `quote`, `post`, `search:`, `boards`, `sort`, and `noti`. Tab still completes.

### Added

- `sort reply` and `sort post` follow the board's own sort links, or `order_by=lastpostdesc` / `order_by=postdatedesc`.
- `floor <n>` scrolls to a loaded floor, or opens the page that should contain it (20 floors per page, or the floor's pid when it is already loaded).
- `author <uid|name>` and `author off` use NGA's `authorid` filter. `op` is still the original-poster toggle.
- `user [uid|name]` prints the uid, location, loaded floors, and a profile link. Author names show the same tip on hover.
- `post [title]` starts a new thread. `vote <floor>` recommends a floor. `bookmark`, `unbookmark`, and `bookmark list` save a thread. Each of those waits for `y`.
- `noti` reads the notification link on the page, or `nuke.php?func=noti`, and lists the threads it finds.

## 3.0.0

Reading and replies. The disguise is usable with the keyboard, and a reply is posted only after an explicit confirm, through the forum's own form.

### Added

- `reply` and `quote` compose a post, show a preview, and submit only after `y`. The request is the page's own `post.php` form, including its hidden fields. NGA's error text is shown in the terminal.
- Per-post expand, click-to-open images, lazy thumbnails when images are on, and clickable URLs in post bodies.
- Help and other command output sit in a panel above the prompt instead of being appended under a long thread.
- The status bar shows image, original-poster, infinite-scroll, and page state.
- An idle page offers `help`, `board list`, and `board fid`. The favorites bar stays visible when it is empty.
- `board add` reads the board id from the URL, the reply form, or the breadcrumb.
- A leading `/` is accepted on commands, so `/help` works.
- `togglekey` changes the disguise shortcut. `Esc` covers the screen with a static example. `compact` shortens the chrome.
- jsdom tests and saved HTML fixtures for extraction, commands, keys, board ids, and reply payloads.

### Fixed

- The Esc cover hides the thread, prompt, and reply panel inside the shell wrapper.
- That wrapper is a full-height column, so a long thread scrolls and the prompt stays on screen.
- A next-page fetch that hits the 15s deadline shows the retry state instead of staying on "Loading".

### Changed

- Version 3.0.0. `@author` and `@namespace` are this repository. `@updateURL` and `@downloadURL` point at `main`.
- Vim keys default to off. While they are on, `h` and `l` scroll the terminal and do not change pages.
- Single-letter shortcuts do not run while vim is off, inside a text field, or during IME composition.
- `whoami` uses the name in the page header, or `reader` when that name is not there.
- `ls` lists every loaded topic and post.
- User-visible script text and code comments are English. `README.md` is English and `README.zh-CN.md` is Chinese.

### Ported from draft PR #1

Input-method guards, the Esc cover, trimmed `compact` hints (default off), per-post expand, lazy-image extraction, stable post ids, author-page overlap, cancellable page fetches, a private Preact scope, remounting the overlay, and a startup guard if the input never appears.
