export type M4Classification = "matched"|"missing"|"duplicated"|"reversed"|"unmatched"|"misclassified";

export const classifyM4Document = ({difference,directJournalCount,hasRelatedControlLine,hasOtherSource,reversed}:{difference:number;directJournalCount:number;hasRelatedControlLine:boolean;hasOtherSource:boolean;reversed:boolean}):M4Classification => {
  if(Math.abs(difference)<=0.01) return "matched";
  if(reversed) return "reversed";
  if(directJournalCount>1) return "duplicated";
  if(directJournalCount===0&&hasOtherSource) return "misclassified";
  if(directJournalCount===0) return "missing";
  return hasRelatedControlLine?"unmatched":"missing";
};

export const requiredM4Movement = (controlType:"ar"|"ap", ledgerMinusDocuments:number) => ({
  amount: Math.round(Math.abs(ledgerMinusDocuments)*100)/100,
  side: (ledgerMinusDocuments<0 ? (controlType==="ar"?"debit":"credit") : (controlType==="ar"?"credit":"debit")) as "debit"|"credit",
});
