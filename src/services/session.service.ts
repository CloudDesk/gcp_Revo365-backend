import { REDIS_SESSIONEXSEC } from '../config/config.js';
import { redisClient } from '../database/redis.session.js';
import { query } from '../database/postgres.js';

export const saveSession = async (sessionId, sessionData): Promise<string> => {
  const createdTime = Math.floor(Date.now() / 1000);
  const organizationId = Number(
    sessionData?.organizationid ?? sessionData?.organizationId
  );

  const sessionDataWithCreatedTime = {
    ...sessionData,
    ...(Number.isSafeInteger(organizationId) && organizationId > 0
      ? { organizationid: organizationId }
      : {}),
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
      const sessionId = req.headers.authorization;
      
      if (!sessionId) {
        return reply.status(401).send({ error: 'Unauthorized: No valid session' });
      }
  
      const sessionData = await redisClient.get(sessionId);
  
      if (sessionData) {
        // Attach to req so controllers can access the logged-in user's data.
        // Upgrade legacy sessions from the user's persisted tenant assignment;
        // this is a lookup, never a hard-coded organization fallback.
        req.session = JSON.parse(sessionData);
        if (!req.session?.organizationid && !req.session?.organizationId) {
          const table = req.session?.role ? 'inventoryusers' : 'users';
          try {
            const persisted = await query(
              `SELECT organizationid FROM ${table} WHERE id = $1 LIMIT 1`,
              [req.session?.id]
            );
            const organizationId = Number(persisted.rows[0]?.organizationid);
            if (Number.isSafeInteger(organizationId) && organizationId > 0) {
              req.session.organizationid = organizationId;
            }
          } catch (error: any) {
            // Organization columns are introduced by the pending tenant-context
            // migration. Until it is approved, a legacy single-tenant database
            // may derive its sole existing finance organization. Never choose an
            // organization when the data contains more than one candidate.
            if (error?.code !== '42703') throw error;
            const organizations = await query(
              `SELECT organizationid
               FROM finance_accounts
               WHERE organizationid IS NOT NULL
               GROUP BY organizationid
               ORDER BY organizationid
               LIMIT 2`
            );
            if (organizations.rows.length === 1) {
              const organizationId = Number(organizations.rows[0].organizationid);
              if (Number.isSafeInteger(organizationId) && organizationId > 0) {
                req.session.organizationid = organizationId;
              }
            }
          }
          if (!req.session?.organizationid && !req.session?.organizationId) {
            console.warn('[finance-context] Session has no organization ID.', {
              actor: req.session?.useremail || req.session?.id || 'unknown',
              role: req.session?.role || 'unknown',
              path: req.url,
            });
          }
        }
        await redisClient.setEx(sessionId, REDIS_SESSIONEXSEC, JSON.stringify(req.session));
        return;
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
