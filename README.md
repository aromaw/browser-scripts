# browser-scripts

Userscripts for Tampermonkey and Violentmonkey. Install links use `aromaw/browser-scripts`.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open the install link for a script below and confirm the install.
3. Each script sets `@updateURL` and `@downloadURL` to its file on `main`, so the extension can update it.

## Scripts

### [NGA Code Agent Disguise](nga-code-agent-disguise/README.md)

Shows NGA (`bbs.nga.cn`, `ngabbs.com`, `bbs.ngacn.cc`, `nga.178.com`) as a Claude or Codex desktop session.

- Install: [nga-code-agent-disguise.user.js](https://raw.githubusercontent.com/aromaw/browser-scripts/main/nga-code-agent-disguise/nga-code-agent-disguise.user.js)
- Notes: [English](nga-code-agent-disguise/README.md), [中文](nga-code-agent-disguise/README.zh-CN.md)

The script used to live at the repository root. The old raw URL (`/nga-code-agent-disguise.user.js`) no longer serves it. Copies that are already installed keep working, but they will not see later updates until you reinstall from the link above. The script's behavior is unchanged.

### [Readable Theme](readable-theme/README.md)

Switches a page between a light and a dark appearance, per site. The default is off, so a site stays as it is until you choose a mode. It follows the site's own theme switch when that switch is a normal `data-theme`, `class="dark"`, or `prefers-color-scheme` hook, and otherwise inverts the page while putting images, video, and canvas back.

- Install: [readable-theme.user.js](https://raw.githubusercontent.com/aromaw/browser-scripts/main/readable-theme/readable-theme.user.js)
- Shortcut: `Alt+Shift+L` cycles Off → Light → Dark
- Userscript menu: Light, Dark, Off, and show or hide the floating button

## Development

From the repository root:

```sh
npm install
npm test
```

`npm test` runs the NGA jsdom suites and the Readable Theme unit and headless-Chromium tests. It does not contact NGA or the documentation sites used for the theme screenshots. `npm run theme-shots` writes those live before/after screenshots.
