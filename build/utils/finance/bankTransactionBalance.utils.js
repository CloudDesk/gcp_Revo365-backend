import { FinanceValidationError, calculateAvailableBalance, toFinanceDateOnly, toMoney, } from "./finance.utils.js";
export const assertTransactionDateIsWithinAccountHistory = (transactionDate, openingBalanceDate) => {
    const openingDate = toFinanceDateOnly(openingBalanceDate);
    if (openingDate && transactionDate < openingDate) {
        throw new FinanceValidationError(`Transaction date cannot be earlier than this account's opening balance date (${openingDate}).`);
    }
};
/**
 * Rebuilds the denormalized per-transaction and current Bank/Cash balances in
 * transaction-date order. Call this while the bank_cash_accounts row is locked.
 */
export const rebuildBankCashAccountBalances = async (client, bankCashAccount, actor, epoch) => {
    const transactionsResult = await client.query(`SELECT id, transactiondate, entryside, amount
     FROM bank_transactions
     WHERE bankcashaccountid = $1 AND postingstatus = 'posted'
     ORDER BY transactiondate ASC, posteddate ASC, id ASC`, [bankCashAccount.id]);
    let currentBalance = toMoney(bankCashAccount.openingbalance, "openingbalance");
    const balances = new Map();
    for (const transaction of transactionsResult.rows) {
        const transactionDate = toFinanceDateOnly(transaction.transactiondate);
        if (transactionDate) {
            assertTransactionDateIsWithinAccountHistory(transactionDate, bankCashAccount.openingbalancedate);
        }
        currentBalance = calculateAvailableBalance(currentBalance, transaction.entryside, transaction.amount);
        balances.set(Number(transaction.id), currentBalance);
        await client.query(`UPDATE bank_transactions SET balanceafter = $1 WHERE id = $2`, [currentBalance, transaction.id]);
    }
    await client.query(`UPDATE bank_cash_accounts
     SET currentbalance = $1,
         version = version + 1,
         modifiedby = $2,
         modifieddate = $3
     WHERE id = $4`, [currentBalance, actor, epoch, bankCashAccount.id]);
    return { currentBalance, balances };
};
//# sourceMappingURL=bankTransactionBalance.utils.js.map