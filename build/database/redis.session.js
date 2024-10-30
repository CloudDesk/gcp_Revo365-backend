import { createClient } from "redis";
import { SESSIONEXSEC } from "../config/config.js";
let redisClient = null;
export const connectGetSessionredis = async () => {
    try {
        console.log("Inside redis connect");
        redisClient = createClient({
            url: process.env.CACHESTORE_CONNECTION_STRING,
            password: "fVZWPfs4xi9SvpdY2d1HZgiqJCPNuZWh",
            socket: {
                host: "redis-10690.c330.asia-south1-1.gce.redns.redis-cloud.com",
                port: 10690,
            },
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
    }
    catch (error) {
        console.log("Inside redis error");
        console.error("Error connecting to Redis:", error);
        throw error;
    }
};
// export const saveSession = async (sessionId, sessionData): Promise<string> => {
//   try {
//     console.log("Inside saveSessionredis");
//     console.log("Generated Session ID:", sessionId);
//     // console.log('Session Data:', sessionData);
//     const createdTime = Math.floor(Date.now() / 1000);
//     const sessionDataWithCreatedTime = {
//       ...sessionData,
//       createddate: createdTime,
//     };
//     let sessionDataString;
//     if (typeof sessionData === "string") {
//       sessionDataString = sessionData;
//     } else {
//       sessionDataString = JSON.stringify(sessionData);
//     }
//     const sizeofsessionDataWithCreatedTime = Buffer.byteLength(
//       sessionDataString,
//       "utf8"
//     );
//     console.log("Data size:", sizeofsessionDataWithCreatedTime, "bytes");
//     // console.log('Updated Session Data:', sessionDataWithCreatedTime);
//     // await redisClient.set(sessionId, JSON.stringify(sessionDataWithCreatedTime));
//     // await redisClient.expire(sessionId, 3600);
//     let redissaved = await redisClient.setEx(
//       sessionId,
//       SESSIONEXSEC,
//       JSON.stringify(sessionDataWithCreatedTime)
//     );
//     console.log("Saved data:", redissaved);
//     return sessionId;
//   } catch (error) {
//     console.log("Inside saveSessionredis error", error.message);
//     return error.message;
//   }
// };
export const saveSession = async (sessionId, sessionData) => {
    try {
        console.log("Inside saveSessionredis");
        console.log("Generated Session ID:", sessionId);
        // Make sure SESSIONEXSEC is a valid integer
        const SESSIONEXSEC = 3600; // 1 hour in seconds - adjust as needed
        const createdTime = Math.floor(Date.now() / 1000);
        let sessionDataWithCreatedTime;
        if (typeof sessionData === "string") {
            try {
                sessionDataWithCreatedTime = {
                    ...JSON.parse(sessionData),
                    createddate: createdTime,
                };
            }
            catch {
                sessionDataWithCreatedTime = {
                    data: sessionData,
                    createddate: createdTime,
                };
            }
        }
        else {
            sessionDataWithCreatedTime = {
                ...sessionData,
                createddate: createdTime,
            };
        }
        const sessionDataString = JSON.stringify(sessionDataWithCreatedTime);
        const sizeofsessionDataWithCreatedTime = Buffer.byteLength(sessionDataString, "utf8");
        console.log("Data size:", sizeofsessionDataWithCreatedTime, "bytes");
        if (!Number.isInteger(SESSIONEXSEC) || SESSIONEXSEC <= 0) {
            throw new Error("Invalid expiration time");
        }
        const redissaved = await redisClient.setEx(sessionId, SESSIONEXSEC, sessionDataString);
        console.log("Saved data:", redissaved);
        return sessionId;
    }
    catch (error) {
        console.log("Inside saveSessionredis error", error.message);
        return error.message;
    }
};
export const getSession = async (req, reply) => {
    try {
        // console.log("Inside Get Session");
        const sessionId = req.headers.authorization;
        if (!sessionId) {
            console.log("No session ID provided in the authorization header");
            return reply
                .status(401)
                .send({ error: "Unauthorized: No valid session" });
        }
        const sessionData = await redisClient.getEx(sessionId, { EX: 3600 });
        if (sessionData) {
            const sessionDataSize = Buffer.byteLength(sessionData, "utf8");
            // console.log('Data size:', sessionDataSize, 'bytes');
            console.log("Valid session found");
            await redisClient.setEx(sessionId, SESSIONEXSEC, sessionData);
            return JSON.parse(sessionData);
        }
        else {
            console.log("Session not found or expired");
            return reply
                .status(401)
                .send({ error: "Unauthorized: No valid session" });
        }
    }
    catch (error) {
        console.error("Error validating session:", error);
        return reply.status(401).send({ error: "Unauthorized: No valid session" });
    }
};
//# sourceMappingURL=redis.session.js.map