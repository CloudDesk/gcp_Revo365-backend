import admin from "firebase-admin";
import serviceData from './service.json' with { type: "json" };
admin.initializeApp({
    credential: admin.credential.cert(serviceData)
});
export const messageinitialization = async (userid, messageData) => {
    try {
    }
    catch (error) {
        return error.message;
    }
};
export const sendPushNotification = async (token, messageData) => {
    const message = {
        notification: {
            title: messageData.title,
            body: messageData.body,
        },
        token: token,
    };
    try {
        console.log("Initial message:", message);
        const response = await admin.messaging().send(message);
        console.log("Notification sent:", response);
        return `Successfully sent message: ${response}`;
    }
    catch (error) {
        console.error("Error sending push notification:", error);
        if (error.code === "messaging/registration-token-not-registered") {
            console.log("Invalid token detected. Consider removing from DB.");
            // Remove or update token logic here
        }
        return `Failed to send message: ${error.message}`;
    }
};
//# sourceMappingURL=firebasepushmessage.js.map