import cron from 'node-cron'
import { stockRevoService } from '../services/stockRevo.service.js';
async function removethirtydaysrecord() {
    let result = await stockRevoService.updateRemoveFromRecyclebin()
}

cron.schedule('* * * * *', () => {
    removethirtydaysrecord();
});
cron.schedule('0 19 * * *', () => {
    removethirtydaysrecord();
});


