// One-shot: install the extensions required by the migration chain.
//
// Migrations use unqualified `vector(...)` and `gen_random_uuid()` types/
// functions. Keep both extensions in `public` so fresh databases and
// drizzle-kit connections resolve them with PostgreSQL's default search path.
// Existing installations that used the old `extensions` schema are moved to
// `public` when the database role has permission to alter the extension.
import postgres from 'postgres';

const databaseUrl = process.env.DIRECT_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!databaseUrl) {
  throw new Error('Set DIRECT_URL, POSTGRES_URL_NON_POOLING, DATABASE_URL, or POSTGRES_URL before installing database extensions.');
}

function resolveSslOption() {
  const ca = process.env.SUPABASE_CA_CERT?.replace(/\\n/g, '\n').trim();
  if (ca) return { ca, rejectUnauthorized: true };

  const SUPABASE_ROOT_CA_2021 = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----`;

  if (databaseUrl && (databaseUrl.includes('supabase.co') || databaseUrl.includes('supabase.com'))) {
    return { ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true };
  }

  if (process.env.DB_DISABLE_SSL === 'true') {
    if (
      process.env.NODE_ENV !== 'production' ||
      (process.env.KESTREL_LOCAL_DOCKER ?? process.env.HAMAFX_LOCAL_DOCKER) === 'true'
    ) {
      return false;
    }
    throw new Error(
      'DB_DISABLE_SSL=true is only permitted with KESTREL_LOCAL_DOCKER=true; configure verified TLS for production databases.',
    );
  }

  const productionTls =
    process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  return productionTls ? { rejectUnauthorized: true } : { rejectUnauthorized: false };
}

const sql = postgres(databaseUrl, {
  prepare: false,
  max: 1,
  ssl: resolveSslOption(),
});

try {
  await sql`CREATE SCHEMA IF NOT EXISTS public`;

  // Repair databases created by the former extensions-schema installer before
  // creating anything new. PostgreSQL's IF NOT EXISTS does not move an
  // existing extension between schemas.
  const existingExtensions = await sql`
    SELECT e.extname, n.nspname AS schema_name
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname IN ('vector', 'pgcrypto')
  `;
  for (const extension of existingExtensions) {
    if (
      (extension.extname === 'vector' || extension.extname === 'pgcrypto') &&
      extension.schema_name !== 'public'
    ) {
      await sql.unsafe(`ALTER EXTENSION ${extension.extname} SET SCHEMA public`);
    }
  }

  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;

  // Repair databases created by the former extensions-schema installer.
  const extensionSchemas = await sql`
    SELECT e.extname, n.nspname AS schema_name
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname IN ('vector', 'pgcrypto')
  `;
  for (const extension of extensionSchemas) {
    if (
      (extension.extname === 'vector' || extension.extname === 'pgcrypto') &&
      extension.schema_name !== 'public'
    ) {
      const name = extension.extname;
      await sql.unsafe(`ALTER EXTENSION ${name} SET SCHEMA public`);
    }
  }

  const extensions = await sql`
    SELECT extname, extversion
    FROM pg_extension
    WHERE extname IN ('vector', 'pgcrypto')
    ORDER BY extname
  `;
  console.info(JSON.stringify(extensions, null, 2));

  const test = await sql`SELECT '[1,2,3]'::vector(3) AS v, gen_random_uuid() AS id`;
  console.info('required extensions work:', test[0]);
} finally {
  await sql.end();
}
