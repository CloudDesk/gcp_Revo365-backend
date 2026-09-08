import pool from './src/database/postgres.js';

const run = async () => {
  const ticketId = 152;
  const ticket = await pool.query(`SELECT id, ticketnumber, tickettype, replacementrequest, assetnumber, orderlinenumber, linkedorderlineid, replacementtype, replacementstatus, activereplacementid FROM tickets WHERE id = $1`, [ticketId]);
  console.log('TICKET', JSON.stringify(ticket.rows, null, 2));

  const history = await pool.query(`SELECT * FROM rental_replacement_history WHERE ticketid = $1 ORDER BY id DESC`, [ticketId]);
  console.log('HISTORY', JSON.stringify(history.rows, null, 2));

  const linkedId = ticket.rows[0]?.linkedorderlineid;
  if (linkedId) {
    const orderline = await pool.query(`SELECT id, uniqueorderid, orderlinenumber, orderstatus, assetnumber, rentalfor, generatedmonthscount, rentstartdate, rentenddate, isactivebillingline, rentalcontractstatus, parentorderlineid, productamount, orderamount FROM orderline WHERE id = $1`, [linkedId]);
    console.log('LINKED_ORDERLINE', JSON.stringify(orderline.rows, null, 2));
  }

  const relatedOrderlines = await pool.query(`SELECT id, uniqueorderid, orderlinenumber, orderstatus, assetnumber, isactivebillingline, rentalcontractstatus, parentorderlineid FROM orderline WHERE uniqueorderid = (SELECT uniqueorderid FROM orderline WHERE id = $1) ORDER BY id`, [linkedId]);
  console.log('RELATED_ORDERLINES', JSON.stringify(relatedOrderlines.rows, null, 2));

  const stock = await pool.query(`SELECT id, serialnumber, rfid, assetnumber, orderlinenumber, stockstatus, servicestatus, holdreason, holdticketid, stocktype, location, modifieddate FROM stock_revo WHERE assetnumber = $1 OR orderlinenumber = $2 ORDER BY modifieddate DESC NULLS LAST, id DESC`, [ticket.rows[0]?.assetnumber, ticket.rows[0]?.orderlinenumber]);
  console.log('TICKET_STOCK_MATCHES', JSON.stringify(stock.rows, null, 2));

  const oldAsset = history.rows[0]?.oldassetnumber;
  const oldStock = await pool.query(`SELECT id, serialnumber, rfid, assetnumber, orderlinenumber, stockstatus, servicestatus, holdreason, holdticketid, stocktype, location, modifieddate FROM stock_revo WHERE CAST(assetnumber AS text) = CAST($1 AS text) OR CAST(rfid AS text) = CAST($1 AS text) ORDER BY modifieddate DESC NULLS LAST, id DESC`, [oldAsset]);
  console.log('OLD_ASSET_STOCK_MATCHES', JSON.stringify(oldStock.rows, null, 2));

  await pool.end();
};

run().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
