import express from 'express';
import { json } from 'express';
import { userRouter } from './web/user.routes';

export async function startServer(port: number) {
  const app = express();
  app.use(json());

  app.use('/user', userRouter);

  await new Promise<void>((resolve) => {
    app.listen(port, () => resolve());
  });
  console.log(`HTTP server listening on :${port}`);
}



