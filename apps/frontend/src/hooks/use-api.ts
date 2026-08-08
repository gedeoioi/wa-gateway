'use client';

import useSWR, { SWRConfiguration } from 'swr';
import { api } from '@/lib/api';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const fetcher = <T>(url: string): Promise<ApiResponse<T>> =>
  api.get<ApiResponse<T>>(url);

export function useApi<T>(endpoint: string | null, config?: SWRConfiguration) {
  return useSWR<ApiResponse<T>>(endpoint, fetcher, {
    revalidateOnFocus: false,
    ...config,
  });
}
