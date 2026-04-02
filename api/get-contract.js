export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing contract ID' });

  try {
    const fetchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/contracts?id=eq.${id}&select=*`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    const data = await fetchRes.json();
    if (!data || data.length === 0) return res.status(404).json({ error: 'Contract not found' });

    const contract = data[0];

    // Don't expose signatures to the client fetch — only what they need to display
    res.status(200).json({
      id: contract.id,
      status: contract.status,
      contract_number: contract.contract_number,
      client_name: contract.client_name,
      client_email: contract.client_email,
      sales_rep: contract.sales_rep,
      contract_data: contract.contract_data,
      amplify_sig: contract.amplify_sig,
      created_at: contract.created_at,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
