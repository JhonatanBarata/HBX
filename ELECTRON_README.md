**Electron shell status**

Overview
- The Electron shell in `electron/main.js` only opens the frontend URL, defaulting to `http://localhost:3001`.
- Backend and publish stay in the official root workflow: `npm run up`, `npm run down`, `npm run commit`, `npm run publish`.
- Electron is not part of the official local/publish flow today and should never point outside the main `APP` root.

Current repository state
- The maintained root path is `C:\Users\Jhonatan\Desktop\App`.
- Any future Electron packaging flow must start from that same root.
- There are currently no official Electron scripts in the root `package.json`.

Manual testing baseline
1. Start the official local stack from the root with `npm run up`.
2. Confirm the frontend is available at `http://localhost:3001`.
3. Only then launch the Electron shell with your local Electron tooling if you still need this wrapper.

Notes
- If Electron is reactivated later, keep it as a thin shell over the same frontend served by the main root workflow.
- Do not create a parallel frontend path or alternate app root for Electron.
