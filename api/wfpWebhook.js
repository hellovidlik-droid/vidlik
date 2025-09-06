// Serverless webhook for WayForPay -> Firestore
const admin = require("firebase-admin");

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SA_JSON;
  if (!raw) throw new Error("FIREBASE_SA_JSON is missing");
  const sa = JSON.parse(raw);
  return admin.initializeApp({ credential: admin.credential.cert(sa) });
}

module.exports = async (req, res) => {
  // WayForPay will POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    initAdmin();
    const db = admin.firestore();

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const email = String(body.clientEmail || body.email || "").trim().toLowerCase();
    const orderReference = body.orderReference || body.orderRef || "n/a";
    const amount = Number(body.amount || 0);
    const currency = body.currency || "UAH";
    const rawStatus = String(body.transactionStatus || body.status || "");
    const status = rawStatus.toLowerCase();

    if (!email) {
      return res.status(400).json({ ok: false, error: "clientEmail is required" });
    }

    // map status
    const approved = ["approved", "success", "purchase", "accept"].some(s => status.includes(s));

    // find user by email
    const auth = admin.auth();
    let user;
    try { user = await auth.getUserByEmail(email); } catch (_) {}

    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + 30 * 24 * 60 * 60 * 1000
    );

    if (user) {
      await db
        .collection("users")
        .doc(user.uid)
        .collection("billing")
        .doc("wayforpay")
        .set(
          {
            provider: "wayforpay",
            lastStatus: rawStatus,
            amount,
            currency,
            orderReference,
            subActive: approved,
            expiresAt: approved ? expiresAt : admin.firestore.FieldValue.delete(),
            updatedAt: now
          },
          { merge: true }
        );
    }

    // Respond OK so WFP doesn’t retry forever
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
