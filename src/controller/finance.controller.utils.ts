import { FinanceValidationError } from "../utils/finance/finance.utils.js";

export const sendFinanceError = (reply: any, error: any) => {
  if (error instanceof FinanceValidationError) {
    return reply.status(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  if (error?.code === "23505") {
    return reply.status(409).send({
      success: false,
      error: {
        code: "FINANCE_DUPLICATE",
        message: "A record with the same unique value already exists.",
      },
    });
  }

  if (error?.code === "23503" || error?.code === "23514") {
    return reply.status(400).send({
      success: false,
      error: {
        code: "FINANCE_CONSTRAINT_ERROR",
        message: "The submitted accounting data is not valid.",
      },
    });
  }

  console.error("Finance module error", error);
  return reply.status(500).send({
    success: false,
    error: {
      code: "FINANCE_INTERNAL_ERROR",
      message: "Unable to process the accounting request.",
    },
  });
};
