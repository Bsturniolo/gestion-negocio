const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

function backupDir() {
  const dir = path.join(app.getPath('documents'), 'Gestion Negocio - Respaldos');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

ipcMain.handle('backup:save', async (_e, json) => {
  const dir = backupDir();
  fs.writeFileSync(path.join(dir, 'respaldo-ultimo.json'), json);
  const hoy = new Date().toISOString().slice(0, 10);
  const diario = path.join(dir, `respaldo-${hoy}.json`);
  fs.writeFileSync(diario, json);
  // conservar solo los 30 respaldos diarios mas recientes
  const viejos = fs.readdirSync(dir).filter(f => /^respaldo-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse().slice(30);
  viejos.forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch {} });
  return dir;
});
ipcMain.handle('backup:open', async () => shell.openPath(backupDir()));

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    title: 'Gestión del Negocio',
    icon: path.join(__dirname, 'app', 'dinardi-512.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('ar.gestion.negocio');
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
