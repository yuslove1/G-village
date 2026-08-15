"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Check, Receipt, ShieldCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui";
import { markWelcomeSeen } from "@/lib/onboarding";

const FEATURES = [
  { Icon: ShieldCheck, label: "Verified before you pay" },
  { Icon: Truck, label: "Delivered nationwide" },
  { Icon: Receipt, label: "Real receipt, every time" },
];

export default function WelcomePage() {
  const router = useRouter();

  function proceed(destination: string) {
    markWelcomeSeen();
    router.replace(destination);
  }

  return (
    <div className="flex min-h-dvh flex-col px-6 pt-10 lg:mx-auto lg:max-w-md lg:justify-center lg:pt-0">
      <div className="relative mx-auto flex h-[270px] w-full max-w-sm items-center justify-center rounded-card bg-surface lg:h-[300px]">
        <div className="relative h-[58%] w-[38%]">
          <Image src="/icons/phone-3d.webp" alt="" fill className="object-contain" sizes="200px" />
        </div>
        <div className="absolute right-10 top-9 h-[34%] w-[34%] lg:right-14 lg:top-10">
          <Image src="/icons/laptop-3d.webp" alt="" fill className="object-contain" sizes="140px" />
        </div>
        <span className="absolute bottom-5 right-1/2 flex h-14 w-14 translate-x-16 items-center justify-center rounded-full bg-canvas shadow-soft lg:translate-x-20">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-mint">
            <Check className="h-5 w-5 text-white" strokeWidth={3} aria-hidden />
          </span>
        </span>
      </div>

      <h1 className="mt-10 font-display text-[1.75rem] leading-tight text-ink lg:text-4xl">
        Computer Village,
        <br />
        at your doorstep<span className="text-coral">.</span>
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        Buy, sell and trade gadgets anywhere in Nigeria. Every device verified before it ships.
      </p>

      <ul className="mt-7 space-y-3.5">
        {FEATURES.map(({ Icon, label }) => (
          <li key={label} className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint-soft text-mint">
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <span className="text-sm font-semibold text-ink">{label}</span>
          </li>
        ))}
      </ul>

      <div className="mt-10 space-y-3 pb-10 lg:mt-12">
        <Button block size="lg" onClick={() => proceed("/")}>
          Get started
        </Button>
        <Button block size="lg" variant="outline" onClick={() => proceed("/login")}>
          I already have an account
        </Button>
      </div>
    </div>
  );
}
