import { query } from "../database/postgres.js";
// import { saveSession } from "../database/redis.session.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { sendMail } from "../Gmail/gmail.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { hashGenerate, hashValidator } from "../utils/hashing/hashing.js";
import { v4 as uuidv4 } from "uuid";
import { saveSession } from "./session.service.js";

let generatedotp;
export module userInventoryService {
  export const getInventoryUsersData = async (request: any, reply: any) => {
    try {
      console.log("get Inventory User function call");
      const pageNumber = parseInt(request.query.page) || 1;
      const recordCount = parseInt(request.query.count) || 5000;
      const keys = Object.keys(request.query);
      const values: string[] = Object.values(request.query);

      let whereClauses: string[] = [];
      let parameterIndex = 1;
      const queryParams: any[] = [];
      let orderByField = "modifieddate";
      let orderByDirection = "DESC";

      keys.forEach((key, index) => {
        const paramValues: any = Array.isArray(values[index])
          ? values[index]
          : [values[index]];
        if (key === "name") {
          console.log(values[index], "Before Capitalize");
          values[index] =
            values[index].charAt(0).toUpperCase() + values[index].slice(1);
          console.log(values[index], "After Capitalize");
        } else if (key === "sortby") {
          const [fieldName, direction] = paramValues[0].split("-");
          orderByField = fieldName;
          orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
        } else if (paramValues[0].startsWith("NOT ")) {
          const cleanValue = paramValues[0].slice(4);
          whereClauses.push(`(${key} != $${parameterIndex})`);
          queryParams.push(cleanValue);
          parameterIndex++;
        } else if (key !== "page" && key !== "count") {
          const clauses = paramValues.map(
            (_, idx) => `${key} = $${parameterIndex + idx}`
          );
          whereClauses.push(`(${clauses.join(" OR ")})`);
          queryParams.push(...paramValues);
          parameterIndex += paramValues.length;
        }
      });
      const offset = (pageNumber - 1) * recordCount;
      const whereClause =
        whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ``;
      const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;

      let queryText = `SELECT * FROM Inventoryusers ${whereClause} ${orderByClause}`;

      if (pageNumber && recordCount) {
        queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
        queryParams.push(offset, recordCount);
      }

      console.log("Query Text:", queryText);
      console.log("Query Params:", queryParams);

      const result = await query(queryText, queryParams);
      let datatypeCheckResult = await dataTypeCheck(result);
      console.log(datatypeCheckResult, "datatypeCheckResult");
      return datatypeCheckResult;
    } catch (error) {
      console.error("Query Execution Error: IN Get Inventory User", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      console.log(ErrorMessage);
      return ErrorMessage;
    }
  };

  export const userlogout = async (request, reply) => {
    try {
      // Make a DELETE request to the Cloudflare Worker to delete the session

      // Clear the sessionId cookie from the client
      let sessionId = request.cookies.sessionId;
      console.log(request.cookies.sessionId, "Request Cookies Before Logout");
      reply.clearCookie("sessionId", {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Strict",
      });
      console.log(request.cookies.sessionId, "Request Cookies After Logout");

      reply.send({ status: "Session deleted" });
    } catch (error) {
      console.error("Query Execution Error: IN deleteUser", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      console.log(ErrorMessage);
      return ErrorMessage;
    }
  };

  export const getInventoryUsersDataTickets = async (request: any) => {
    try {
      console.log("get Inventory User Tickets function call");
      const role = request.query.role || "Service";
      const location = request.query.location || "head_office";

      // let queryText = `
      //     SELECT u.*,
      //            COUNT(t.id) AS ticketcount
      //     FROM inventoryusers AS u
      //     LEFT Join tickets AS t ON u.id = t.assignedid
      //     WHERE t.ticketstatus <> 'closed' AND u.role = $1
      //     GROUP BY u.id
      // `;

      // let queryText = `
      //     SELECT u.*, COUNT(t.id) AS ticketcount
      //     FROM inventoryusers AS u
      //     LEFT JOIN tickets AS t ON u.id = t.assignedid
      //     WHERE u.role = $1 AND (t.ticketstatus <> 'resolved_closed' AND t.ticketstatus <> 'unresolved_closed')
      //     AND u.location = $2
      //     GROUP BY u.id
      // `;

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

      console.log("Query Text:", queryText);
      console.log("Query Params:", queryParams);

      const result = await query(queryText, queryParams);
      let datatypeCheckResult = await dataTypeCheck(result);
      console.log(datatypeCheckResult, "datatypeCheckResult");
      return datatypeCheckResult;
    } catch (error) {
      console.error(
        "Query Execution Error: IN getInventoryUsersDataTickets",
        error
      );
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      console.log(ErrorMessage);
      return ErrorMessage;
    }
  };

  export const getLoggedInInventoryUsersData = async (request, reply) => {
    try {
      const queryString = `SELECT * FROM Inventoryusers where useremail = '${request.params.useremail}'`;
      console.log(queryString);
      const result = await query(queryString, []);
      console.log(result.rows);
      console.log(request.params.userpassword);
      if (result && result.rows.length > 0) {
        let validatepassword = await hashValidator(
          request.params.userpassword,
          result.rows[0].userpassword
        );
        if (validatepassword) {
          const sessionId = uuidv4();
          const sessionData = {
            useremail: request.params.useremail,
            userpassword: request.params.userpassword,
          };
          let sessionsaved = await saveSession(sessionId, sessionData);
          //   console.log(">>>>", sessionsaved, ">>>>");
          console.log(sessionsaved, "session saved is ");
          if (sessionsaved) {
            // reply.setCookie('sessionId', sessionId, {
            //     path: '/',
            //     maxAge: 60 * 60 * 24
            // });
            console.log(sessionId, "Session Id is ");
            console.log(result.rows, "Result Rows are ");
            return { sessionId, userdata: result.rows };
          } else {
            return "Please Contact Admin.You are Not Authorized to Login";
          }
        } else {
          return "user Credentials are wrong please try again";
        }
      } else {
        return "No Users Found With this Email Id.Please Give Correct Email or contact Admin";
      }
    } catch (error) {
      console.error(
        "Query Execution Error: IN getLoggedIn Inventory UsersData",
        error
      );
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      console.log(ErrorMessage);
      return ErrorMessage;
    }
  };

  export const deleteInventoryUser = async (id: number) => {
    try {
      const result: any = await query(
        `DELETE FROM Inventoryusers WHERE id = $1`,
        [id]
      );
      if (result.rowCount != 0) {
        return `${result.rowCount} User deleted successfully`;
      } else {
        return `User not found with id ${id}`;
      }
    } catch (error) {
      console.error("Query Execution Error: IN delete Inventory User", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      console.log(ErrorMessage);
      return ErrorMessage;
    }
  };

  // export const upsertInventoryUser = async (userData: any) => {
  //   try {
  //     // Implement logic to insert or update user data
  //     let querydata: string;
  //     let params: any[];
  //     const { id, ...upsertFields } = userData;
  //     if (id) {
  //       if (upsertFields.useremail) {
  //         console.log(upsertFields.useremail);
  //         querydata = `select * from Inventoryusers where useremail = '${upsertFields.useremail}'`;
  //         console.log(querydata);
  //         const result = await query(querydata, []);
  //         console.log(result.rows);
  //         let iddaata = result.rows[0].id;
  //         if (iddaata) {
  //           if (upsertFields.userpassword) {
  //             let hashingResult = await hashGenerate(upsertFields.userpassword);
  //             console.log(hashingResult, "Hashing Result when Updating User ");
  //             if (hashingResult) {
  //               upsertFields.userpassword = hashingResult;
  //             }
  //           }
  //           console.log(upsertFields, "upsertFields when Updating user");
  //           let updatedfieldNames = Object.keys(upsertFields);
  //           let updatedfieldValues = Object.values(upsertFields);
  //           console.log(updatedfieldNames);
  //           querydata = `UPDATE Inventoryusers SET ${updatedfieldNames
  //             .map((field, index) => `${field} = $${index + 1}`)
  //             .join(", ")} WHERE id = $${
  //             updatedfieldNames.length + 1
  //           } RETURNING *`;
  //           params = [...updatedfieldValues, iddaata];
  //           const result = await query(querydata, params);
  //           return result;
  //         } else {
  //           return "Entered Email is Wrong.Please Enter Correct Email";
  //         }
  //       }
  //     } else {
  //       console.log(upsertFields);

  //       if (upsertFields.useremail) {
  //         console.log(upsertFields.useremail);
  //         querydata = `select * from Inventoryusers where useremail = '${upsertFields.useremail}'`;
  //         console.log(querydata);
  //         const result = await query(querydata, []);
  //         console.log(result.rows);
  //         if (result.rows.length > 0) {
  //           return "Users already Exist";
  //         } else {
  //           let hashingResult = await hashGenerate(upsertFields.userpassword);
  //           console.log(hashingResult, "Hashing Result is ");
  //           if (hashingResult) {
  //             upsertFields.userpassword = hashingResult;
  //           }
  //           console.log(upsertFields, "upsertFields");
  //           let updatedfieldNames = Object.keys(upsertFields);
  //           let updatedfieldValues = Object.values(upsertFields);
  //           console.log(updatedfieldNames);
  //           querydata = `INSERT INTO Inventoryusers (${updatedfieldNames.join(
  //             ", "
  //           )}) VALUES (${updatedfieldNames
  //             .map((_, index) => `$${index + 1}`)
  //             .join(", ")}) RETURNING *`;
  //           params = updatedfieldValues;
  //           const result = await query(querydata, params);
  //           return result;
  //         }
  //       }
  //     }
  //   } catch (error) {
  //     console.error("Query Execution Error: IN upsert Inventory User", error);
  //     let ErrorMessage = await ErrorHandler.handleQueryError(error);
  //     console.log(ErrorMessage);
  //     return ErrorMessage;
  //   }
  // };

  export const upsertInventoryUser = async (userData: any) => {
    try {
      console.log('Received userData:', userData);
  
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
        console.log("Insert Data:",insertData);

  
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
console.log("New;;", updateFields);

const checkUserQuery = `
  SELECT * FROM inventoryusers WHERE id = $1
`;
const userExists = await query(checkUserQuery, [id]);
console.log("Checking:", userExists.rows);

if (userExists.rows.length === 0) {
  return "User not found";
}

const updateData: any = {};

// Handle all fields from updateFields
for (const [key, value] of Object.entries(updateFields)) {
  // Skip empty or undefined values
  if (value !== undefined && value !== '') {
    if (key === 'userpassword') {
      updateData[key] = await hashGenerate(value);
    } else {
      updateData[key] = value;
    }
  }
}

console.log('Console:', updateData, 'Console:');
if (Object.keys(updateData).length === 0) {
  return "No fields to update";
}

const updateQueryFields = Object.keys(updateData);
const updateValues = Object.values(updateData);
console.log('updateQueryFields:', updateQueryFields);
console.log('updateValues:', updateValues);

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
  
    } catch (error) {
      console.error("Query Execution Error in upsertInventoryUser:", error);
      const errorMessage = await ErrorHandler.handleQueryError(error);
      return errorMessage;
    }
  };
  
  export const forgotuser = async (request: any, reply: any) => {
    try {
      request.query.useremail = request.body.useremail;
      if (!request.body.otp) {
        generatedotp = Math.floor(1000 + Math.random() * 9000);
        request.body.subject = "OTP Verification Code";
        request.body.text =
          "Your otp code to Reset Password For Revo Site is " + generatedotp;
        request.body.to = request.body.useremail;
        let finduser = await getInventoryUsersData(request, reply);
        if (finduser && finduser.length > 0) {
          let emailresult = await sendMail(request, generatedotp);
          console.log(emailresult);
          return { status: "success", message: "OTP sent Successfuly" };
        } else {
          return {
            status: "failure",
            message:
              "Entered User Email Is wrong.please Enter correct Email to Reset Password",
          };
        }
      } else if (request.body.otp) {
        console.log("else if  value of generatedotp is " + generatedotp);
        let finduser = await getInventoryUsersData(request, reply);
        console.log(finduser, "FInd User is ");
        if (request.body.otp == generatedotp) {
          return {
            status: "success",
            message: "Entered otp is correct",
            data: finduser,
          };
        } else {
          return { status: "failure", message: "please enter correct OTP" };
        }
      }
    } catch (error) {
      console.error("Query Execution Error: IN getproductsData", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      console.log(ErrorMessage);
      return ErrorMessage;
    }
  };
}
