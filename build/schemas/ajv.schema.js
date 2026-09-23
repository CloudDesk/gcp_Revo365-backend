import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Ajv = require("ajv");
const ajvErrors = require("ajv-errors");
const ajv = new Ajv({ allErrors: true });
ajvErrors(ajv);
// Function to validate the uploaded fil
const validateRequestBody = (schema) => {
    return async (request, reply) => {
        try {
            console.log('validation', JSON.stringify(request.body));
            const valid = ajv.validate(schema, request.body);
            if (!valid) {
                console.log(ajv.errors, 'AJV Errors');
                reply.status(400).send({ error: ajv.errors });
            }
        }
        catch (error) {
            reply.status(500).send(error);
        }
    };
};
const validateDataLoader = async (schema, value) => {
    try {
        const valid = ajv.validate(schema, value);
        if (!valid) {
            return { error: ajv.errors };
        }
        else {
            return true;
        }
    }
    catch (error) {
        return error;
    }
};
export { validateRequestBody, validateDataLoader };
//# sourceMappingURL=ajv.schema.js.map