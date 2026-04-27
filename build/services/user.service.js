import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { sendTransactionalMail } from "../Gmail/gmail.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { hashGenerate, hashValidator } from "../utils/hashing/hashing.js";
import { v4 as uuidv4 } from 'uuid';
import { saveSession } from "./session.service.js";
import { REDIRECT_INVENTORY_URL } from "../config/config.js";
import { getOtp, saveOtp } from "./otp.service.js";
let generatedotp;
export var userService;
(function (userService) {
    userService.getUsersData = async (request) => {
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
                const paramValues = Array.isArray(values[index])
                    ? values[index]
                    : [values[index]];
                if (key === "displaysize" || key === "price") {
                    const rangeClauses = paramValues.map((range) => {
                        const [lowerBound, upperBound] = range.split("-");
                        queryParams.push(lowerBound, upperBound);
                        const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
                        parameterIndex += 2;
                        return clause;
                    });
                    whereClauses.push(`(${rangeClauses.join(" OR ")})`);
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
            let queryText = `SELECT * FROM users ${whereClause} ${orderByClause}`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            console.log(queryText, queryParams, "queryText and QueryParams");
            const result = await query(queryText, queryParams);
            let datatypeCheckResult = await dataTypeCheck(result);
            return datatypeCheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getUsersData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    userService.getCustomersData = async (request) => {
        try {
            console.log('Inside get customer');
            console.log(request);
            const ids = request;
            const uniqueIds = [...new Set(ids)];
            const placeholders = uniqueIds.map((_, i) => `$${i + 1}`).join(', ');
            const queryText = `SELECT * FROM users WHERE id IN (${placeholders})`;
            const users = await query(queryText, uniqueIds);
            console.log(users.rows, 'Damm');
            return users.rows;
        }
        catch (error) {
        }
    };
    userService.forgotuser = async (request) => {
        try {
            request.query.useremail = request.body.useremail;
            let data = { email: request.body.useremail };
            if (!request.body.otp) {
                generatedotp = Math.floor(1000 + Math.random() * 9000);
                let otpsave = await saveOtp(request.query.useremail, generatedotp);
                let finduser = await userService.getUsersData(request);
                if (finduser && finduser.length > 0) {
                    data.otp = generatedotp;
                    try {
                        await sendTransactionalMail({
                            to: request.body.useremail,
                            subject: 'OTP Verification Code',
                            text: `Your OTP to reset your Revo password is: ${generatedotp}. It is valid for 10 minutes.`,
                        });
                    }
                    catch (mailErr) {
                        console.error('[forgotuser] OTP email failed:', mailErr?.message || mailErr);
                    }
                    return { status: "success", Message: "OTP sent Successfuly" };
                }
                else {
                    return {
                        status: "failure",
                        Message: "Entered User Email Is wrong.please Enter correct Email to Reset Password",
                    };
                }
            }
            else if (request.body.otp) {
                let finduser = await userService.getUsersData(request);
                let optmatch = await getOtp(request.query.useremail, request.body.otp);
                if (optmatch) {
                    return {
                        status: "success",
                        Message: "Entered otp is correct",
                        data: finduser,
                    };
                }
                else {
                    return { status: "failure", Message: "Invalid or expired OTP. Please regenerate or enter the correct OTP." };
                }
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN forgotuser", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    userService.getLoggedInUsersData = async (request, reply) => {
        const useremail = request?.body?.useremail ?? request?.params?.useremail;
        const userpassword = request?.body?.userpassword ?? request?.params?.userpassword;
        console.log("getLoggedInUsersData", { useremail });
        if (!useremail || !userpassword) {
            return "User Credentials are wrong. Please try again";
        }
        try {
            const ecomQuery = `SELECT * FROM users WHERE LOWER(useremail) = LOWER($1)`;
            const ecomResult = await query(ecomQuery, [useremail]);
            if (ecomResult.rows.length > 0) {
                let validatePassword = await hashValidator(userpassword, ecomResult.rows[0].userpassword);
                if (validatePassword) {
                    const sessionId = uuidv4();
                    const sessionData = {
                        id: ecomResult.rows[0]?.id,
                        useremail
                    };
                    let sessionSaved = await saveSession(sessionId, sessionData);
                    if (sessionSaved) {
                        return { sessionId, userdata: ecomResult.rows };
                    }
                    else {
                        return "Please Contact Admin. You are Not Authorized to Login";
                    }
                }
                else {
                    return "User Credentials are wrong. Please try again";
                }
            }
            else {
                console.log("else");
                const inventoryQuery = `SELECT * FROM inventoryusers WHERE useremail = $1`;
                const inventoryResult = await query(inventoryQuery, [useremail]);
                if (inventoryResult.rows.length > 0) {
                    let validatePassword = await hashValidator(userpassword, inventoryResult.rows[0].userpassword);
                    if (validatePassword) {
                        const sessionId = uuidv4();
                        const sessionData = {
                            firstname: inventoryResult.rows[0].firstname,
                            id: inventoryResult.rows[0].id,
                            lastname: inventoryResult.rows[0].lastname,
                            location: inventoryResult.rows[0].location,
                            role: inventoryResult.rows[0].role,
                            useremail: inventoryResult.rows[0].useremail,
                            userpassword: inventoryResult.rows[0].userpassword,
                            usersphonenumber: inventoryResult.rows[0].usersphonenumber
                        };
                        let sessionSaved = await saveSession(sessionId, sessionData);
                        if (sessionSaved) {
                            return {
                                sessionId, userdata: inventoryResult.rows,
                                redirect: true,
                                inventoryAppUrl: `${REDIRECT_INVENTORY_URL}?sessionId=${sessionId}`
                            };
                        }
                        else {
                            return "Please Contact Admin. You are Not Authorized to Login";
                        }
                    }
                    else {
                        return "User Credentials are wrong. Please try again";
                    }
                }
                else {
                    return "No Users Found With this Email ID. Please Sign up";
                }
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN getLoggedInUsersData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    userService.deleteUser = async (id) => {
        try {
            const result = await query(`DELETE FROM users WHERE id = $1`, [id]);
            if (result.rowCount != 0) {
                return `${result.rowCount} User deleted successfully`;
            }
            else {
                return `User not found with id ${id}`;
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN deleteUser", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    userService.userlogout = async (request, reply) => {
        try {
            let sessionId = request.cookies.sessionId;
            reply.clearCookie('sessionId', {
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'Strict'
            });
            reply.send({ status: 'Session deleted' });
        }
        catch (error) {
            console.error("Query Execution Error: IN userlogout", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    userService.upsertUser = async (userData) => {
        try {
            if (!userData.id) {
                console.log("Inserting new user data");
                const checkEmailQuery = `
          SELECT id, 'users' as table_name FROM users WHERE useremail = $1
          UNION ALL
          SELECT id, 'inventoryusers' as table_name FROM inventoryusers WHERE useremail = $1
        `;
                const emailCheckResult = await query(checkEmailQuery, [userData.useremail]);
                if (emailCheckResult.rows.length > 0) {
                    return {
                        command: 'Fail',
                        message: "Email already exists. Please try sign in with new E-Mail"
                    };
                }
                const hashedPassword = await hashGenerate(userData.userpassword);
                const insertData = {
                    firstname: userData.firstname,
                    lastname: userData.lastname,
                    useremail: userData.useremail,
                    userpassword: hashedPassword,
                    usermobilenumber: userData.usermobilenumber,
                    isbusinessuser: userData.isbusinessuser,
                    gstnumber: userData.gstnumber,
                };
                const insertFields = Object.keys(insertData);
                const insertValues = Object.values(insertData);
                const insertQuery = `
          INSERT INTO users (${insertFields.join(", ")}) 
          VALUES (${insertFields.map((_, index) => `$${index + 1}`).join(", ")}) 
          RETURNING *
        `;
                const result = await query(insertQuery, insertValues);
                console.log("[DEBUG][POST /users] user created:", {
                    id: result.rows?.[0]?.id,
                    useremail: result.rows?.[0]?.useremail,
                });
                return {
                    command: "INSERT",
                    rows: result.rows
                };
            }
            const { id, ...updateFields } = userData;
            // console.log("Updating user data for ID:", id);
            // console.log("Updating user data for ID2:", updateFields);
            const checkUserQuery = `
        SELECT * FROM users WHERE id = $1
      `;
            const userExists = await query(checkUserQuery, [id]);
            console.log("User Exists:", userExists.rows);
            if (userExists.rows.length === 0) {
                console.log("User not found with ID:");
                return { command: 'Fail', message: "User not found" };
            }
            // Construct updateData dynamically from updateFields
            const updateData = {};
            const allowedFields = [
                'firstname',
                'lastname',
                'useremail',
                'usermobilenumber',
                'gender',
                'gstnumber',
                'isbusinessuser'
            ];
            allowedFields.forEach((field) => {
                if (updateFields[field] !== undefined) {
                    updateData[field] = updateFields[field];
                }
            });
            // Handle password separately if provided
            if (updateFields.userpassword) {
                updateData.userpassword = await hashGenerate(updateFields.userpassword);
            }
            if (Object.keys(updateData).length === 0) {
                return { command: 'Fail', message: "No fields to update" };
            }
            const updateQueryFields = Object.keys(updateData);
            const updateValues = Object.values(updateData);
            // console.log("Update Query Fields:", updateQueryFields);
            // console.log("Update Values:", updateValues);   
            const updateQuery = `
        UPDATE users 
        SET ${updateQueryFields.map((field, index) => `${field} = $${index + 1}`).join(", ")} 
        WHERE id = $${updateQueryFields.length + 1} 
        RETURNING *
      `;
            const result = await query(updateQuery, [...updateValues, id]);
            console.log("Update Result:", result.rows);
            console.log("[DEBUG][POST /users] user updated:", {
                id,
                updatedFields: updateQueryFields,
            });
            return {
                command: "UPDATE",
                rows: result.rows
            };
        }
        catch (error) {
            console.error("Query Execution Error in upsertUser:", error);
            const errorMessage = await ErrorHandler.handleQueryError(error);
            return errorMessage;
        }
    };
    userService.upsertFcmidUser = async (userData) => {
        try {
            let querydata;
            let params;
            const { id, ...upsertFields } = userData;
            if (id) {
                if (upsertFields.useremail) {
                    querydata = `select * from users where useremail = '${upsertFields.useremail}'`;
                    const result = await query(querydata, []);
                    let iddaata = result.rows[0].id;
                    if (iddaata) {
                        let updatedfieldNames = Object.keys(upsertFields);
                        let updatedfieldValues = Object.values(upsertFields);
                        querydata = `UPDATE users SET ${updatedfieldNames
                            .map((field, index) => `${field} = $${index + 1}`)
                            .join(", ")} WHERE id = $${updatedfieldNames.length + 1} RETURNING *`;
                        params = [...updatedfieldValues, iddaata];
                        const result = await query(querydata, params);
                        return result;
                    }
                    else {
                        return "Entered Email is Wrong.Please Enter Correct Email";
                    }
                }
            }
            else {
                if (upsertFields.useremail) {
                    querydata = `select * from users where useremail = '${upsertFields.useremail}'`;
                    const result = await query(querydata, []);
                    if (result.rows.length > 0) {
                        return "Users already Exist";
                    }
                    else {
                        let hashingResult = await hashGenerate(upsertFields.userpassword);
                        if (hashingResult) {
                            upsertFields.userpassword = hashingResult;
                        }
                        let updatedfieldNames = Object.keys(upsertFields);
                        let updatedfieldValues = Object.values(upsertFields);
                        querydata = `INSERT INTO users (${updatedfieldNames.join(", ")}) VALUES (${updatedfieldNames
                            .map((_, index) => `$${index + 1}`)
                            .join(", ")}) RETURNING *`;
                        params = updatedfieldValues;
                        const result = await query(querydata, params);
                        return result;
                    }
                }
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertFcmidUser", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(userService || (userService = {}));
//# sourceMappingURL=user.service.js.map