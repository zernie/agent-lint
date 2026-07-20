import { Hero } from "@/components/sections/Hero";
import { OutputPreview } from "@/components/sections/OutputPreview";
import { Rings } from "@/components/sections/Rings";
import { Wedge } from "@/components/sections/Wedge";
import { Debunk } from "@/components/sections/Debunk";
import { RepoPicker } from "@/components/sections/RepoPicker";
import { CTA } from "@/components/sections/CTA";
import { Footer } from "@/components/Footer";

export function App() {
  return (
    <main className="min-h-screen">
      <Hero />
      <OutputPreview />
      <Rings />
      <Wedge />
      <Debunk />
      <RepoPicker />
      <CTA />
      <Footer />
    </main>
  );
}
