const emailTemplates = {
    tickets: {
        new: {
            subject: "Ticket Raised",
            text: `Hi,\nTicket Raised Successfully with Ticket Number {ticketNumber}`,
        },
        resolved_closed: {
            subject: "Ticket Resolved",
            text: `Hi,\nTicket Resolved Successfully with Ticket Number {ticketNumber}.\nAdmin Team Will Contact You Shortly For Further Details`,
        },
        unresolved_closed: {
            subject: "Ticket Unresolved",
            text: `Hi,\nTicket is Unresolved. Sorry For the Inconvenience. Please collect Your product From Service center`,
        },
    },
    orders: {
        cancelled: {
            subject: "Order Cancelled",
            text: `Hi,\nYour Order has been Cancelled with Order Id {orderId}.\nYour Order Amount is {orderAmount} And It will be Refunded to your Account in 5-7 Working Days`,
        },
        orderPlaced: {
            subject: "Order Placed Successfully",
            text: `Hi,\nYour Order has been placed successfully with Order Id {orderId} And Your Order Amount is {orderAmount}`,
        },
    }
};
export default emailTemplates;
//# sourceMappingURL=emailtemplate.js.map