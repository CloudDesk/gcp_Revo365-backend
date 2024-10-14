import Fastify from 'fastify'
import Revo365Routes from './routes/routes.js';
import Multer from 'fastify-multer';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { checkDatabaseConnection } from './database/postgres.js';
import cors from '@fastify/cors'
import { PORT } from './config/config.js';
import  formbody  from '@fastify/formbody';
import fastifyCookie from 'fastify-cookie';

const fastify: any = Fastify();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const parentDir = resolve(__dirname, '..');

fastify.register(formbody);
fastify.register(fastifyCookie)

// console.log(__filename, 'fileName')
// console.log(parentDir, 'Dir Name')
// console.log(join(parentDir, "/src/uploads"), 'join  Name')



// fastify.decorateRequest('isServerReady', 'isReady');
// fastify.decorateReply('isNot', 'isNOt');
// fastify.decorateRequest('yeah', 'yeah Value')
// fastify.register(dbconnector)

// declare module 'fastify' {
//     interface FastifyInstance {
//         isServerReady: boolean;
//     }
// }
// declare module 'fastify' {
//     interface FastifyInstance {
//         isNot: boolean;
//     }
// }
// fastify.register(decorartorA)
// fastify.register(decorartorB)
// fastify.decorate('utility', function (data: any) {
//     return data
// })
// fastify.decorate('almost', function (data: any) {
//     return data
// })

// fastify.decorate('util', (request, key, value) => {
//     return  request[key] = value
//     })


// fastify.addHook('onRequest', function (request, reply, done) {
//     console.log('on Request');
//     let data = this.datatypecheck(request, 'timestamp', new Date())
//     let data2 = this.util(request, 'utildata', 'Utility function array')
//     let data3 = this.decoratorB(request, 'testdatass', 'Utility function array')
//     // console.log(data);
//     done()
// })



fastify.register(Multer.contentParser)
fastify.register(Revo365Routes, { fastifyInstance: fastify })

console.log(join(parentDir, "/uploads"),'INDEX PATH');
console.log(parentDir,'INDEX PATH 2');
fastify.register(fastifyStatic, {
    root: join(parentDir, "/uploads"),
});

fastify.register(cors)

// fastify.addHook('onRequest', async (request, reply) => {
//     request.sessionTimings = {
//       rid: Date.now(),
//       cfsession:0,
//       queryStartTime: 0,
//       queryEndTime: 0,
//       datatypecheckStartTime: 0,
//       datatypecheckEndTime: 0,
//       closeTime: 0
//     };
//     console.log('ON REQUEST ROUTE IS');
//   });
  
//   fastify.addHook('onResponse', (request, reply, done) => {

//     request.sessionTimings.closeTime = Date.now();  // Request End Time
//     const totalProcessingTime = request.sessionTimings.closeTime - request.sessionTimings.rid;
//     console.log(`Route: ${request.routerPath} - Processing time: ${totalProcessingTime}ms`);
//     console.log('ON RESPONSE ROUTE IS');
//     done();
//   });

fastify.addHook('onReady', async () => {
    try {
        let data = await checkDatabaseConnection();
        console.log(data, 'inside');
        // done()
        // console.log(fastify.isServerReady, 'Loging value is');
    } catch (error) {
        console.error("Failed to connect to the database:", error);
        return error
    }
});


fastify.listen({ port: PORT ,host: '0.0.0.0'}, (err, address) => {
    try {
        if (err) {
            console.error(err)
        }
        if (address) {
            console.log("Successfully Connected", address);
        }
        else {
            console.log('Server Not Connectd ');
        }
    } catch (error) {
        return error
    }
})

// export { fastify };
