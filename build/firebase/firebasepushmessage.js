import admin from "firebase-admin";
let userTokenData;
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
        const response = await admin.messaging().send(message);
        return `Successfully sent message to :  ${response}`;
    }
    catch (error) {
        console.error("Error sending sendPushNotification:", error);
    }
};
//# sourceMappingURL=firebasepushmessage.js.map