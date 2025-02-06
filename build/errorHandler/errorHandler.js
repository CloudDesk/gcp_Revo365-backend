export var ErrorHandler;
(function (ErrorHandler) {
    ErrorHandler.checkErrorMessage = async (error) => {
        if (error.errorDetails) {
            return error;
        }
        let errorMessage = "An unknown error occurred";
        const errorDetails = [];
        ;
        if (error.code) {
            switch (error.code) {
                case "23505": // Duplicate key violation
                    errorMessage = "Duplicate Key Exist";
                    if (error.detail) {
                        const match = error.detail.match(/Key \((.*?)\)=\((.*?)\)/);
                        if (match) {
                            errorDetails.push({
                                key: match[1],
                                message: `${match[1]} ${match[2]}  already exists.So Please Give Unique Number`,
                            });
                        }
                        else {
                            errorDetails.push({ key: "unknown", message: error.detail });
                        }
                    }
                    break;
                case "23503": // Foreign key constraint violation
                    errorMessage = "Foreign key constraint violation";
                    if (error.detail) {
                        const match = error.detail.match(/Key \((.*?)\)=\((.*?)\)/);
                        if (match) {
                            errorDetails.push({
                                key: match[1],
                                message: `Entered  ${match[1]}  Is Not Exist ${match[2]}.Please Provide Valid ${match[1]}`,
                            });
                        }
                        else {
                            errorDetails.push({ key: "unknown", message: error.detail });
                        }
                    }
                    break;
                case "23502": // Not-null constraint violation
                    errorMessage = "Not-null constraint violation";
                    if (error.detail) {
                        const match = error.detail.match(/null value in column "(.*?)"/);
                        if (match) {
                            errorDetails.push({
                                key: match[1],
                                message: `Not-null constraint violation in column (${match[1]}).`,
                            });
                        }
                        else {
                            errorDetails.push({ key: "unknown", message: error.detail });
                        }
                    }
                    break;
                case "23514": // Check constraint violation
                    errorMessage = "constraint violation";
                    if (error.detail) {
                        const match = error.detail.match(/Failing row contains \((.*?)\)/);
                        if (match) {
                            errorDetails.push({
                                key: "check constraint",
                                message: `Check constraint violation: ${error.detail}.`,
                            });
                        }
                        else {
                            errorDetails.push({ key: "unknown", message: error.detail });
                        }
                    }
                    break;
                case "42601": // Syntax error
                    errorMessage = "Syntax error in the SQL query";
                    errorDetails.push({ key: "syntax", message: error.message });
                    break;
                case "42703": // Undefined column error
                    errorMessage = "Undefined column error";
                    console.log(error.message, "Erro dat");
                    const messageMatch = error.message.match(/column "(.*?)" of relation "(.*?)" does not exist/);
                    if (messageMatch) {
                        errorDetails.push({
                            key: messageMatch[1],
                            message: `Undefined column: ${messageMatch[1]} in table: ${messageMatch[2]}.`,
                        });
                    }
                    if (error.detail) {
                        const match = error.detail.match(/column "(.*?)"/);
                        if (match) {
                            errorDetails.push({
                                key: match[1],
                                message: `Undefined column: ${match[1]}.`,
                            });
                        }
                        else {
                            errorDetails.push({ key: "unknown", message: error.detail });
                        }
                    }
                    break;
                case "42P01": // Undefined table error
                    errorMessage = "Undefined table error";
                    errorDetails.push({
                        key: "table",
                        message: `Undefined table: ${error.message}.`,
                    });
                    break;
                case "23504": // Foreign key constraint violation due to deletion
                    errorMessage = "Foreign key constraint violation due to deletion";
                    if (error.detail) {
                        const match = error.detail.match(/Key \((.*?)\)=\((.*?)\)/);
                        if (match) {
                            errorDetails.push({
                                key: match[1],
                                message: `Foreign key constraint violation for key (${match[1]})=(${match[2]}).`,
                            });
                        }
                        else {
                            errorDetails.push({ key: "unknown", message: error.detail });
                        }
                    }
                    break;
                default:
                    errorMessage = error.message;
                    if (error.detail) {
                        errorDetails.push({ key: "general", message: error.detail });
                    }
            }
        }
        else {
            errorMessage = error.message;
            if (error.detail) {
                errorDetails.push({ key: "general", message: error.detail });
            }
        }
        console.log(errorMessage, "Error message is");
        return { errorMessage, errorDetails, statusCode: 404 };
    };
    ErrorHandler.handleQueryError = async (error) => {
        const { errorMessage, errorDetails, statusCode } = await ErrorHandler.checkErrorMessage(error);
        return { errorMessage, errorDetails, statusCode };
    };
})(ErrorHandler || (ErrorHandler = {}));
//# sourceMappingURL=errorHandler.js.map