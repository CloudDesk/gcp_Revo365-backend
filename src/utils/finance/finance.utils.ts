import {
  createCipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "crypto";

export class FinanceValidationError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = "FINANCE_VALIDATION_ERROR") {
    super(message);
    this.name = "FinanceValidationError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const toMoney = (value: unknown, fieldName = "amount"): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new FinanceValidationError(`${fieldName} must be a valid number.`);
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

export const requirePositiveMoney = (value: unknown, fieldName = "amount"): number => {
  const parsed = toMoney(value, fieldName);
  if (parsed <= 0) {
    throw new FinanceValidationError(`${fieldName} must be greater than zero.`);
  }
  return parsed;
};

export const requireIsoDate = (value: unknown, fieldName: string): string => {
  const normalized = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new FinanceValidationError(`${fieldName} must use YYYY-MM-DD format.`);
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== normalized
  ) {
    throw new FinanceValidationError(`${fieldName} must be a valid date.`);
  }
  return normalized;
};

export const toFinanceDateOnly = (value: unknown): string | null => {
  if (value == null || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const normalized = String(value).trim();
  const dateOnly = normalized.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/)?.[1];
  return dateOnly || null;
};

export const normalizeAccountType = (value: unknown): "bank" | "cash" => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized !== "bank" && normalized !== "cash") {
    throw new FinanceValidationError("accounttype must be bank or cash.");
  }
  return normalized;
};

export const normalizeEntrySide = (value: unknown): "debit" | "credit" => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized !== "debit" && normalized !== "credit") {
    throw new FinanceValidationError("entryside must be debit or credit.");
  }
  return normalized;
};

export const calculateAvailableBalance = (
  previousBalance: unknown,
  entrySide: unknown,
  amount: unknown
): number => {
  const previous = toMoney(previousBalance, "previousbalance");
  const transactionAmount = requirePositiveMoney(amount);
  const side = normalizeEntrySide(entrySide);
  return toMoney(
    side === "debit"
      ? previous + transactionAmount
      : previous - transactionAmount,
    "balanceafter"
  );
};

const requireEncryptionKey = (secret: string | undefined): Uint8Array => {
  if (!secret || secret.trim().length < 16) {
    throw new FinanceValidationError(
      "Finance encryption key is not configured.",
      500,
      "FINANCE_ENCRYPTION_KEY_MISSING"
    );
  }
  return Uint8Array.from(createHash("sha256").update(secret).digest());
};

export const protectAccountNumber = (
  accountNumber: unknown,
  secret: string | undefined
) => {
  const normalized = String(accountNumber || "").replace(/\s+/g, "").trim();
  if (!/^[A-Za-z0-9-]{4,40}$/.test(normalized)) {
    throw new FinanceValidationError(
      "accountnumber must contain 4 to 40 letters, numbers, or hyphens."
    );
  }

  const key = requireEncryptionKey(secret);
  const iv = Uint8Array.from(randomBytes(12));
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted =
    cipher.update(normalized, "utf8", "base64") + cipher.final("base64");
  const authTag = cipher.getAuthTag();

  return {
    encrypted: [
      "v1",
      Buffer.from(iv).toString("base64"),
      authTag.toString("base64"),
      encrypted,
    ].join(":"),
    hash: createHmac("sha256", secret!)
      .update(normalized.toUpperCase())
      .digest("hex"),
    last4: normalized.slice(-4),
  };
};

export const maskAccountNumber = (last4: unknown): string | null => {
  const normalized = String(last4 || "").trim();
  return normalized ? `****${normalized}` : null;
};

export const formatTdsSectionDisplayName = (
  natureOfPayment: unknown,
  newCode: unknown,
  rate: unknown
): string =>
  `${String(natureOfPayment).trim()} ${String(newCode).trim()}(${String(rate).trim()})`;

export const resolveFinanceContext = (request: any) => {
  const session = request?.session || {};
  const actor =
    session.id ??
    session.userid ??
    session.userId ??
    session.useremail ??
    session.email ??
    "unknown";
  const organizationId = Number(
    session.organizationid ?? session.organizationId ?? 1
  );

  return {
    actor: String(actor),
    organizationId:
      Number.isSafeInteger(organizationId) && organizationId > 0
        ? organizationId
        : 1,
  };
};

export const nowEpoch = () => Math.floor(Date.now() / 1000);
