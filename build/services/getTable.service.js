import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { query } from "../database/postgres.js";
export var getTables;
(function (getTables) {
    getTables.getTable = async (request) => {
        try {
            let querystring = "SELECT table_name  as table FROM information_schema.tables WHERE table_schema='public'";
            let result = await query(querystring, []);
            const labels = {
                home: "Home",
                stock_revo: "Stock",
                servicecostestimation: "Cost Estimation",
                purchaseorder: "Purchase Order",
                notes: "Notes",
                revoinvoice: "Revo Invoice",
                inventoryusers: "Inventory Users",
                supplier: "Supplier",
                product_revo: "Products",
                tickets: "Service Requests",
                orders: "Orders",
                poinvoice: "Supplier Invoice",
                purchaserequest: "Purchase Request",
                transaction: "Transaction",
                quotes: "Quotes",
                permissions: "Permissions"
            };
            result.rows.unshift({ table: 'home' });
            result = result.rows
                .map((element) => {
                const label = labels[element.table];
                return label ? { ...element, label } : null;
            })
                .filter((element) => element !== null);
            return result;
        }
        catch (error) {
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    getTables.getUserTable = async (request) => {
        try {
            let allowedTables = [];
            let notALlowedTables = [];
            let getPermissions = await query("select * from permissions where role = $1", [request.params.role]);
            getPermissions.rows.forEach(element => {
                element.permissionset.forEach((e) => {
                    if (e.permissions.read) {
                        allowedTables.push(e);
                    }
                    else {
                        notALlowedTables.push(e);
                    }
                });
            });
            return allowedTables;
        }
        catch (error) {
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(getTables || (getTables = {}));
//# sourceMappingURL=getTable.service.js.map