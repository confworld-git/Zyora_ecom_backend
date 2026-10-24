# Razorpay payment setup

Set these variables in the backend deployment environment:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Keep all three values secret where appropriate and never commit them. Configure the Razorpay webhook URL as `https://<backend-host>/api/payments/razorpay/webhook` and subscribe it to the `payment.captured`, `refund.processed`, and `refund.failed` events.

Online checkout reserves inventory before opening Razorpay Checkout. A verified capture commits the reservation; an explicitly cancelled reservation is released immediately, while unpaid reservations expire after 30 minutes. Releasing a reservation also reverses its coupon use. If payment is captured after inventory has been released, the backend requests a refund. If a refund request fails, the order remains in `refunding` so duplicate webhook deliveries cannot create duplicate refunds; review and reconcile that order in Razorpay.
