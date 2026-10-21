import type { Order } from './store.ts';

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

const styles = `
  body { font: 15px/1.5 system-ui, sans-serif; background: #f4f4f6; color: #1d1d22; margin: 0; }
  main { max-width: 420px; margin: 48px auto; padding: 0 16px; }
  .card { background: #fff; border: 1px solid #e3e3e8; border-radius: 14px; padding: 24px; }
  .badge { display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: .04em;
    text-transform: uppercase; background: #fff4d6; color: #7a5200; border-radius: 6px; padding: 2px 8px; }
  h1 { font-size: 28px; margin: 12px 0 4px; }
  .muted { color: #5c5c66; font-size: 14px; }
  fieldset { border: 0; padding: 0; margin: 20px 0; }
  legend { font-weight: 600; margin-bottom: 8px; }
  label { display: block; padding: 6px 0; }
  .actions { display: grid; gap: 8px; margin-top: 8px; }
  button { font: inherit; font-weight: 600; height: 44px; border-radius: 10px; border: 1px solid #c9c9d1;
    background: #fff; cursor: pointer; }
  button.primary { background: #1d6b45; border-color: #1d6b45; color: #fff; }
  button:focus-visible { outline: 2px solid #1d6b45; outline-offset: 2px; }
`;

function layout(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(title)}</title>
  <style>${styles}</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

export function checkoutPage(order: Order) {
  return layout(
    'Test payment',
    `<div class="card">
      <span class="badge">Test mode · no real money</span>
      <h1>${rupees(order.amount)}</h1>
      <p class="muted">Order ${escape(order.id)}<br>Expires ${order.expiresAt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>
      <form method="post">
        <fieldset>
          <legend>Webhook delivery</legend>
          <label><input type="radio" name="delivery" value="normal" checked> Send right away</label>
          <label><input type="radio" name="delivery" value="late"> Send late</label>
          <label><input type="radio" name="delivery" value="duplicate"> Send three times</label>
          <label><input type="radio" name="delivery" value="drop"> Don't send (merchant has to reconcile)</label>
        </fieldset>
        <div class="actions">
          <button class="primary" name="outcome" value="pay">Pay ${rupees(order.amount)}</button>
          <button name="outcome" value="fail">Decline the payment</button>
          <button name="outcome" value="cancel">Cancel and go back</button>
        </div>
      </form>
    </div>`,
  );
}

export function messagePage(title: string, message: string) {
  return layout(title, `<div class="card"><h1>${escape(title)}</h1><p class="muted">${escape(message)}</p></div>`);
}
