import { ARRAY, ARRAYOFOBJECT, BIG_INT, BOOLEAN, INTEGER, NUMERIC, TEXT, TEXTA, TEXTB, VARCHAR, _VARCHAR, tsvector } from "./dataTypeconfig.js";
const dataTypeCheck = async (result: any) => {
  try {
    const columns = result.fields;
    // console.log(JSON.stringify(columns), 'COLUMNS');
    for (let row of result.rows) {
      for (let [key, value] of Object.entries(row)) {
        const column = columns.find((col: any) => col.name === key);
        const columnType = column ? column.dataTypeID : null;
        switch (columnType) {
          // case 20: // Numeric type
          // case 23: // Numeric type
          // case 1700: // Numeric type
          case BIG_INT:
          case INTEGER:
          case NUMERIC:
            if (typeof value === 'string') {
              row[key] = parseFloat(value);
            }
            break;
          // case 1043: // String
          // case 25: // Text
          // case 1009: // Array
          // case 16: // Boolean
          case VARCHAR:
          case TEXT:
          case TEXTA:
          case TEXTB:
          case ARRAY:
          case BOOLEAN:
          case _VARCHAR:
          case ARRAYOFOBJECT:
          case tsvector:
            //no Changes for this data  types
            break;
          default:
            console.error(`Unrecognized data type for column... Need to set datatype id for the fields called :  ${key}`);
            break;
        }
      }
    }
    // console.log('data type function ');
    return result.rows

  } catch (error) {
    console.log('error in data type check ', error.message);
    return error

  }
}

export default dataTypeCheck