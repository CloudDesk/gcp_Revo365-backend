import admin from "firebase-admin";
import { GCP_PROJECT_ID } from "../config/config.js";
const firebaseApp = admin.apps.length > 0
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: GCP_PROJECT_ID || undefined,
        storageBucket: "rental-agreeements",
    });
export { admin, firebaseApp };
//# sourceMappingURL=firebaseAdmin.js.map