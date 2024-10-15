// import { saveSession } from "../cloudflare/cloudflare.session.js";
import { query } from "../database/postgres.js";
import { saveSession } from "../database/redis.session.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { sendMail } from "../Gmail/gmail.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { hashGenerate, hashValidator } from "../utils/hashing/hashing.js";
import { v4 as uuidv4 } from 'uuid';
let generatedotp;

export module userService {
  export const getUsersData = async (request: any) => {
    try {
      console.log("get User function call");
      const pageNumber = parseInt(request.query.page) || 1;
      const recordCount = parseInt(request.query.count) || 5000;
      const keys = Object.keys(request.query);
      const values = Object.values(request.query);

      let whereClauses: string[] = [];
      let parameterIndex = 1;
      const queryParams: any[] = [];
      let orderByField = "modifieddate";
      let orderByDirection = "DESC";

      keys.forEach((key, index) => {
        const paramValues: any = Array.isArray(values[index])
          ? values[index]
          : [values[index]];
        if (key === "displaysize" || key === "price") {
          const rangeClauses = paramValues.map((range) => {
            const [lowerBound, upperBound] = range.split("-");
            queryParams.push(lowerBound, upperBound);
            const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1
              })`;
            console.log(clause, "clause 2");

            parameterIndex += 2;
            console.log(clause, "clause");
            return clause;
          });
          whereClauses.push(`(${rangeClauses.join(" OR ")})`);
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

      let queryText = `SELECT * FROM users ${whereClause} ${orderByClause}`;

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
      console.error("Query Execution Error: IN getproductsData", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      console.log(ErrorMessage);
      return ErrorMessage;
    }
  };

  export const forgotuser = async (request: any) => {
    try {
      request.query.useremail = request.body.useremail;
      if (!request.body.otp) {
        generatedotp = Math.floor(1000 + Math.random() * 9000);
        request.body.subject = "OTP Verification Code";
        request.body.text =
          "Your otp code to Reset Password For Revo Site is " + generatedotp;
        request.body.to = request.body.useremail;
        let finduser = await getUsersData(request);
        console.log(finduser, "FInd User is ");
        if (finduser && finduser.length > 0) {
          let emailresult = await sendMail(request, generatedotp);
          console.log(emailresult);
          return { status: "success", Message: "OTP sent Successfuly" };
        } else {
          return {
            status: "failure",
            Message:
              "Entered User Email Is wrong.please Enter correct Email to Reset Password",
          };
        }
      } else if (request.body.otp) {
        console.log("else if  value of generatedotp is " + generatedotp);
        let finduser = await getUsersData(request);
        console.log(finduser, "FInd User is ");
        if (request.body.otp == generatedotp) {
          return {
            status: "success",
            Message: "Entered otp is correct",
            data: finduser,
          };
        } else {
          return { status: "failure", Message: "please enter correct OTP" };
        }
      }
    } catch (error) {
      console.error("Query Execution Error: IN getproductsData", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      console.log(ErrorMessage);
      return ErrorMessage;
    }
  };
  export const getLoggedInUsersData = async (request, reply) => {
    try {
      const queryString = `SELECT * FROM users where useremail = '${request.params.useremail}'`;
      console.log(queryString);
      const result = await query(queryString, []);
      if (result.rows.length > 0) {
        let validatepassword = await hashValidator(
          request.params.userpassword,
          result.rows[0].userpassword
        );
        console.log(validatepassword);
        if (validatepassword) {
          const sessionId = uuidv4();
          const sessionData = {
            useremail: request.params.useremail,
            userpassword: request.params.userpassword
          };
          let sessionsaved = await saveSession(sessionId, sessionData)
          console.log(sessionData, "Session Data is ");
          console.log(sessionId, "Session Id is ");
          if (sessionsaved) {
            reply.setCookie('sessionId', sessionId, {
              path: '/',
              maxAge: 60 * 60 * 24
            });
            console.log(sessionId, "Session Id is ");
            console.log(result.rows, "Result Rows are ");
            return { sessionId, userdata: result.rows };
          }
          else {
            return "Please Contact Admin.You are Not Authorized to Login";
          }
        } else {
          return "user Credentials are wrong please try again";
        }
      } else {
        return "No Users Found With this Email Id.Please Sign in";
      }
    } catch (error) {
      console.error("Query Execution Error: IN getLoggedInUsersData", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      console.log(ErrorMessage);
      return ErrorMessage;
    }
  };

  export const deleteUser = async (id: number) => {
    try {
      const result: any = await query(`DELETE FROM users WHERE id = $1`, [id]);
      if (result.rowCount != 0) {
        return `${result.rowCount} User deleted successfully`;
      } else {
        return `User not found with id ${id}`;
      }
    } catch (error) {
      console.error("Query Execution Error: IN deleteUser", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      console.log(ErrorMessage);
      return ErrorMessage;
    }
  };
  export const userlogout = async (request,reply) => {
    try {
      // Make a DELETE request to the Cloudflare Worker to delete the session
  
      // Clear the sessionId cookie from the client
      let sessionId = request.cookies.sessionId
      console.log(request.cookies.sessionId, 'Request Cookies Before Logout');
      reply.clearCookie('sessionId', {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Strict'
      });
      console.log(request.cookies.sessionId, 'Request Cookies After Logout');

      reply.send({ status: 'Session deleted'});
    } catch (error) {
      console.error("Query Execution Error: IN deleteUser", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      console.log(ErrorMessage);
      return ErrorMessage;
    }
  };
  export const upsertUser = async (userData: any) => {
    try {
      let querydata: string;
      let params: any[];
      const { id, ...upsertFields } = userData;
      if (id) {
        if (upsertFields.useremail) {
          console.log(upsertFields.useremail);
          querydata = `select * from users where useremail = '${upsertFields.useremail}'`;
          console.log(querydata);
          const result = await query(querydata, []);
          console.log(result.rows);
          let iddaata = result.rows[0].id;
          if (iddaata) {
            let hashingResult = await hashGenerate(upsertFields.userpassword);
            console.log(hashingResult, "Hashing Result when Updating User ");
            if (hashingResult) {
              upsertFields.userpassword = hashingResult;
            }
            console.log(upsertFields, "upsertFields when Updating user");
            let updatedfieldNames = Object.keys(upsertFields);
            let updatedfieldValues = Object.values(upsertFields);
            console.log(updatedfieldNames);
            querydata = `UPDATE users SET ${updatedfieldNames
              .map((field, index) => `${field} = $${index + 1}`)
              .join(", ")} WHERE id = $${updatedfieldNames.length + 1
              } RETURNING *`;
            params = [...updatedfieldValues, iddaata];
            const result = await query(querydata, params);
            return result;
          } else {
            return "Entered Email is Wrong.Please Enter Correct Email";
          }
        }
      } else {
        if (upsertFields.useremail) {
          console.log(upsertFields.useremail);
          querydata = `select * from users where useremail = '${upsertFields.useremail}'`;
          console.log(querydata);
          const result = await query(querydata, []);
          console.log(result.rows);
          if (result.rows.length > 0) {
            return "Users already Exist";
          } else {
            let hashingResult = await hashGenerate(upsertFields.userpassword);
            console.log(hashingResult, "Hashing Result is ");
            if (hashingResult) {
              upsertFields.userpassword = hashingResult;
            }
            console.log(upsertFields, "upsertFields");
            let updatedfieldNames = Object.keys(upsertFields);
            let updatedfieldValues = Object.values(upsertFields);
            console.log(updatedfieldNames);
            querydata = `INSERT INTO users (${updatedfieldNames.join(
              ", "
            )}) VALUES (${updatedfieldNames
              .map((_, index) => `$${index + 1}`)
              .join(", ")}) RETURNING *`;
            params = updatedfieldValues;
            const result = await query(querydata, params);
            return result;
          }
        }
      }
    } catch (error) {
      console.error("Query Execution Error: IN upsertUser", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      console.log(ErrorMessage);
      return ErrorMessage;
    }
  };

  export const upsertFcmidUser = async (userData: any) => {
    try {
      let querydata: string;
      let params: any[];
      const { id, ...upsertFields } = userData;
      if (id) {
        console.log(upsertFields, 'Upsert Fields are')
        if (upsertFields.useremail) {
          console.log(upsertFields.useremail);
          querydata = `select * from users where useremail = '${upsertFields.useremail}'`;
          console.log(querydata);
          const result = await query(querydata, []);
          console.log(result.rows);
          let iddaata = result.rows[0].id;
          if (iddaata) {
            console.log(upsertFields, "upsertFields when Updating user");
            let updatedfieldNames = Object.keys(upsertFields);
            let updatedfieldValues = Object.values(upsertFields);
            console.log(updatedfieldNames);
            querydata = `UPDATE users SET ${updatedfieldNames
              .map((field, index) => `${field} = $${index + 1}`)
              .join(", ")} WHERE id = $${updatedfieldNames.length + 1
              } RETURNING *`;
            params = [...updatedfieldValues, iddaata];
            console.log(querydata)
            console.log(params)
            const result = await query(querydata, params);
            return result;
          } else {
            return "Entered Email is Wrong.Please Enter Correct Email";
          }
        }
      } else {
        if (upsertFields.useremail) {
          console.log(upsertFields.useremail);
          querydata = `select * from users where useremail = '${upsertFields.useremail}'`;
          console.log(querydata);
          const result = await query(querydata, []);
          console.log(result.rows);
          if (result.rows.length > 0) {
            return "Users already Exist";
          } else {
            let hashingResult = await hashGenerate(upsertFields.userpassword);
            console.log(hashingResult, "Hashing Result is ");
            if (hashingResult) {
              upsertFields.userpassword = hashingResult;
            }
            console.log(upsertFields, "upsertFields");
            let updatedfieldNames = Object.keys(upsertFields);
            let updatedfieldValues = Object.values(upsertFields);
            console.log(updatedfieldNames);
            querydata = `INSERT INTO users (${updatedfieldNames.join(
              ", "
            )}) VALUES (${updatedfieldNames
              .map((_, index) => `$${index + 1}`)
              .join(", ")}) RETURNING *`;
            params = updatedfieldValues;
            const result = await query(querydata, params);
            return result;
          }
        }
      }
    } catch (error) {
      console.error("Query Execution Error: IN upsertUser", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      console.log(ErrorMessage);
      return ErrorMessage;
    }
  };
}
