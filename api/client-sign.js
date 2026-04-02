export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const RESEND_KEY   = process.env.RESEND_API_KEY;

  // Fixed distribution list
  const ACCOUNTING  = 'kim@amplifylaw.ai';
  const PM          = 'sam@amplifylaw.ai';
  const LEADERSHIP  = ['matt@amplifylaw.ai', 'mhughes@amplifylaw.ai'];

  const SALES_REPS = {
    'Craig':           'craig@amplifylaw.ai',
    'Cynthia':         'cynthia@amplifylaw.ai',
    'Scott':           'scott@amplifylaw.ai',
    'Matthew Hughes':  'mhughes@amplifylaw.ai',
  };

  try {
    const { contractId, clientSig, sigNameB, sigTitleB } = req.body;

    // 1. Fetch contract from Supabase
    const fetchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/contracts?id=eq.${contractId}&select=*`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    const [contract] = await fetchRes.json();
    if (!contract) throw new Error('Contract not found');
    if (contract.status === 'signed') throw new Error('Already signed');

    const d = contract.contract_data;

    // 2. Update Supabase record
    await fetch(`${SUPABASE_URL}/rest/v1/contracts?id=eq.${contractId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify({
        status:     'signed',
        client_sig: clientSig,
        signed_at:  new Date().toISOString(),
        contract_data: { ...d, sigNameB, sigTitleB }
      })
    });

    // 3. Build recipient list
    const salesEmail = SALES_REPS[contract.sales_rep] || null;
    const allRecipients = [
      contract.client_email,
      ACCOUNTING,
      PM,
      ...LEADERSHIP,
      ...(salesEmail ? [salesEmail] : []),
    ].filter((v, i, a) => a.indexOf(v) === i); // dedupe

    // 4. Send notification email to all
    const signedDate = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

    const emailBody = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#E80E00;padding:32px;border-radius:8px 8px 0 0;text-align:center;">
          <h1 style="color:white;margin:0;font-size:28px;letter-spacing:2px;">AMPLIFY</h1>
          <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:12px;">FOR LAWYERS</p>
        </div>
        <div style="background:#ffffff;padding:32px;border:1px solid #E8E4E0;border-top:none;">
          <div style="background:#F5F0EC;border-left:3px solid #E80E00;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;font-weight:600;color:#0A0A0A;">✅ Contract Fully Executed</p>
            <p style="margin:4px 0 0;font-size:12px;color:#888;">Signed by both parties on ${signedDate}</p>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr style="background:#F5F0EC;">
              <td style="padding:10px 12px;color:#888;font-weight:500;">Contract No.</td>
              <td style="padding:10px 12px;color:#0A0A0A;font-weight:600;">${d.contractNum}</td>
            </tr>
            <tr>
              <td style="padding:10px 12px;color:#888;font-weight:500;">Client</td>
              <td style="padding:10px 12px;color:#0A0A0A;">${d.clientName}</td>
            </tr>
            <tr style="background:#F5F0EC;">
              <td style="padding:10px 12px;color:#888;font-weight:500;">Contact</td>
              <td style="padding:10px 12px;color:#0A0A0A;">${d.clientContact || '—'}</td>
            </tr>
            <tr>
              <td style="padding:10px 12px;color:#888;font-weight:500;">Sales Rep</td>
              <td style="padding:10px 12px;color:#0A0A0A;">${contract.sales_rep || '—'}</td>
            </tr>
            <tr style="background:#F5F0EC;">
              <td style="padding:10px 12px;color:#888;font-weight:500;">Total Value</td>
              <td style="padding:10px 12px;font-size:16px;font-weight:700;color:#E80E00;">${d.total}</td>
            </tr>
            <tr>
              <td style="padding:10px 12px;color:#888;font-weight:500;">Start Date</td>
              <td style="padding:10px 12px;color:#0A0A0A;">${d.startDate || '—'}</td>
            </tr>
            <tr style="background:#F5F0EC;">
              <td style="padding:10px 12px;color:#888;font-weight:500;">Payment Terms</td>
              <td style="padding:10px 12px;color:#0A0A0A;">${d.paySchedule}</td>
            </tr>
          </table>
          <p style="color:#888;font-size:12px;margin-top:24px;line-height:1.6;">
            This contract has been fully executed. Both parties have provided electronic signatures. 
            This notification has been sent to the client, accounting (Kim), project management (Sam), 
            the assigned sales rep (${contract.sales_rep}), and leadership.
          </p>
        </div>
        <div style="background:#0A0A0A;padding:16px 32px;border-radius:0 0 8px 8px;text-align:center;">
          <p style="color:#888;font-size:11px;margin:0;">amplifylaw.ai &nbsp;|&nbsp; accounts@amplifylaw.ai</p>
        </div>
      </div>
    `;

    // Send to all recipients
    await Promise.all(allRecipients.map(email =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_KEY}`
        },
        body: JSON.stringify({
          from: 'Amplify for Lawyers <accounts@amplifylaw.ai>',
          to: [email],
          subject: `✅ Signed: Service Agreement ${d.contractNum} — ${d.clientName}`,
          html: emailBody
        })
      })
    ));

    res.status(200).json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
