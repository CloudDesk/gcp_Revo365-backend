import { createClient, RedisClientType } from 'redis';
import { randomBytes } from 'crypto';

let redisClient: RedisClientType | null = null;

export const connectGetSessionredis = async () => {
  try {
    console.log('Inside redis connect');

    redisClient = createClient({
      url: process.env.CACHESTORE_CONNECTION_STRING,
      password: 'MYwkDFf6aJBCL8Fb63UAbnHHZvx7m4CV',
      socket: {
        host: 'redis-11650.c253.us-central1-1.gce.redns.redis-cloud.com',
        port: 11650
      }
    });

    redisClient.on("connect", () => {
      console.log("Connected successfully to the Redis store");
    });

    redisClient.on("error", (err) => {
      console.error("Redis Client Error", err);
    });

   let data = await redisClient.connect(); 

  
  } catch (error) {
    console.log('Inside redis error');
    console.error("Error connecting to Redis:", error);
    throw error;
  }
};

export const saveSession = async (sessionId,sessionData): Promise<string> => {
  console.log('Inside saveSessionredis')
  console.log('Generated Session ID:', sessionId);
  console.log('Session Data:', sessionData);
  const createdTime = Math.floor(Date.now() / 1000);  

  const sessionDataWithCreatedTime = {
    ...sessionData,
    createddate: createdTime 
  };
  console.log('Updated Session Data:',sessionDataWithCreatedTime);

  await redisClient.set(sessionId, JSON.stringify(sessionDataWithCreatedTime));
  await redisClient.expire(sessionId, 120); 

  return sessionId; 
};

export const getSession = async (req: any, reply: any): Promise<boolean> => {
    try {
      const sessionId = req.headers.authorization;
  
      if (!sessionId) {
        console.log('No session ID provided in the authorization header');
        return reply.status(401).send({ error: 'Unauthorized: No valid session' });
      }
  
      const sessionData = await redisClient.get(sessionId);
  
      if (sessionData) {
        console.log('Valid session found');
        return true;
      } else {
        console.log('Session not found or expired');
        return reply.status(401).send({ error: 'Unauthorized: No valid session' });
      }
    } catch (error) {
      console.error('Error validating session:', error);
      return reply.status(401).send({ error: 'Unauthorized: No valid session' });
    }
  };
