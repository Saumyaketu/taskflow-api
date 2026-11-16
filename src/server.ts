import { app } from './app.js';
import { env } from './config/env.js';
import { disconnectDatabase } from './config/database.js';

const PORT = env.PORT;

const server = app.listen(PORT, () => {
  console.log(`Server running in ${env.NODE_ENV} mode on http://localhost:${PORT}`);
  console.log(`Health endpoint available at http://localhost:${PORT}/health`);
});

const shutdown = async () => {
  console.log('Shutting down server gracefully...');
  server.close(async () => {
    await disconnectDatabase();
    console.log('Server and database connections shut down cleanly.');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown); // Deployment/server termination
process.on('SIGINT', shutdown);  // Local Ctrl+C
