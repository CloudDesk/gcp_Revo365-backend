import { REDIS_SESSIONEXSEC } from '../config/config.js';
import { redisClient } from '../database/redis.session.js';

export const saveSession = async (sessionId, sessionData): Promise<string> => {
  console.log('Inside saveSessionredis');
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
  
  let redissaved = await redisClient.setEx(sessionId, REDIS_SESSIONEXSEC, JSON.stringify(sessionDataWithCreatedTime));
  return sessionId;
};
export const getSession = async (req: any, reply: any): Promise<any> => {
    try {
      console.log('Inside GetSession');
      const sessionId = req.headers.authorization;
      
      if (!sessionId) {
        return reply.status(401).send({ error: 'Unauthorized: No valid session' });
      }
  
      const sessionData = await redisClient.get(sessionId);
  
      if (sessionData) {
        const sessionDataSize = Buffer.byteLength(sessionData, 'utf8');
        await redisClient.setEx(sessionId, REDIS_SESSIONEXSEC, sessionData);
        return JSON.parse(sessionData);
      } else {
        return reply.status(401).send({ error: 'Unauthorized: No valid session' });
      }
    } catch (error) {
      console.error('Error in getSession:', error);
      return reply.status(401).send({ error: 'Unauthorized: No valid session' });
    }
  };


export const getSessionData = async (req: any) => {
  const { sessionId } = req.query;

  if (!sessionId) {
    throw new Error('No session ID found');
  }

  try {
    const sessionData = await redisClient.get(sessionId);

    return {
      sessionId,
      userdata: sessionData ? [JSON.parse(sessionData)] : [] 
    };

  } catch (error) {
    console.error('Error in getSessionData:', error);
    throw new Error('Failed to retrieve session data');
  }
};
