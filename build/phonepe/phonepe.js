import crypto from 'crypto';
import axios from 'axios';
import { ErrorHandler } from '../errorHandler/errorHandler.js';
const MERCHANT_ID = "PGTESTPAYUAT86";
const SALT_KEY = "96434309-7796-489d-8924-ab56988a6076";
const keyIndex = 1;
export var phonePay;
(function (phonePay) {
    phonePay.paymentInitialization = async (request) => {
        try {
            let { merchanttransactionId, name, amount, mobilenumber } = request.body;
            const data = {
                merchantId: MERCHANT_ID,
                merchantTransactionId: merchanttransactionId,
                name: name,
                amount: Number(amount) * 100,
                redirectUrl: `https://revo-365-backend-1066464674690.us-central1.run.app/payment/status?id=${merchanttransactionId}`,
                redirectMode: "POST",
                mobileNumber: mobilenumber,
                paymentInstrument: {
                    type: "PAY_PAGE",
                },
            };
            const payload = JSON.stringify(data);
            const payloadMain = Buffer.from(payload).toString("base64");
            const string = payloadMain + "/pg/v1/pay" + SALT_KEY;
            const sha256 = crypto.createHash("sha256").update(string).digest("hex");
            const checksum = sha256 + "###" + keyIndex;
            const prod_url = "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay";
            const options = {
                method: "POST",
                url: prod_url,
                headers: {
                    accept: "application/json",
                    "Content-Type": "application/json",
                    "X-VERIFY": checksum,
                },
                data: {
                    request: payloadMain,
                },
            };
            const response = await axios(options);
            return response.data;
        }
        catch (error) {
            console.error("Query Execution Error: IN paymentInitialization", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    phonePay.paymentConfirmation = async (request) => {
        try {
            const merchantTransactionId = request.query.id;
            const merchantId = MERCHANT_ID;
            const keyIndex = 1;
            const string = `/pg/v1/status/${merchantId}/${merchantTransactionId}` + SALT_KEY;
            const sha256 = crypto.createHash('sha256').update(string).digest('hex');
            const checksum = sha256 + `###` + keyIndex;
            const options = {
                method: 'GET',
                url: `https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status/${merchantId}/${merchantTransactionId}`,
                headers: {
                    accept: "application/json",
                    "Content-Type": "application/json",
                    "X-VERIFY": checksum,
                    "X-MERCHANT-ID": `${merchantId}`
                },
            };
            const response = await axios(options);
            console.log(JSON.stringify(response.data), 'status');
            const queryParams = new URLSearchParams(response.data).toString();
            let url = 'http://localhost:5173/success?' + queryParams;
            // Check if the response indicates failure and change the URL accordingly
            if (!response.data.success) {
                url = 'http://localhost:5173/fail?' + queryParams;
            }
            return url;
        }
        catch (error) {
            console.error("Query Execution Error: IN paymentConfirmation", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
})(phonePay || (phonePay = {}));
//# sourceMappingURL=phonepe.js.map