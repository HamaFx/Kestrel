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

// SPDX-License-Identifier: Apache-2.0

import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/layout/page-header';
import { checkIsAdmin } from '@/lib/auth/admin-check';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    redirect('/dashboard');
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Admin Control Plane"
        description="Global AI providers, model routing, live market feeds, system health, and operator audit logs."
      />
      {children}
    </div>
  );
}
