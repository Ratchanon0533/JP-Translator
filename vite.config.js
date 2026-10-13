import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // A fixed port, so the address in the README and .claude/launch.json stays correct.
  server: { port: 5174, strictPort: true },
});
