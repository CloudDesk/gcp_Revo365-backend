import { createClient, RedisClientType } from "redis";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

let redisClient: RedisClientType | null = null;

export const connectGetSessionredis = async () => {
  try {
    redisClient = createClient({
      url: `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
      // url: `redis://:fVZWPfs4xi9SvpdY2d1HZgiqJCPNuZWh@redis-10690.c330.asia-south1-1.gce.redns.redis-cloud.com:10690`,

      // Note: The format is redis://:password@host:port
      // The extra colon before the password is important!
    });

    redisClient.on("connect", () => {
      console.log("Connected successfully to the Redis store");
    });

    redisClient.on("error", (err) => {
      console.error("Redis Client Error", err);
    });

    await redisClient.connect();
  } catch (error) {
    console.error("Error connecting to Redis:", error);
    throw error;
  }
};

export { redisClient };
