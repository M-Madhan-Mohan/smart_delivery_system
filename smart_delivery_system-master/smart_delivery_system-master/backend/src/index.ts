import http from 'http';
import app from './app';
import { connectRedis } from './utils/redis';
import { initSocket } from './utils/socket';

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

export const io = initSocket(server);

server.listen(PORT, async () => {
  await connectRedis();
  console.log(`Server is running on port ${PORT}`);
});
