const emailTemplates = {
    otp: {
        passwordReset: {
            subject: 'OTP Verification Code',
            text: 'Your OTP to reset your Revo password is: {otp}. It is valid for 10 minutes.',
        },
    },
    tickets: {
        // ─── T-01: Ticket Created (Customer) ──────────────────────────────────────
        new: {
            subject: 'Your Service Request #{ticketNumber} Has Been Raised',
            text: `Hi,\n\nYour service request has been raised successfully.\n\nTicket Number : {ticketNumber}\n\nOur team will review your request and assign a technician shortly. You will receive an update once the technician is assigned.\n\nThank You,\nRevo Service Team`,
        },
        // ─── T-02: Technician Assigned (Technician) ───────────────────────────────
        assigned: {
            subject: 'New Service Ticket Assigned — #{ticketNumber}',
            text: `Hi {technicianName},\n\nA new service ticket has been assigned to you.\n\nTicket Number   : {ticketNumber}\nProduct         : {productName}\nIssue           : {issueDescription}\n\nPlease log in to the service portal to view the full details and update the ticket status.\n\nThank You,\nRevo Service Team`,
        },
        // ─── T-03: Service In Progress (Customer) ─────────────────────────────────
        service_in_progress: {
            subject: 'Your Service Request #{ticketNumber} Is Now In Progress',
            text: `Hi,\n\nYour service request for {productName} is now in progress.\n\nTicket Number : {ticketNumber}\n\nOur technician has started working on your device. We will notify you as soon as the service is completed.\n\nThank You,\nRevo Service Team`,
        },
        // ─── T-03A: Ticket Opened (Customer) ──────────────────────────────────────
        open: {
            subject: 'Your Service Request #{ticketNumber} Is Open',
            text: `Hi,\n\nYour service request has been opened for diagnosis.\n\nTicket Number : {ticketNumber}\nProduct       : {productName}\n\nOur service team is reviewing your issue and will update you shortly.\n\nThank You,\nRevo Service Team`,
        },
        // ─── T-03B: Testing In Progress (Customer) ────────────────────────────────
        testing_in_progress: {
            subject: 'Testing In Progress — Service Request #{ticketNumber}',
            text: `Hi,\n\nDiagnostic testing is currently in progress for your service request.\n\nTicket Number : {ticketNumber}\nProduct       : {productName}\n\nWe will share the next update once testing is completed.\n\nThank You,\nRevo Service Team`,
        },
        // ─── T-03C: Waiting For Spare (Customer) ──────────────────────────────────
        waiting_for_spare: {
            subject: 'Awaiting Spare Part — Service Request #{ticketNumber}',
            text: `Hi,\n\nYour service request is currently waiting for a required spare part.\n\nTicket Number : {ticketNumber}\nProduct       : {productName}\n\nWe will notify you as soon as the spare is available and service resumes.\n\nThank You,\nRevo Service Team`,
        },
        // ─── T-03D: Out For Delivery (Customer) ───────────────────────────────────
        out_for_delivery: {
            subject: 'Your Product Is Out For Delivery — #{ticketNumber}',
            text: `Hi,\n\nYour serviced product is now out for delivery.\n\nTicket Number : {ticketNumber}\nProduct       : {productName}\n\nPlease keep your phone available for delivery coordination.\n\nThank You,\nRevo Service Team`,
        },
        // ─── T-04: Resolved (Customer) ────────────────────────────────────────────
        resolved_closed: {
            subject: 'Your Service Request #{ticketNumber} Has Been Resolved',
            text: `Hi,\n\nYour service request has been resolved successfully.\n\nTicket Number : {ticketNumber}\n\nIf you have any further questions, feel free to contact our support team. We appreciate your patience.\n\nThank You,\nRevo Service Team`,
        },
        // ─── T-04A: Closed (Customer) ─────────────────────────────────────────────
        closed: {
            subject: 'Your Service Request #{ticketNumber} Has Been Closed',
            text: `Hi,\n\nYour service request has been closed.\n\nTicket Number : {ticketNumber}\n\nIf you still need support, you can reopen this ticket or create a new request.\n\nThank You,\nRevo Service Team`,
        },
        // ─── T-05: Quote Shared — Awaiting Customer Approval (Customer) ──────────
        waiting_for_cost_estimation_approval: {
            subject: 'Cost Estimate for Your Service Request #{ticketNumber}',
            text: `Hi,\n\nA cost estimate has been prepared for your service request.\n\nTicket Number   : {ticketNumber}\nProduct         : {productName}\nTotal Payable   : {totalPayable}\n\nPlease review the detailed estimation document here:\n{estimationUrl}\n\nKindly approve or decline the estimate through the app or by contacting our service team. Your approval is required before we can proceed with the service.\n\nThank You,\nRevo Service Team`,
        },
        // ─── T-06: Unresolved / Quote Rejected (Customer) ────────────────────────
        unresolved_closed: {
            subject: 'Update on Your Service Request #{ticketNumber}',
            text: `Hi,\n\nWe regret to inform you that your service request could not be resolved.\n\nTicket Number : {ticketNumber}\n\nWe are sorry for the inconvenience. Please collect your product from our service centre. For further assistance, please contact our support team.\n\nThank You,\nRevo Service Team`,
        },
        // ─── T-07: Re-quote Initiated (Customer) ──────────────────────────────────
        re_quote: {
            subject: 'Revised Quote Initiated — #{ticketNumber}',
            text: `Hi,\n\nWe have received your request for a revised cost estimate.\n\nTicket Number : {ticketNumber}\n\nOur team is reviewing the details and will share a revised estimate shortly. We appreciate your patience.\n\nThank You,\nRevo Service Team`,
        },
        // ─── T-07A: Reopened Ticket (Customer) ────────────────────────────────────
        reopened_ticket: {
            subject: 'Your Service Request #{ticketNumber} Has Been Reopened',
            text: `Hi,\n\nYour service request has been reopened and moved back to active processing.\n\nTicket Number : {ticketNumber}\nProduct       : {productName}\n\nOur team will continue working and keep you updated.\n\nThank You,\nRevo Service Team`,
        },
        // ─── T-08: Payment Received (Customer) ────────────────────────────────────
        payment_received: {
            subject: 'Payment Confirmed — Service Request #{ticketNumber}',
            text: `Hi,\n\nWe have successfully received your payment for the service request.\n\nTicket Number   : {ticketNumber}\nAmount Paid     : {amount}\nPayment Method  : {paymentMethod}\n\nThank you for choosing Revo Service. We hope to serve you again.\n\nRevo Service Team`,
        },
        // ─── T-09: Admin New Ticket Alert (Admin - Optional) ──────────────────────
        admin_new_ticket: {
            subject: 'New Service Request Logged — #{ticketNumber}',
            text: `Hi Admin,\n\nA new service request has been logged in the system.\n\nTicket Number : {ticketNumber}\nProduct       : {productName}\nIssue         : {issueDescription}\nLocation      : {location}\n\nPlease review and assign a technician from the admin portal.\n\nRevo System`,
        },
        // ─── T-12: Service Invoice Ready (Customer) ───────────────────────────────
        invoice_ready: {
            subject: 'Your Service Invoice Is Ready — #{ticketNumber}',
            text: `Hi,\n\nYour service invoice for Ticket #{ticketNumber} is now available.\n\nPlease view and download your invoice using the link below:\n{invoiceUrl}\n\nIf you have any questions, please contact our support team.\n\nThank you for choosing Revo Service.\n\nRevo Service Team`,
        },
    },
    orders: {
        cancelled: {
            subject: 'Order Cancelled',
            text: `Hi,\nYour Order has been Cancelled with Order Id {orderId}.\nYour Order Amount is {orderAmount} And It will be Refunded to your Account in 5-7 Working Days`,
        },
        orderPlaced: {
            subject: 'Order Placed Successfully',
            text: `Hi,\n\nOrder placed successfully.\n{orderDetails}\n\nThank You!`,
        },
    },
};
export default emailTemplates;
//# sourceMappingURL=emailtemplate.js.map