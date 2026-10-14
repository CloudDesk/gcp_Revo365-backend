import { ARRAY, ARRAYOFOBJECT, BIG_INT, BOOLEAN, DATE, INTEGER, NUMERIC, TEXT, TEXTA, TEXTB, TIMESTAMP, TIMESTAMPTZ, VARCHAR, _VARCHAR, tsvector } from "./dataTypeconfig.js";

const STORAGE_CONSOLE_URL = "https://storage.cloud.google.com/";
const STORAGE_PUBLIC_URL = "https://storage.googleapis.com/";

const normalizeStorageUrls = (value: any): any => {
  if (typeof value === "string") {
    return value.split(STORAGE_CONSOLE_URL).join(STORAGE_PUBLIC_URL);
  }

  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeStorageUrls(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeStorageUrls(entry)])
    );
  }

  return value;
};

const dataTypeCheck = async (result: any) => {
  try {
    const columns = result.fields;
    // console.log(JSON.stringify(columns), 'COLUMNS');
    for (let row of result.rows) {
      for (let [key, value] of Object.entries(row)) {
        row[key] = normalizeStorageUrls(value);
        value = row[key];
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
          case DATE:
          case TIMESTAMP:
          case TIMESTAMPTZ:
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
