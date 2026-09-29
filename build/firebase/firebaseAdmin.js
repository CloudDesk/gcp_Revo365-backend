import admin from "firebase-admin";
import { createRequire } from "module";
import { GCP_PROJECT_ID } from "../config/config.js";
const require = createRequire(import.meta.url);
const ecommerceServiceAccount = require("./service.json");
const firebaseApp = admin.apps.length > 0
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: GCP_PROJECT_ID || undefined,
        storageBucket: "rental-agreeements",
    });
const firebaseAuthAppName = "ecommerce-auth";
const firebaseAuthApp = admin.apps.find((app) => app?.name === firebaseAuthAppName) ||
    admin.initializeApp({
        credential: admin.credential.cert(ecommerceServiceAccount),
        projectId: ecommerceServiceAccount.project_id,
    }, firebaseAuthAppName);
const firebaseAuth = admin.auth(firebaseAuthApp);
export { admin, firebaseApp, firebaseAuth };
//# sourceMappingURL=firebaseAdmin.js.map