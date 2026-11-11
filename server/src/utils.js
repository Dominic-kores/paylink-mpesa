// Mask the customer's phone number
export const maskPhone = (phone) =>
  `${phone.slice(0, 4)}****${phone.slice(-4)}`;

// Return payment details without exposing the full phone
export const publicPayment = (payment) => ({
  id: payment.id,
  status: payment.status,
  amount: payment.amount,
  resultDesc: payment.resultDesc,
  receipt: payment.mpesaReceiptNumber,
  paidAt: payment.paidAt,
  createdAt: payment.createdAt,
});
