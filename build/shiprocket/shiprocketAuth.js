import axios from "axios";
import { SHIPROCKET_BASE_URL, SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD } from "../config/config.js";
const BASE = SHIPROCKET_BASE_URL;
const EMAIL = SHIPROCKET_EMAIL;
const PASSWORD = SHIPROCKET_PASSWORD;
async function loginShiprocket() {
    try {
        console.log(BASE, EMAIL, PASSWORD, 'cred');
        const response = await axios.post(`${BASE}/auth/login`, {
            email: EMAIL,
            password: PASSWORD,
        });
        const token = response.data.token;
        console.log("✅ Login successful!");
        console.log("Token:", token);
        return token;
    }
    catch (error) {
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
//# sourceMappingURL=shiprocketAuth.js.map