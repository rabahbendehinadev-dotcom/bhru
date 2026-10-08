import type { PoolClient } from '@workspace/db';
import { HttpError } from '../auth';
import { currencies } from '../commerce/currencies';
import { money, walletCurrency } from './wallet';

/** A single MVCC SQL snapshot. Diagnostic only: no locks, UPDATEs or repairs. */
export async function reconcileWallet(sub:string,id:string,db:PoolClient) {
  const row=(await db.query(`WITH w AS (
      SELECT * FROM customer_wallets WHERE subscriber_id=$1 AND customer_id=$2
    ), l AS (
      SELECT e.* FROM customer_wallet_ledger e JOIN w USING(subscriber_id,customer_id)
    ), totals AS (
      SELECT coalesce(sum(CASE WHEN direction='credit' THEN amount_account_units ELSE -amount_account_units END),0) signed,
        count(*)::int entries,count(*) FILTER(WHERE posting_sequence IS NULL)::int legacy,
        count(*) FILTER(WHERE account_currency_snapshot->>'code' IS DISTINCT FROM
          (SELECT accounting_currency FROM w))::int currency_issues,
        coalesce(sum(CASE WHEN direction='credit' THEN amount_account_units ELSE -amount_account_units END)
          FILTER(WHERE posting_sequence IS NULL),0) legacy_signed FROM l
    ), ordered AS (
      SELECT l.*,lag(balance_after) OVER(ORDER BY posting_sequence) previous_after,
        lag(posting_sequence) OVER(ORDER BY posting_sequence) previous_sequence
      FROM l WHERE posting_sequence IS NOT NULL
    ), chain AS (
      SELECT count(*) FILTER(WHERE
        posting_sequence<>coalesce(previous_sequence,0)+1 OR
        balance_after-CASE WHEN direction='credit' THEN amount_account_units ELSE -amount_account_units END
          <>coalesce(previous_after,(SELECT legacy_signed FROM totals)+coalesce(
            (SELECT opening_account_units FROM customer_wallet_baselines WHERE subscriber_id=$1 AND customer_id=$2),0))
      )::int chain_issues FROM ordered
    ), orders AS (
      SELECT count(*) FILTER(WHERE d.id IS NULL OR d.type<>'order_debit' OR d.reference_id<>o.id
        OR d.amount_account_units<>o.price_account_units OR d.account_currency_snapshot<>o.account_currency_snapshot
        OR (o.status='rejected' AND (r.id IS NULL OR r.original_debit_id<>d.id
          OR r.amount_account_units<>d.amount_account_units OR r.account_currency_snapshot<>d.account_currency_snapshot))
        OR (o.status<>'rejected' AND r.id IS NOT NULL))::int order_issues
      FROM service_orders o
      LEFT JOIN l d ON d.id=o.wallet_debit_reference
      LEFT JOIN l r ON r.reference_id=o.id AND r.type='order_refund'
      WHERE o.subscriber_id=$1 AND o.customer_id=$2
    )
    SELECT w.available_balance::text stored,w.accounting_currency,
      b.opening_account_units::text opening,b.basis,b.account_currency baseline_currency,b.recorded_at,
      totals.signed::text signed,totals.entries,totals.legacy,totals.currency_issues,
      chain.chain_issues,orders.order_issues
    FROM w LEFT JOIN customer_wallet_baselines b USING(subscriber_id,customer_id)
    CROSS JOIN totals CROSS JOIN chain CROSS JOIN orders`,[sub,id])).rows[0];
  if(!row)throw new HttpError(404,'Client wallet not found.');
  const known=row.basis==='guarded_zero_origin'&&row.baseline_currency===row.accounting_currency;
  const derived=known?BigInt(row.opening)+BigInt(row.signed):null;
  const difference=derived===null?null:BigInt(row.stored)-derived;
  const currency=walletCurrency(await currencies(sub,db),row.accounting_currency);
  const format=(n:bigint)=>`${n<0n?'-':''}${money(n<0n?-n:n,currency)}`;
  return {
    status:!known?'UNVERIFIED':difference!==0n||row.currency_issues||row.chain_issues||row.order_issues?'MISMATCH':'MATCH',
    accountCurrency:row.accounting_currency,storedBalance:row.stored,
    ledgerDerivedBalance:derived?.toString()??null,difference:difference?.toString()??null,
    formattedStoredBalance:format(BigInt(row.stored)),formattedLedgerDerivedBalance:derived===null?null:format(derived),
    formattedDifference:difference===null?null:format(difference),
    openingBalance:known?row.opening:null,baselineBasis:row.basis??null,baselineRecordedAt:row.recorded_at??null,
    entryCount:row.entries,legacyEntryCount:row.legacy,currencyIssues:row.currency_issues,
    sequenceIssues:row.chain_issues,orderIssues:row.order_issues,
    readOnly:true,
  };
}
