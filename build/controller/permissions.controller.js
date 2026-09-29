import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { permssionservice } from "../services/permission.service.js";
export var permissionscontroller;
(function (permissionscontroller) {
    permissionscontroller.getPermissions = async (request, reply) => {
        try {
            let getPermissionsResult = await permssionservice.getPermissions(request);
            reply.send(getPermissionsResult);
        }
        catch (error) {
            console.error('ERROR IN  Controller getPermissions', error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    permissionscontroller.upsertPermission = async (request, reply) => {
        try {
            let upsertPermissionResult = await permssionservice.upsertPermission(request.body);
            if (upsertPermissionResult.command === "UPDATE" ||
                upsertPermissionResult.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertPermissionResult.command === "UPDATE"
                        ? `Permission Updated Successfully`
                        : `Permission Created successfully`,
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(404).send(upsertPermissionResult);
            }
        }
        catch (error) {
            console.error('ERROR IN  Controller upsertPermission', error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(permissionscontroller || (permissionscontroller = {}));
//# sourceMappingURL=permissions.controller.js.map