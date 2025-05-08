import { userService } from "../services/user.service.js";
export var userController;
(function (userController) {
    userController.getUsersData = async (request, reply) => {
        try {
            let getUsersDataResult = await userService.getUsersData(request);
            reply.send(getUsersDataResult);
        }
        catch (error) {
            console.error("Error in getUsersData", error);
            reply.send(error.message);
        }
    };
    userController.forgotuser = async (request, reply) => {
        try {
            let forgotuserData = await userService.forgotuser(request);
            if (forgotuserData.status === 'success') {
                reply.send(forgotuserData);
            }
            else {
                reply.status(404).send(forgotuserData.Message);
            }
        }
        catch (error) {
            console.error("Error in forgotuser", error);
            reply.send(error.message);
        }
    };
    userController.getLoggedInUsersData = async (request, reply) => {
        try {
            let getUsersDataResult = await userService.getLoggedInUsersData(request, reply);
            if (getUsersDataResult && getUsersDataResult.userdata && !Array.isArray(getUsersDataResult.userdata)) {
                reply.status(401).send({ error: getUsersDataResult });
            }
            else {
                reply.send(getUsersDataResult);
            }
        }
        catch (error) {
            console.error("Error in getLoggedInUsersData", error);
            reply.send(error.message);
        }
    };
    userController.deleteUserData = async (request, reply) => {
        try {
            const { id } = request.params;
            let deleteUserResult = await userService.deleteUser(Number(id));
            reply.send(deleteUserResult);
        }
        catch (error) {
            console.error("Error in deleteUserData", error);
            reply.send(error.message);
        }
    };
    userController.upsertUser = async (request, reply) => {
        try {
            const userData = request.body;
            let upsertUserResult = await userService.upsertUser(userData);
            if (upsertUserResult.command == 'UPDATE') {
                reply.status(200).send('User Updated successfully');
            }
            else if (upsertUserResult.command == 'INSERT') {
                reply.status(200).send({ message: 'User signup done successfully', data: upsertUserResult.rows });
            }
            else {
                reply.status(401).send(upsertUserResult.message);
            }
        }
        catch (error) {
            console.error("Error in upsertUser", error);
            reply.send(error.message);
        }
    };
    userController.userlogout = async (request, reply) => {
        try {
            const userData = request.body;
            console.log(request.cookies.sessionId);
            let upsertUserResult = await userService.userlogout(request, reply);
            reply.status(200).send('Logged Out Successfully');
        }
        catch (error) {
            console.error("Error in userlogout", error);
            reply.send(error.message);
        }
    };
    userController.upsertFcmidUser = async (request, reply) => {
        try {
            const userData = request.body;
            let upsertUserResult = await userService.upsertFcmidUser(userData);
            if (upsertUserResult?.command === "UPDATE" || upsertUserResult?.command === "INSERT") {
                let message = {};
                message = {
                    user: upsertUserResult?.command === "UPDATE"
                        ? ` User Updated successfully`
                        : ` User signup done successfully`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(500).send(upsertUserResult);
            }
        }
        catch (error) {
            console.error("Error in upsertFcmidUser", error);
            reply.send(error.message);
        }
    };
})(userController || (userController = {}));
//# sourceMappingURL=user.controller.js.map