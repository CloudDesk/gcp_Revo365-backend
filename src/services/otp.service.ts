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
  } else {
    return 'Failed to save data.';
  }
};
 
export const getOtp = async (useremail, userenteredotp) => {
  const otpData = await redisClient.get(useremail);
 
  if (!otpData) {
    console.log('No OTP found for the given email.');
    return false;
  }
//  console.log(otpData ,'otp data')
  const parsedData = JSON.parse(otpData);
//  console.log(typeof(parsedData.otp) ,'Parsed Data Otp')
//  console.log(typeof(userenteredotp) ,'user entered otp')
  if (Number(parsedData.otp) ===Number(userenteredotp)) {
    console.log('OTP matches');
    return true;
  } else {
    console.log('OTP does not match');
    return false;
  }
};