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
  console.log("Initializing CloudTasksClient...");
  console.log("GOOGLE_APPLICATION_CREDENTIALS:", process.env.GOOGLE_APPLICATION_CREDENTIALS || "Not set (using default credentials)");
  client = new CloudTasksClient({
    // Add explicit timeout and retry settings
    fallback: false,
  });
  console.log("CloudTasksClient initialized successfully");
} catch (error) {
  console.error("Error initializing CloudTasksClient:", error);
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export async function createHttpTask(merchantid: any) {
  try {
    console.log(merchantid, "INSIDE TASK");
    
    // Validate configuration
    if (!project || !location || !queue || !url) {
      const error = "Missing GCP configuration. Please check GCP_PROJECT_ID, GCP_PROJECT_LOCATION, GCP_PROJECT_QUEUE, and GCP_TASK_URL";
      console.error(error);
      return { success: false, error };
    }
    
    console.log("GCP Config:", { project, location, queue, url });
    
    const payloadString: any = JSON.stringify({ merchantid: merchantid });
    console.log(payloadString, "payloadString");
    const parent = client.queuePath(project, location, queue);
    console.log(parent, "parent");
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
    console.log(task, "task");
    if (inSeconds) {
      task.scheduleTime = {
        seconds: parseInt(inSeconds) + Date.now() / 1000,
      };
    }
    const request = { parent: parent, task: task };
    console.log(request, "request");
    console.log("About to call client.createTask...");
    try {
      console.log("Calling client.createTask with request:", JSON.stringify(request, null, 2));
      
      // Add timeout wrapper to prevent hanging
      const TIMEOUT_MS = 30000; // 30 seconds timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`createTask timeout after ${TIMEOUT_MS}ms - the API call may be hanging due to authentication or network issues`));
        }, TIMEOUT_MS);
      });
      
      console.log("Starting createTask call with timeout of", TIMEOUT_MS, "ms...");
      const createTaskPromise = client.createTask(request);
      
      // Race between createTask and timeout
      const result = await Promise.race([createTaskPromise, timeoutPromise]);
      const [response] = result as any;
      
      console.log("Task created successfully! Response:", response);
      console.log("Task name:", response?.name);
      return { success: true, response };
    } catch (error: any) {
      console.error("Error in createHttpTask - createTask call failed:", error);
      console.error("Error message:", error?.message);
      console.error("Error code:", error?.code);
      console.error("Error details:", error?.details);
      console.error("Full error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
      return { success: false, error: error?.message || String(error) };
    }

   
  } catch (error) {
    console.error("Error in createHttpTask1:", error);
    return { success: false, error };
  }
}
