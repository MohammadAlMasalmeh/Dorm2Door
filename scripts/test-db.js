/**
 * test-db.js — End-to-end smoke test for the Dorm2Door Supabase schema.
 *
 * Run:  node test-db.js
 *
 * What this covers:
 *   1. Signup — creates a consumer and a provider via Supabase Auth (admin)
 *   2. .edu enforcement — verifies non-.edu signup is rejected
 *   3. Role assignment — promotes the provider user
 *   4. Provider profile — creates a providers row + a service
 *   5. Appointment — consumer books the service
 *   6. Review — consumer leaves a review; verifies avg_rating trigger fires
 *   7. Tag query — queries providers filtered by tag, sorted by avg_rating
 *   8. Immutability — verifies reviews cannot be updated or deleted
 *   9. Cleanup — deletes all test data
 */
require('dotenv').config({ path: __dirname + '/.env' });
const { adminClient } = require('./client');

// ─── helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label, value) {
  if (value) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`);
}

async function cleanup(consumerUid, providerUid) {
  section('Cleanup');
  // Order matters due to FK constraints
  if (providerUid) {
    await adminClient.from('reviews').delete().eq('provider_id', providerUid);
    await adminClient.from('appointments').delete().eq('provider_id', providerUid);
    await adminClient.from('services').delete().eq('provider_id', providerUid);
    await adminClient.from('providers').delete().eq('id', providerUid);
  }
  if (consumerUid) await adminClient.from('users').delete().eq('id', consumerUid);
  if (providerUid) await adminClient.from('users').delete().eq('id', providerUid);

  // Remove auth users
  if (consumerUid) await adminClient.auth.admin.deleteUser(consumerUid);
  if (providerUid)  await adminClient.auth.admin.deleteUser(providerUid);
  console.log('  done.');
}

// ─── main ─────────────────────────────────────────────────────────────────────

(async () => {
  let consumerUid, providerUid, serviceId, appointmentId;

  try {
    // ── 1. Signup ──────────────────────────────────────────────────────────────
    section('1 · Signup');

    const { data: cData, error: cErr } = await adminClient.auth.admin.createUser({
      email: 'test_consumer@utexas.edu',
      password: 'Password123!',
      email_confirm: true,
    });
    ok('consumer created (test_consumer@utexas.edu)', !cErr && cData?.user);
    consumerUid = cData?.user?.id;

    const { data: pData, error: pErr } = await adminClient.auth.admin.createUser({
      email: 'test_provider@utexas.edu',
      password: 'Password123!',
      email_confirm: true,
    });
    ok('provider created (test_provider@utexas.edu)', !pErr && pData?.user);
    providerUid = pData?.user?.id;

    // ── 2. .edu enforcement ────────────────────────────────────────────────────
    section('2 · .edu enforcement (trigger)');

    // The handle_new_user trigger runs on auth.users INSERT.
    // It raises an exception if the email doesn't end in .edu.
    // We test this by attempting to create a non-.edu user directly.
    const { error: badErr } = await adminClient.auth.admin.createUser({
      email: 'not_a_student@gmail.com',
      password: 'Password123!',
      email_confirm: true,
    });
    ok('.edu check — non-.edu signup rejected by trigger', !!badErr);
    if (badErr) console.log(`     (got expected error: ${badErr.message})`);

    // ── 3. users rows created by trigger ─────────────────────────────────────
    section('3 · users rows (auto-created by trigger)');

    if (!consumerUid || !providerUid) {
      throw new Error('Cannot continue without both auth users.');
    }

    const { data: uRows, error: uErr } = await adminClient
      .from('users')
      .select('id, email, role')
      .in('id', [consumerUid, providerUid]);

    ok('two users rows exist', !uErr && uRows?.length === 2);

    // ── 4. Role promotion ──────────────────────────────────────────────────────
    section('4 · Role promotion');

    const { error: roleErr } = await adminClient
      .from('users')
      .update({ role: 'provider' })
      .eq('id', providerUid);
    ok('provider role set', !roleErr);

    // ── 5. Provider profile + service ─────────────────────────────────────────
    section('5 · Provider profile & service');

    const { error: provErr } = await adminClient.from('providers').insert({
      id: providerUid,
      bio: 'Fast and reliable delivery.',
      tags: ['delivery', 'groceries'],
      location: 'West Campus',
    });
    ok('providers row inserted', !provErr);

    const { data: svcData, error: svcErr } = await adminClient
      .from('services')
      .insert({
        provider_id: providerUid,
        name: 'Grocery Run',
        price: 9.99,
        description: 'I will pick up groceries from HEB.',
      })
      .select('id')
      .single();
    ok('service inserted', !svcErr && svcData?.id);
    serviceId = svcData?.id;

    // ── 6. Appointment ─────────────────────────────────────────────────────────
    section('6 · Appointment booking');

    const { data: apptData, error: apptErr } = await adminClient
      .from('appointments')
      .insert({
        consumer_id: consumerUid,
        provider_id: providerUid,
        service_id: serviceId,
        status: 'pending',
        scheduled_at: new Date(Date.now() + 86400000).toISOString(), // tomorrow
      })
      .select('id')
      .single();
    ok('appointment created', !apptErr && apptData?.id);
    appointmentId = apptData?.id;

    // ── 7. Review + avg_rating trigger ────────────────────────────────────────
    section('7 · Review & avg_rating trigger');

    const { error: revErr } = await adminClient.from('reviews').insert({
      appointment_id: appointmentId,
      provider_id: providerUid,
      rating: 4,
      comment: 'Great service!',
    });
    ok('review inserted', !revErr);

    // Give the trigger a moment (it's synchronous in Postgres, so no real wait needed)
    const { data: provRow, error: provReadErr } = await adminClient
      .from('providers')
      .select('avg_rating')
      .eq('id', providerUid)
      .single();
    ok('avg_rating updated by trigger', !provReadErr && Number(provRow?.avg_rating) === 4.00);
    console.log(`     avg_rating = ${provRow?.avg_rating}`);

    // ── 8. Tag query ───────────────────────────────────────────────────────────
    section('8 · Tag query (array-contains + ORDER BY avg_rating)');

    const { data: tagged, error: tagErr } = await adminClient
      .from('providers')
      .select('id, avg_rating, tags')
      .contains('tags', ['delivery'])
      .order('avg_rating', { ascending: false });
    ok('tag query returned results', !tagErr && tagged?.length > 0);
    ok('result contains our provider', tagged?.some(p => p.id === providerUid));

    // ── 9. Immutability check ──────────────────────────────────────────────────
    section('9 · Review immutability (RLS policy audit)');

    // pg_policies is a system catalog — query it via Management API instead of REST.
    // We confirm immutability by checking the schema: only INSERT + SELECT exist on reviews.
    // This was already verified during the schema push (section 3 of the setup).
    //
    // To simulate what a normal user experiences, create a second anon client
    // signed in as the consumer and attempt an update — it should be rejected.
    const { createClient } = require('@supabase/supabase-js');
    const userClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
    const { error: signInErr } = await userClient.auth.signInWithPassword({
      email: 'test_consumer@utexas.edu',
      password: 'Password123!',
    });

    if (!signInErr) {
      // RLS blocks silently (0 rows affected, no JS error) — verify by re-reading the record.
      await userClient.from('reviews').update({ rating: 1 }).eq('appointment_id', appointmentId);
      const { data: afterUpd } = await adminClient
        .from('reviews').select('rating').eq('appointment_id', appointmentId).single();
      ok('review rating unchanged after user update attempt (UPDATE blocked by RLS)', afterUpd?.rating === 4);

      await userClient.from('reviews').delete().eq('appointment_id', appointmentId);
      const { data: afterDel } = await adminClient
        .from('reviews').select('id').eq('appointment_id', appointmentId).single();
      ok('review still exists after user delete attempt (DELETE blocked by RLS)', !!afterDel?.id);
    } else {
      ok('sign-in for immutability test succeeded', false);
      ok('reviews are immutable for normal users', false);
    }

  } catch (err) {
    console.error('\nUnexpected error:', err.message);
    failed++;
  } finally {
    await cleanup(consumerUid, providerUid);

    section('Results');
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
  }
})();
