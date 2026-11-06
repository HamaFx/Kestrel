/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Supabase's 2021 root CA. Supabase connections chain to this certificate and
// it is not in the system trust store, so every TLS-verifying client in this
// package must pin it explicitly. Single source of truth: the drizzle client
// pools (connection/pools.ts), the pg-boss queue (queue/index.ts), and
// drizzle-kit's config all resolve TLS through `resolvePostgresSslOptions()` —
// a copy that forgot the CA is what silently broke the backtest queue
// (node-postgres: "self-signed certificate in certificate chain").
//
// Operators can still override via SUPABASE_CA_CERT; keep this value in sync
// with https://supabase.com/docs/guides/platform/ssl-enforcement.
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

/** Node-postgres `ssl` option shape used by postgres-js, pg-boss, and drizzle-kit. */
export type PostgresSslOptions = false | { rejectUnauthorized: boolean; ca?: string };

export interface PostgresSslEnv {
  DB_DISABLE_SSL?: string | undefined;
  KESTREL_LOCAL_DOCKER?: string | undefined;
  NODE_ENV?: string | undefined;
  SUPABASE_CA_CERT?: string | undefined;
}

/**
 * Resolve TLS options for a Postgres connection string.
 *
 * Precedence:
 *   1. `DB_DISABLE_SSL=true` — allowed only for the bundled local Docker DB
 *      (or non-production); production without `KESTREL_LOCAL_DOCKER=true`
 *      fails closed.
 *   2. `SUPABASE_CA_CERT` — explicit operator CA bundle.
 *   3. Supabase host — pin the 2021 root CA, which is not in the system store.
 *   4. Localhost — plain TCP, matching the development database.
 *   5. Production — verify against the system CA store; elsewhere allow the
 *      self-signed certificate common to local/test databases.
 */
export function resolvePostgresSslOptions(
  connectionString: string,
  env: PostgresSslEnv = process.env,
): PostgresSslOptions {
  if (env.DB_DISABLE_SSL === 'true') {
    if (env.NODE_ENV !== 'production' || env.KESTREL_LOCAL_DOCKER === 'true') {
      return false;
    }
    throw new Error(
      '[db] DB_DISABLE_SSL=true is only permitted with KESTREL_LOCAL_DOCKER=true; ' +
        'configure verified TLS for production databases.',
    );
  }

  if (env.SUPABASE_CA_CERT) {
    const ca = env.SUPABASE_CA_CERT.split(/\\n|\n/)
      .join('\n')
      .trim();
    if (ca) return { ca, rejectUnauthorized: true };
  }

  if (connectionString.includes('supabase.co') || connectionString.includes('supabase.com')) {
    return { ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true };
  }

  if (/@(?:localhost|127\.0\.0\.1)(?::|\/)/.test(connectionString)) return false;

  return { rejectUnauthorized: env.NODE_ENV === 'production' };
}
