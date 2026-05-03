import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error (Mocked)'));

export const connectRedis = async () => {
  console.log('Redis connection bypassed for local test.');
};

export default redisClient;
