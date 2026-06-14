import Image from "next/image";

import logoImage from "../../public/logo  c500.webp";

type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className = "" }: BrandLogoProps) {
  return (
    <Image
      src={logoImage}
      alt="Community Studio"
      priority
      className={`h-8 w-auto object-contain ${className}`}
    />
  );
}
