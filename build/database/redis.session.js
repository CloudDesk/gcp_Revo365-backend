import { createClient } from 'redis';
import dotenv from 'dotenv';
// Load environment variables
dotenv.config();
let redisClient = null;
export const connectGetSessionredis = async () => {
    try {
        console.log('Inside redis connect');
        redisClient = createClient({
            url: `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
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
    }
    catch (error) {
        console.log('Inside redis error');
        console.error("Error connecting to Redis:", error);
        throw error;
    }
};
export { redisClient };
//# sourceMappingURL=redis.session.js.map