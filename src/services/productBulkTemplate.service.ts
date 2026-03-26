import ExcelJS from "exceljs";
import { productrevoInsertSchema } from "../schemas/productrevo.schema.js";

type SchemaProperty = {
  type?: string | string[];
  items?: {
    type?: string | string[];
  };
  enum?: Array<string | number | boolean>;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
};

type TemplateField = {
  key: string;
  types: string[];
  nullable: boolean;
  required: boolean;
  example: string | number | boolean;
  constraints: string;
  notes: string;
};

type FieldOverride = {
  include?: boolean;
  required?: boolean;
  example?: string | number | boolean;
  notes?: string;
};

type TemplateProfileName = "legacy_product_bulk" | "full_schema";

type TemplateProfile = {
  key: TemplateProfileName;
  description: string;
  fields: readonly string[] | "ALL";
};

const EXCLUDED_TEMPLATE_FIELDS = new Set<string>([
  "isdeleted",
  "removefromrecyclebin",
  "soldquantity",
  "availablequantity",
  "ecompublishedquantity",
]);

const CORE_BULK_UPLOAD_FIELDS = [
  "subcategory",
  "category",
  "productname",
  "ponumber",
  "price",
  "brand",
  "suppliername",
  "model",
] as const;

const CORE_FIELD_SET = new Set<string>(CORE_BULK_UPLOAD_FIELDS);

const TEMPLATE_PROFILES: Record<TemplateProfileName, TemplateProfile> = {
  legacy_product_bulk: {
    key: "legacy_product_bulk",
    description: "Legacy 8-field product bulk template used by existing upload flow.",
    fields: CORE_BULK_UPLOAD_FIELDS,
  },
  full_schema: {
    key: "full_schema",
    description: "All schema-driven fields except internal/excluded fields.",
    fields: "ALL",
  },
};

const DEFAULT_TEMPLATE_PROFILE: TemplateProfileName = "legacy_product_bulk";

const FIELD_OVERRIDES: Record<string, FieldOverride> = {
  subcategory: {
    required: true,
    example: "laptop",
  },
  productname: {
    required: true,
    example: "Test Laptop",
    notes: "Human-readable product name shown in catalog.",
  },
  category: {
    required: true,
    example: "new",
  },
  brand: {
    required: true,
    example: "dell",
  },
  model: {
    required: true,
    example: "latitude",
  },
  price: {
    required: true,
    example: 25000,
  },
  suppliername: {
    required: true,
    example: "Teqit Test",
  },
  ecomvisible: {
    example: true,
    notes: "Set true to show product on ecommerce listings.",
  },
  puc: {
    example: "REVOPUC0001",
  },
  ponumber: {
    required: true,
    example: "PO-2026-001",
  },
  serialnumber: {
    example: "SN-T14-0001",
  },
};

const getTypeList = (property: SchemaProperty): string[] => {
  if (Array.isArray(property.type)) {
    return property.type.filter((item): item is string => typeof item === "string");
  }
  if (typeof property.type === "string") {
    return [property.type];
  }
  return ["string"];
};

const buildConstraintsLabel = (property: SchemaProperty, filteredTypes: string[]): string => {
  const constraints: string[] = [];
  const primaryType = filteredTypes[0];

  if ((primaryType === "number" || primaryType === "integer") && typeof property.minimum === "number") {
    constraints.push(`min: ${property.minimum}`);
  }
  if ((primaryType === "number" || primaryType === "integer") && typeof property.maximum === "number") {
    constraints.push(`max: ${property.maximum}`);
  }
  if (primaryType === "string" && typeof property.minLength === "number") {
    constraints.push(`minLength: ${property.minLength}`);
  }
  if (primaryType === "string" && typeof property.maxLength === "number") {
    constraints.push(`maxLength: ${property.maxLength}`);
  }
  if (Array.isArray(property.enum) && property.enum.length > 0) {
    constraints.push(`enum: ${property.enum.join(", ")}`);
  }
  if (primaryType === "array" && property.items?.type) {
    const arrayType = Array.isArray(property.items.type)
      ? property.items.type.filter((item): item is string => typeof item === "string").join(" | ")
      : property.items.type;
    constraints.push(`items: ${arrayType}`);
  }

  return constraints.join(" | ");
};

const getFallbackExample = (fieldKey: string, filteredTypes: string[]): string | number | boolean => {
  const primaryType = filteredTypes[0];

  if (primaryType === "number" || primaryType === "integer") {
    if (fieldKey.toLowerCase().includes("date")) {
      return Date.now();
    }
    return 1;
  }
  if (primaryType === "boolean") {
    return false;
  }
  if (primaryType === "array") {
    return "[\"value1\",\"value2\"]";
  }
  return `sample_${fieldKey}`;
};

const resolveTemplateProfile = (requestedProfile?: string): TemplateProfile => {
  const profileKey = (requestedProfile || DEFAULT_TEMPLATE_PROFILE) as TemplateProfileName;
  const profile = TEMPLATE_PROFILES[profileKey];
  if (!profile) {
    const supported = Object.keys(TEMPLATE_PROFILES).join(", ");
    throw new Error(`Invalid template profile '${requestedProfile}'. Supported profiles: ${supported}`);
  }
  return profile;
};

const buildTemplateFields = (profile: TemplateProfile): TemplateField[] => {
  const schema = productrevoInsertSchema as {
    properties?: Record<string, SchemaProperty>;
    required?: string[];
  };

  const properties = schema.properties ?? {};
  const requiredFromSchema = new Set<string>(schema.required ?? []);
  const priorityFieldRank = new Map<string, number>(
    (profile.fields === "ALL" ? CORE_BULK_UPLOAD_FIELDS : profile.fields).map((fieldName, index) => [
      fieldName,
      index,
    ])
  );
  const selectedFields =
    profile.fields === "ALL" ? null : new Set<string>(profile.fields.filter((fieldName) => fieldName in properties));

  return Object.entries(properties)
    .filter(([key]) => {
      if (FIELD_OVERRIDES[key]?.include === false || EXCLUDED_TEMPLATE_FIELDS.has(key)) return false;
      if (!selectedFields) return true;
      return selectedFields.has(key);
    })
    .map(([key, property]) => {
      const typeList = getTypeList(property);
      const nullable = typeList.includes("null");
      const filteredTypes = typeList.filter((item) => item !== "null");
      const resolvedTypes = filteredTypes.length ? filteredTypes : ["string"];
      const override = FIELD_OVERRIDES[key];
      const isCoreField = CORE_FIELD_SET.has(key) && profile.key === "legacy_product_bulk";
      const rank = priorityFieldRank.has(key)
        ? (priorityFieldRank.get(key) as number)
        : Number.MAX_SAFE_INTEGER;

      return {
        key,
        types: resolvedTypes,
        nullable,
        required: isCoreField || override?.required || requiredFromSchema.has(key),
        example: override?.example ?? getFallbackExample(key, resolvedTypes),
        constraints: buildConstraintsLabel(property, resolvedTypes),
        notes: override?.notes ?? (isCoreField ? "Core legacy bulk-upload field." : ""),
        rank,
      };
    })
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank;
      return left.key.localeCompare(right.key);
    })
    .map(({ rank: _rank, ...field }) => field);
};

const styleHeaderRow = (row: ExcelJS.Row): void => {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E78" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFB8CCE4" } },
      left: { style: "thin", color: { argb: "FFB8CCE4" } },
      bottom: { style: "thin", color: { argb: "FFB8CCE4" } },
      right: { style: "thin", color: { argb: "FFB8CCE4" } },
    };
  });
};

const addTemplateSheet = (workbook: ExcelJS.Workbook, fields: TemplateField[]): void => {
  const ws = workbook.addWorksheet("Products_Template");
  ws.columns = fields.map((field) => ({
    header: field.key,
    key: field.key,
    width: Math.max(16, field.key.length + 4),
  }));

  const sampleRow = Object.fromEntries(fields.map((field) => [field.key, field.example]));
  const editableRow = Object.fromEntries(fields.map((field) => [field.key, ""]));

  ws.addRow(sampleRow);
  ws.addRow(editableRow);

  ws.views = [{ state: "frozen", ySplit: 1 }];
  styleHeaderRow(ws.getRow(1));

  const sampleDataRow = ws.getRow(2);
  sampleDataRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8F4FF" },
    };
  });
};

const addInstructionSheet = (workbook: ExcelJS.Workbook, fields: TemplateField[], profile: TemplateProfile): void => {
  const ws = workbook.addWorksheet("Instructions");

  ws.getCell("A1").value =
    `Profile: ${profile.key}. ${profile.description} Keep headers unchanged. Arrays must be valid JSON array strings (example: [\"a\",\"b\"]).`;
  ws.mergeCells("A1:G1");
  ws.getCell("A1").alignment = { wrapText: true, vertical: "top" };
  ws.getCell("A1").font = { bold: true };

  ws.columns = [
    { header: "Field", key: "field", width: 28 },
    { header: "Type", key: "type", width: 18 },
    { header: "Required", key: "required", width: 12 },
    { header: "Nullable", key: "nullable", width: 12 },
    { header: "Example", key: "example", width: 34 },
    { header: "Constraints", key: "constraints", width: 42 },
    { header: "Notes", key: "notes", width: 42 },
  ];

  ws.spliceRows(2, 0, [
    "Field",
    "Type",
    "Required",
    "Nullable",
    "Example",
    "Constraints",
    "Notes",
  ]);

  fields.forEach((field) => {
    ws.addRow({
      field: field.key,
      type: field.types.join(" | "),
      required: field.required ? "Yes" : "No",
      nullable: field.nullable ? "Yes" : "No",
      example: String(field.example),
      constraints: field.constraints,
      notes: field.notes,
    });
  });

  styleHeaderRow(ws.getRow(2));
  ws.views = [{ state: "frozen", ySplit: 2 }];
};

export module productBulkTemplateService {
  export const generateProductBulkTemplate = async (
    requestedProfile?: string
  ): Promise<ExcelJS.Workbook> => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Revo365 Backend";
    workbook.created = new Date();
    workbook.modified = new Date();

    const profile = resolveTemplateProfile(requestedProfile);
    const fields = buildTemplateFields(profile);

    addTemplateSheet(workbook, fields);
    addInstructionSheet(workbook, fields, profile);

    return workbook;
  };

  export const defaultProfile = DEFAULT_TEMPLATE_PROFILE;
  export const supportedProfiles = Object.keys(TEMPLATE_PROFILES);
}
