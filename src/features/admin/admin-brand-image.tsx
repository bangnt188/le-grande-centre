"use client";

import { useState } from "react";

type AdminBrandImageProps = {
  src: string;
  alt?: string;
  className?: string;
  width: number;
  height: number;
};

export function AdminBrandImage({ src, alt = "", className, width, height }: AdminBrandImageProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;

  return <img
    src={src}
    alt={alt}
    className={className}
    width={width}
    height={height}
    decoding="async"
    loading="eager"
    referrerPolicy="no-referrer"
    onError={() => setFailed(true)}
  />;
}
