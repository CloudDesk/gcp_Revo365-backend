import { REDIS_EMAIL_OTPEXPSEC } from '../config/config.js';
import { redisClient } from '../database/redis.session.js';
export const saveOtp = async (useremail, generatedotp) => {
    const otpdata = {
        useremail: useremail,
        otp: generatedotp
    };
    await redisClient.setEx(useremail, REDIS_EMAIL_OTPEXPSEC, JSON.stringify(otpdata));
    const savedData = await redisClient.get(useremail);
    if (savedData) {
        return `Data saved successfully ${savedData}`;
    }
    else {
        return 'Failed to save data.';
    }
};
export const getOtp = async (useremail, userenteredotp) => {
    const otpData = await redisClient.get(useremail);
    if (!otpData) {
        return false;
    }
    const parsedData = JSON.parse(otpData);
    if (Number(parsedData.otp) === Number(userenteredotp)) {
        return true;
    }
    else {
        return false;
    }
};
//# sourceMappingURL=otp.service.js.map