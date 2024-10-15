
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { GCP_PRJECT_QUEUE, GCP_PROJECT_ID,GCP_PROJECT_LOCATION,GCP_TASK_URL} from '../config/config.js';
let project = GCP_PROJECT_ID
let queue = GCP_PRJECT_QUEUE
let location = GCP_PROJECT_LOCATION
let url = GCP_TASK_URL
let inSeconds: any = 120
import { CloudTasksClient } from '@google-cloud/tasks';
let client;
try {
    client = new CloudTasksClient();
    console.log('CloudTasksClient initialized successfully');
} catch (error) {
    console.error('Error initializing CloudTasksClient:', error);
    process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const parentDir = resolve(__dirname, '/revo-436904-8c40dfd46abd.json');
// console.log(__dirname, "Parent Dir TAKS __dirname");
// console.log(join(__dirname, "/revo-436904-8c40dfd46abd.json"), 'join  Name');
// console.log(parentDir, "Parent Dir TAKS");
process.env.GOOGLE_APPLICATION_CREDENTIALS = join(__dirname, "/revo-436904-09a3ddafb0ac.json")

// console.log(join(__dirname, "/revo-436904-09a3ddafb0ac.json") ,'VA:LUE IS ');
export async function createHttpTask(merchantid: any) {
    try {
        console.log(merchantid, 'INSIDE TASK');
        console.log('Task parameters:', { project, queue, location, url });
        // const payloadString = JSON.stringify({ message: "Hello, world" });
        const payloadString: any = JSON.stringify({ merchantid: merchantid })
        const parent = client.queuePath(project, location, queue);
        console.log('Queue path created:', parent);
        const task: any = {
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
    } catch (error) {
        console.error('Error in createHttpTask:', error);
        throw error;
    }
}
