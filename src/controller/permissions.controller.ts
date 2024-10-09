import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { permssionservice } from "../services/permission.service.js";

export module permissionscontroller {
    export const getPermissions = async (request: any, reply: any) => {
        try {
            let getPermissionsResult = await permssionservice.getPermissions(request);
            reply.send(getPermissionsResult);

        } catch (error) {
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage

        }
    }

    export const upsertPermission = async (request: any, reply: any) => {
        try {
            let upsertPermissionResult = await permssionservice.upsertPermission(request.body);
            if (
                upsertPermissionResult.command === "UPDATE" ||
                upsertPermissionResult.command === "INSERT"
            ) {
                let message: any = {};
                message = {
                    message:
                        upsertPermissionResult.command === "UPDATE"
                            ? `Permission Updated Successfully`
                            : `Permission Created successfully`,
                };
                reply.status(200).send(message);
            } else {
                reply.status(404).send(upsertPermissionResult);
            }

        } catch (error) {
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage

        }
    }
}