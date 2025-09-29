import axios from "axios";
import { SHIPROCKET_BASE_URL, SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD } from "../config/config.js";

const BASE = SHIPROCKET_BASE_URL as string;
const EMAIL = SHIPROCKET_EMAIL as string;
const PASSWORD = SHIPROCKET_PASSWORD as string;

async function loginShiprocket(): Promise<string | null> {
  try {
    console.log(BASE,EMAIL,PASSWORD,'cred')
    const response = await axios.post(`${BASE}/auth/login`, {
      email: EMAIL,
      password: PASSWORD,
    });

    const token: string = response.data.token;
    console.log("✅ Login successful!");
    console.log("Token:", token);

    return token;
  } catch (error: any) {
    console.error("❌ Login failed:", error.response?.data || error.message);
    return null;
  }
}

export default loginShiprocket;

// Run directly
// if (import.meta.url === `file://${process.argv[1]}`) {
//   loginShiprocket();
// }

loginShiprocket();