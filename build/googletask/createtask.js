import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
let project = 'docblitz-437213';
let queue = 'revoorderphonepe';
let location = 'us-central1';
// let url = 'https://us-central1-revo-436904.cloudfunctions.net/revoorder'
// let url = 'https://asia-south1-revo-436904.cloudfunctions.net/revo-cloud-function'
let url = 'https://us-central1-docblitz-437213.cloudfunctions.net/revo-gcp-phonepe';
let inSeconds = 120;
import { CloudTasksClient } from '@google-cloud/tasks';
let client;
try {
    client = new CloudTasksClient();
    console.log('CloudTasksClient initialized successfully');
}
catch (error) {
    console.error('Error initializing CloudTasksClient:', error);
    process.exit(1);
}
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const parentDir = resolve(__dirname, '/docblitz-437213-d99f2718bd72.json');
// console.log(__dirname, "Parent Dir TAKS __dirname");
// console.log(join(__dirname, "/revo-436904-8c40dfd46abd.json"), 'join  Name');
// console.log(parentDir, "Parent Dir TAKS");
// process.env.GOOGLE_APPLICATION_CREDENTIALS = join(__dirname, "/revo-436904-09a3ddafb0ac.json")
process.env.GOOGLE_APPLICATION_CREDENTIALS = join(__dirname, "/docblitz-437213-d99f2718bd72.json");
// console.log(join(__dirname, "/revo-436904-09a3ddafb0ac.json") ,'VA:LUE IS ');
export async function createHttpTask(merchantid) {
    try {
        console.log(merchantid, 'INSIDE TASK');
        console.log('Task parameters:', { project, queue, location, url });
        // const payloadString = JSON.stringify({ message: "Hello, world" });
        const payloadString = JSON.stringify({ merchantid: merchantid });
        const parent = client.queuePath(project, location, queue);
        console.log('Queue path created:', parent);
        const task = {
            httpRequest: {
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payloadString),
                },
                // headers: {
                //     'Content-Type': 'text/plain',
                // },
                httpMethod: 'POST',
                url,
                body: Buffer.from(payloadString).toString('base64'),
            },
        };
        if (inSeconds) {
            task.scheduleTime = {
                seconds: parseInt(inSeconds) + Date.now() / 1000,
            };
        }
        console.log('Sending task:', JSON.stringify(task, null, 2));
        const request = { parent: parent, task: task };
        const [response] = await client.createTask(request);
        console.log(`Created task ${response.name}`);
    }
    catch (error) {
        console.error('Error in createHttpTask:', error);
        throw error;
    }
}
//# sourceMappingURL=createtask.js.map