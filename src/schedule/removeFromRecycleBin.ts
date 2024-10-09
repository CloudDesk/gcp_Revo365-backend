import cron from 'node-cron'
import { stockRevoService } from '../services/stockRevo.service.js';
async function removethirtydaysrecord() {
    console.log('Cron job executed at:', new Date().toLocaleString());

    let result = await stockRevoService.updateRemoveFromRecyclebin()
    console.log(result, 'Result is ');
}

cron.schedule('* * * * *', () => {
    removethirtydaysrecord();
});
cron.schedule('0 19 * * *', () => {
    removethirtydaysrecord();
});


