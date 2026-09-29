import { sendPushNotification } from "../firebase/firebasepushmessage.js";
import { userService } from "./user.service.js";
export const testSendFCMNotification = async (request, reply) => {
    console.log("fcmnotification", request.params);
    const messageData = {
        title: "Hello User",
        body: "Payment Not Done. If any payment was debited, it will be refunded in 5 business days.",
    };
    try {
        let user = await userService.getLoggedInUsersData(request, reply);
        console.log(user, "user");
        if (!user || user?.length === 0) {
            return reply.status(404).send({ error: "User not found" });
        }
        let fcmId = user[0].fcmid;
        if (!fcmId) {
            return reply.status(400).send({ error: "User does not have an FCM ID" });
        }
        await sendPushNotification(fcmId, messageData);
        return reply.status(200).send({ success: "Notification sent successfully" });
    }
    catch (error) {
        console.error("Error in testSendFCMNotification:", error);
        return reply.status(500).send({ error: "Failed to send notification" });
    }
};
//# sourceMappingURL=test.service.js.map