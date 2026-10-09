import Handlebars from "handlebars";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Helpers ─────────────────────────────────────────────────────────────────

Handlebars.registerHelper("formatDate", (value: any) => {
  if (!value) return "___________";
  const n = Number(value);
  const ms =
    Number.isFinite(n) && n > 0
      ? String(Math.trunc(n)).length <= 10
        ? n * 1000
        : n
      : NaN;
  const d = new Date(ms);
  if (isNaN(d.getTime())) {
    // try as ISO string
    const d2 = new Date(value);
    if (isNaN(d2.getTime())) return String(value);
    return d2.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
});

Handlebars.registerHelper("formatCurrency", (value: any) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
});

Handlebars.registerHelper("inc", (index: number) => index + 1);

Handlebars.registerHelper("joinArr", (arr: any, sep: string) => {
  if (!Array.isArray(arr)) return "";
  return arr.join(sep ?? ", ");
});

Handlebars.registerHelper("defaultText", (value: any, fallback = "___________") => {
  const text = String(value ?? "").trim();
  return text || fallback;
});

Handlebars.registerHelper("ordinal", (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
});

// ── Template Loader ──────────────────────────────────────────────────────────

const TEMPLATE_PATHS = [
  path.resolve(__dirname, "../../templates/rental_agreement_template.html"),
  path.resolve(process.cwd(), "templates/rental_agreement_template.html"),
];

let _compiled: Handlebars.TemplateDelegate | null = null;

export const getRentalAgreementTemplate = (): Handlebars.TemplateDelegate => {
  if (_compiled) return _compiled;
  for (const p of TEMPLATE_PATHS) {
    if (fs.existsSync(p)) {
      _compiled = Handlebars.compile(fs.readFileSync(p, "utf8"));
      return _compiled;
    }
  }
  throw new Error(
    "Rental agreement HTML template not found. Expected at: " +
      TEMPLATE_PATHS[0]
  );
};
