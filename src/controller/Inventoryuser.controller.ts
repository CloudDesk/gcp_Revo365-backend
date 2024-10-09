import { FastifyRequest, FastifyReply } from "fastify";
import { userInventoryService } from "../services/Inventoryuser.service.js";

interface idparams {
    id: number
}

export module InventoryuserController {

    export const getInventoryUsersData = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let getUsersDataResult = await userInventoryService.getInventoryUsersData(request, reply);
            reply.send(getUsersDataResult);
        } catch (error) {
            reply.send(error.message);
        }
    }

    export const userlogout = async (request: any, reply: any) => {
        try {
            const userData = request.body;
            console.log(request.cookies.sessionId
            );
            let upsertUserResult = await userInventoryService.userlogout(request, reply);
            console.log(upsertUserResult);

            reply.status(200).send('Logged Out Successfully')
        } catch (error) {
            reply.send(error.message);
        }
    }
    export const forgotuser = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let forgotuserData: any = await userInventoryService.forgotuser(request, reply);
            console.log(forgotuserData, 'forgotuserData');
            if (forgotuserData.status === 'success') {
                reply.send(forgotuserData);

            }
            else {
                reply.status(404).send({ error: forgotuserData.message })
            }
        } catch (error) {
            reply.send(error.message);
        }
    }
    export const getInventoryUsersDataTickets = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let getUsersDataResult = await userInventoryService.getInventoryUsersDataTickets(request);
            reply.send(getUsersDataResult);
        } catch (error) {
            reply.send(error.message);
        }
    }
    export const getLoggedInInventoryUsersData = async (request: FastifyRequest, reply: FastifyReply) => {

        try {
            let getUsersDataResult: any = await userInventoryService.getLoggedInInventoryUsersData(request, reply);
            console.log(getUsersDataResult, 'getUsersDataResult');
            console.log(Array.isArray(getUsersDataResult.userdata));
            if (getUsersDataResult && getUsersDataResult.userdata && !Array.isArray(getUsersDataResult.userdata)) {
                reply.status(401).send({ error: getUsersDataResult })
            }
            else {
                reply.send(getUsersDataResult);

            }
        } catch (error) {
            reply.send(error.message);
        }
    }

    export const deleteInventoryUserData = async (request: FastifyRequest<{ Params: idparams }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            let deleteUserResult = await userInventoryService.deleteInventoryUser(Number(id));
            reply.send(deleteUserResult);
        } catch (error) {
            reply.send(error.message);
        }
    }

    export const upsertInventoryUser = async (request: any, reply: any) => {
        try {
            const userData = request.body;
            console.log(userData)
            let upsertUserResult = await userInventoryService.upsertInventoryUser(userData);
            console.log(upsertUserResult);
            if (upsertUserResult?.command === "UPDATE" || upsertUserResult?.command === "INSERT") {
                let message: any = {};
                message = {
                    message: upsertUserResult?.command === "UPDATE"
                        ? ` User signup done successfully`
                        : ` User signup done successfully`,
                    data: upsertUserResult?.rows[0]
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(500).send({ error: upsertUserResult })
            }
        } catch (error) {
            reply.send(error.message);
        }
    }
}
