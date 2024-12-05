import { REDIS_SESSIONEXSEC } from '../config/config.js';
import { redisClient } from '../database/redis.session.js';
export const saveSession = async (sessionId, sessionData) => {
    console.log('Inside saveSessionredis');
    console.log('Generated Session ID:', sessionId);
    console.log('Session Data:', sessionData);
    const createdTime = Math.floor(Date.now() / 1000);
    const sessionDataWithCreatedTime = {
        ...sessionData,
        createddate: createdTime
    };
    console.log('Updated Session Data:', sessionDataWithCreatedTime);
    console.log('Start');
    let sessionDataString;
    if (typeof sessionData === 'string') {
        sessionDataString = sessionData;
    }
    else {
        sessionDataString = JSON.stringify(sessionData);
    }
    const sizeofsessionDataWithCreatedTime = Buffer.byteLength(sessionDataString, 'utf8');
    console.log('Data size:', sizeofsessionDataWithCreatedTime, 'bytes');
    let redissaved = await redisClient.setEx(sessionId, REDIS_SESSIONEXSEC, JSON.stringify(sessionDataWithCreatedTime));
    console.log('Saved data:', redissaved);
    return sessionId;
};
export const getSession = async (req, reply) => {
    try {
        console.log('Inside GetSession');
        console.log(req.headers, 'headers are ');
        console.log(req.headers.authorization, "getSession headers");
        const sessionId = req.headers.authorization;
        if (!sessionId) {
            console.log('No session ID provided in the authorization header');
            return reply.status(401).send({ error: 'Unauthorized: No valid session' });
        }
        const sessionData = await redisClient.get(sessionId);
        console.log('SESSION DATA1:', sessionData);
        if (sessionData) {
            const sessionDataSize = Buffer.byteLength(sessionData, 'utf8');
            console.log('Data size:', sessionDataSize, 'bytes');
            await redisClient.setEx(sessionId, REDIS_SESSIONEXSEC, sessionData);
            return JSON.parse(sessionData);
        }
        else {
            console.log('Session not found or expired');
            return reply.status(401).send({ error: 'Unauthorized: No valid session' });
        }
    }
    catch (error) {
        console.error('Error validating session:', error);
        return reply.status(401).send({ error: 'Unauthorized: No valid session' });
    }
};
// export const getSession = async (req: any, reply: any): Promise<any> => {
//   try {
//     console.log('Inside GetSession')
//     console.log(req.headers.authorization, "getSession headers");
//     const sessionId = req.headers.authorization;
//     console.log('>>>',sessionId)
//     if (!sessionId) {
//       console.log('No session ID provided in the authorization header');
//       return reply.status(401).send({ error: 'Unauthorized: No valid session' });
//     }
//     const sessionData = await redisClient.getEx(sessionId, { 'EX': SESSIONEXSEC });
//     if (sessionData) {
//       redisClient.setEx(sessionId, SESSIONEXSEC, JSON.stringify(sessionData));
//       return JSON.parse(sessionData);
//     } else {
//       console.log('Session not found or expired');
//       return reply.status(401).send({ error: 'Unauthorized: No valid session' });
//     }
//   } catch (error) {
//     console.error('Error validating session:', error);
//     return reply.status(401).send({ error: 'Unauthorized: No valid session' });
//   }
// };
export const getSessionData = async (req) => {
    const { sessionId } = req.query;
    console.log(sessionId, "sessionIdsessionId");
    if (!sessionId) {
        throw new Error('No session ID found');
    }
    try {
        const sessionData = await redisClient.get(sessionId);
        return {
            sessionId,
            userdata: sessionData ? [JSON.parse(sessionData)] : [] // Wrap in an array or return an empty array if null
        };
    }
    catch (error) {
        console.error('Error in getSessionData:', error);
        throw new Error('Failed to retrieve session data');
    }
};
//# sourceMappingURL=session.service.js.map