import { validateRequestBody } from "../schemas/ajv.schema.js";
import { filesUpload } from "../multer/Multer.js";
import { gets3DataStream, gets3Dataurl } from "../aws/getDatafroms3.js";
import { picklistControler } from "../controller/picklist.controller.js";
import { recordCount } from "../controller/recordcount.controller.js";
import { globalSearchController } from "../controller/globalsearch.controller.js";
import { recycleBinController } from "../controller/recyclebin.controller.js";
import { cartController } from "../controller/cart.controller.js";
import { userController } from "../controller/user.controller.js";
import { supplierController } from "../controller/supplier.controller.js";
import { addressController } from "../controller/address.controller.js";
import { cartInsertSchema } from "../schemas/cart.shema.js";
import { ordersController } from "../controller/orders.controller.js";
import { stockController } from "../controller/stock.controller.js";
import { dataLoaderController } from "../controller/dataloader.controller.js";
import { generatePurchaseOrderController } from "../controller/pogenerate.controller.js";
import { purchaseOrderController } from "../controller/purchaseorder.controller.js";
import { productrevoController } from "../controller/productrevo.controller.js";
import { stockRevoController } from "../controller/stockrevo.controller.js";
import { archivestockrevoSchema, deletestockrevoSchema, stockrevoSchema } from "../schemas/stockRevo.schema.js";
import { ratingController } from "../controller/rating.controller.js";
import { transactionController } from "../controller/transaction.controller.js";
import { purchaseorderInsertSchema } from "../schemas/purchaseorder.schema.js";
import { purcahseRequestController } from "../controller/purchaserequest.controller.js";
import { sendMail } from "../Gmail/gmail.js";
import { generatePRController } from "../controller/prgenerate.controller.js";
import { generatePRSchema } from "../schemas/prgenerate.schema.js";
import { prInsertSchema } from "../schemas/pr.schema.js";
import { quoteController } from "../controller/quote.controller.js";
import { poinvoicecontroller } from "../controller/poinvoice.controller.js";
import { notesController } from "../controller/notes.controller.js";
import { InventoryuserController } from "../controller/Inventoryuser.controller.js";
import { ticketController } from "../controller/tickets.controller.js";
import { dashboardController } from "../controller/dashboard.controller.js";
import { constEstimationController } from "../controller/costestimation.controller.js";
import { revoinvoicecontroller } from "../controller/revoinvoice.controller.js";
import { tablecontoller } from "../controller/table.controller.js";
import { permissionscontroller } from "../controller/permissions.controller.js";
import { addressInsertSchema } from "../schemas/address.schema.js";
import { notesSchema } from "../schemas/notes.schems.js";
import { locationhistrorycontroller } from "../controller/locationhistory.controller.js";
import { getSession } from "../services/session.service.js";
import { sessionController } from "../controller/session.controller.js";
import { sendPushNotification } from "../firebase/firebasepushmessage.js";
import { thirdPartyController } from "../controller/thirdparty.controller.js";
import { demandrequestController } from "../controller/demandrequest.controller.js";
import { runShiprocketDiagnostics, shiprocketShippingService } from "../services/shiprocket.service.js";
import { bannerController } from "../controller/banner.controller.js";
import { googlereviewController } from "../controller/googlereview.controller.js";
import { blogscontroller } from "../controller/blogs.controller.js";
import { enquiryController } from "../controller/enquiry.controller.js";
import { enquiryExportController } from "../controller/enquiryExport.controller.js";
import { buybackEnquiriesController } from "../controller/buybackEnquiries.controller.js";
import { serviceEnquiriesController } from "../controller/serviceEnquiries.controller.js";
import { orderReturnsController } from "../controller/orderReturns.controller.js";
import { refundsController } from "../controller/refunds.controller.js";
import { ENV_INTERNAL_TASK_SECRET } from "../config/config.js";
import { ticketReplacementController } from "../controller/ticketReplacement.controller.js";
import { initiateRentalReplacementSchema, receiveOldAssetSchema, assignTechnicalReplacementSchema, assignCommercialReplacementSchema, rejectReplacementSchema, returnRentalAssetSchema, stopRentalSchema, markRentalAssetLostSchema, assessRentalDamageSchema, linkPenaltyInvoiceSchema, renewRentalContractSchema, generateRentalLossDeclarationSchema, finalizeRentalLossDeclarationSchema } from "../schemas/ticketReplacement.schema.js";
import { rentalAgreementController } from "../controller/rentalAgreement.controller.js";
import { createRentalAgreementSchema, regenerateRentalAgreementPdfSchema } from "../schemas/rentalAgreement.schema.js";
import { kubbTicketsController } from "../controller/kubbTickets.controller.js";
import { rentalInvoiceDocumentController } from "../controller/rentalInvoiceDocument.controller.js";
import { vendorCustomerAssignmentController } from "../controller/vendorCustomerAssignment.controller.js";
import { accessController } from "../controller/access.controller.js";
import { consolidatedInvoiceController } from "../controller/consolidatedInvoice.controller.js";
import { storeQuotationController } from "../controller/storeQuotation.controller.js";
const Revo365Routes = async function (fastify, opts) {
    const taskOrSessionAuth = async (request, reply) => {
        const taskSecretHeader = request.headers["x-task-secret"];
        const receivedTaskSecret = Array.isArray(taskSecretHeader)
            ? taskSecretHeader[0]
            : taskSecretHeader;
        if (ENV_INTERNAL_TASK_SECRET &&
            receivedTaskSecret &&
            String(receivedTaskSecret) === String(ENV_INTERNAL_TASK_SECRET)) {
            return;
        }
        return getSession(request, reply);
    };
    //product version 1
    // fastify.get('/product/:pageNumber/:recordCount', productController.getProducts);
    // fastify.get('/product/Archieve/:pageNumber/:recordCount', productController.getArcheivedProducts);
    // fastify.get('/product/:id', productController.getEachProducts);
    // fastify.post('/product', { preHandler: [validateRequestBody(productInsertSchema)] }, productController.upsertProduct);
    // fastify.delete('/product/:id',/* { preHandler: validateRequestBody(deleteProductSchema) } , */ productController.deleteProduct);
    // fastify.post('/product-file/:productid', { preHandler: [filesUpload] }, productController.upsertProductwithfile);
    // fastify.post('/rearange-image/:productid', productController.rearrangeImage);
    // fastify.get('/product/updaterecyclebin', productController.updateRemovedFromRecyclebin);
    // fastify.get('/product-similar/:pageNumber/:recordCount', productController.getSimilarProducts);
    // fastify.get(`/product-ecom`, productController.getEcomProducts);
    // stock v1
    fastify.get(`/stock`, stockController.getStockData);
    fastify.get('/loaderio-f7191720e20ac18e9783086e50fb0ed5/', (req, reply) => {
        reply.send('loaderio-f7191720e20ac18e9783086e50fb0ed5');
    });
    fastify.get('/fcmnotification', async (req, reply) => {
        // reply.status(200).send('test')
        console.log("first");
        const messageData = {
            title: "Hello there! 👋",
            body: "Hope you're having a great day!"
        };
        let fcmId = req.query.token; // Fetch from query params
        if (!fcmId) {
            console.error("No FCM token provided");
            return reply.status(400).send({ error: "FCM token is required" });
        }
        try {
            await sendPushNotification(fcmId, messageData);
            return reply.status(200).send({ success: "Notification sent successfully" });
        }
        catch (error) {
            console.error("Error in testSendFCMNotification:", error);
            return reply.status(500).send({ error: "Failed to send notification" });
        }
    });
    // version 2 -> product
    fastify.get('/v2/product', { preHandler: [getSession] }, productrevoController.getAdminProductsrevoData);
    fastify.get('/v2/product-ecommerce', productrevoController.getProductsrevoData);
    fastify.get('/v2/product/Archieve', { preHandler: [getSession] }, productrevoController.getArcheivedProductsRevo);
    fastify.get('/v2/product-ecom/:id', productrevoController.getEachEcomProductsRevo);
    fastify.get('/v2/product/:id', { preHandler: [getSession] }, productrevoController.getEachProductsRevo);
    fastify.post('/v2/product', { preHandler: [getSession] }, /* { preHandler: [validateRequestBody(productInsertSchema)] } ,*/ productrevoController.upsertProductrevo);
    fastify.delete('/v2/product/:id', { preHandler: [getSession] }, /* { preHandler: validateRequestBody(deleteProductSchema) } , */ productrevoController.deleteProductrevo);
    fastify.post('/v2/product-file/:productid', { preHandler: [getSession, filesUpload] }, productrevoController.upsertProductwithfileRevo);
    fastify.post('/v3/product-file', productrevoController.upsertProductwithfileRevogcp);
    fastify.post('/v2/rearange-image/:productid', { preHandler: [getSession] }, productrevoController.rearrangeImageRevo);
    fastify.get('/v2/product/updaterecyclebin', { preHandler: [getSession] }, productrevoController.updateRemovedFromRecyclebinRevo);
    fastify.get(`/v2/product-ecom`, productrevoController.getProductsEcomrevoData);
    fastify.get('/v2/product-similar', { preHandler: [getSession] }, productrevoController.getSimilarProducts);
    fastify.get('/v2/product-ecom-similar', productrevoController.getSimilarProducts);
    fastify.post('/v2/product/lockqty', { preHandler: [getSession] }, productrevoController.upsertlockqty);
    fastify.post('/v2/product/bulk/validate', { preHandler: [getSession] }, productrevoController.validateBulkProduct);
    fastify.post('/v2/product/bulk', { preHandler: [getSession] }, productrevoController.insertBulkProduct);
    fastify.get('/v2/product/bulk/template', { preHandler: [getSession] }, productrevoController.downloadBulkProductTemplate);
    // Product lifecycle toggle: PATCH /v2/product/:id/ecom-visibility  body: { ecomvisible: true|false }
    fastify.patch('/v2/product/:id/ecom-visibility', { preHandler: [getSession] }, productrevoController.toggleEcomVisible);
    //version 2 -> stock  (ecomvisible is query-param driven: ?ecomvisible=true / ?ecomvisible=false)
    fastify.get('/v2/stock', { preHandler: [getSession] }, stockRevoController.getStockRevoData);
    fastify.get('/v2/stock/barcode/next', { preHandler: [getSession] }, stockRevoController.getNextStockBarcodeNumber);
    fastify.get('/v2/stock/:id', { preHandler: [getSession] }, stockRevoController.getEachStockRevoData);
    fastify.post('/v2/stock', { preHandler: [getSession, validateRequestBody(stockrevoSchema)] }, stockRevoController.upsertStockRevoData);
    fastify.post('/v2/stock/:id/release-service-hold', { preHandler: [getSession] }, stockRevoController.releaseServiceHoldStockToAvailable);
    fastify.post('/v2/stock/:id/mark-found', { preHandler: [getSession] }, stockRevoController.markLostStockAsFound);
    fastify.post('/v2/stock/:id/mark-repaired', { preHandler: [getSession] }, stockRevoController.markDamagedStockAsRepaired);
    // fastify.post('/v2/stock',stockRevoController.upsertStockRevoData);
    // fastify.delete('/v2/stock/:id', { preHandler: [getSession] }, stockRevoController.deleteStockRevoData);
    fastify.get('/v2/stock/Archieve', { preHandler: [getSession] }, stockRevoController.getArcheivedStocksRevo);
    fastify.get('/stock/updaterecyclebin', { preHandler: [getSession] }, stockRevoController.updateRemovedFromRecyclebinRevo);
    fastify.delete('/v2/stock/isdelete', { preHandler: [validateRequestBody(deletestockrevoSchema), getSession] }, stockRevoController.upsertStockRevoDatadelete);
    fastify.post('/v2/stock/isarchive', { preHandler: [validateRequestBody(archivestockrevoSchema), getSession] }, stockRevoController.upsertStockRevoDataarchive);
    fastify.get('/v2/stock/e-waste', stockRevoController.getEwasteStocksRevo);
    // fastify.get('/v2/stock/qty',stockRevoController.testgetArcheivedStocksRevo)
    //s3buket data
    fastify.get('/s3/:Pid/:size', { preHandler: [getSession] }, gets3Dataurl);
    fastify.get('/s3stream', { preHandler: [getSession] }, gets3DataStream);
    //picklistfields
    fastify.get('/picklist/:objectName', picklistControler.getPicklistforobject);
    fastify.get('/picklist', { preHandler: [getSession] }, picklistControler.getAllPicklist);
    //count of totalRecord
    fastify.get('/count/:objectName', { preHandler: [getSession] }, recordCount.getRecordCount);
    fastify.get('/v2/count/:objectName', recordCount.getRecordCountRevo);
    fastify.get('/count/:objectName/:userId', { preHandler: [getSession] }, recordCount.getRecordCountWithUserId);
    fastify.get('/count-Archivefilter/:objectName', { preHandler: [getSession] }, recordCount.getArchivefilterRecordCount);
    fastify.get('/count/global', { preHandler: [getSession] }, recordCount.getGlobalProductDataCount);
    //GlobalSearch
    fastify.get('/global', globalSearchController.getALlData);
    ;
    fastify.get('/v2/global', globalSearchController.getAllProductData);
    fastify.get('/v3/global', { preHandler: [getSession] }, globalSearchController.getGlobalStockOrderTicketData);
    //Recycle bin v1
    //fastify.get('/recyclebin/:pageNumber/:recordCount', recycleBinController.getRecycleBindata)
    fastify.get('/v2/recyclebin/:pageNumber/:recordCount', { preHandler: [getSession] }, recycleBinController.getRecycleBindataRevo);
    //cart
    // fastify.get('/cart', cartController.getCartData)
    fastify.get('/cart', { preHandler: [getSession] }, cartController.getCartData);
    fastify.delete('/cart/:id', { preHandler: [getSession] }, cartController.deleteCart);
    fastify.post('/cart', { preHandler: [getSession, validateRequestBody(cartInsertSchema)] }, cartController.upsertCart);
    fastify.post('/cart/quantity', { preHandler: [getSession] }, cartController.updateCartQuantity);
    fastify.get('/demandrequest', { preHandler: [getSession] }, demandrequestController.getDemandRequest);
    fastify.post('/demandrequest', { preHandler: [getSession] }, demandrequestController.upsertDemandRequest);
    //wishlist (using consolidated cartController)
    fastify.get('/wishlist', { preHandler: [getSession] }, cartController.getCartData);
    fastify.get('/wishlist/:userId', { preHandler: [getSession] }, cartController.getUserCartData);
    fastify.delete('/wishlist/:id', { preHandler: [getSession] }, cartController.deleteCart);
    fastify.post('/wishlist', { preHandler: [getSession] }, cartController.upsertCart);
    //users
    fastify.get('/users', { preHandler: [getSession] }, userController.getUsersData);
    fastify.get('/whatsapp/users', userController.getUsersData);
    fastify.get('/users/:useremail/:userpassword', userController.getLoggedInUsersData);
    fastify.post('/users/login', userController.getLoggedInUsersData);
    fastify.post('/users/google-login', userController.getGoogleLoggedInUserData);
    fastify.post('/users', userController.upsertUser);
    fastify.post('/users/fcmid', userController.upsertFcmidUser);
    fastify.get('/users/logout', userController.userlogout);
    fastify.post('/customers', userController.getCustomersData);
    fastify.delete('/users/:id', userController.deleteUserData);
    fastify.post('/user-forgot', userController.forgotuser);
    //Invetroyusers
    fastify.get('/inventoryusers', { preHandler: [getSession] }, InventoryuserController.getInventoryUsersData);
    fastify.get('/inventoryusers/tickets', { preHandler: [getSession] }, InventoryuserController.getInventoryUsersDataTickets);
    fastify.get('/whatsapp/inventoryusers/tickets', InventoryuserController.getInventoryUsersDataTickets);
    fastify.get('/inventoryusers/:useremail/:userpassword', InventoryuserController.getLoggedInInventoryUsersData);
    fastify.post('/inventoryusers/login', InventoryuserController.getLoggedInInventoryUsersData);
    fastify.post('/inventoryusers', InventoryuserController.upsertInventoryUser);
    fastify.delete('/inventoryusers/:id', InventoryuserController.deleteInventoryUserData);
    fastify.post('/inventoryusers-forgot', InventoryuserController.forgotuser);
    fastify.get('/inventoryusers/logout', InventoryuserController.userlogout);
    fastify.get('/me/access', { preHandler: [getSession] }, accessController.getMyAccess);
    fastify.get('/vendor-customer-assignments', { preHandler: [getSession] }, vendorCustomerAssignmentController.getAssignments);
    fastify.post('/vendor-customer-assignments', { preHandler: [getSession] }, vendorCustomerAssignmentController.replaceAssignments);
    //address
    fastify.get('/address', { preHandler: [getSession] }, addressController.getAddressData);
    fastify.get('/address/:userId', { preHandler: [getSession] }, addressController.getUserAddressData);
    fastify.post('/address', { preHandler: [validateRequestBody(addressInsertSchema)] }, addressController.upsertAddress);
    fastify.delete('/address/:id', { preHandler: [getSession] }, addressController.deleteAddress);
    //orders
    // fastify.get('/orders', ordersController.getOrderData)
    fastify.get('/orders', { preHandler: [getSession] }, ordersController.getUserOrderData);
    fastify.get('/orders/overall', { preHandler: [getSession] }, ordersController.getOrderData);
    fastify.get('/orderline', { preHandler: [getSession] }, ordersController.getorderlinedata);
    fastify.get('/whatsapp/orderline', ordersController.getorderlinedata);
    fastify.get('/orderline/Inventory', { preHandler: [getSession] }, ordersController.getInvorderlinedata);
    fastify.get('/customer/orderline', { preHandler: [getSession] }, ordersController.getOrderlineDynamicData);
    fastify.post('/orderline', { preHandler: [getSession] }, ordersController.updateorderlineitem);
    fastify.get('/orderline/return-request', { preHandler: [getSession] }, orderReturnsController.getReturnRequests);
    fastify.post('/orderline/return-request', { preHandler: [getSession] }, orderReturnsController.createReturnRequest);
    fastify.post('/orderline/return-request/approve', { preHandler: [getSession] }, orderReturnsController.approveReturnRequest);
    fastify.post('/orderline/return-request/reject', { preHandler: [getSession] }, orderReturnsController.rejectReturnRequest);
    fastify.post('/orderline/return-request/receive', { preHandler: [getSession] }, orderReturnsController.receiveReturnRequest);
    fastify.post('/orderline/return-request/finalize', { preHandler: [getSession] }, orderReturnsController.finalizeReturnRequest);
    fastify.get('/orderline/return-reasons', { preHandler: [getSession] }, orderReturnsController.getReturnReasons);
    fastify.post('/orderline/return-reasons', { preHandler: [getSession] }, orderReturnsController.upsertReturnReason);
    fastify.get('/orderline/refund-eligibility', { preHandler: [getSession] }, refundsController.getRefundEligibility);
    fastify.get('/orderline/refund', { preHandler: [getSession] }, refundsController.getRefunds);
    fastify.post('/orderline/refund', { preHandler: [getSession] }, refundsController.initiateRefund);
    fastify.post('/orderline/refund/sync', { preHandler: [getSession] }, refundsController.syncRefund);
    fastify.get('/v2/orders', { preHandler: [getSession] }, ordersController.getUserOrderData1);
    fastify.post('/orders', { preHandler: [getSession] }, ordersController.upsertOrder);
    fastify.post('/v2/orders', { preHandler: [getSession] }, ordersController.upsertOrderv2);
    fastify.delete('/orders/:id', { preHandler: [getSession] }, ordersController.deleteOrder);
    fastify.post('/v2/orders/transactions', { preHandler: [getSession] }, ordersController.getInvoiceDataForOrderid);
    //third party orders - inventory
    fastify.get('/thirdpartyorders', { preHandler: [getSession] }, thirdPartyController.getThirdpartyOrderData);
    // Admin: mark 3rd-party order as dispatched / shipped / delivered / cancelled
    // body: { id: number, orderstatus: 'dispatched'|'shipped'|'delivered'|'cancelled' }
    fastify.post('/thirdpartyorders/status', { preHandler: [getSession] }, thirdPartyController.updateThirdPartyOrderStatus);
    fastify.post('/test/task', { preHandler: [getSession] }, productrevoController.updateOrderedQuantityarray);
    fastify.post('/test/updateorderquantity', { preHandler: [getSession] }, productrevoController.updateOrderedQuantityarray);
    //supplier
    fastify.get('/supplier', { preHandler: [getSession] }, supplierController.getSupplier);
    fastify.post('/supplier', { preHandler: [getSession] }, supplierController.upsertSupplier);
    fastify.delete('/supplier/:id', { preHandler: [getSession] }, supplierController.deleteSupplier);
    fastify.get('/supplier/:id', { preHandler: [getSession] }, supplierController.getSupplierProductdata);
    //supplier - lookup
    fastify.get('/supplier-name', { preHandler: [getSession] }, supplierController.getSupplierName);
    // data loader
    fastify.post('/dataloader', { preHandler: [getSession] }, dataLoaderController.insertDataLoaderData);
    fastify.post('/get-dataloader', { preHandler: [getSession, filesUpload] }, dataLoaderController.getDataLoaderData);
    //stockrevo dataloader
    fastify.post('/get-dataloader/stock', { preHandler: [getSession, filesUpload] }, dataLoaderController.getDataLoaderDataStock);
    fastify.post('/dataloader/stock', { preHandler: [getSession] }, dataLoaderController.insertBulkDataStock);
    //data loader
    fastify.post('/dataloader/test', { preHandler: [getSession] }, dataLoaderController.insertDataLoaderDatalatest);
    //invoice
    fastify.post('/generate/purchase-order', { preHandler: [getSession] }, generatePurchaseOrderController.purchaseOrderData);
    // purchase order
    fastify.get('/purchase-order', { preHandler: [getSession] }, purchaseOrderController.getPurchaseOrder);
    fastify.get('/purchase-order/:id', { preHandler: [getSession] }, purchaseOrderController.getEachPurchaseOrder);
    fastify.post('/purchase-order', { preHandler: [getSession, validateRequestBody(purchaseorderInsertSchema)] }, purchaseOrderController.upsertPurchaseOrder);
    fastify.post('/purchase-Order/invoice/:id', { preHandler: [getSession, filesUpload] }, purchaseOrderController.upsertInvoice);
    fastify.post('/v2/purchase-Order/invoice/:id', purchaseOrderController.upsertInvoice);
    fastify.post('/purchase-Order/update/invoice/:id', { preHandler: [getSession] }, purchaseOrderController.deleteUrl);
    fastify.delete('/purchase-order/:id', { preHandler: [getSession] }, purchaseOrderController.deletePurchaseOrder);
    // productrevo
    fastify.get('/productrevo', { preHandler: [getSession] }, productrevoController.getProductsrevoData);
    fastify.delete('/productrevo/:id', { preHandler: [getSession] }, productrevoController.deleteProductrevo);
    fastify.post('/productrevo', { preHandler: [getSession] }, productrevoController.upsertProductrevo);
    // rating
    fastify.get('/rating', { preHandler: [getSession] }, ratingController.getRatingData);
    fastify.get('/rating-ecom', ratingController.getRatingData);
    fastify.delete('/rating/:id', { preHandler: [getSession] }, ratingController.deleteRating);
    fastify.post('/rating', { preHandler: [getSession, filesUpload] }, ratingController.upsertRating);
    fastify.post('/v2/rating', ratingController.upsertGcpRating);
    fastify.post('/rating-image/delete', { preHandler: [getSession] }, ratingController.deleteImageRating);
    // phonepe
    fastify.post('/payment', { preHandler: [getSession] }, transactionController.paymentInitialization);
    fastify.post('/payment/razorpay', { preHandler: [getSession] }, transactionController.paymentInitializationRazorpay);
    fastify.post('/payment/razorpay/ticket', { preHandler: [getSession] }, transactionController.paymentInitializationRazorpayTicket);
    fastify.post('/payment/confirmation-razorpay', { preHandler: [getSession] }, transactionController.paymentConfirmationRazorpay);
    fastify.post('/payment/razorpay/webhook', { config: { rawBody: true } }, transactionController.paymentWebhookRazorpay);
    fastify.post('/payment/shiprocket/webhook', transactionController.paymentWebhookShiprocket);
    // Alias path without provider keywords for Shiprocket URL validator restrictions.
    fastify.post('/payment/shipment/webhook', transactionController.paymentWebhookShiprocket);
    fastify.post('/payment/shiprocket/sync', { preHandler: [getSession] }, transactionController.syncShiprocketShipmentStatus);
    fastify.get('/payment/shiprocket/settings', { preHandler: [getSession] }, transactionController.getShiprocketSettings);
    fastify.post('/payment/shiprocket/settings', { preHandler: [getSession] }, transactionController.updateShiprocketSettings);
    fastify.get('/payment/shiprocket/pickups', { preHandler: [getSession] }, transactionController.getShiprocketPickupLocations);
    fastify.post('/payment/shiprocket/create', { preHandler: [getSession] }, transactionController.createShiprocketShipment);
    fastify.post('/payment/shiprocket/cancel', { preHandler: [getSession] }, transactionController.cancelShiprocketShipment);
    fastify.post('/payment/confirmation-razorpay/tickets', { preHandler: [getSession] }, transactionController.paymentConfirmationRazorpayTicket);
    fastify.post('/payment/status', transactionController.paymentConfirmation);
    //transaction
    fastify.get('/transaction', { preHandler: [getSession] }, transactionController.getTransactionData);
    fastify.post('/transaction', { preHandler: [getSession] }, transactionController.inserttransaction);
    // ecom enquiry (public)
    fastify.post('/enquiry-corporate', enquiryController.enquiryCorporate);
    fastify.post('/enquiry-individual', enquiryController.enquiryIndividual);
    // enquiry export — downloads Excel with Corporate + Individual sheets (session-protected)
    fastify.get('/enquiry-export', { preHandler: [getSession] }, enquiryExportController.downloadEnquiryExcel);
    // buyback enquiries (public create, protected admin views)
    fastify.post('/buyback-enquiries', buybackEnquiriesController.createEnquiry);
    fastify.get('/buyback-enquiries/:pageNumber/:recordCount', { preHandler: [getSession] }, buybackEnquiriesController.getAllEnquiries);
    fastify.get('/buyback-enquiries/single/:id', { preHandler: [getSession] }, buybackEnquiriesController.getSingleEnquiry);
    fastify.post('/buyback-enquiries/update/:id', { preHandler: [getSession] }, buybackEnquiriesController.updateEnquiry);
    // service enquiries (protected admin views)
    fastify.post('/service-enquiries', serviceEnquiriesController.createEnquiry);
    fastify.get('/service-enquiries/:pageNumber/:recordCount', { preHandler: [getSession] }, serviceEnquiriesController.getAllEnquiries);
    fastify.get('/service-enquiries/single/:id', { preHandler: [getSession] }, serviceEnquiriesController.getSingleEnquiry);
    fastify.post('/service-enquiries/update/:id', { preHandler: [getSession] }, serviceEnquiriesController.updateEnquiry);
    //purchase Request
    fastify.get('/purchase-request', { preHandler: [getSession] }, purcahseRequestController.getPurchaseRequestData);
    fastify.post('/purchase-request', { preHandler: [getSession, validateRequestBody(prInsertSchema)] }, purcahseRequestController.upsertPurchaseRequestData);
    //generate PR
    fastify.post('/generate/purchase-request', { preHandler: [getSession, validateRequestBody(generatePRSchema)] }, generatePRController.generatepr);
    fastify.get('/session', sessionController.getSessionController);
    //quote
    fastify.get('/quote', { preHandler: [getSession] }, quoteController.getQuotes);
    fastify.post('/quote', { preHandler: [getSession] }, quoteController.upsertQuotes);
    //in-store customer quotations
    fastify.get('/store-quotation', { preHandler: [getSession] }, storeQuotationController.getStoreQuotations);
    fastify.post('/store-quotation', { preHandler: [getSession] }, storeQuotationController.upsertStoreQuotation);
    fastify.get('/store-quotation/:id/versions', { preHandler: [getSession] }, storeQuotationController.getStoreQuotationVersions);
    fastify.post('/store-quotation/:id/finalize', { preHandler: [getSession] }, storeQuotationController.finalizeStoreQuotation);
    fastify.post('/store-quotation/:id/convert', { preHandler: [getSession] }, storeQuotationController.markStoreQuotationConverted);
    //notes
    fastify.get('/note', { preHandler: [getSession] }, notesController.getnotes);
    fastify.post('/note', { preHandler: [getSession, validateRequestBody(notesSchema)] }, notesController.upsertnotes);
    //attach quote
    fastify.post('/quote/file', { preHandler: [getSession, filesUpload] }, quoteController.attachQuotefiles);
    fastify.post('/v2/quote/file', quoteController.attachGcpQuotefiles);
    //poinvoice
    fastify.get('/poinvoice', { preHandler: [getSession] }, poinvoicecontroller.getPOInvoice);
    fastify.post('/poinvoice', { preHandler: [getSession, filesUpload] }, poinvoicecontroller.upsertPoInvoice);
    fastify.post('/v2/poinvoice', poinvoicecontroller.upsertGcpPoInvoice);
    //Gmail
    fastify.post('/gmail', { preHandler: [getSession, filesUpload] }, sendMail);
    //orderRFID
    // fastify.post('/order-rfid', ordersController.upsertOrderrfid);
    fastify.post('/order-rfid', { preHandler: [getSession] }, ordersController.upsertOrderrfid);
    fastify.post('/order-rfid/line', { preHandler: [getSession] }, ordersController.upsertOrderlinerfid);
    //tickets
    fastify.get('/tickets', { preHandler: [getSession] }, ticketController.getTicketsData);
    fastify.get('/whatsapp/tickets', ticketController.getTicketsData);
    fastify.get('/customer/tickets', { preHandler: [getSession] }, ticketController.getTicketDynamicData);
    fastify.get('/tickets/queue', { preHandler: [getSession] }, ticketController.getQueueTicketsData);
    fastify.get('/tickets/:id/rental-replacement/context', { preHandler: [getSession] }, ticketReplacementController.getRentalReplacementContext);
    fastify.get('/tickets/:id/rental-replacement/history', { preHandler: [getSession] }, ticketReplacementController.getRentalReplacementHistory);
    fastify.post('/tickets/:id/rental-replacement/initiate', { preHandler: [getSession, validateRequestBody(initiateRentalReplacementSchema)] }, ticketReplacementController.initiateRentalReplacement);
    fastify.post('/tickets/:id/rental-replacement/receive-old-asset', { preHandler: [getSession, validateRequestBody(receiveOldAssetSchema)] }, ticketReplacementController.receiveOldAsset);
    fastify.post('/tickets/:id/rental-replacement/assign-technical', { preHandler: [getSession, validateRequestBody(assignTechnicalReplacementSchema)] }, ticketReplacementController.assignTechnicalReplacement);
    fastify.post('/tickets/:id/rental-replacement/assign-commercial', { preHandler: [getSession, validateRequestBody(assignCommercialReplacementSchema)] }, ticketReplacementController.assignCommercialReplacement);
    fastify.post('/tickets/:id/rental-replacement/reject', { preHandler: [getSession, validateRequestBody(rejectReplacementSchema)] }, ticketReplacementController.rejectReplacement);
    fastify.post('/tickets/:id/rental-replacement/return', { preHandler: [getSession, validateRequestBody(returnRentalAssetSchema)] }, ticketReplacementController.returnRentalAsset);
    fastify.post('/tickets/:id/rental-replacement/mark-lost', { preHandler: [getSession, validateRequestBody(markRentalAssetLostSchema)] }, ticketReplacementController.markRentalAssetLost);
    fastify.post('/tickets/:id/rental-replacement/generate-loss-declaration', { preHandler: [getSession, validateRequestBody(generateRentalLossDeclarationSchema)] }, ticketReplacementController.generateRentalLossDeclaration);
    fastify.post('/tickets/:id/rental-replacement/finalize-loss-declaration', { preHandler: [getSession, validateRequestBody(finalizeRentalLossDeclarationSchema)] }, ticketReplacementController.finalizeRentalLossDeclaration);
    fastify.post('/tickets/:id/rental-replacement/assess-damage', { preHandler: [getSession, validateRequestBody(assessRentalDamageSchema)] }, ticketReplacementController.assessRentalDamage);
    fastify.post('/tickets/:id/rental-replacement/link-penalty', { preHandler: [getSession, validateRequestBody(linkPenaltyInvoiceSchema)] }, ticketReplacementController.linkPenaltyInvoice);
    fastify.post('/tickets/:id/rental-replacement/renew', { preHandler: [getSession, validateRequestBody(renewRentalContractSchema)] }, ticketReplacementController.renewRentalContract);
    fastify.post('/tickets/:id/rental-replacement/stop-rental', { preHandler: [getSession, validateRequestBody(stopRentalSchema)] }, ticketReplacementController.stopRental);
    fastify.get('/rental-agreements/create-context', { preHandler: [getSession] }, rentalAgreementController.getRentalAgreementCreateContext);
    fastify.get('/rental-agreements', { preHandler: [getSession] }, rentalAgreementController.getRentalAgreements);
    fastify.get('/rental-agreements/:id', { preHandler: [getSession] }, rentalAgreementController.getRentalAgreementById);
    fastify.post('/rental-agreements', { preHandler: [getSession, validateRequestBody(createRentalAgreementSchema)] }, rentalAgreementController.createRentalAgreement);
    fastify.post('/rental-agreements/:id/generate-pdf', { preHandler: [getSession, validateRequestBody(regenerateRentalAgreementPdfSchema)] }, rentalAgreementController.regenerateRentalAgreementPdf);
    fastify.post('/tickets', { preHandler: [getSession, filesUpload] }, ticketController.upsertTickets);
    fastify.post('/whatsapp/tickets', { preHandler: [filesUpload] }, ticketController.upsertTicketsWhatsapp);
    fastify.post('/v2/tickets', ticketController.upsertGcpTickets);
    // KUBB Tickets (New)
    fastify.post('/kubb_tickets', kubbTicketsController.createTicket);
    fastify.get('/kubb_tickets/:pageNumber/:recordCount', { preHandler: [getSession] }, kubbTicketsController.getAllTickets);
    fastify.get('/kubb_tickets/single/:id', { preHandler: [getSession] }, kubbTicketsController.getSingleTicket);
    fastify.post('/kubb_tickets/update/:id', { preHandler: [getSession] }, kubbTicketsController.updateTicket);
    // Merchant Transaction Id - 
    // fastify.post('/delete/merchantid', { preHandler: [getSession] }, ordersController.deleteBasedOnMerchantId)
    fastify.post('/delete/merchantid', { preHandler: [taskOrSessionAuth] }, ordersController.deleteFailedOrder);
    // Dashboard
    // orders - product_revo
    fastify.get('/dashboard/totalsales', { preHandler: [getSession] }, dashboardController.getPerMonthSalesData);
    fastify.get('/dashboard/monthwise-sales', { preHandler: [getSession] }, dashboardController.getSalesMonthlyData);
    fastify.get('/dashboard/monthwise-sales/location', { preHandler: [getSession] }, dashboardController.getSalesMonthlyLocationData);
    fastify.get('/dashboard/group-by', { preHandler: [getSession] }, dashboardController.getGroupedData);
    fastify.get('/dashboard/groupby-values', { preHandler: [getSession] }, dashboardController.getSalesGroupbyValuesData);
    fastify.get('/dashboard/dynamicvalues', { preHandler: [getSession] }, dashboardController.getDynamicSalesGroupbyValuesData);
    fastify.get('/dashboard/amount-quantity', { preHandler: [getSession] }, dashboardController.getOrderStatusAmountQuantityData);
    fastify.get('/dashboard/quantity', { preHandler: [getSession] }, dashboardController.getOrderStatusQuantityData);
    fastify.get('/dashboard/ticket-count', { preHandler: [getSession] }, dashboardController.getTicketCountData);
    fastify.get('/dashboard/epoch-ticket-count', { preHandler: [getSession] }, dashboardController.getEpochTicketCountData);
    fastify.get('/dashboard/epoch-ticket-count/location', { preHandler: [getSession] }, dashboardController.getEpochTicketCountLocationBasedData);
    fastify.get('/dashboard/product-count', { preHandler: [getSession] }, dashboardController.getProductCountData);
    fastify.get('/dashboard/today-ticket', { preHandler: [getSession] }, dashboardController.getTodayTicketPriorityCountData);
    fastify.get('/dashboard/today-tickettype', { preHandler: [getSession] }, dashboardController.getTodayTicketTypeCountData);
    fastify.get('/dashboard/count/:objectName', { preHandler: [getSession] }, dashboardController.getCountDashboardData);
    // fastify.get('/dashboard/available/count-quantity', dashboardController.getAvalibleTotalAmountCountData)
    fastify.get('/dashboard/available/count-quantity', { preHandler: [getSession] }, dashboardController.getAvailableTotalAmountCountData);
    // fastify.get('/dashboard/available/count-quantity/location', dashboardController.getAvalibleTotalAmountCountLocationBasedData)
    fastify.get('/dashboard/available/count-quantity/location', { preHandler: [getSession] }, dashboardController.getAvailableTotalAmountCountLocationBasedData);
    // fastify.get('/dashboard/available/quantity', dashboardController.getAvalibleCountData)
    fastify.get('/dashboard/available/quantity', { preHandler: [getSession] }, dashboardController.getAvailableCountData);
    // fastify.get('/dashboard/available/quantity/location', dashboardController.getAvalibleCountDataLocation)
    fastify.get('/dashboard/available/quantity/location', { preHandler: [getSession] }, dashboardController.getAvailableCountDataLocation);
    fastify.get('/dashboard/revenue', { preHandler: [getSession] }, dashboardController.getRevenueQuarterData);
    fastify.get('/dashboard/revenue/location', { preHandler: [getSession] }, dashboardController.getRevenueQuarterDataLocation); // new
    fastify.get('/dashboard/sold-details', { preHandler: [getSession] }, dashboardController.getSoldDetailsData);
    fastify.get('/audit-file', { preHandler: [getSession] }, dashboardController.getInvoiceData);
    fastify.get('/audit-file/date', { preHandler: [getSession] }, dashboardController.getInvoiceDateBasedData);
    // any table
    // fastify.get('/dashboard/:objectName', dashboardController.getCountData)
    fastify.get('/dashboard/count-orderstatus', { preHandler: [getSession] }, dashboardController.getCountData);
    fastify.get('/rental-invoice/:uniqueorderid', { preHandler: [getSession] }, ordersController.getInvoiceGeneratedData);
    fastify.post('/rental-invoice', { preHandler: [getSession] }, ordersController.updateInvoiceGeneratedData);
    //service estimation
    fastify.get('/service-estimation', { preHandler: [getSession] }, constEstimationController.getCostEstimationData);
    fastify.post('/service-estimation', { preHandler: [getSession] }, constEstimationController.upsertCostEstimation);
    fastify.post('/v2/service-estimation', { preHandler: [getSession] }, constEstimationController.upsertGcpCostEstimation);
    // fastify.post('/service-estimation',{preHandler:[validateRequestBody(servicecostestimationSchema)]},constEstimationController.upsertCostEstimation);
    // banner
    fastify.get('/banner', bannerController.getAllBanner);
    fastify.post('/banner', bannerController.upsertBanner);
    fastify.delete('/banner/:id', { preHandler: [getSession] }, bannerController.deleteBanner);
    //blogs
    fastify.get('/blogs', blogscontroller.getAllBlogs);
    fastify.post('/blogs', blogscontroller.upsertBlogs);
    fastify.delete('/blog/:id', { preHandler: [getSession] }, blogscontroller.deleteBlog);
    // Google Review
    fastify.get('/reviews', googlereviewController.getReviewsHandler);
    //invoicedata
    fastify.post('/generate/invoice', { preHandler: [getSession] }, revoinvoicecontroller.getRevoInvoiceDataById);
    //revo-invoice
    fastify.get('/revo-invoice', { preHandler: [getSession] }, revoinvoicecontroller.getRevoInvoiceData);
    fastify.get('/whatsapp/revo-invoice', revoinvoicecontroller.getRevoInvoiceData);
    fastify.post('/revo-invoice', { preHandler: [getSession] }, revoinvoicecontroller.upsertRevoInvoice);
    fastify.post('/revo-invoice/:id/rental-documents', { preHandler: [getSession] }, rentalInvoiceDocumentController.generateRentalInvoiceDocuments);
    fastify.post('/consolidated-invoice/list', { preHandler: [getSession] }, consolidatedInvoiceController.listConsolidatedInvoices);
    fastify.post('/consolidated-invoice/preview', { preHandler: [getSession] }, consolidatedInvoiceController.previewConsolidatedInvoice);
    fastify.post('/consolidated-invoice/generate', { preHandler: [getSession] }, consolidatedInvoiceController.generateConsolidatedInvoice);
    //Query Table
    fastify.get('/table', { preHandler: [getSession] }, tablecontoller.getTable);
    //userbased tables
    fastify.get('/table/:role', { preHandler: [getSession] }, tablecontoller.getUserTable);
    //permission
    fastify.get('/permission', { preHandler: [getSession] }, permissionscontroller.getPermissions);
    fastify.post('/permission', { preHandler: [getSession] }, permissionscontroller.upsertPermission);
    //location History
    fastify.get('/locationhistory', { preHandler: [getSession] }, locationhistrorycontroller.getLocationHistoryData);
    fastify.post('/locationhistory', { preHandler: [getSession] }, locationhistrorycontroller.upsertLocatonData);
    //shiprocket
    fastify.post('/calculate-shipping', { preHandler: [getSession] }, async (request, reply) => {
        try {
            const { deliveryPincode, weight, cod } = request.body;
            if (!deliveryPincode) {
                return reply.status(400).send({
                    success: false,
                    message: "Delivery pincode is required",
                });
            }
            const shippingInfo = await shiprocketShippingService.getLowestShippingCost(deliveryPincode, weight || 1, cod || false);
            return reply.status(200).send({
                success: true,
                data: shippingInfo,
            });
        }
        catch (error) {
            console.error("Error in calculate-shipping route:", error);
            return reply.status(500).send({
                success: false,
                message: error.message || "Failed to calculate shipping",
            });
        }
    });
    fastify.get('/test-shiprocket-diagnostics', async (request, reply) => {
        await runShiprocketDiagnostics();
        return reply.send({
            message: 'Diagnostics completed. Check your server console for detailed output.'
        });
    });
    // ─────────────────────────────────────────────────────────────────────
    // PRODUCT REVIEWS (rating table extended)
    // ─────────────────────────────────────────────────────────────────────
    // Customer-facing — open reads
    fastify.get('/products/:productId/reviews', ratingController.getReviewsForProduct);
    fastify.get('/products/:productId/reviews/stats', ratingController.getReviewStats);
    // Customer-facing — session required
    fastify.post('/products/:productId/reviews', { preHandler: [getSession] }, ratingController.createReview);
    fastify.put('/reviews/:reviewId', { preHandler: [getSession] }, ratingController.updateReview);
    fastify.delete('/reviews/:reviewId', { preHandler: [getSession] }, ratingController.deleteReviewCustomer);
    fastify.post('/reviews/:reviewId/report', { preHandler: [getSession] }, ratingController.reportReview);
    fastify.post('/reviews/:reviewId/helpful', { preHandler: [getSession] }, ratingController.markHelpful);
    // Admin-facing — session required
    fastify.get('/admin/reviews', { preHandler: [getSession] }, ratingController.getAdminReviews);
    fastify.post('/admin/products/:productId/reviews', { preHandler: [getSession] }, ratingController.createAdminReview);
    fastify.post('/admin/products/:productId/reviews/bulk', { preHandler: [getSession] }, ratingController.bulkCreateAdminReviews);
    fastify.patch('/admin/reviews/:reviewId/hide', { preHandler: [getSession] }, ratingController.hideReview);
    fastify.patch('/admin/reviews/:reviewId/unhide', { preHandler: [getSession] }, ratingController.unhideReview);
    fastify.post('/admin/reviews/:reviewId/reply', { preHandler: [getSession] }, ratingController.addAdminReply);
    fastify.delete('/admin/reviews/:reviewId', { preHandler: [getSession] }, ratingController.deleteReviewAdmin);
};
export default Revo365Routes;
//# sourceMappingURL=routes.js.map