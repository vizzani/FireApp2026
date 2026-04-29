// FireApp — Supabase Edge Function: send-verbale-email
// Deploy: supabase functions deploy send-verbale-email
//
// Variabili d'ambiente necessarie (Supabase > Settings > Edge Functions > Secrets):
//   RESEND_API_KEY  → ottieni da https://resend.com (free: 100 email/giorno)
//   SUPABASE_URL    → già disponibile automaticamente
//   SUPABASE_SERVICE_ROLE_KEY → Supabase > Settings > API > service_role key
//
// Per testare localmente: supabase functions serve --env-file .env.local

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { intervention_id, recipient_email, pdf_storage_path } = await req.json();

    if (!intervention_id || !recipient_email) {
      return new Response(JSON.stringify({ error: 'intervention_id e recipient_email sono obbligatori' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Inizializza Supabase con service role key (accesso completo ai dati)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Recupera dati intervento
    const { data: inv, error: invError } = await supabase
      .from('interventions')
      .select('*, clients(name, address, city, email), profiles(full_name, cert_number), organizations(name)')
      .eq('id', intervention_id)
      .single();

    if (invError || !inv) {
      return new Response(JSON.stringify({ error: 'Intervento non trovato' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Recupera anomalie
    const { data: anomalies } = await supabase
      .from('anomalies')
      .select('*')
      .eq('intervention_id', intervention_id);

    // Genera URL firmato per il PDF (valido 7 giorni = 604800 secondi)
    let pdfDownloadUrl = '';
    const storagePath = pdf_storage_path || inv.pdf_url;
    if (storagePath) {
      const { data: signedData } = await supabase.storage
        .from('reports')
        .createSignedUrl(storagePath, 604800);
      pdfDownloadUrl = signedData?.signedUrl ?? '';
    }

    // Formatta data in italiano
    const dataFormattata = new Date(inv.date + 'T12:00:00').toLocaleDateString('it-IT', {
      day: '2-digit', month: 'long', year: 'numeric'
    });

    // Formatta impianti
    const EQ_LABELS: Record<string, string> = {
      estintori: 'Estintori', idranti: 'Idranti', irai: 'IRAI',
      evac: 'EVAC', sprinkler: 'Sprinkler', porte_rei: 'Porte REI',
    };
    const impiantiStr = (inv.equipment_types || []).map((t: string) => EQ_LABELS[t] || t).join(', ');
    const esitoStr = { conforme: 'Conforme', anomalie: 'Conforme con anomalie', non_conforme: 'Non conforme' }[inv.outcome as string] || '—';
    const esitoColor = inv.outcome === 'conforme' ? '#16a05e' : inv.outcome === 'non_conforme' ? '#dc2626' : '#d97706';

    // Sezione anomalie per email
    const anomalieHtml = anomalies?.length
      ? `<div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:0 8px 8px 0;margin:16px 0">
          <p style="color:#dc2626;font-weight:700;margin:0 0 8px">Anomalie rilevate (${anomalies.length})</p>
          ${anomalies.map((a: { equipment_type: string; severity: string; description: string }) => {
            const sev = { critical: 'Critica', high: 'Alta', medium: 'Media', low: 'Bassa' }[a.severity] || '';
            return `<p style="margin:4px 0;font-size:13px;color:#374151"><strong>${EQ_LABELS[a.equipment_type] || a.equipment_type}</strong> · Gravità ${sev}<br>
            <span style="color:#6b7280">${a.description}</span></p>`;
          }).join('')}
        </div>`
      : '';

    const pdfSection = pdfDownloadUrl
      ? `<div style="text-align:center;margin:24px 0">
          <a href="${pdfDownloadUrl}" style="background:#073524;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
            Scarica il verbale PDF
          </a>
          <p style="font-size:12px;color:#9ca3af;margin-top:8px">Link valido per 7 giorni</p>
        </div>`
      : '<p style="color:#6b7280;font-size:13px">Il PDF sarà disponibile al prossimo accesso all\'app.</p>';

    // HTML email
    const emailHtml = `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    
    <!-- Header verde -->
    <div style="background:#073524;padding:28px 32px">
      <p style="color:rgba(255,255,255,.6);font-size:13px;margin:0 0 4px">Verbale di manutenzione antincendio</p>
      <h1 style="color:white;font-size:22px;font-weight:700;margin:0">n. ${inv.report_number || '—'}</h1>
      <p style="color:rgba(255,255,255,.5);font-size:13px;margin:6px 0 0">${inv.organizations?.name || ''}</p>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px">
      <p style="font-size:15px;color:#374151;margin:0 0 20px">
        Gentile referente,<br>
        si invia in allegato il verbale di manutenzione antincendio eseguito in data <strong>${dataFormattata}</strong>.
      </p>

      <!-- Riepilogo -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#9ca3af;width:40%">Cliente</td>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;color:#111827">${inv.clients?.name || '—'}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#9ca3af">Indirizzo</td>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151">${[inv.clients?.address, inv.clients?.city].filter(Boolean).join(', ') || '—'}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#9ca3af">Tipo intervento</td>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151">${(inv.type || '').charAt(0).toUpperCase() + inv.type.slice(1)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#9ca3af">Impianti verificati</td>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151">${impiantiStr}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#9ca3af">Tecnico</td>
          <td style="padding:8px 0;font-size:13px;color:#374151">${inv.profiles?.full_name || '—'} ${inv.profiles?.cert_number ? '· Cert. ' + inv.profiles.cert_number : ''}</td>
        </tr>
      </table>

      <!-- Esito badge -->
      <div style="text-align:center;margin-bottom:20px">
        <span style="background:${esitoColor};color:white;font-weight:700;padding:8px 24px;border-radius:999px;font-size:14px">
          Esito: ${esitoStr}
        </span>
      </div>

      ${anomalieHtml}

      ${pdfSection}

      <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0">
      <p style="font-size:12px;color:#9ca3af;margin:0">
        Questo verbale è stato generato automaticamente da FireApp.<br>
        Per informazioni contattare ${inv.organizations?.name || 'il manutentore'}.
      </p>
    </div>
  </div>
</body>
</html>`;

    // Invia email con Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY non configurata' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'FireApp <noreply@tuodominio.it>',  // ← cambia con il tuo dominio verificato in Resend
        to: [recipient_email],
        subject: `Verbale manutenzione antincendio n. ${inv.report_number} — ${inv.clients?.name || ''}`,
        html: emailHtml,
      }),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.text();
      console.error('Resend error:', errBody);
      return new Response(JSON.stringify({ error: 'Errore Resend: ' + errBody }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const resendData = await resendRes.json();
    return new Response(JSON.stringify({ success: true, email_id: resendData.id }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Edge Function error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
