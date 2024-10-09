import { FastifyRequest, FastifyReply } from "fastify";
import { userService } from "../services/user.service.js";

interface idparams {
    id: number
}

export module userController {

    export const getUsersData = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let getUsersDataResult = await userService.getUsersData(request);
            reply.send(getUsersDataResult);
        } catch (error) {
            reply.send(error.message);
        }
    }
    export const forgotuser = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let forgotuserData: any = await userService.forgotuser(request);
            console.log(forgotuserData, 'forgotuserData');
            if (forgotuserData.status === 'success') {
                reply.send(forgotuserData);

            }
            else {
                reply.status(404).send(forgotuserData.Message)
            }
        } catch (error) {
            reply.send(error.message);
        }
    }
    export const getLoggedInUsersData = async (request: FastifyRequest, reply: FastifyReply) => {

        try {
            let getUsersDataResult:any = await userService.getLoggedInUsersData(request, reply);
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

    export const deleteUserData = async (request: FastifyRequest<{ Params: idparams }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            let deleteUserResult = await userService.deleteUser(Number(id));
            reply.send(deleteUserResult);
        } catch (error) {
            reply.send(error.message);
        }
    }

    export const upsertUser = async (request: any, reply: any) => {
        try {
            const userData = request.body;
            let upsertUserResult = await userService.upsertUser(userData);
            console.log(upsertUserResult);
            if (upsertUserResult?.command === "UPDATE" || upsertUserResult?.command === "INSERT") {
                let message: any = {};
                message = {
                    user: upsertUserResult?.command === "UPDATE"
                        ? ` User Updated successfully`
                        : ` User signup done successfully`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(500).send(upsertUserResult)
            }
        } catch (error) {
            reply.send(error.message);
        }
    }
    export const userlogout = async (request: any, reply: any) => {
        try {
            const userData = request.body;
            console.log(request.cookies.sessionId
            );
            let upsertUserResult = await userService.userlogout(request,reply);
            console.log(upsertUserResult);
           
                reply.status(200).send('Logged Out Successfully')
        } catch (error) {
            reply.send(error.message);
        }
    }


    export const upsertFcmidUser = async (request: any, reply: any) => {
        try {
            const userData = request.body;
            let upsertUserResult = await userService.upsertFcmidUser(userData);
            console.log(upsertUserResult);
            if (upsertUserResult?.command === "UPDATE" || upsertUserResult?.command === "INSERT") {
                let message: any = {};
                message = {
                    user: upsertUserResult?.command === "UPDATE"
                        ? ` User Updated successfully`
                        : ` User signup done successfully`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(500).send(upsertUserResult)
            }
        } catch (error) {
            reply.send(error.message);
        }
    }
}
