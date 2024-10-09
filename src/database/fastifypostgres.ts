import fastifyPlugin from "fastify-plugin"
import fastifyPostgres from "@fastify/postgres";
import { POSTGRES_HOST, POSTGRES_PASSWORD, POSTGRES_PORT, POSTGRES_USER, POSTGRES__DATABASE } from "../config/config.js";
const dbconnector = async function (fastify: any, opts: any) {
    try {
        await fastify.register((fastifyPostgres), {
            connectionString: `postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES__DATABASE}`
        })
        console.log('Fastify PostgreSQL connected successfully ');

    } catch (error) {
        console.error('Error connecting to PostgreSQL:', error);
        setTimeout(() => dbconnector(fastify, opts), 5000); // Retry connection after 5 seconds
    }
}


export default fastifyPlugin(dbconnector)
