import { StickyCTA } from "@/components/StickyCTA";
import { Toaster } from "@/components/ui/toaster";
import { Hero } from "@/components/sections/Hero";
import { Wedge } from "@/components/sections/Wedge";
import { Debunk } from "@/components/sections/Debunk";
import { DemoAudit } from "@/components/sections/DemoAudit";
import { CTA } from "@/components/sections/CTA";
import { Footer } from "@/components/Footer";

export function App() {
  return (
    <>
      <StickyCTA />
      <main className="min-h-screen">
        <Hero />
        <Wedge />
        <Debunk />
        <DemoAudit />
        <CTA />
        <Footer />
      </main>
      <Toaster />
    </>
  );
}
