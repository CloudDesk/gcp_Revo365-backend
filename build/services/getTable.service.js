import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { query } from "../database/postgres.js";
import { accessScopeService } from "./accessScope.service.js";
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
                poinvoice: "Supplier Bill",
                purchaserequest: "Purchase Request",
                transaction: "Transaction",
                quotes: "Quotes",
                permissions: "Permissions",
                kubb_tickets: "KUBB Enquires",
                buyback_enquiries: "Buyback Enquiries",
                service_enquiries: "Service Enquiries",
                rental_agreement: "Rental Agreements"
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
            const sessionRole = String(request.session?.role || "").toLowerCase();
            const requestedRole = request.params.role;
            const effectiveRole = sessionRole && sessionRole !== "admin"
                ? request.session.role
                : requestedRole;
            let getPermissions = await query("select * from permissions where role = $1", [effectiveRole]);
            getPermissions.rows.forEach(element => {
                const permissionset = accessScopeService.applyRoleScopes(element.role, element.permissionset);
                permissionset.forEach((e) => {
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
            console.error("Error in getUserTable:", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(getTables || (getTables = {}));
//# sourceMappingURL=getTable.service.js.map