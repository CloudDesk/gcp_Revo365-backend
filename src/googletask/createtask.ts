import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import {
  GCP_PROJECT_ID,
  GCP_PROJECT_LOCATION,
  GCP_PROJECT_QUEUE,
  GCP_TASK_URL,
} from "../config/config.js";
let project = GCP_PROJECT_ID;
let queue = GCP_PROJECT_QUEUE;
let location = GCP_PROJECT_LOCATION;
let url = GCP_TASK_URL;
let inSeconds: any = 120;
import { CloudTasksClient } from "@google-cloud/tasks";
let client;
try {
  client = new CloudTasksClient();
} catch (error) {
  console.error("Error initializing CloudTasksClient:", error);
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export async function createHttpTask(merchantid: any) {
  try {
    console.log(merchantid, "INSIDE TASK");
    const payloadString: any = JSON.stringify({ merchantid: merchantid });
    const parent = client.queuePath(project, location, queue);
    const task: any = {
      httpRequest: {
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payloadString),
        },
        httpMethod: "POST",
        url,
        body: Buffer.from(payloadString).toString("base64"),
      },
    };
    if (inSeconds) {
      task.scheduleTime = {
        seconds: parseInt(inSeconds) + Date.now() / 1000,
      };
    }
    const request = { parent: parent, task: task };
    const [response] = await client.createTask(request);
  } catch (error) {
    console.error("Error in createHttpTask1:", error);
    return { success: false, error };
  }
}
