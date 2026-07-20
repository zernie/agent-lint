import { Hero } from "@/components/sections/Hero";
import { Rings } from "@/components/sections/Rings";
import { Wedge } from "@/components/sections/Wedge";
import { Debunk } from "@/components/sections/Debunk";
import { CTA } from "@/components/sections/CTA";
import { Footer } from "@/components/Footer";

export function App() {
  return (
    <main className="min-h-screen">
      <Hero />
      <Rings />
      <Wedge />
      <Debunk />
      <CTA />
      <Footer />
    </main>
  );
}
