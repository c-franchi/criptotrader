import { useState } from "react";
import { tokenLogoSources } from "@/lib/tokenLogo";

export function TokenLogo({
  address,
  symbol,
  logoUrl,
}: {
  address: string;
  symbol: string;
  logoUrl?: string | null | undefined;
}) {
  return (
    <Logo key={`${address}:${logoUrl ?? ""}`} address={address} symbol={symbol} logoUrl={logoUrl} />
  );
}
function Logo({
  address,
  symbol,
  logoUrl,
}: {
  address: string;
  symbol: string;
  logoUrl?: string | null | undefined;
}) {
  const sources = tokenLogoSources(address, logoUrl);
  const [index, setIndex] = useState(0);
  return (
    <span
      className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-bold text-primary"
      aria-hidden="true"
    >
      {sources[index] ? (
        <img
          src={sources[index]}
          alt=""
          className="size-full object-contain"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setIndex((i) => i + 1)}
        />
      ) : (
        symbol.slice(0, 3)
      )}
    </span>
  );
}
