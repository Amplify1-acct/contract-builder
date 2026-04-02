export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const RESEND_KEY   = process.env.RESEND_API_KEY;
  const BASE_URL     = process.env.BASE_URL || 'https://contracts.amplifylaw.ai';

  try {
    const { contractData, amplifySig } = req.body;

    // 1. Save to Supabase
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/contracts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        contract_number: contractData.contractNum,
        client_name:     contractData.clientName,
        client_email:    contractData.clientEmail,
        sales_rep:       contractData.salesRep,
        status:          'pending_client',
        contract_data:   contractData,
        amplify_sig:     amplifySig,
      })
    });

    if (!insertRes.ok) {
      const err = await insertRes.text();
      throw new Error('Supabase insert failed: ' + err);
    }

    const [record] = await insertRes.json();
    const contractId = record.id;
    const signingLink = `${BASE_URL}/sign/${contractId}`;

    // 2. Email client
    const clientEmail = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_KEY}`
      },
      body: JSON.stringify({
        from: 'Amplify for Lawyers <accounts@amplifylaw.ai>',
        to: [contractData.clientEmail],
        subject: `Your Service Agreement from Amplify for Lawyers — ${contractData.contractNum}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <div style="background:#E80E00;padding:32px;border-radius:8px 8px 0 0;text-align:center;">
              <h1 style="color:white;margin:0;font-size:28px;letter-spacing:2px;">AMPLIFY</h1>
              <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:12px;">FOR LAWYERS</p>
            </div>
            <div style="background:#ffffff;padding:32px;border:1px solid #E8E4E0;border-top:none;">
              <p style="font-size:16px;color:#0A0A0A;">Dear ${contractData.clientContact || contractData.clientName},</p>
              <p style="color:#444;line-height:1.6;">Your Service Agreement with Amplify for Lawyers is ready for your review and signature.</p>
              <div style="background:#F5F0EC;border-radius:8px;padding:16px;margin:20px 0;">
                <p style="margin:0;font-size:13px;color:#888;">Contract Reference</p>
                <p style="margin:4px 0 0;font-size:18px;font-weight:600;color:#0A0A0A;">${contractData.contractNum}</p>
                <p style="margin:8px 0 0;font-size:13px;color:#888;">Total Value</p>
                <p style="margin:4px 0 0;font-size:18px;font-weight:600;color:#E80E00;">${contractData.total}</p>
              </div>
              <p style="color:#444;line-height:1.6;">Please review the agreement and add your electronic signature using the link below. This link is unique to your contract.</p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${signingLink}" style="background:#E80E00;color:white;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
                  Review &amp; Sign Agreement
                </a>
              </div>
              <p style="color:#888;font-size:12px;line-height:1.6;">This link will take you to a secure page where you can review the full contract and add your signature. If you have any questions, reply to this email or contact your Amplify representative.</p>
            </div>
            <div style="background:#0A0A0A;padding:16px 32px;border-radius:0 0 8px 8px;text-align:center;">
              <p style="color:#888;font-size:11px;margin:0;">amplifylaw.ai &nbsp;|&nbsp; accounts@amplifylaw.ai</p>
            </div>
          </div>
        `
      })
    });

    if (!clientEmail.ok) {
      const err = await clientEmail.text();
      throw new Error('Resend client email failed: ' + err);
    }

    res.status(200).json({ success: true, contractId, signingLink });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
