import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { query } from "../database/postgres.js";

export module getTables {
    export const getTable = async (request: any) => {

        try {
            let querystring =
                "SELECT table_name  as table FROM information_schema.tables WHERE table_schema='public'";
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
                permissions: "Permissions",
                kubb_tickets: "KUBB Enquires",
                buyback_enquiries: "Buyback Enquiries",
                service_enquiries: "Service Enquiries"
            };
            result.rows.unshift({ table: 'home' })
            result = result.rows
                .map((element) => {
                    const label = labels[element.table];
                    return label ? { ...element, label } : null;
                })
                .filter((element: string) => element !== null);
            return result;
        } catch (error) {
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };

    export const getUserTable = async (request: any) => {
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
                })
            });
            return allowedTables;
        } catch (error) {
            console.error("Error in getUserTable:", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
}
