export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const hostname = url.hostname;

        const origin = request.headers.get('Origin') || '';
        const isAllowed = origin.endsWith('dailyhitmetrics.com') || origin.endsWith('workers.dev');
        const allowedOrigin = isAllowed ? origin : 'https://news.dailyhitmetrics.com';

        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': allowedOrigin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // ── API ROUTES ──
        if (url.pathname === '/api/data') {
            const data = await env.DAILY_HIT_METRICS_KV.get('data');
            if (!data) {
                return new Response(JSON.stringify({ error: 'No data available' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
            return new Response(data, {
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', ...corsHeaders }
            });
        }

        // ── SPORTS DATA API ──
        if (url.pathname === '/api/sports') {
            const data = await env.SPORTS_KV.get('data');
            if (!data) {
                return new Response(JSON.stringify({ error: 'No sports data available' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
            return new Response(data, {
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', ...corsHeaders }
            });
        }

        if (url.pathname === '/api/international') {
            const data = await env.INTERNATIONAL_KV.get('data');
            if (!data) {
                return new Response(JSON.stringify({ error: 'No international data available' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
            return new Response(data, {
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', ...corsHeaders }
            });
        }

        if (url.pathname === '/api/comedy') {
            const data = await env.COMEDY_KV.get('data');
            if (!data) {
                return new Response(JSON.stringify({ error: 'No comedy data available' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
            return new Response(data, {
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', ...corsHeaders }
            });
        }

        // ── STRIPE CHECKOUT ──
        if (url.pathname === '/api/create-checkout-session' && request.method === 'POST') {
            try {
                const { userId, email } = await request.json();

                const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        'mode': 'subscription',
                        'line_items[0][price]': 'price_1TwTusJX6rSaATLsqh4YyUnC',
                        'line_items[0][quantity]': '1',
                        'customer_email': email,
                        'client_reference_id': userId,
                        'success_url': 'https://news.dailyhitmetrics.com/pro-welcome.html?session_id={CHECKOUT_SESSION_ID}',
                        'cancel_url': 'https://dailyhitmetrics.com/?canceled=true',
                        'metadata[userId]': userId,
                    })
                });

                const session = await stripeResponse.json();
                console.log('Stripe status:', stripeResponse.status, 'Key prefix:', env.STRIPE_SECRET_KEY ? env.STRIPE_SECRET_KEY.substring(0, 12) : 'MISSING');

                if (session.error) {
                    return new Response(JSON.stringify({ error: session.error.message, status: stripeResponse.status }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                }

                return new Response(JSON.stringify({ url: session.url }), {                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });

            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
        }

        // ── STRIPE WEBHOOK ──
        if (url.pathname === '/api/stripe-webhook' && request.method === 'POST') {
            try {
                const body = await request.text();
                const signature = request.headers.get('stripe-signature');

                // Verify webhook signature
                if (!signature || !env.STRIPE_WEBHOOK_SECRET) {
                    return new Response('Webhook signature missing', { status: 400 });
                }

                // Parse signature header
                const sigParts = {};
                signature.split(',').forEach(part => {
                    const [k, v] = part.split('=');
                    sigParts[k] = v;
                });
                const timestamp = sigParts['t'];
                const receivedSig = sigParts['v1'];

                // Compute expected signature
                const encoder = new TextEncoder();
                const key = await crypto.subtle.importKey(
                    'raw',
                    encoder.encode(env.STRIPE_WEBHOOK_SECRET),
                    { name: 'HMAC', hash: 'SHA-256' },
                    false,
                    ['sign']
                );
                const signedData = encoder.encode(`${timestamp}.${body}`);
                const signatureBuffer = await crypto.subtle.sign('HMAC', key, signedData);
                const expectedSig = Array.from(new Uint8Array(signatureBuffer))
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join('');

                // Reject if signature doesn't match
                if (expectedSig !== receivedSig) {
                    return new Response('Invalid webhook signature', { status: 400 });
                }

                // Reject if timestamp is too old (5 minutes)
                const tolerance = 300;
                if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > tolerance) {
                    return new Response('Webhook timestamp too old', { status: 400 });
                }

                const event = JSON.parse(body);

                if (event.type === 'checkout.session.completed') {
                    const session = event.data.object;
                    const userId = session.client_reference_id || session.metadata?.userId;

                    if (userId) {
                        // Update subscription_tier to 'pro' in Supabase
                        await fetch(`https://dljqwghiyjhombvflgfg.supabase.co/rest/v1/profiles?id=eq.${userId}`, {
                            method: 'PATCH',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': env.SUPABASE_SERVICE_KEY,
                                'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                            },
                            body: JSON.stringify({ subscription_tier: 'pro' })
                        });
                    }
                }

                if (event.type === 'customer.subscription.deleted') {
                    const subscription = event.data.object;
                    const userId = subscription.metadata?.userId;
                    if (userId) {
                        await fetch(`https://dljqwghiyjhombvflgfg.supabase.co/rest/v1/profiles?id=eq.${userId}`, {
                            method: 'PATCH',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': env.SUPABASE_SERVICE_KEY,
                                'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                            },
                            body: JSON.stringify({ subscription_tier: 'free' })
                        });
                    }
                }

                return new Response(JSON.stringify({ received: true }), {
                    headers: { 'Content-Type': 'application/json' }
                });

            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // ── PAYPAL UPGRADE (client-side fallback) ──
        if (url.pathname === '/api/paypal-upgrade' && request.method === 'POST') {
            try {
                const { userId, subscriptionId } = await request.json();
                if (!userId) return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

                await fetch(`https://dljqwghiyjhombvflgfg.supabase.co/rest/v1/profiles?id=eq.${userId}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': env.SUPABASE_SERVICE_KEY,
                        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
                    },
                    body: JSON.stringify({ subscription_tier: 'pro', paypal_subscription_id: subscriptionId })
                });

                return new Response(JSON.stringify({ success: true }), {
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
        }

        // ── SITE DEFAULTS (admin-set preferences as global defaults) ──
        if (url.pathname === '/api/defaults' && request.method === 'GET') {
            const site = url.searchParams.get('site') || 'news';
            const data = await env.DAILY_HIT_METRICS_KV.get(`defaults-${site}`);
            return new Response(data || '{}', {
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', ...corsHeaders }
            });
        }

        if (url.pathname === '/api/defaults' && request.method === 'POST') {
            const site = url.searchParams.get('site') || 'news';
            const body = await request.json();
            await env.DAILY_HIT_METRICS_KV.put(`defaults-${site}`, JSON.stringify(body));
            return new Response(JSON.stringify({ ok: true }), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // ── ZOOM (global admin setting) ──
        if (url.pathname === '/api/zoom' && request.method === 'GET') {
            const data = await env.DAILY_HIT_METRICS_KV.get('zoom');
            return new Response(data || '{"zoom":1.20}', {
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', ...corsHeaders }
            });
        }

        if (url.pathname === '/api/zoom' && request.method === 'POST') {
            const body = await request.json();
            await env.DAILY_HIT_METRICS_KV.put('zoom', JSON.stringify(body));
            return new Response(JSON.stringify({ ok: true }), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // ── TYPOGRAPHY (global admin settings) ──
        if (url.pathname === '/api/typography' && request.method === 'GET') {
            const data = await env.DAILY_HIT_METRICS_KV.get('typography');
            return new Response(data || '{}', {
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', ...corsHeaders }
            });
        }

        if (url.pathname === '/api/typography' && request.method === 'POST') {
            const body = await request.json();
            await env.DAILY_HIT_METRICS_KV.put('typography', JSON.stringify(body));
            return new Response(JSON.stringify({ ok: true }), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // ── RSS PROXY (admin) ──
        if (url.pathname === '/api/rss-proxy' && request.method === 'GET') {
            const feedUrl = url.searchParams.get('url');
            if (!feedUrl) return new Response('Missing url parameter', { status: 400 });
            try {
                const res = await fetch(feedUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DailyHitMetrics/1.0)', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' }
                });
                const text = await res.text();
                return new Response(text, {
                    status: res.status,
                    headers: { 'Content-Type': 'text/xml', ...corsHeaders }
                });
            } catch (e) {
                return new Response(e.message, { status: 500, headers: corsHeaders });
            }
        }

        // ── RSS STATUS CHECK (admin) ──
        if (url.pathname === '/api/rss-check' && request.method === 'GET') {
            const feedUrl = url.searchParams.get('url');
            if (!feedUrl) return new Response('Missing url parameter', { status: 400 });
            try {
                const res = await fetch(feedUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DailyHitMetrics/1.0)', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' }
                });
                return new Response(JSON.stringify({ status: res.status }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            } catch (e) {
                return new Response(JSON.stringify({ status: 'ERR', error: e.message }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
        }

        // ── PAYPAL WEBHOOK ──
        if (url.pathname === '/api/paypal-webhook' && request.method === 'POST') {
            try {
                const body = await request.json();
                const eventType = body.event_type;

                console.log('PayPal webhook event:', eventType);

                if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
                    const subscriptionId = body.resource?.id;
                    const subscriberEmail = body.resource?.subscriber?.email_address;

                    if (subscriberEmail) {
                        // Find user by email and update to pro
                        const res = await fetch(
                            `https://dljqwghiyjhombvflgfg.supabase.co/rest/v1/profiles?email=eq.${encodeURIComponent(subscriberEmail)}&select=id`,
                            {
                                headers: {
                                    'apikey': env.SUPABASE_SERVICE_KEY,
                                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
                                }
                            }
                        );
                        const users = await res.json();
                        if (users.length > 0) {
                            await fetch(
                                `https://dljqwghiyjhombvflgfg.supabase.co/rest/v1/profiles?id=eq.${users[0].id}`,
                                {
                                    method: 'PATCH',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'apikey': env.SUPABASE_SERVICE_KEY,
                                        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
                                    },
                                    body: JSON.stringify({
                                        subscription_tier: 'pro',
                                        paypal_subscription_id: subscriptionId
                                    })
                                }
                            );
                            console.log(`PayPal: upgraded ${subscriberEmail} to pro`);
                        }
                    }
                }

                if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED' || eventType === 'BILLING.SUBSCRIPTION.EXPIRED') {
                    const subscriberEmail = body.resource?.subscriber?.email_address;
                    if (subscriberEmail) {
                        const res = await fetch(
                            `https://dljqwghiyjhombvflgfg.supabase.co/rest/v1/profiles?email=eq.${encodeURIComponent(subscriberEmail)}&select=id`,
                            {
                                headers: {
                                    'apikey': env.SUPABASE_SERVICE_KEY,
                                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
                                }
                            }
                        );
                        const users = await res.json();
                        if (users.length > 0) {
                            await fetch(
                                `https://dljqwghiyjhombvflgfg.supabase.co/rest/v1/profiles?id=eq.${users[0].id}`,
                                {
                                    method: 'PATCH',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'apikey': env.SUPABASE_SERVICE_KEY,
                                        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
                                    },
                                    body: JSON.stringify({ subscription_tier: 'free', paypal_subscription_id: null })
                                }
                            );
                            console.log(`PayPal: downgraded ${subscriberEmail} to free`);
                        }
                    }
                }

                return new Response(JSON.stringify({ received: true }), {
                    headers: { 'Content-Type': 'application/json' }
                });

            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // ── HELPDESK EMAIL AGENT ──
        if (url.pathname === '/api/helpdesk' && request.method === 'POST') {
            try {
                const payload = await request.json();
                const data = payload.data || payload;
                console.log('Helpdesk payload keys:', JSON.stringify(Object.keys(payload)));
                console.log('Helpdesk data keys:', JSON.stringify(Object.keys(data)));

                // Only process emails to helpdesk@dailyhitmetrics.com
                const toField = data.to || data.received_for || '';
                const toStr = Array.isArray(toField) ? toField.join(',') : String(toField);
                if (!toStr.toLowerCase().includes('helpdesk@dailyhitmetrics.com')) {
                    console.log('Helpdesk: skipping email not addressed to helpdesk@', toStr);
                    return new Response(JSON.stringify({ skipped: true, to: toStr }), { status: 200 });
                }

                const fromField = data.from || '';
                const fromEmail = typeof fromField === 'string' ?
                    (fromField.match(/<([^>]+)>/) ? fromField.match(/<([^>]+)>/)[1] : fromField) :
                    fromField;
                const fromName = data.sender_name || (typeof fromField === 'string' && fromField.includes('<') ? fromField.split('<')[0].trim() : fromEmail);
                const subject = data.subject || '(no subject)';

                // Fetch full email body via Resend API using email_id
                let bodyText = '';
                const emailId = data.email_id;
                if (emailId) {
                    try {
                        const emailRes = await fetch(`https://api.resend.com/emails/${emailId}`, {
                            headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}` }
                        });
                        if (emailRes.ok) {
                            const emailData = await emailRes.json();
                            bodyText = emailData.text || emailData.html?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || '';
                        } else {
                            console.error('Failed to fetch email body:', emailRes.status);
                        }
                    } catch(e) {
                        console.error('Email fetch error:', e.message);
                    }
                }

                // Call Anthropic API
                const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': env.ANTHROPIC_API_KEY,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: 'claude-haiku-4-5-20251001',
                        max_tokens: 1024,
                        system: `You are the Daily Hit Metrics helpdesk assistant. Daily Hit Metrics (dailyhitmetrics.com) is a real-time news aggregation platform operated by MpathTek. It aggregates trending content from across the web across six verticals: U.S. News, International, Sports, Finance, Politics, and Entertainment — updated every hour.

Subscription tiers:
- Free: Access to U.S. News only
- Pro ($4.99/month): Access to all six verticals, settings, keyword alerts
- Pro+ (annual): Same as Pro at annual pricing

Key features: customizable article feeds per section, newspaper shade themes, zoom control, keyword email alerts, global typography settings (admin only).

Contact: helpdesk@dailyhitmetrics.com
Website: dailyhitmetrics.com

Be helpful, concise, and friendly. Sign off as "The Daily Hit Metrics Team". If you cannot answer something confidently, let the user know you'll have a human follow up. Do not make up information about features or pricing. Keep replies under 200 words.`,
                        messages: [
                            {
                                role: 'user',
                                content: `Email from: ${fromName} <${fromEmail}>\nSubject: ${subject}\n\n${bodyText}`
                            }
                        ]
                    })
                });

                if (!anthropicRes.ok) {
                    console.error('Anthropic API error:', await anthropicRes.text());
                    return new Response(JSON.stringify({ error: 'AI error' }), { status: 500 });
                }

                const aiData = await anthropicRes.json();
                const replyText = aiData.content?.[0]?.text || 'Thank you for contacting Daily Hit Metrics. We will get back to you shortly.';

                // Send reply via Resend
                const replyHtml = `<!DOCTYPE html><html><body style="font-family:Georgia,serif; font-size:14px; color:#2a1a0a; max-width:600px; margin:0 auto; padding:20px;">
<div style="border-left:3px solid #3a6b4a; padding-left:16px; margin-bottom:20px;">
    <div style="font-size:18px; font-weight:700; color:#2f3640;">Daily Hit Metrics</div>
    <div style="font-size:12px; color:#8a6a50;">dailyhitmetrics.com</div>
</div>
${replyText.split('\n').map(p => p.trim() ? `<p style="line-height:1.7; margin:0 0 12px;">${p}</p>` : '').join('')}
<hr style="border:none; border-top:1px solid #d4c9b0; margin:24px 0;">
<div style="font-size:11px; color:#8a6a50;">
    Daily Hit Metrics · <a href="https://dailyhitmetrics.com" style="color:#3a6b4a;">dailyhitmetrics.com</a> · 
    <a href="mailto:helpdesk@dailyhitmetrics.com" style="color:#3a6b4a;">helpdesk@dailyhitmetrics.com</a>
</div>
</body></html>`;

                const resendRes = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: 'Daily Hit Metrics <helpdesk@dailyhitmetrics.com>',
                        to: fromEmail,
                        subject: `Re: ${subject}`,
                        html: replyHtml,
                        text: replyText
                    })
                });

                if (!resendRes.ok) {
                    const resendErr = await resendRes.text();
                    console.error('Resend reply failed:', resendRes.status, resendErr);
                }

                const supaRes = await fetch(`https://dljqwghiyjhombvflgfg.supabase.co/rest/v1/helpdesk_emails`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': env.SUPABASE_SERVICE_KEY,
                        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({
                        from_email: fromEmail,
                        from_name: fromName,
                        subject,
                        body: bodyText,
                        ai_reply: replyText,
                        replied: resendRes.ok,
                        created_at: new Date().toISOString()
                    })
                });
                if (!supaRes.ok) {
                    const supaErr = await supaRes.text();
                    console.error('Supabase insert failed:', supaRes.status, supaErr);
                }

                console.log(`Helpdesk: replied to ${fromEmail} re: "${subject}" (Resend: ${resendRes.ok})`);
                return new Response(JSON.stringify({ ok: true }), { status: 200 });

            } catch (err) {
                console.error('Helpdesk error:', err.message);
                return new Response(JSON.stringify({ error: err.message }), { status: 500 });
            }
        }

        return new Response('Not found', { status: 404 });
    }
};
