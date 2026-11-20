# Sharing Tycoon Master 3000

This page explains, step by step, how to get the game to friends. No coding needed.

There are three ways to share it:

| Way | What friends get | Best for |
|---|---|---|
| **1. A web link** | They click a link and play in their browser. They can also "install" it like an app. | Almost everyone (PC, Mac, Android, iPhone/iPad) |
| **2. Desktop downloads** | A normal Windows / Mac / Linux program. No browser needed. | Friends who prefer a "real" program |
| **3. Upload a zip to itch.io / Netlify** | A link on another website | If you don't want to use GitHub Pages |

The game works in Chrome, Edge, Firefox and Safari (16.4 or newer), on computers and on recent phones and tablets. Saves stay on each player's own device.

---

## 1. The web link (GitHub Pages)

### One-time setup (about 2 minutes)

1. Open the repository on github.com.
2. Click **Settings** (top bar) → **Pages** (left menu).
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Done. Every time new work lands on `main` (or the dev branch `claude/elegant-galileo-0epg22`), the game is rebuilt and published automatically. You can also publish by hand: **Actions** tab → **Deploy to GitHub Pages** → **Run workflow**.

Your link will be:

**https://daganfan.github.io/tycoon-master.3000/**

(If the repository is renamed or moved, the **Actions** tab → latest **Deploy to GitHub Pages** run shows the exact link under "deploy".)

**Things to know**

- **Free GitHub Pages needs a public repository.** A private repo needs a paid GitHub plan (Pro/Team) for Pages. If you want to keep the code private and stay free, use option 3 below instead.
- **Publishing from the dev branch:** GitHub only lets `main` publish by default. If a run from `claude/elegant-galileo-0epg22` fails with "Branch is not allowed to deploy", go to **Settings → Environments → github-pages → Deployment branches and tags → Add rule**, type `claude/elegant-galileo-0epg22`, save, and re-run the workflow. Only the most recent push (from either branch) is what the link shows.
- After an update, players see a small **"New version available — Reload"** message. Clicking it saves the game and loads the new version.

### How friends "install" it like an app

After opening the link once, the game also works **offline**, and friends can add it as an app with its own icon:

- **Chrome / Edge on Windows, Mac, Linux, ChromeOS:** click the **Install** icon at the right end of the address bar (a small screen with an arrow), or menu **⋮ → Cast, save and share → Install page as app** (Edge: **… → Apps → Install this site as an app**).
- **Android (Chrome):** menu **⋮ → Add to Home screen → Install**.
- **iPhone / iPad (Safari):** tap **Share** (square with arrow) → **Add to Home Screen** → **Add**.
- **Mac (Safari 17+):** **File → Add to Dock**.
- **Firefox:** play it in the browser tab (Firefox on desktop doesn't install sites as apps), or use the desktop download below.

Installed apps open full screen, without the browser bars, and update themselves.

---

## 2. Desktop downloads (Windows .exe, Mac .dmg, Linux AppImage)

### Making the files

1. On github.com, open the **Actions** tab.
2. In the left list, click **Desktop builds**.
3. Click **Run workflow** (right side) → **Run workflow**.
4. Wait about 10–15 minutes until all jobs show a green check.
5. Open the finished run and scroll to **Artifacts**. Download:
   - **TycoonMaster3000-windows** → contains `…-Setup.exe` (installer) and `…-Portable.exe` (runs without installing)
   - **TycoonMaster3000-macos** → `…-mac.dmg` (works on both Intel and Apple Silicon Macs)
   - **TycoonMaster3000-linux** → `…-linux-x86_64.AppImage`
   - **TycoonMaster3000-web** → a zip for itch.io / Netlify (see option 3)

   GitHub delivers each artifact as a zip; unzip it to get the file. Artifacts are kept for 90 days.

**A permanent download page (optional):** create a *release tag* instead. On github.com: **Releases** (right sidebar) → **Draft a new release** → **Choose a tag** → type `v0.1.0` (any name starting with `v`) → **Create new tag** → **Publish release**. The workflow runs on its own and attaches all the files to that release page, which you can send to friends.

### What friends do

The programs are not "signed" (signing costs money every year), so the computer shows a warning the first time. It's safe to continue:

- **Windows:** double-click the `Setup.exe` (or the `Portable.exe`). If a blue **"Windows protected your PC"** box appears, click **More info → Run anyway**. The installer adds a desktop shortcut.
- **Mac:** open the `.dmg` and drag **Tycoon Master 3000** into **Applications**. The first time, **right-click (or Control-click) the app → Open → Open**. If macOS still refuses ("is damaged" / "can't be opened"), open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**.
- **Linux:** right-click the `.AppImage` → **Properties → Permissions → Allow executing as program**, then double-click it.

In the desktop app: **F11** (or **Alt+Enter**) toggles full screen; **F5** reloads. Saves are kept between launches and survive updates.

---

## 3. Other places to host the web version

All of these use the same ready-made zip. Get it either from the **TycoonMaster3000-web** artifact above, or (if you have the code on your computer) by running `npm run package:web`, which writes `release/TycoonMaster3000-web-<version>.zip`.

- **itch.io** (great for games, free): Create new project → *Kind of project:* **HTML** → upload the zip → tick **This file will be played in the browser** → *Embed options:* set the size to 1280 × 720 and tick **Fullscreen button** → Save. You can keep the page private/restricted and share a secret link.
- **Netlify Drop** (free, no account needed for a quick test): go to <https://app.netlify.com/drop>, unzip the file and drag the **folder** onto the page. You get a link immediately (create a free account to keep it).
- **Vercel / Cloudflare Pages:** also work; upload the unzipped folder as a static site with no build step.

---

## For developers

| Command | Does |
|---|---|
| `npm run build` | Web build in `dist/` (PWA: manifest + offline service worker) |
| `npm run package:web` | Build + zip `dist/` into `release/` |
| `npm run desktop` | Build and run the Electron app locally |
| `npm run desktop:build` | Package installers for the current OS into `release/` |
| `npm run desktop:build:dir` | Unpacked app only (fast check) |
| `npm run icons` | Re-render all PNG icons from `public/icon.svg` |

- Everything uses relative paths (`base: './'`, manifest `start_url`/`scope` = `./`), so one build works at a domain root, under `/<repo>/` on GitHub Pages, inside an itch.io iframe and in Electron.
- Electron (`electron/main.cjs`) serves `dist/` from a private `app://game/` origin so IndexedDB saves persist; packaging config is `electron/builder.yml`. The service worker is skipped inside Electron.
- Workflows: `.github/workflows/ci.yml` (checks + Playwright e2e), `pages.yml` (GitHub Pages), `desktop.yml` (installers + release on `v*` tags).
- Browser compatibility: `src/polyfills.ts` (roundRect, prefixed AudioContext, structuredClone) and `src/bootGuard.ts` (friendly screen if WebGL 2 is missing or boot fails).
