import { query } from "../database/postgres.js";
// import { saveSession } from "../database/redis.session.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { sendMail } from "../Gmail/gmail.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { hashGenerate, hashValidator } from "../utils/hashing/hashing.js";
import { v4 as uuidv4 } from "uuid";
import { saveSession } from "./session.service.js";
import { getOtp, saveOtp } from "./otp.service.js";
let generatedotp;
export var userInventoryService;
(function (userInventoryService) {
    userInventoryService.getInventoryUsersData = async (request, reply) => {
        try {
            const pageNumber = parseInt(request.query.page) || 1;
            const recordCount = parseInt(request.query.count) || 5000;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClauses = [];
            let parameterIndex = 1;
            const queryParams = [];
            let orderByField = "modifieddate";
            let orderByDirection = "DESC";
            keys.forEach((key, index) => {
                const paramValues = Array.isArray(values[index]) ? values[index] : [values[index]];
                if (key === "name") {
                    values[index] = values[index].charAt(0).toUpperCase() + values[index].slice(1);
                }
                else if (key === "sortby") {
                    const [fieldName, direction] = paramValues[0].split("-");
                    orderByField = fieldName;
                    orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
                }
                else if (paramValues[0].startsWith("NOT ")) {
                    const cleanValue = paramValues[0].slice(4);
                    whereClauses.push(`(${key} != $${parameterIndex})`);
                    queryParams.push(cleanValue);
                    parameterIndex++;
                }
                else if (key !== "page" && key !== "count") {
                    const clauses = paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`);
                    whereClauses.push(`(${clauses.join(" OR ")})`);
                    queryParams.push(...paramValues);
                    parameterIndex += paramValues.length;
                }
            });
            const offset = (pageNumber - 1) * recordCount;
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ``;
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            let queryText = `SELECT * FROM Inventoryusers ${whereClause} ${orderByClause}`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            let datatypeCheckResult = await dataTypeCheck(result);
            return datatypeCheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN Get Inventory User", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    userInventoryService.userlogout = async (request, reply) => {
        try {
            // Make a DELETE request to the Cloudflare Worker to delete the session
            // Clear the sessionId cookie from the client
            let sessionId = request.cookies.sessionId;
            reply.send({ status: "Session deleted" });
        }
        catch (error) {
            console.error("Query Execution Error: IN deleteUser", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    userInventoryService.getInventoryUsersDataTickets = async (request) => {
        try {
            console.log("get Inventory User Tickets function call");
            const role = request.query.role || "Service";
            const location = request.query.location || "head_office";
            let queryText = `
            SELECT u.*, COUNT(t.id) AS ticketcount
            FROM inventoryusers AS u 
            LEFT JOIN tickets AS t ON u.id = t.assignedid AND (t.ticketstatus <> 'resolved_closed' AND t.ticketstatus <> 'unresolved_closed')
            WHERE u.role = $1 
            AND u.location = $2
            GROUP BY u.id
        `;
            const queryParams = [role, location];
            if (request.query.page && request.query.count) {
                const pageNumber = parseInt(request.query.page) || 1;
                const recordCount = parseInt(request.query.count) || 5000;
                const offset = (pageNumber - 1) * recordCount;
                queryText += ` OFFSET $2 LIMIT $3`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            let datatypeCheckResult = await dataTypeCheck(result);
            return datatypeCheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getInventoryUsersDataTickets", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    userInventoryService.getLoggedInInventoryUsersData = async (request, reply) => {
        try {
            const queryString = `SELECT * FROM Inventoryusers where useremail = '${request.params.useremail}'`;
            const result = await query(queryString, []);
            if (result && result.rows.length > 0) {
                let validatepassword = await hashValidator(request.params.userpassword, result.rows[0].userpassword);
                if (validatepassword) {
                    const sessionId = uuidv4();
                    const sessionData = {
                        useremail: request.params.useremail,
                        userpassword: request.params.userpassword,
                    };
                    let sessionsaved = await saveSession(sessionId, sessionData);
                    if (sessionsaved) {
                        return { sessionId, userdata: result.rows };
                    }
                    else {
                        return "Please Contact Admin.You are Not Authorized to Login";
                    }
                }
                else {
                    return "user Credentials are wrong please try again";
                }
            }
            else {
                return "No Users Found With this Email Id.Please Give Correct Email or contact Admin";
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN getLoggedIn Inventory UsersData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    userInventoryService.deleteInventoryUser = async (id) => {
        try {
            const result = await query(`DELETE FROM Inventoryusers WHERE id = $1`, [id]);
            if (result.rowCount != 0) {
                return `${result.rowCount} User deleted successfully`;
            }
            else {
                return `User not found with id ${id}`;
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN delete Inventory User", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    userInventoryService.upsertInventoryUser = async (userData) => {
        try {
            if (!userData.id) {
                const checkEmailQuery = `
          SELECT id, 'users' as table_name FROM users WHERE useremail = $1
          UNION ALL
          SELECT id, 'inventoryusers' as table_name FROM inventoryusers WHERE useremail = $1
        `;
                const emailCheckResult = await query(checkEmailQuery, [userData.useremail]);
                if (emailCheckResult.rows.length > 0) {
                    return "Email already exists in users or inventoryusers table";
                }
                const hashedPassword = await hashGenerate(userData.userpassword);
                const insertData = {
                    firstname: userData.firstname,
                    lastname: userData.lastname,
                    location: userData.location,
                    role: userData.role,
                    useremail: userData.useremail,
                    userpassword: hashedPassword,
                    usersphonenumber: userData.usersphonenumber
                };
                const insertFields = Object.keys(insertData);
                const insertValues = Object.values(insertData);
                const insertQuery = `
          INSERT INTO inventoryusers (${insertFields.join(", ")}) 
          VALUES (${insertFields.map((_, index) => `$${index + 1}`).join(", ")}) 
          RETURNING *
        `;
                const result = await query(insertQuery, insertValues);
                return {
                    command: "INSERT",
                    rows: result.rows
                };
            }
            const { id, ...updateFields } = userData;
            const checkUserQuery = `
  SELECT * FROM inventoryusers WHERE id = $1
`;
            const userExists = await query(checkUserQuery, [id]);
            if (userExists.rows.length === 0) {
                return "User not found";
            }
            const updateData = {};
            // Handle all fields from updateFields
            for (const [key, value] of Object.entries(updateFields)) {
                // Skip empty or undefined values
                if (value !== undefined && value !== '') {
                    if (key === 'userpassword') {
                        updateData[key] = await hashGenerate(value);
                    }
                    else {
                        updateData[key] = value;
                    }
                }
            }
            if (Object.keys(updateData).length === 0) {
                return "No fields to update";
            }
            const updateQueryFields = Object.keys(updateData);
            const updateValues = Object.values(updateData);
            const updateQuery = `
  UPDATE inventoryusers 
  SET ${updateQueryFields.map((field, index) => `${field} = $${index + 1}`).join(", ")} 
  WHERE id = $${updateQueryFields.length + 1} 
  RETURNING *
`;
            const result = await query(updateQuery, [...updateValues, id]);
            return {
                command: "UPDATE",
                rows: result.rows
            };
        }
        catch (error) {
            console.error("Query Execution Error in upsertInventoryUser:", error);
            const errorMessage = await ErrorHandler.handleQueryError(error);
            return errorMessage;
        }
    };
    userInventoryService.forgotuser = async (request, reply) => {
        try {
            request.query.useremail = request.body.useremail;
            if (!request.body.otp) {
                generatedotp = Math.floor(1000 + Math.random() * 9000);
                request.body.subject = "OTP Verification Code";
                request.body.text =
                    "Your otp code to Reset Password For Revo Site is " + generatedotp;
                request.body.to = request.body.useremail;
                let otpsave = await saveOtp(request.query.useremail, generatedotp);
                console.log(otpsave);
                let finduser = await userInventoryService.getInventoryUsersData(request, reply);
                if (finduser && finduser.length > 0) {
                    let emailresult = await sendMail(request, generatedotp);
                    return { status: "success", message: "OTP sent Successfuly" };
                }
                else {
                    return {
                        status: "failure",
                        message: "Entered User Email Is wrong.please Enter correct Email to Reset Password",
                    };
                }
            }
            else if (request.body.otp) {
                let finduser = await userInventoryService.getInventoryUsersData(request, reply);
                console.log('DAAAN', generatedotp, '==', Number(request.body.otp));
                let optmatch = await getOtp(request.query.useremail, request.body.otp);
                if (optmatch) {
                    return {
                        status: "success",
                        message: "Entered otp is correct",
                        data: finduser,
                    };
                }
                else {
                    return {
                        status: "failure",
                        message: "Invalid or expired OTP. Please regenerate or enter the correct OTP.",
                    };
                }
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN getproductsData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
})(userInventoryService || (userInventoryService = {}));
//# sourceMappingURL=Inventoryuser.service.js.map