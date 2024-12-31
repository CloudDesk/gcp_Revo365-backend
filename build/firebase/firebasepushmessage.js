import admin from "firebase-admin";
// import { query } from "../database/postgres.js";
// import serviceData from './service.json' assert { type: 'json' };
let userTokenData;
// admin.initializeApp({
//   credential: admin.credential.cert(serviceData as admin.ServiceAccount),
// });
export const messageinitialization = async (userid, messageData) => {
    try {
        // const queryText = `SELECT * FROM users where id = $1`;
        // const dataresult = await query(queryText, [userid]);
        // if (dataresult.rows.length > 0) {
        //   if (dataresult.rows[0].fcmid && dataresult.rows[0].fcmid != null) {
        //     userTokenData = dataresult.rows[0].fcmid
        //     const userToken = userTokenData
        //     let data = await sendPushNotification
        //       (userToken, messageData);
        //   }
        //   else {
        //     return 'No Push Notification Method Present '
        //   }
        // }
    }
    catch (error) {
        return error.message;
    }
};
export const sendPushNotification = async (token, messageData) => {
    console.log('INside Message sendPushNotification');
    const message = {
        notification: {
            title: messageData.title,
            body: messageData.body,
        },
        token: token,
    };
    try {
        const response = await admin.messaging().send(message);
        console.log("Successfully sent message:", response);
        return `Successfully sent message to :  ${response}`;
    }
    catch (error) {
        console.error("Error sending message:", error);
    }
};
//# sourceMappingURL=firebasepushmessage.js.map