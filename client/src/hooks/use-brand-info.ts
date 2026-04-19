/**
 * useBrandInfo — fetches the CMS-editable brand contact + tagline. Falls
 * back to baked-in defaults from @shared/brand if the API is unavailable
 * or the field is empty.
 */
import { useQuery } from "@tanstack/react-query";
import {
  TIDUM_LEGAL_EMAIL,
  TIDUM_SUPPORT_ADDRESS,
  TIDUM_SUPPORT_EMAIL,
  TIDUM_SUPPORT_PHONE,
} from "@shared/brand";

export interface BrandInfo {
  supportEmail: string;
  supportPhone: string;
  supportAddress: string;
  legalEmail: string;
  companyName: string;
  companyTagline: string;
}

const FALLBACK: BrandInfo = {
  supportEmail: TIDUM_SUPPORT_EMAIL,
  supportPhone: TIDUM_SUPPORT_PHONE,
  supportAddress: TIDUM_SUPPORT_ADDRESS,
  legalEmail: TIDUM_LEGAL_EMAIL,
  companyName: "Tidum",
  companyTagline: "Arbeidstidssystem for felt, turnus og norsk dokumentasjonskrav.",
};

export function useBrandInfo(): BrandInfo {
  const { data } = useQuery<BrandInfo>({
    queryKey: ["/api/cms/brand"],
    queryFn: async () => {
      const res = await fetch("/api/cms/brand");
      if (!res.ok) return FALLBACK;
      const json = (await res.json()) as Partial<BrandInfo>;
      return { ...FALLBACK, ...json };
    },
    staleTime: 5 * 60_000,
  });
  return data ?? FALLBACK;
}
