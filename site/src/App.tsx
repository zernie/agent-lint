import { StickyCTA } from "@/components/StickyCTA";
import { Toaster } from "@/components/ui/toaster";
import { Hero } from "@/components/sections/Hero";
import { Wedge } from "@/components/sections/Wedge";
import { VerbMap } from "@/components/sections/VerbMap";
import { Debunk } from "@/components/sections/Debunk";
import { DemoAudit } from "@/components/sections/DemoAudit";
import { Adoption } from "@/components/sections/Adoption";
import { FAQ } from "@/components/sections/FAQ";
import { CTA } from "@/components/sections/CTA";
import { Footer } from "@/components/Footer";

export function App() {
  return (
    <>
      <StickyCTA />
      <main className="min-h-screen">
        <Hero />
        <Wedge />
        <VerbMap />
        <Debunk />
        <DemoAudit />
        <Adoption />
        <FAQ />
        <CTA />
        <Footer />
      </main>
      <Toaster />
    </>
  );
}
