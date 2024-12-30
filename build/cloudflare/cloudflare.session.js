import axios from "axios";
// const workerUrl = 'https://lively-meadow-03e5.pravinsf24.workers.dev';
const workerUrl = 'https://crimson-rain-3768.cdmacdev.workers.dev';
export async function getSession(request, reply) {
    try {
        //let sessionId = request.cookies.sessionId
        let sessionId = request.headers.authorization;
        const response = await axios.get(`${workerUrl}/session/get?sessionId=${sessionId}`);
        let data = {};
        if (response.data.error) {
            return reply.status(401).send({ error: 'Unauthorized: No valid session' });
            //return true
        }
        else if (response.data) {
            return true;
        }
    }
    catch (error) {
        console.error('Error getting session:', error.message);
        return reply.status(401).send({ error: 'Unauthorized: No valid session' });
        // return true
    }
}
export async function saveSession(sessionId, sessionData) {
    try {
        const response = await axios.post(`${workerUrl}/session/save`, { sessionId, sessionData }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        console.log('Session saved: ', response.data);
        if (response.data) {
            return { sucess: true, data: response.data };
        }
    }
    catch (error) {
        console.log(error);
        console.error('Error saving session:', error.message);
    }
}
//# sourceMappingURL=cloudflare.session.js.map