import { query } from "../database/postgres.js";
import { QueryResult } from "pg";
import _ from "lodash";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
interface objectName {
  objectName: string;
}
export module picklistservice {
  export const getProductPicklist = async (request: any) => {
    try {
      let sortedData
      let objectName: string;
      let quoteobject = false
      if (request.params) {
        objectName = request.params.objectName;
      } else {
        objectName = request.objectName;
      }

      if(objectName === 'quotes'){
        quoteobject = true
      }
      const picklistResult: QueryResult = await query(
        `select * from picklist where object = $1`,
        [objectName]
      );
      let datatypecheckResult = await dataTypeCheck(picklistResult);
      const groupedData = {};
      for (const value of datatypecheckResult) {
        const key = value.fieldname;
        if (!groupedData[key]) {
          groupedData[key] = [];
        }
        groupedData[key].push(value);
      }

      function compareNumbers(a, b) {
        let numA = parseInt(a.label.match(/\d+/)[0]);
        let numB = parseInt(b.label.match(/\d+/)[0]);
        return numA - numB;
      }
      function compareLabelsAndNumbers(a, b) {
        const labelA = (a.label || '').toLowerCase();
        const labelB = (b.label || '').toLowerCase();
        // Regular expression to match alphabetic and numeric parts
        const regex = /([a-z]+)(\d+(\.\d+)?)?/i;
        // Extracting alphabetic and numeric parts from the labels
        const matchA = labelA.match(regex);
        const matchB = labelB.match(regex);
        // Extracted text and numeric parts
        const textA = matchA ? matchA[1] : '';
        const textB = matchB ? matchB[1] : '';
        const numA = matchA && matchA[2] ? parseFloat(matchA[2]) : NaN;
        const numB = matchB && matchB[2] ? parseFloat(matchB[2]) : NaN;
        // Compare text parts first
        if (textA < textB) return -1;
        if (textA > textB) return 1;
        // If text parts are equal, compare numeric parts
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB; // Compare numeric parts as numbers
        } else if (!isNaN(numA)) {
          return -1; // Label A has a numeric part, so it should come before Label B
        } else if (!isNaN(numB)) {
          return 1; // Label B has a numeric part, so it should come before Label A
        }
        return 0;
      }
      function compareLabelsAndNumbersDsc(a, b) {
        const labelA = (a.label || '').toLowerCase();
        const labelB = (b.label || '').toLowerCase();
        const regex = /([a-z]+)(\d+(\.\d+)?)?/i;
        const matchA = labelA.match(regex);
        const matchB = labelB.match(regex);
        const textA = matchA ? matchA[1] : '';
        const textB = matchB ? matchB[1] : '';
        const numA = matchA && matchA[2] ? parseFloat(matchA[2]) : NaN;
        const numB = matchB && matchB[2] ? parseFloat(matchB[2]) : NaN;
        if (textA > textB) return -1;
        if (textA < textB) return 1;
        if (!isNaN(numA) && !isNaN(numB)) {
          return numB - numA; 
        } else if (!isNaN(numA)) {
          return 1; 
        } else if (!isNaN(numB)) {
          return -1;
        }
        return 0;
      }
      for (const key in groupedData) {
        if (Array.isArray(groupedData[key])) {
          if (key === "ram" || key === "storagecapacity" || key === "frequency" || key === "warranty" || key === 'ageoflaptopmonth') {
            groupedData[key].sort(compareNumbers);
          }
          else if (key === "operatingsystemversion") {
            groupedData[key].sort(compareLabelsAndNumbers)
          }
          else if (key === "foldable" || key === "lightindicator") {
            groupedData[key].sort(compareLabelsAndNumbersDsc)
          }
          else if (quoteobject && key === 'status'){
          
           
          }
          else {
            groupedData[key].sort((a, b) => (a.label > b.label ? 1 : -1));
          }
        }
      }
      return groupedData;
    } catch (error) {
      console.error("Query Execution Error: IN getProductPicklist", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      return ErrorMessage
    }
  };

  export const getAllPicklist = async (request: any) => {
    try {

      const picklistResult: QueryResult = await query(
        `select * from picklist`,
        []
      );
      let datatypecheckResult = await dataTypeCheck(picklistResult);
      const groupedData = {};
      for (const value of datatypecheckResult) {
        const key = value.fieldname;
        if (!groupedData[key]) {
          groupedData[key] = [];
        }
        groupedData[key].push(value);
      }

      function compareNumbers(a, b) {
        let numA = parseInt(a.label.match(/\d+/)[0]);
        let numB = parseInt(b.label.match(/\d+/)[0]);
        return numA - numB;
      }
      function compareLabelsAndNumbers(a, b) {
        const labelA = (a.label || '').toLowerCase();
        const labelB = (b.label || '').toLowerCase();
        const regex = /([a-z]+)(\d+(\.\d+)?)?/i;
        const matchA = labelA.match(regex);
        const matchB = labelB.match(regex);
        const textA = matchA ? matchA[1] : '';
        const textB = matchB ? matchB[1] : '';
        const numA = matchA && matchA[2] ? parseFloat(matchA[2]) : NaN;
        const numB = matchB && matchB[2] ? parseFloat(matchB[2]) : NaN;
     
        if (textA < textB) return -1;
        if (textA > textB) return 1;
       
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB;
        } else if (!isNaN(numA)) {
          return -1;
        } else if (!isNaN(numB)) {
          return 1; 
        }
        return 0;
      }
      function compareLabelsAndNumbersDsc(a, b) {
        const labelA = (a.label || '').toLowerCase();
        const labelB = (b.label || '').toLowerCase();
        const regex = /([a-z]+)(\d+(\.\d+)?)?/i;
        const matchA = labelA.match(regex);
        const matchB = labelB.match(regex);
        const textA = matchA ? matchA[1] : '';
        const textB = matchB ? matchB[1] : '';
        const numA = matchA && matchA[2] ? parseFloat(matchA[2]) : NaN;
        const numB = matchB && matchB[2] ? parseFloat(matchB[2]) : NaN;
        if (textA > textB) return -1;
        if (textA < textB) return 1;
        if (!isNaN(numA) && !isNaN(numB)) {
          return numB - numA; 
        } else if (!isNaN(numA)) {
          return 1; 
        } else if (!isNaN(numB)) {
          return -1;
        }
        return 0;
      }
      for (const key in groupedData) {
        if (Array.isArray(groupedData[key])) {
          if (key === "ram" || key === "storagecapacity" || key === "frequency" || key === "warranty" || key === 'ageoflaptopmonth') {
            groupedData[key].sort(compareNumbers);
          }
          else if (key === "operatingsystemversion") {
            groupedData[key].sort(compareLabelsAndNumbers)
          }
          else if (key === "foldable" || key === "lightindicator") {
            groupedData[key].sort(compareLabelsAndNumbersDsc)
          }
          else {
            groupedData[key].sort((a, b) => (a.label > b.label ? 1 : -1));
          }
        }
      }
      return groupedData;
    } catch (error) {
      console.error("Query Execution Error: IN getAllPicklist", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      return ErrorMessage
    }
  };
}
