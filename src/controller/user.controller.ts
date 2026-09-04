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
            console.error("Error in getUsersData", error);
            reply.send(error.message);
        }
    }
    export const getCustomersData = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let getCustomerDataResult = await userService.getCustomersData(request.body);
            console.log(getCustomerDataResult)
            reply.send(getCustomerDataResult);
        } catch (error) {

        }
    }
    export const forgotuser = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let forgotuserData: any = await userService.forgotuser(request);
            if (forgotuserData.status === 'success') {
                reply.send(forgotuserData);

            }
            else {
                reply.status(404).send(forgotuserData.Message)
            }
        } catch (error) {
            console.error("Error in forgotuser", error);
            reply.send(error.message);
        }
    }
    export const getLoggedInUsersData = async (request: FastifyRequest, reply: FastifyReply) => {

        try {
            let getUsersDataResult: any = await userService.getLoggedInUsersData(request, reply);
            if (getUsersDataResult && getUsersDataResult.userdata && !Array.isArray(getUsersDataResult.userdata)) {
                reply.status(401).send({ error: getUsersDataResult })
            }
            else {
                reply.send(getUsersDataResult);
            }
        } catch (error) {
            console.error("Error in getLoggedInUsersData", error);
            reply.send(error.message);
        }
    }

    export const getGoogleLoggedInUserData = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let getUsersDataResult: any = await userService.getGoogleLoggedInUserData(request);
            if (getUsersDataResult && getUsersDataResult.userdata && !Array.isArray(getUsersDataResult.userdata)) {
                reply.status(401).send({ error: getUsersDataResult })
            }
            else if (getUsersDataResult?.sessionId && Array.isArray(getUsersDataResult?.userdata)) {
                reply.send(getUsersDataResult);
            }
            else {
                reply.status(401).send(getUsersDataResult);
            }
        } catch (error) {
            console.error("Error in getGoogleLoggedInUserData", error);
            reply.send(error.message);
        }
    }

    export const deleteUserData = async (request: FastifyRequest<{ Params: idparams }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            let deleteUserResult = await userService.deleteUser(Number(id));
            reply.send(deleteUserResult);
        } catch (error) {
            console.error("Error in deleteUserData", error);
            reply.send(error.message);
        }
    }

    export const upsertUser = async (request: any, reply: any) => {
        try {
            // console.log("Request Body in upsertUser:", request.body);
            const userData = request.body;
            const debugUserData = { ...userData };
            if (debugUserData.userpassword) {
                debugUserData.userpassword = "***";
            }
            console.log("[DEBUG][POST /users] request payload:", debugUserData);
            let upsertUserResult: any = await userService.upsertUser(userData);
            console.log("[DEBUG][POST /users] service response command:", upsertUserResult?.command);
            if (upsertUserResult.command == 'UPDATE') {
                reply.status(200).send('User Updated successfully');
            } else if (upsertUserResult.command == 'INSERT') {
                reply.status(200).send({ message: 'User signup done successfully', data: upsertUserResult.rows });
            } else if (upsertUserResult.errorMessage === 'Duplicate Key Exist') {
                reply.status(404).send(upsertUserResult.errorDetails[0].message)
            }
            else {

                reply.status(401).send(upsertUserResult.message)
            }
        } catch (error) {
            console.error("Error in upsertUser", error);
            reply.send(error.message);
        }
    }

    export const userlogout = async (request: any, reply: any) => {
        try {
            const userData = request.body;
            console.log(request.cookies.sessionId
            );
            let upsertUserResult = await userService.userlogout(request, reply);
            reply.status(200).send('Logged Out Successfully')
        } catch (error) {
            console.error("Error in userlogout", error);
            reply.send(error.message);
        }
    }


    export const upsertFcmidUser = async (request: any, reply: any) => {
        try {
            const userData = request.body;
            let upsertUserResult = await userService.upsertFcmidUser(userData);
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
            console.error("Error in upsertFcmidUser", error);
            reply.send(error.message);
        }
    }
}
