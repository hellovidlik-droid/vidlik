import * as admin from "firebase-admin";

const SA = process.env.FIREBASE_SA_JSON ? JSON.parse(process.env.FIREBASE_SA_JSON) : null;
if (!admin.apps.length) {
  if (!SA) throw new Error("Missing FIREBASE_SA_JSON");
  admin.initializeApp({ credential: admin.credential.cert(SA) });
}
const db = admin.firestore();
const auth = admin.auth();

function isApproved(s = "") {
  const v = String(s).toLowerCase();
  return ["approved", "accept", "success", "purchase", "settle", "ok"].some(x => v.includes(x));
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const p = typeof req.body === "object" ? req.body : {};
    const orderRef    = p.orderReference || p.orderRef || null;
    const amount      = Number(p.amount || p.orderAmount || 0);
    const currency    = p.currency || p.orderCurrency || "UAH";
    const statusRaw   = p.transactionStatus || p.status || p.reason || "";
    const clientEmail = p.clientEmail || p.email || "";

    const ok = isApproved(statusRaw);
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60 * 1000);

    let uid = null;
    if (clientEmail) {
      try { uid = (await auth.getUserByEmail(clientEmail)).uid; } catch {}
    }

    if (uid) {
      const ref = db.collection("users").doc(uid).collection("billing").doc("wayforpay");
      await ref.set({
        provider: "wayforpay",
        orderReference: orderRef,
        amount, currency,
        lastStatus: statusRaw,
        subActive: ok,
        updatedAt: now,
        ...(ok ? { renewedAt: now, expiresAt } : {})
      }, { merge: true });
    }

    return res.status(200).json({ status: "accept" });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ status: "accept" });
  }
}
