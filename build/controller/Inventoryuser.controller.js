import { userInventoryService } from "../services/Inventoryuser.service.js";
export var InventoryuserController;
(function (InventoryuserController) {
    InventoryuserController.getInventoryUsersData = async (request, reply) => {
        try {
            let getUsersDataResult = await userInventoryService.getInventoryUsersData(request, reply);
            reply.send(getUsersDataResult);
        }
        catch (error) {
            reply.send(error.message);
        }
    };
    InventoryuserController.userlogout = async (request, reply) => {
        try {
            const userData = request.body;
            let upsertUserResult = await userInventoryService.userlogout(request, reply);
            reply.status(200).send('Logged Out Successfully');
        }
        catch (error) {
            reply.send(error.message);
        }
    };
    InventoryuserController.forgotuser = async (request, reply) => {
        try {
            let forgotuserData = await userInventoryService.forgotuser(request, reply);
            if (forgotuserData.status === 'success') {
                reply.send(forgotuserData);
            }
            else {
                reply.status(404).send({ error: forgotuserData.message });
            }
        }
        catch (error) {
            reply.send(error.message);
        }
    };
    InventoryuserController.getInventoryUsersDataTickets = async (request, reply) => {
        try {
            let getUsersDataResult = await userInventoryService.getInventoryUsersDataTickets(request);
            reply.send(getUsersDataResult);
        }
        catch (error) {
            reply.send(error.message);
        }
    };
    InventoryuserController.getLoggedInInventoryUsersData = async (request, reply) => {
        try {
            let getUsersDataResult = await userInventoryService.getLoggedInInventoryUsersData(request, reply);
            if (getUsersDataResult && getUsersDataResult.userdata && !Array.isArray(getUsersDataResult.userdata)) {
                reply.status(401).send({ error: getUsersDataResult });
            }
            else {
                console.log("INISIDE ELSE OF USERS ");
                reply.send(getUsersDataResult);
            }
        }
        catch (error) {
            reply.send(error.message);
        }
    };
    InventoryuserController.deleteInventoryUserData = async (request, reply) => {
        try {
            const { id } = request.params;
            let deleteUserResult = await userInventoryService.deleteInventoryUser(Number(id));
            reply.send(deleteUserResult);
        }
        catch (error) {
            reply.send(error.message);
        }
    };
    InventoryuserController.upsertInventoryUser = async (request, reply) => {
        try {
            const userData = request.body;
            console.log(userData);
            let upsertUserResult = await userInventoryService.upsertInventoryUser(userData);
            if (upsertUserResult.command === "UPDATE" || upsertUserResult.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertUserResult.command === "UPDATE"
                        ? `Inventory Users Updated successfully`
                        : `Inventory Users Data Inserted successfully`,
                    data: upsertUserResult.rows
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(500).send({ error: upsertUserResult });
            }
        }
        catch (error) {
            reply.send(error.message);
        }
    };
})(InventoryuserController || (InventoryuserController = {}));
//# sourceMappingURL=Inventoryuser.controller.js.map