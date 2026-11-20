// Desktop wrapper: serves the built web game (dist/) from a private app:// origin
// so saves (IndexedDB) persist between launches, exactly like the browser version.
const { app, BrowserWindow, protocol, net, shell, Menu } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const HOST = 'game';
const DIST = path.join(__dirname, '..', 'dist');

// A fixed name keeps the save location stable across versions.
app.setName('Tycoon Master 3000');

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  const createWindow = () => {
    win = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 960,
      minHeight: 600,
      title: 'Tycoon Master 3000',
      backgroundColor: '#08090d',
      icon: path.join(__dirname, 'resources', 'icon.png'),
      autoHideMenuBar: true,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    win.removeMenu();
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => (win = null));

    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
        win.setFullScreen(!win.isFullScreen());
        event.preventDefault();
      } else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
        win.webContents.reload();
        event.preventDefault();
      } else if (input.key === 'F12' && !app.isPackaged) {
        win.webContents.toggleDevTools();
      }
    });

    // Open external links in the real browser, never inside the game window.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith(`${SCHEME}://${HOST}/`)) e.preventDefault();
    });

    void win.loadURL(`${SCHEME}://${HOST}/index.html`);
  };

  app.whenReady().then(() => {
    // macOS needs an app menu for Cmd+Q / Cmd+H / copy-paste; elsewhere no menu bar at all.
    Menu.setApplicationMenu(
      process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null,
    );
    protocol.handle(SCHEME, (req) => {
      const { pathname } = new URL(req.url);
      const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.normalize(path.join(DIST, rel));
      if (!file.startsWith(DIST + path.sep)) return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
