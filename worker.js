export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const hostname = url.hostname;

        const origin = request.headers.get('Origin') || '';
        const allowedOrigin = origin.endsWith('dailyhitmetrics.com') ? origin : 'https://dailyhitmetrics.com';

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
                        'success_url': 'https://dailyhitmetrics.com/success.html?session_id={CHECKOUT_SESSION_ID}',
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

        return new Response('Not found', { status: 404 });
    }
};
