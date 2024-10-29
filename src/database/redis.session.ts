import { createClient, RedisClientType } from 'redis';
import { randomBytes } from 'crypto';
import { SESSIONEXSEC } from '../config/config.js';

let redisClient: RedisClientType | null = null;
export const connectGetSessionredis = async () => {
  try {
    console.log('Inside redis connect');

    redisClient = createClient({
      url: process.env.CACHESTORE_CONNECTION_STRING,
      password: 'fVZWPfs4xi9SvpdY2d1HZgiqJCPNuZWh',

      socket: {
        host: 'redis-10690.c330.asia-south1-1.gce.redns.redis-cloud.com',
        port: 10690
      }
    });
    // redis-10690.c330.asia-south1-1.gce.redns.redis-cloud.com:10690 ,fVZWPfs4xi9SvpdY2d1HZgiqJCPNuZWh -  cdmac
    // redis-11887.c330.asia-south1-1.gce.redns.redis-cloud.com:11887 ,Cs3OAZSzFSOnGpkbqmYdu6f9xLyx2PPn- suresh

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

export const saveSession = async (sessionId, sessionData): Promise<string> => {
  console.log('Inside saveSessionredis')
  console.log('Generated Session ID:', sessionId);
  // console.log('Session Data:', sessionData);
  const createdTime = Math.floor(Date.now() / 1000);

  const sessionDataWithCreatedTime = {
    ...sessionData,
    createddate: createdTime
  };
  let sessionDataString;
  if (typeof sessionData === 'string') {
    sessionDataString = sessionData;
  } else {
    sessionDataString = JSON.stringify(sessionData);
  }
  const sizeofsessionDataWithCreatedTime = Buffer.byteLength(sessionDataString, 'utf8');
  console.log('Data size:', sizeofsessionDataWithCreatedTime, 'bytes');
  // console.log('Updated Session Data:', sessionDataWithCreatedTime);

  // await redisClient.set(sessionId, JSON.stringify(sessionDataWithCreatedTime));
  // await redisClient.expire(sessionId, 3600);
  let redissaved = await redisClient.setEx(sessionId, SESSIONEXSEC, JSON.stringify(sessionDataWithCreatedTime));
  console.log('Saved data:',redissaved);

  return sessionId;
};

export const getSession = async (req: any, reply: any): Promise<boolean> => {
  try {
    // console.log("Inside Get Session");
    const sessionId = req.headers.authorization;
    if (!sessionId) {
      console.log('No session ID provided in the authorization header');
      return reply.status(401).send({ error: 'Unauthorized: No valid session' });
    }

    const sessionData = await redisClient.getEx(sessionId, { 'EX': 3600 });

    if (sessionData) {
      const sessionDataSize = Buffer.byteLength(sessionData, 'utf8');
      // console.log('Data size:', sessionDataSize, 'bytes');
      console.log('Valid session found');
      await redisClient.setEx(sessionId, SESSIONEXSEC, sessionData);
      return JSON.parse(sessionData);
    } else {
      console.log('Session not found or expired');
      return reply.status(401).send({ error: 'Unauthorized: No valid session' });
    }
  } catch (error) {
    console.error('Error validating session:', error);
    return reply.status(401).send({ error: 'Unauthorized: No valid session' });
  }
};
