export type ChartAccountLifecycleFixture = {
  organizationId: number;
  chartAccount: {
    id: number;
    accountcode: string;
    accountname: string;
    accounttype: "expense";
    accountsubtype: "expense";
    status: "active";
    issystem: false;
    isusercreatedchartaccount: true;
  };
  bankCashAccounts: Array<{
    id: number;
    organizationid: number;
    financeaccountid: number;
    accountname: string;
    accounttype: "bank" | "cash";
    openingbalance: number;
    openingbalancedate: string;
    currentbalance: number;
  }>;
  bankTransactions: Array<{
    id: number;
    organizationid: number;
    bankcashaccountid: number;
    journalentryid: number;
    transactiondate: string;
    posteddate: number;
    entryside: "debit" | "credit";
    amount: number;
    balanceafter: number;
    partytype: "ledger";
    counterpartyaccountid: number;
    allocationmethod: "direct_ledger";
    sourcetype: "manual";
    postingstatus: "posted";
  }>;
  journalEntries: Array<{
    id: number;
    organizationid: number;
    sourceid: number;
    sourcetype: "bank_transaction" | "manual_journal";
    status: "posted";
  }>;
  journalLines: Array<{
    id: number;
    journalentryid: number;
    financeaccountid: number;
    debitamount: number;
    creditamount: number;
  }>;
  expenseBills: Array<{ id: number; expenseaccountid: number }>;
  reconciliationSettings: Array<{
    id: number;
    arcounterpartaccountid: number | null;
    apcounterpartaccountid: number | null;
  }>;
};

const chartAccount = {
  id: 41,
  accountcode: "OFFICE-RENT",
  accountname: "Office Rent",
  accounttype: "expense" as const,
  accountsubtype: "expense" as const,
  status: "active" as const,
  issystem: false as const,
  isusercreatedchartaccount: true as const,
};

const makeJournalLines = (
  journalEntryId: number,
  bankFinanceAccountId: number,
  amount: number,
  firstId: number
) => [
  {
    id: firstId,
    journalentryid: journalEntryId,
    financeaccountid: bankFinanceAccountId,
    debitamount: 0,
    creditamount: amount,
  },
  {
    id: firstId + 1,
    journalentryid: journalEntryId,
    financeaccountid: chartAccount.id,
    debitamount: amount,
    creditamount: 0,
  },
];

export const createSingleBankDirectLedgerFixture = (): ChartAccountLifecycleFixture => ({
  organizationId: 7,
  chartAccount: { ...chartAccount },
  bankCashAccounts: [
    {
      id: 11,
      organizationid: 7,
      financeaccountid: 101,
      accountname: "Main Bank",
      accounttype: "bank",
      openingbalance: 10_000,
      openingbalancedate: "2026-01-01",
      currentbalance: 7_000,
    },
  ],
  bankTransactions: [
    {
      id: 501,
      organizationid: 7,
      bankcashaccountid: 11,
      journalentryid: 701,
      transactiondate: "2026-09-01",
      posteddate: 1_788_199_200,
      entryside: "credit",
      amount: 3_000,
      balanceafter: 7_000,
      partytype: "ledger",
      counterpartyaccountid: chartAccount.id,
      allocationmethod: "direct_ledger",
      sourcetype: "manual",
      postingstatus: "posted",
    },
  ],
  journalEntries: [
    {
      id: 701,
      organizationid: 7,
      sourceid: 501,
      sourcetype: "bank_transaction",
      status: "posted",
    },
  ],
  journalLines: makeJournalLines(701, 101, 3_000, 901),
  expenseBills: [],
  reconciliationSettings: [],
});

export const createMultiBankDirectLedgerFixture = (): ChartAccountLifecycleFixture => {
  const fixture = createSingleBankDirectLedgerFixture();
  fixture.bankCashAccounts.push({
    id: 12,
    organizationid: 7,
    financeaccountid: 102,
    accountname: "Petty Cash",
    accounttype: "cash",
    openingbalance: 5_000,
    openingbalancedate: "2026-01-01",
    currentbalance: 3_500,
  });
  fixture.bankTransactions.push({
    id: 502,
    organizationid: 7,
    bankcashaccountid: 12,
    journalentryid: 702,
    transactiondate: "2026-09-02",
    posteddate: 1_788_285_600,
    entryside: "credit",
    amount: 1_500,
    balanceafter: 3_500,
    partytype: "ledger",
    counterpartyaccountid: chartAccount.id,
    allocationmethod: "direct_ledger",
    sourcetype: "manual",
    postingstatus: "posted",
  });
  fixture.journalEntries.push({
    id: 702,
    organizationid: 7,
    sourceid: 502,
    sourcetype: "bank_transaction",
    status: "posted",
  });
  fixture.journalLines.push(...makeJournalLines(702, 102, 1_500, 903));
  return fixture;
};

export const createBlockingReferenceFixture = (): ChartAccountLifecycleFixture => {
  const fixture = createSingleBankDirectLedgerFixture();
  fixture.journalEntries.push({
    id: 703,
    organizationid: 7,
    sourceid: 703,
    sourcetype: "manual_journal",
    status: "posted",
  });
  fixture.journalLines.push(
    {
      id: 905,
      journalentryid: 703,
      financeaccountid: chartAccount.id,
      debitamount: 250,
      creditamount: 0,
    },
    {
      id: 906,
      journalentryid: 703,
      financeaccountid: 199,
      debitamount: 0,
      creditamount: 250,
    }
  );
  fixture.expenseBills.push({ id: 801, expenseaccountid: chartAccount.id });
  fixture.reconciliationSettings.push({
    id: 301,
    arcounterpartaccountid: chartAccount.id,
    apcounterpartaccountid: null,
  });
  return fixture;
};

/**
 * Test-only contract for the read-only reference inspector implemented in a
 * later phase. Keeping it beside the fixtures avoids introducing lifecycle
 * behavior into production code during Phase 0.
 */
export const inspectFixtureChartAccountReferences = (
  fixture: ChartAccountLifecycleFixture,
  chartAccountId: number
) => {
  const journalById = new Map(
    fixture.journalEntries.map((entry) => [entry.id, entry])
  );
  const directLedgerTransactionIds = new Set(
    fixture.bankTransactions
      .filter(
        (transaction) =>
          transaction.counterpartyaccountid === chartAccountId &&
          transaction.partytype === "ledger" &&
          transaction.allocationmethod === "direct_ledger"
      )
      .map((transaction) => transaction.id)
  );
  const directLedgerJournalIds = new Set(
    fixture.journalEntries
      .filter(
        (entry) =>
          entry.sourcetype === "bank_transaction" &&
          directLedgerTransactionIds.has(entry.sourceid)
      )
      .map((entry) => entry.id)
  );
  const manualJournalLineIds = fixture.journalLines
    .filter((line) => {
      const journal = journalById.get(line.journalentryid);
      return (
        line.financeaccountid === chartAccountId &&
        journal?.sourcetype === "manual_journal"
      );
    })
    .map((line) => line.id);
  const expenseBillIds = fixture.expenseBills
    .filter((bill) => bill.expenseaccountid === chartAccountId)
    .map((bill) => bill.id);
  const reconciliationSettingIds = fixture.reconciliationSettings
    .filter(
      (setting) =>
        setting.arcounterpartaccountid === chartAccountId ||
        setting.apcounterpartaccountid === chartAccountId
    )
    .map((setting) => setting.id);

  return {
    cascadeSafe: {
      bankTransactionIds: [...directLedgerTransactionIds],
      journalEntryIds: [...directLedgerJournalIds],
      journalLineIds: fixture.journalLines
        .filter((line) => directLedgerJournalIds.has(line.journalentryid))
        .map((line) => line.id),
    },
    blocking: {
      manualJournalLineIds,
      expenseBillIds,
      reconciliationSettingIds,
    },
  };
};
