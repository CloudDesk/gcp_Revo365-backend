import Fastify, { FastifyRequest } from "fastify";
import Revo365Routes from "./routes/routes.js";
import Multer from "fastify-multer";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { checkDatabaseConnection } from "./database/postgres.js";
import cors from "@fastify/cors";
import { PORT } from "./config/config.js";
import formbody from "@fastify/formbody";

import fs from "fs";
// import { stringify } from 'csv-stringify';

import { connectGetSessionredis } from "./database/redis.session.js";

interface CustomRequest extends FastifyRequest {
  startTime?: [number, number]; // Optional startTime property
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const parentDir = resolve(__dirname, "..");

// Configuration
const logFilePath = "./request_logs.csv";

// Create a write stream for logging in append mode
const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

// Create Fastify instance
const fastify: any = Fastify({ logger: true });

// Log CSV header if file is empty
fs.stat(logFilePath, (err, stats) => {
  if (err || stats.size === 0) {
    logStream.write("timestamp,method,url,statusCode,duration\n");
  }
});

fastify.register(cors);

// Log each request to CSV
fastify.addHook("onRequest", (request: CustomRequest, reply, done) => {
  request.startTime = process.hrtime(); // Start timer
  done();
});

// Log each response to CSV
// fastify.addHook('onResponse', (request: CustomRequest, reply, done) => {
//     const endTime = process.hrtime(request.startTime);
//     const duration = endTime[0] * 1000 + endTime[1] / 1000000; // Convert to milliseconds
//     const getLocalTime = () => {
//         return new Date().toLocaleString('en-IN', {
//             timeZone: 'Asia/Kolkata', // Specify the time zone for Kolkata
//             hour12: false,
//             year: 'numeric',
//             month: '2-digit',
//             day: '2-digit',
//             hour: '2-digit',
//             minute: '2-digit',
//             second: '2-digit',
//         }).replace(',', ''); // Remove the comma from the formatted string
//     };

//     const logEntry = [
//         getLocalTime(), // Timestamp
//         request.method,           // HTTP Method
//         request.url,              // Request URL
//         reply.statusCode,         // Response Status Code
//         duration.toFixed(2),      // Duration in milliseconds
//     ];

//     stringify([logEntry], { header: false }, (err, output) => {
//         if (err) {
//             fastify.log.error(`Failed to stringify log entry: ${err}`);
//         } else {
//             logStream.write(output); // Write to log file
//         }
//     });

//     done();
// });

fastify.register(formbody);
// fastify.register(fastifyCookie)
fastify.register(Multer.contentParser);
fastify.register(Revo365Routes, { fastifyInstance: fastify });

console.log(join(parentDir, "/uploads"), "INDEX PATH");
console.log(parentDir, "INDEX PATH 2");
fastify.register(fastifyStatic, {
  root: join(parentDir, "/uploads"),
});


fastify.addHook("onReady", async () => {
  try {
    let data = await checkDatabaseConnection();
    console.log(data, "inside");
    await connectGetSessionredis();
    // done()
    // console.log(fastify.isServerReady, 'Loging value is');
  } catch (error) {
    console.error("Failed to connect to the database:", error);
    return error;
  }
});

fastify.listen({ port: PORT}, (err, address) => {
  try {
    if (err) {
      console.error(err);
    }
    if (address) {
      console.log("Successfully Connected", address);
    } else {
      console.log("Server Not Connectd ");
    }
  } catch (error) {
    return error;
  }
});

// export { fastify };
