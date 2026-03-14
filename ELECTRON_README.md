**Electron packaging (WhatsApp Dashboard)**

Overview
- The Electron app simply opens the frontend at `http://localhost:3001`.
- Backend remains fully separate; Electron does not include or run backend code.

Files
- `electron/main.js` — Electron main process, opens the frontend URL.
- `electron/icon.ico` — placeholder icon (replace before building installer).
- `package.json` — scripts added to help dev, build frontend and package .exe.

Scripts
- `npm run electron:dev` — waits for `http://localhost:3001` (uses `wait-on`) then starts Electron (development use).
- `npm run electron:build-frontend` — runs `npm --prefix frontend run build` to build the Next frontend.
- `npm run electron:package` — builds the frontend and then runs `electron-builder` to generate a Windows installer (.exe).

How to edit and test
1) Develop frontend

```powershell
cd c:\Users\Jhonatan\Desktop\App\Jhonatan123\frontend
npm install
npm run dev
```

2) Develop backend

```powershell
cd c:\Users\Jhonatan\Desktop\App\backend
npm install
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

3) Run Electron in dev (after frontend is serving at :3001)

```powershell
cd c:\Users\Jhonatan\Desktop\App\Jhonatan123
npm install  # installs electron, electron-builder, wait-on
npm run electron:dev
```

Build installer (.exe)
1) Replace `electron/icon.ico` with a real icon file.
2) Run:

```powershell
cd c:\Users\Jhonatan\Desktop\App\Jhonatan123
npm install
npm run electron:package
```

Notes
- The packaged app will still expect the frontend to be available at `http://localhost:3001`. You can set `ELECTRON_APP_URL` env var to point the packaged app to a different host.
- If you want to embed the frontend inside Electron (no external server), we can add a tiny static server or build an exportable static frontend, but that requires changes to the frontend build and is out of scope for this task.
