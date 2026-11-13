/**
 * Stock & Transaction utility helpers
 */

export function generateTransactionId() {
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randPart = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `TRX-${datePart}-${randPart}`;
}

export function parseTxnDetails(item) {
  if (!item) return { txnId: '-', user: 'Admin', comment: '' };

  const transferredBy = item.transferred_by || '';
  const remarks = item.remarks || '';
  const combined = `${transferredBy} ${remarks}`;

  // 1. Extract Transaction ID (matches [TRX-...] or TRX-...)
  const txnMatch = combined.match(/\[(?:TRX-ID:\s*)?(TRX-[^\]]+)\]/i) || combined.match(/\b(TRX-[A-Z0-9-]+)\b/i);
  const txnId = txnMatch ? txnMatch[1].trim() : (item.id ? `TRX-#${item.id}` : '-');

  // 2. Extract User
  let user = item.transferred_by_user || item.created_by || '';
  if (!user && transferredBy) {
    user = transferredBy.split('[')[0].trim();
  }
  if (!user) user = 'Admin';

  // 3. Extract Comments / Remarks
  let comment = '';
  // Check for "| Note: <comment>" in transferred_by
  const noteMatch = transferredBy.match(/\|\s*Note:\s*(.*)$/i);
  if (noteMatch && noteMatch[1].trim()) {
    comment = noteMatch[1].trim();
  } else if (remarks) {
    comment = remarks
      .replace(/\[TRX-ID:[^\]]+\]\s*/i, '')
      .replace(/^Transfer to [^:]+:\s*/i, '')
      .replace(/^Shipped to [^:]+:\s*/i, '')
      .replace(/^Received from [^:]+:\s*/i, '')
      .trim();
  }

  return { txnId, user, comment };
}

