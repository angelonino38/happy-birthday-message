import 'dotenv/config';
import { startServer } from './server';
import { startScheduler } from './scheduler';
import { initDb } from './x/db';

async function main() {
  const port = Number(process.env.PORT || 3000);
  await initDb();
  await startServer(port);
  await startScheduler();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});



