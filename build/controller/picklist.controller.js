import { picklistservice } from "../services/picklist.service.js";
export var picklistControler;
(function (picklistControler) {
    picklistControler.getPicklistforobject = async (request, reply) => {
        try {
            console.log('Get Product picklist');
            let getPicklistData = await picklistservice.getProductPicklist(request);
            reply.send(getPicklistData);
        }
        catch (error) {
            console.error('ERROR IN  Controller getPicklistforobject', error);
            reply.send(error.message);
        }
    };
    picklistControler.getAllPicklist = async (request, reply) => {
        try {
            let getPicklistData = await picklistservice.getAllPicklist(request);
            reply.send(getPicklistData);
        }
        catch (error) {
            console.error('ERROR IN  Controller getAllPicklist', error);
            reply.send(error.message);
        }
    };
})(picklistControler || (picklistControler = {}));
//# sourceMappingURL=picklist.controller.js.map