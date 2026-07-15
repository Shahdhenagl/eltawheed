export function allocatePayment(paymentOrder: any, allOrders: any[]) {
  if (paymentOrder.type !== 'payment') return { toSales: 0, toOldDebt: 0 };

  // 1. Check if the payment note targets a specific invoice
  const match = paymentOrder.notes?.match(/سداد أجل للفاتورة رقم #([\w-]+)/);
  if (match && match[1]) {
    const invoiceId = match[1];
    const targetOrder = allOrders.find(o => o.id === invoiceId && !o.is_deleted);
    if (targetOrder) {
      const paidAmount = paymentOrder.paid_amount || 0;
      return { toSales: paidAmount, toOldDebt: 0 };
    }
  }

  const customerId = paymentOrder.customer?.id;
  if (!customerId) {
    return { toSales: paymentOrder.paid_amount, toOldDebt: 0 };
  }

  // 2. Chronological allocation across customer's unpaid orders
  const customerOrders = allOrders
    .filter(o => !o.is_deleted && o.customer?.id === customerId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const unpaidSales: { id: string, amountOwed: number }[] = [];

  for (const o of customerOrders) {
    if (o.id === paymentOrder.id) break; // Stop when we reach THIS payment

    if (o.type === 'sale') {
      const owed = o.total - o.paid_amount;
      if (owed > 0) {
        unpaidSales.push({
          id: o.id,
          amountOwed: owed
        });
      }
    } else if (o.type === 'payment') {
      let paymentLeft = o.paid_amount;
      // Deduct from unpaid sales in chronological order
      for (const sale of unpaidSales) {
        if (paymentLeft <= 0) break;
        const deducted = Math.min(paymentLeft, sale.amountOwed);
        sale.amountOwed -= deducted;
        paymentLeft -= deducted;
      }
    }
  }

  // Now allocate the current payment to the remaining unpaid sales
  let currentPaymentLeft = paymentOrder.paid_amount;
  let allocatedToSales = 0;

  for (const sale of unpaidSales) {
    if (currentPaymentLeft <= 0) break;
    if (sale.amountOwed > 0) {
      const allocated = Math.min(currentPaymentLeft, sale.amountOwed);
      allocatedToSales += allocated;
      currentPaymentLeft -= allocated;
    }
  }

  const toOldDebt = currentPaymentLeft;

  return {
    toSales: allocatedToSales,
    toOldDebt
  };
}
