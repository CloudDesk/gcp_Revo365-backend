import { validateRequestBody } from "../schemas/ajv.schema.js";
import { filesUpload } from "../multer/Multer.js";
import { gets3DataStream, gets3Dataurl } from "../aws/getDatafroms3.js";
import { picklistControler } from "../controller/picklist.controller.js";
import { recordCount } from "../controller/recordcount.controller.js";
import { globalSearchController } from "../controller/globalsearch.controller.js";
import { recycleBinController } from "../controller/recyclebin.controller.js";
import { cartController } from "../controller/cart.controller.js";
import { wishListController } from "../controller/wishlist.controller.js";
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
import { inventoryusersSchema } from "../schemas/inventoryusers.schema.js";
import { notesSchema } from "../schemas/notes.schems.js";
import { locationhistrorycontroller } from "../controller/locationhistory.controller.js";
import { getSession } from "../database/redis.session.js";
// import { getSession } from "../cloudflare/cloudflare.session.js";
const Revo365Routes = async function (fastify, opts) {
    console.log('Routes called ');
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
    fastify.get('/test', { preHandler: [getSession] }, (req, reply) => {
        reply.status(200).send('test');
    });
    // verison 2 -> product
    fastify.get('/v2/product', { preHandler: [getSession] }, productrevoController.getProductsrevoData);
    fastify.get('/v2/product-ecommerce', productrevoController.getProductsrevoData);
    fastify.get('/v2/product/Archieve', { preHandler: [getSession] }, productrevoController.getArcheivedProductsRevo);
    fastify.get('/v2/product-ecom/:id', productrevoController.getEachProductsRevo);
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
    //version 2 -> stock
    fastify.get('/v2/stock', { preHandler: [getSession] }, stockRevoController.getStockRevoData);
    fastify.get('/v2/stock/:id', { preHandler: [getSession] }, stockRevoController.getEachStockRevoData);
    fastify.post('/v2/stock', { preHandler: [getSession, validateRequestBody(stockrevoSchema)] }, stockRevoController.upsertStockRevoData);
    // fastify.post('/v2/stock',stockRevoController.upsertStockRevoData);
    fastify.delete('/v2/stock/:id', { preHandler: [getSession] }, stockRevoController.deleteStockRevoData);
    fastify.get('/v2/stock/Archieve', { preHandler: [getSession] }, stockRevoController.getArcheivedStocksRevo);
    fastify.get('/stock/updaterecyclebin', { preHandler: [getSession] }, stockRevoController.updateRemovedFromRecyclebinRevo);
    fastify.delete('/v2/stock/isdelete', { preHandler: [validateRequestBody(deletestockrevoSchema), getSession] }, stockRevoController.upsertStockRevoDatadelete);
    fastify.post('/v2/stock/isarchive', { preHandler: [validateRequestBody(archivestockrevoSchema), getSession] }, stockRevoController.upsertStockRevoDataarchive);
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
    //wishlist
    fastify.get('/wishlist', { preHandler: [getSession] }, wishListController.getWishlistData);
    fastify.get('/wishlist/:userId', { preHandler: [getSession] }, wishListController.getUserWishlistData);
    fastify.delete('/wishlist/:id', { preHandler: [getSession] }, wishListController.deleteFromWishlist);
    fastify.post('/wishlist', { preHandler: [getSession] }, wishListController.upsertToWishlist);
    //users
    fastify.get('/users', { preHandler: [getSession] }, userController.getUsersData);
    fastify.get('/users/:useremail/:userpassword', userController.getLoggedInUsersData);
    fastify.post('/users', userController.upsertUser);
    fastify.post('/users/fcmid', userController.upsertFcmidUser);
    fastify.get('/users/logout', userController.userlogout);
    fastify.delete('/users/:id', userController.deleteUserData);
    fastify.post('/user-forgot', userController.forgotuser);
    //Invetroyusers
    fastify.get('/inventoryusers', { preHandler: [getSession] }, InventoryuserController.getInventoryUsersData);
    fastify.get('/inventoryusers/tickets', { preHandler: [getSession] }, InventoryuserController.getInventoryUsersDataTickets);
    fastify.get('/inventoryusers/:useremail/:userpassword', InventoryuserController.getLoggedInInventoryUsersData);
    fastify.post('/inventoryusers', InventoryuserController.upsertInventoryUser);
    fastify.delete('/inventoryusers/:id', InventoryuserController.deleteInventoryUserData);
    fastify.post('/inventoryusers-forgot', InventoryuserController.forgotuser);
    fastify.get('/inventoryusers/logout', InventoryuserController.userlogout);
    //address
    fastify.get('/address', { preHandler: [getSession] }, addressController.getAddressData);
    fastify.get('/address/:userId', { preHandler: [getSession] }, addressController.getUserAddressData);
    fastify.post('/address', { preHandler: [getSession, validateRequestBody(inventoryusersSchema)] }, addressController.upsertAddress);
    fastify.delete('/address/:id', { preHandler: [getSession] }, addressController.deleteAddress);
    //orders
    // fastify.get('/orders', ordersController.getOrderData)
    fastify.get('/orders', { preHandler: [getSession] }, ordersController.getUserOrderData);
    fastify.get('/orders/overall', { preHandler: [getSession] }, ordersController.getOrderData);
    fastify.get('/orderline', { preHandler: [getSession] }, ordersController.getorderlinedata);
    fastify.get('/orderline/Inventory', { preHandler: [getSession] }, ordersController.getInvorderlinedata);
    fastify.get('/customer/orderline', { preHandler: [getSession] }, ordersController.getOrderlineDynamicData);
    fastify.post('/orderline', { preHandler: [getSession] }, ordersController.updateorderlineitem);
    fastify.get('/v2/orders', { preHandler: [getSession] }, ordersController.getUserOrderData1);
    fastify.post('/orders', { preHandler: [getSession] }, ordersController.upsertOrder);
    fastify.post('/v2/orders', { preHandler: [getSession] }, ordersController.upsertOrderv2);
    fastify.delete('/orders/:id', { preHandler: [getSession] }, ordersController.deleteOrder);
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
    fastify.post('/payment/status', transactionController.paymentConfirmation);
    //transaction
    fastify.get('/transaction', { preHandler: [getSession] }, transactionController.getTransactionData);
    fastify.post('/transaction', { preHandler: [getSession] }, transactionController.inserttransaction);
    //purchase Request
    fastify.get('/purchase-request', { preHandler: [getSession] }, purcahseRequestController.getPurchaseRequestData);
    fastify.post('/purchase-request', { preHandler: [getSession, validateRequestBody(prInsertSchema)] }, purcahseRequestController.upsertPurchaseRequestData);
    //generate PR
    fastify.post('/generate/purchase-request', { preHandler: [getSession, validateRequestBody(generatePRSchema)] }, generatePRController.generatepr);
    //quote
    fastify.get('/quote', { preHandler: [getSession] }, quoteController.getQuotes);
    fastify.post('/quote', { preHandler: [getSession] }, quoteController.upsertQuotes);
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
    fastify.get('/customer/tickets', { preHandler: [getSession] }, ticketController.getTicketDynamicData);
    fastify.get('/tickets/queue', { preHandler: [getSession] }, ticketController.getQueueTicketsData);
    fastify.post('/tickets', { preHandler: [getSession, filesUpload] }, ticketController.upsertTickets);
    fastify.post('/v2/tickets', ticketController.upsertGcpTickets);
    // Merchant Transaction Id - 
    fastify.post('/delete/merchantid', { preHandler: [getSession] }, ordersController.deleteBasedOnMerchantId);
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
    //service estimation
    fastify.get('/service-estimation', { preHandler: [getSession] }, constEstimationController.getCostEstimationData);
    fastify.post('/service-estimation', { preHandler: [getSession] }, constEstimationController.upsertCostEstimation);
    // fastify.post('/service-estimation',{preHandler:[validateRequestBody(servicecostestimationSchema)]},constEstimationController.upsertCostEstimation);
    //invoicedata
    fastify.post('/generate/invoice', { preHandler: [getSession] }, revoinvoicecontroller.getRevoInvoiceDataById);
    //revo-invoice
    fastify.get('/revo-invoice', { preHandler: [getSession] }, revoinvoicecontroller.getRevoInvoiceData);
    fastify.post('/revo-invoice', { preHandler: [getSession] }, revoinvoicecontroller.upsertRevoInvoice);
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
    /* decorator
    fastify.decorateRequest('gotch', 'data')

    fastify.decorate('util', (request, key, value) => {
        return request[key] = value
    })
    fastify.decorate('data', () => {
        return 'Yeah got it !!!! updated one set value is '
    })
    fastify.post('/plugin1', function (request, reply) {
        console.log('plugin');
        console.log(request.utildata);
        reply.send({ Timestamp: request.timestamp, utildata: request.utildata, testdatass: request.testdatass })
    })

    
    fastify.get('/plugin2', (request, reply) => {
        reply.send(request)
    })
 */
};
export default Revo365Routes;
//# sourceMappingURL=routes.js.map