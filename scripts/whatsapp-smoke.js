// Wrapper to run the backend WhatsApp smoke test from the host project (Jhonatan123).
// The backend code lives in ../backend and runs via Docker on localhost:3000.

process.env.APP_PORT = process.env.APP_PORT || '3000';

// eslint-disable-next-line @typescript-eslint/no-var-requires
require('../../backend/scripts/whatsapp-smoke');
