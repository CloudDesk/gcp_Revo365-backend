import { ErrorHandler } from '../errorHandler/errorHandler.js';
import { getSessionData } from '../services/session.service.js';
 
export module sessionController {
    export const getSessionController = async (req: any, rep: any) => {
        try {
            console.log('Inside Session Controller',req)
            console.log('Inside Session Controller',req.query)
 
            // let getSessionDataResult = await sessionService.getSessionData(req);
            let getSessionDataResult = await getSessionData(req)
         
            console.log(getSessionDataResult, "getSessionDataResultgetSessionDataResult");
            rep.send(getSessionDataResult);
        } catch (error) {
            console.log('ERROR IN Controller getSessionData');
            let errordata = await ErrorHandler.handleQueryError(error);
            rep.status(404).send(errordata);
        }
    }
}