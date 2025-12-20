import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import logoImage from "@assets/ChatGPT_Image_Dec_18,_2025,_09_45_03_PM_(1)_1766173209038.png";
import heroImage from "@assets/ChatGPT_Image_Dec_20,_2025,_02_10_02_PM_1766220033119.png";

export default function Home() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      <div className="absolute inset-0">
        <img
          src={heroImage}
          alt="Healthcare moments"
          className="h-full w-full object-cover opacity-60"
        />
        <div 
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 30%, rgba(0,0,0,0.5) 70%, rgba(0,0,0,0.9) 100%),
              radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.6) 80%)
            `
          }}
        />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6">
        <div className="flex flex-col items-center text-center">
          <img
            src={logoImage}
            alt="Perfusion"
            className="mb-8 h-auto w-80 md:w-96 lg:w-[28rem]"
            data-testid="img-logo"
          />
          
          <p className="mb-12 max-w-xl text-lg tracking-wide text-white/80 md:text-xl">
            Connecting healthcare where it matters most
          </p>

          <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
            <Link href="/user">
              <Button 
                size="lg"
                className="min-w-48 bg-[hsl(0,56%,46%)] font-semibold tracking-wide text-white border-[hsl(0,56%,52%)]"
                data-testid="button-care-seeker"
              >
                Care Seeker
              </Button>
            </Link>
            
            <Link href="/provider">
              <Button 
                variant="outline"
                size="lg"
                className="min-w-48 border-white/30 bg-black/40 font-semibold tracking-wide text-white backdrop-blur-sm"
                data-testid="button-care-provider"
              >
                Care Provider
              </Button>
            </Link>
          </div>
        </div>

        <div className="absolute bottom-8 text-center">
          <p className="text-sm tracking-widest text-white/40 uppercase">
            Trusted by critical care networks
          </p>
        </div>
      </div>
    </div>
  );
}
