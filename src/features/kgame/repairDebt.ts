// Repairs retain their original customer ids. Count debt only when the legacy
// identity still matches the unified customer, rather than guessing an id link.
export const repairCustomerMatches = `EXISTS(SELECT 1 FROM customers legacy JOIN partners customer ON customer.id = legacy.id
  WHERE legacy.id = rt.customer_id AND customer.is_customer = 1 AND legacy.customer_code IS NOT NULL AND legacy.customer_code = customer.partner_code)`;
export const repairPaidExpression = `(SELECT COALESCE(SUM(CASE WHEN ct.flow_type = 'IN' THEN ct.amount_cents ELSE -ct.amount_cents END),0)
  FROM cash_transactions ct WHERE LOWER(ct.reference_type) IN ('repair','repair_ticket') AND ct.reference_id = rt.id
  AND ct.category = 'REPAIR_FEE' AND COALESCE(ct.status,'ACTIVE') != 'CANCELLED')`;
export const repairDebtExpression = `CASE WHEN rt.owner_type = 'CUSTOMER' AND rt.status != 'CANCELLED' AND ${repairCustomerMatches}
  THEN MAX(0, rt.repair_price_cents - ${repairPaidExpression}) ELSE 0 END`;
export const partnerRepairDebtExpression = `(SELECT COALESCE(SUM(${repairDebtExpression}),0) FROM repair_tickets rt WHERE rt.customer_id = p.id)`;
