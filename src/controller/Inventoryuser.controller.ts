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
            let upsertUserResult = await userInventoryService.userlogout(request, reply);
            reply.status(200).send('Logged Out Successfully')
        } catch (error) {
            reply.send(error.message);
        }
    }
    export const forgotuser = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let forgotuserData: any = await userInventoryService.forgotuser(request, reply);
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
            if (getUsersDataResult && getUsersDataResult.userdata && !Array.isArray(getUsersDataResult.userdata)) {
                reply.status(401).send({ error: getUsersDataResult })
            }
            else {
                console.log("INISIDE ELSE OF USERS ")
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
            let upsertUserResult : any = await userInventoryService.upsertInventoryUser(userData);
            if (upsertUserResult.command === "UPDATE" || upsertUserResult.command === "INSERT") {
                let message: any = {};
                message = {
                    message: upsertUserResult.command === "UPDATE"
                        ? `Inventory Users Updated successfully`
                        : `Inventory Users Data Inserted successfully`,
                        data:upsertUserResult.rows
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
