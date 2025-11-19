import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";

export module blogService {
    export const upsertBlogs = async (Data: any[]) => {
        try {
            console.log("Blog Data Received for Upsert:", Data);
          
            let results = [];
            for(const blogs of Data) {
              let querydata, params;
              const { id, ...upsertFields } = blogs;
              const fieldNames = Object.keys(upsertFields);
              const fieldValues = Object.values(upsertFields);
      
              if (id) {
                querydata = `UPDATE blogs SET ${fieldNames
                  .map((field, index) => `${field} = $${index + 1}`)
                  .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
              } else {
                querydata = `INSERT INTO blogs (${fieldNames.join(
                  ", "
                )}) VALUES (${fieldNames
                  .map((_, index) => `$${index + 1}`)
                  .join(", ")}) RETURNING *`;
                params = fieldValues;
              }
      
              const result = await query(querydata, params);
              results.push(result);
            }
      
            const allCommands = results.map(r => r.command);
            const uniqueCommands = [...new Set(allCommands)];
      
            if (uniqueCommands.length === 1) {
              return {
                command: uniqueCommands[0],
                rowCount: results.reduce((acc, r) => acc + r.rowCount, 0),
                rows: results.flatMap(r => r.rows),
                ...results[0]
              };
            } else {
              return results;
            }
    
        } catch (error) {
          console.error("Query Execution Error: IN upsertBlog", error);
          let ErrorMessage = await ErrorHandler.handleQueryError(error)
          return ErrorMessage
        }
      }
      export const getAllBlogs = async () =>{
        try {
            const querydata = `SELECT * FROM blogs`;
            const result =  await query(querydata,[]);
            console.log("Get All Banner Result:", result);
            return result.rows;
            
        } catch (error) {
            
        }
      }  

      export const deleteBlog = async (id: number) => {
        try {
            console.log("Deleting blog with ID:", id);
          const result: any = await query(`DELETE FROM blogs WHERE id = $1`, [id]);
          if (result.rowCount != 0) {
            return `Data Deleted Successfully`;
          } else {
            return `Blog not found with id ${id}`;
          }
        } catch (error) {
          console.error("Query Execution Error: IN deleteBlog", error);
          let ErrorMessage = await ErrorHandler.handleQueryError(error)
          return ErrorMessage
        }
      };
}