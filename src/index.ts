import Fastify from 'fastify'
import Revo365Routes from './routes/routes.js';
import Multer from 'fastify-multer';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { checkDatabaseConnection } from './database/postgres.js';
import cors from '@fastify/cors'
import { PORT } from './config/config.js';
import formbody from '@fastify/formbody';
import fastifyCookie from 'fastify-cookie';
import { connectGetSessionredis } from './database/redis.session.js';

const fastify: any = Fastify();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const parentDir = resolve(__dirname, '..');

fastify.register(formbody);
fastify.register(fastifyCookie)
fastify.register(Multer.contentParser)
fastify.register(Revo365Routes, { fastifyInstance: fastify })

console.log(join(parentDir, "/uploads"), 'INDEX PATH');
console.log(parentDir, 'INDEX PATH 2');
fastify.register(fastifyStatic, {
    root: join(parentDir, "/uploads"),
});

fastify.register(cors)


fastify.addHook('onReady', async () => {
    try {
        let data = await checkDatabaseConnection();
        console.log(data, 'inside');
        await connectGetSessionredis();
        // done()
        // console.log(fastify.isServerReady, 'Loging value is');
    } catch (error) {
        console.error("Failed to connect to the database:", error);
        return error
    }
});


fastify.listen({port: PORT,host: '0.0.0.0' }, (err, address) => {
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
