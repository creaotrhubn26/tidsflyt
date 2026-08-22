import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { getQueryFn } from '@/lib/queryClient';

// Targeted check for the exact queryKey shape users.tsx (Task 4) uses to
// fetch GET /api/company/users/manageable-roles: confirms getQueryFn turns
// { company_id, preview_role } into the right URL — company_id always
// present, preview_role only appended when it's a defined string (i.e. only
// while role preview is active), never as the literal "undefined".
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, queryFn: getQueryFn({ on401: 'throw' }) },
    },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
};

function useManageableRoles(companyId: number | undefined, previewRole: string | undefined) {
  return useQuery<{ roles: string[] }>({
    queryKey: [
      '/api/company/users/manageable-roles',
      { company_id: companyId, preview_role: previewRole },
    ],
    enabled: companyId != null,
  });
}

describe('manageable-roles query key (users.tsx invite dropdown)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('omits preview_role from the URL when preview is inactive', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ roles: ['tiltaksleder', 'teamleder'] }),
    });

    const { result } = renderHook(() => useManageableRoles(7, undefined), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/company/users/manageable-roles?company_id=7',
      { credentials: 'include' },
    );
    expect(result.current.data).toEqual({ roles: ['tiltaksleder', 'teamleder'] });
  });

  it('includes preview_role in the URL when a preview role is set', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ roles: ['miljoarbeider', 'member', 'user'] }),
    });

    const { result } = renderHook(() => useManageableRoles(7, 'tiltaksleder'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/company/users/manageable-roles?company_id=7&preview_role=tiltaksleder',
      { credentials: 'include' },
    );
    expect(result.current.data).toEqual({ roles: ['miljoarbeider', 'member', 'user'] });
  });
});
