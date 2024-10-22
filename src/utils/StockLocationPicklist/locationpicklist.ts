import { query } from "../../database/postgres.js";

export const getStockLocationData = async () => {
    try {
      const queryText = "SELECT value FROM picklist WHERE fieldname = 'location' AND object = 'product_revo';";
      const result = await query(queryText, []);  
      const stockLocationData = result?.rows?.map(row => row.value);  
      return stockLocationData;

    } catch (err) {
      console.error('Error fetching stock location data:', err);
      throw err;
    }
  };