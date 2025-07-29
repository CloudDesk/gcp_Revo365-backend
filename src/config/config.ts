import dotenv from 'dotenv'
dotenv.config()

const config = {
  ACCESSKEYID: process.env.ACCESSKEYID,
  SECRETACCESSKEY: process.env.SECRETACCESSKEY,
  PORT: process.env.PORT,
  REGION: process.env.REGION,
  POSTGRES_USER: process.env.POSTGRES_USER,
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
  POSTGRES_HOST: process.env.POSTGRES_HOST,
  POSTGRES_PORT: process.env.POSTGRES_PORT,
  POSTGRES__DATABASE: process.env.POSTGRES__DATABASE,
  PROTOCOL: process.env.PROTOCOL,
  REDIRECT_URL_PAYMENT_STATUS: process.env.REDIRECT_URL_PAYMENT_STATUS,
  REDIRECT_URL_SUCCESS: process.env.REDIRECT_URL_SUCCESS,
  REDIRECT_URL_FAILURE: process.env.REDIRECT_URL_FAILURE,
  GMAIL_SERVICE: process.env.GMAIL_SERVICE,
  GMAIL_HOST: process.env.GMAIL_HOST,
  GMAIL_PORT: process.env.GMAIL_PORT,
  GMAIL_AUTH_USER: process.env.GMAIL_AUTH_USER,
  GMAIL_AUTH_PASSWORD: process.env.GMAIL_AUTH_PASSWORD,
  GCP_TASK_URL: process.env.GCP_TASK_URL,
  GCP_PROJECT_ID: process.env.GCP_PROJECT_ID,
  GCP_PROJECT_QUEUE: process.env.GCP_PROJECT_QUEUE,
  GCP_PROJECT_LOCATION: process.env.GCP_PROJECT_LOCATION,
  REDIRECT_INVENTORY_URL: process.env.REDIRECT_INVENTORY_URL,
  REDIS_SESSIONEXSEC: +process.env.REDIS_SESSIONEXSEC,
  REDIS_EMAIL_OTPEXPSEC: +process.env.REDIS_EMAIL_OTPEXPSEC,
  POSTGRESS_QUERY_API:process.env.POSTGRESS_QUERY_API,
  ENV_RAZORPAY_KEY_ID: process.env.ENV_RAZORPAY_KEY_ID,
  ENV_RAZORPAY_KEY_SECRET: process.env.ENV_RAZORPAY_KEY_SECRET
};

export const { ACCESSKEYID } = config;
export const { SECRETACCESSKEY } = config;
export const { PORT } = config;
export const { REGION } = config;
export const { POSTGRES_USER } = config;
export const { POSTGRES_PASSWORD } = config;
export const { POSTGRES_HOST } = config;
export const { POSTGRES_PORT } = config;
export const { POSTGRES__DATABASE } = config;
export const { PROTOCOL } = config;
export const { REDIRECT_URL_PAYMENT_STATUS } = config;
export const { REDIRECT_URL_SUCCESS } = config;
export const { REDIRECT_URL_FAILURE } = config;
export const { GMAIL_SERVICE } = config;
export const { GMAIL_HOST } = config;
export const { GMAIL_PORT } = config;
export const { GMAIL_AUTH_USER } = config;
export const { GMAIL_AUTH_PASSWORD } = config;
export const { GCP_TASK_URL } = config;
export const { GCP_PROJECT_ID } = config;
export const { GCP_PROJECT_QUEUE } = config;
export const { GCP_PROJECT_LOCATION } = config;
export const { REDIRECT_INVENTORY_URL } = config
export const { REDIS_SESSIONEXSEC } = config
export const { REDIS_EMAIL_OTPEXPSEC } = config
export const { POSTGRESS_QUERY_API } = config
export const { ENV_RAZORPAY_KEY_ID } = config
export const { ENV_RAZORPAY_KEY_SECRET } = config