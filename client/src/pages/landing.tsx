import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Phone, Mail, MapPin, ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import logoImage from "@assets/Pitchdeck_logo_1769590061051.png";
import indiaMapImage from "@assets/ChatGPT_Image_Dec_18__2025__08_43_37_PM-removebg-preview_1769521462134.png";
import bedsideImage from "@assets/ChatGPT_Image_Jan_29,_2026,_01_37_39_PM_1769674310991.png";
import labVideo from "@assets/perfusion_video_h264.mp4";
import portalLaptopImage from "@assets/ChatGPT_Image_Jan_29,_2026,_01_58_26_PM_1769675402188.png";

export default function LandingPage() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-black text-gray-900 dark:text-white overflow-x-hidden transition-colors duration-500">
      {/* Theme Toggle - Fixed position using global component */}
      <div className="fixed top-6 right-6 z-50" data-testid="container-theme-toggle">
        <ThemeToggle />
      </div>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        {/* Animated artery SVG overlay */}
        <svg 
          className="absolute inset-0 w-full h-full pointer-events-none z-10 motion-reduce:hidden"
          viewBox="0 0 1920 1080"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="arteryGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(0, 70%, 50%)" stopOpacity="0" />
              <stop offset="40%" stopColor="hsl(0, 70%, 50%)" stopOpacity="1" />
              <stop offset="60%" stopColor="hsl(0, 80%, 60%)" stopOpacity="1" />
              <stop offset="100%" stopColor="hsl(0, 70%, 50%)" stopOpacity="0" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
          {/* Main artery path - curves from India map through center to logo area with curved underline */}
          <path
            id="arteryPath"
            d="M 1350 280 
               C 1280 350 1200 420 1100 480
               Q 950 560 800 540
               C 650 520 500 480 380 460
               Q 280 445 200 480
               C 150 500 120 540 100 560
               Q 80 580 90 600
               C 120 630 200 640 320 635"
            fill="none"
            stroke="rgba(180, 50, 50, 0.15)"
            strokeWidth="3"
            className="artery-base dark:stroke-[rgba(180,50,50,0.2)]"
          />
          
          {/* Animated blood cells */}
          <circle r="10" fill="url(#arteryGradient)" filter="url(#glow)">
            <animateMotion
              dur="4s"
              repeatCount="indefinite"
              path="M 1350 280 
                    C 1280 350 1200 420 1100 480
                    Q 950 560 800 540
                    C 650 520 500 480 380 460
                    Q 280 445 200 480
                    C 150 500 120 540 100 560
                    Q 80 580 90 600
                    C 120 630 200 640 320 635"
            />
          </circle>
          
          <circle r="7" fill="hsl(0, 70%, 55%)" opacity="0.8" filter="url(#glow)">
            <animateMotion
              dur="4s"
              repeatCount="indefinite"
              begin="1.3s"
              path="M 1350 280 
                    C 1280 350 1200 420 1100 480
                    Q 950 560 800 540
                    C 650 520 500 480 380 460
                    Q 280 445 200 480
                    C 150 500 120 540 100 560
                    Q 80 580 90 600
                    C 120 630 200 640 320 635"
            />
          </circle>
          
          <circle r="5" fill="hsl(0, 60%, 45%)" opacity="0.6" filter="url(#glow)">
            <animateMotion
              dur="4s"
              repeatCount="indefinite"
              begin="2.6s"
              path="M 1350 280 
                    C 1280 350 1200 420 1100 480
                    Q 950 560 800 540
                    C 650 520 500 480 380 460
                    Q 280 445 200 480
                    C 150 500 120 540 100 560
                    Q 80 580 90 600
                    C 120 630 200 640 320 635"
            />
          </circle>
        </svg>
        
        <div className="relative z-20 container mx-auto px-6 lg:px-12 grid lg:grid-cols-2 gap-12 items-center">
          {/* Left side - Logo (2-3x larger) and tagline */}
          <div className="flex flex-col items-start space-y-6">
            <img
              src={logoImage}
              alt="Perfusion"
              className="h-auto w-[14rem] md:w-[18rem] lg:w-[22rem] drop-shadow-2xl"
              data-testid="img-landing-logo"
            />
            
            <p className="text-xl md:text-2xl lg:text-3xl font-light tracking-wide text-gray-600 dark:text-white/70">
              Connecting Remote Healthcare
            </p>
            
            <div className="relative mt-4">
              <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-red-600 via-red-500 to-red-700 rounded-full" />
              <blockquote className="pl-6 text-2xl md:text-3xl lg:text-4xl font-semibold italic leading-relaxed">
                "Because geography shouldn't decide survival."
              </blockquote>
            </div>
            
            <Link href="/home">
              <Button 
                size="lg"
                className="mt-6 bg-gradient-to-r from-red-700 via-red-600 to-red-700 text-white font-semibold tracking-wide shadow-lg shadow-red-900/30 border border-red-500/30"
                data-testid="button-enter-perfusion"
              >
                Enter Perfusion
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
          
          {/* Right side - India map */}
          <div className="relative flex items-center justify-center lg:justify-end">
            <div className="relative">
              <img
                src={indiaMapImage}
                alt="Healthcare across India"
                className="h-auto w-[24rem] md:w-[30rem] lg:w-[38rem] drop-shadow-2xl opacity-90"
                data-testid="img-india-map"
              />
              <div className="absolute inset-0 -z-10 blur-3xl bg-red-900/20 rounded-full scale-75" />
            </div>
          </div>
        </div>
        
        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center animate-bounce motion-reduce:animate-none" aria-hidden="true">
          <span className="text-gray-600 dark:text-white/70 text-sm mb-2">Scroll to explore</span>
          <div className="w-6 h-10 border-2 border-gray-400 dark:border-white/30 rounded-full flex justify-center">
            <div className="w-1.5 h-3 bg-gray-500 dark:bg-white/50 rounded-full mt-2 animate-pulse motion-reduce:animate-none" />
          </div>
        </div>
      </section>

      {/* Platform Connection Visual Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              Bridging the Healthcare Gap
            </h2>
            <p className="text-lg text-gray-600 dark:text-white/70 max-w-2xl mx-auto">
              Perfusion connects peripheral hospitals to mainstream healthcare
            </p>
          </div>
          
          {/* Horizontal flow layout: Remote → Perfusion → Mainstream */}
          <div className="relative max-w-6xl mx-auto">
            {/* Three column layout with flow direction */}
            <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-4 lg:gap-8 relative">
              
              {/* Remote Hospitals - Left */}
              <div className="flex flex-col items-center text-center md:w-1/4">
                <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-gray-100 to-white dark:from-gray-800 dark:to-gray-900 shadow-lg flex items-center justify-center border border-gray-200 dark:border-gray-700">
                  <svg className="w-10 h-10 md:w-12 md:h-12" viewBox="0 0 64 64" fill="none" role="img" aria-label="Remote hospital building">
                    <title>Remote Hospital</title>
                    <rect x="16" y="24" width="32" height="32" rx="2" className="fill-gray-200 dark:fill-gray-700" stroke="#dc2626" strokeWidth="2"/>
                    <rect x="26" y="8" width="12" height="24" rx="1" className="fill-gray-100 dark:fill-gray-600" stroke="#dc2626" strokeWidth="2"/>
                    <rect x="28" y="34" width="8" height="12" fill="#dc2626"/>
                    <line x1="32" y1="14" x2="32" y2="26" stroke="#dc2626" strokeWidth="2"/>
                    <line x1="26" y1="20" x2="38" y2="20" stroke="#dc2626" strokeWidth="2"/>
                  </svg>
                </div>
                <h3 className="mt-3 text-base md:text-lg font-bold text-gray-900 dark:text-white">Remote Hospitals</h3>
                <p className="text-gray-600 dark:text-white/60 text-xs md:text-sm">Resource-limited facilities</p>
              </div>
              
              {/* Arrow flowing INTO Perfusion */}
              <div className="hidden md:flex items-center">
                <svg className="w-16 lg:w-24 h-8" viewBox="0 0 80 30" fill="none" aria-hidden="true">
                  <path 
                    d="M 5 15 L 60 15" 
                    stroke="rgba(220, 38, 38, 0.5)"
                    className="dark:stroke-[rgba(220,38,38,0.6)]"
                    strokeWidth="3"
                    strokeDasharray="6 4"
                  >
                    <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1s" repeatCount="indefinite" />
                  </path>
                  <polygon points="60,8 75,15 60,22" fill="#dc2626" opacity="0.7" />
                </svg>
              </div>
              {/* Mobile arrow down */}
              <div className="md:hidden flex items-center justify-center">
                <svg className="w-8 h-12" viewBox="0 0 30 50" fill="none" aria-hidden="true">
                  <path d="M 15 5 L 15 35" stroke="rgba(220, 38, 38, 0.5)" strokeWidth="3" strokeDasharray="6 4">
                    <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1s" repeatCount="indefinite" />
                  </path>
                  <polygon points="8,35 15,48 22,35" fill="#dc2626" opacity="0.7" />
                </svg>
              </div>
              
              {/* Perfusion Platform - Center laptop */}
              <div className="flex flex-col items-center md:w-2/5">
                <div className="relative">
                  <img 
                    src={portalLaptopImage} 
                    alt="Perfusion Portal on laptop" 
                    className="w-[240px] md:w-[300px] lg:w-[380px] h-auto drop-shadow-2xl"
                    data-testid="img-portal-laptop"
                  />
                  {/* Subtle glow effect */}
                  <div className="absolute inset-0 -z-10 blur-3xl bg-red-600/20 scale-110 rounded-full" />
                </div>
              </div>
              
              {/* Arrow flowing OUT of Perfusion */}
              <div className="hidden md:flex items-center">
                <svg className="w-16 lg:w-24 h-8" viewBox="0 0 80 30" fill="none" aria-hidden="true">
                  <path 
                    d="M 5 15 L 60 15" 
                    stroke="rgba(220, 38, 38, 0.5)"
                    className="dark:stroke-[rgba(220,38,38,0.6)]"
                    strokeWidth="3"
                    strokeDasharray="6 4"
                  >
                    <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="1s" repeatCount="indefinite" />
                  </path>
                  <polygon points="60,8 75,15 60,22" fill="#dc2626" opacity="0.7" />
                </svg>
              </div>
              {/* Mobile arrow down */}
              <div className="md:hidden flex items-center justify-center">
                <svg className="w-8 h-12" viewBox="0 0 30 50" fill="none" aria-hidden="true">
                  <path d="M 15 5 L 15 35" stroke="rgba(220, 38, 38, 0.5)" strokeWidth="3" strokeDasharray="6 4">
                    <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="1s" repeatCount="indefinite" />
                  </path>
                  <polygon points="8,35 15,48 22,35" fill="#dc2626" opacity="0.7" />
                </svg>
              </div>
              
              {/* Mainstream Healthcare - Right */}
              <div className="flex flex-col items-center text-center md:w-1/4">
                <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-gray-100 to-white dark:from-gray-800 dark:to-gray-900 shadow-lg flex items-center justify-center border border-gray-200 dark:border-gray-700">
                  <svg className="w-10 h-10 md:w-12 md:h-12" viewBox="0 0 64 64" fill="none" role="img" aria-label="Mainstream healthcare facility">
                    <title>Mainstream Healthcare</title>
                    <rect x="8" y="20" width="48" height="36" rx="2" className="fill-gray-200 dark:fill-gray-700" stroke="#dc2626" strokeWidth="2"/>
                    <rect x="22" y="8" width="20" height="20" rx="1" className="fill-gray-100 dark:fill-gray-600" stroke="#dc2626" strokeWidth="2"/>
                    <rect x="26" y="36" width="12" height="20" fill="#dc2626"/>
                    <circle cx="32" cy="14" r="4" fill="#dc2626"/>
                    <rect x="14" y="28" width="8" height="8" fill="#dc2626" opacity="0.6"/>
                    <rect x="42" y="28" width="8" height="8" fill="#dc2626" opacity="0.6"/>
                  </svg>
                </div>
                <h3 className="mt-3 text-base md:text-lg font-bold text-gray-900 dark:text-white">Mainstream Healthcare</h3>
                <p className="text-gray-600 dark:text-white/60 text-xs md:text-sm">Specialists & diagnostics</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bedside Assistance Section - Refined with color-matched image */}
      <section className="py-24 relative" data-testid="section-bedside-assistance">
        <div className="container mx-auto px-6 lg:px-12 relative z-10">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Text side */}
              <div>
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
                  Superspeciality Support at Patient's <span className="text-red-600">Bedside</span>
                </h2>
                <p className="text-lg md:text-xl text-gray-600 dark:text-white/60 leading-relaxed">
                  When expert guidance matters most, we bring specialists directly to the patient. Real-time consultations for critically ill patients, right where care happens.
                </p>
              </div>
              
              {/* Image side with live consultation badge overlay */}
              <div className="relative">
                <div className="relative rounded-2xl overflow-hidden shadow-xl max-w-md mx-auto lg:max-w-none">
                  <img 
                    src={bedsideImage} 
                    alt="Specialist providing remote consultation to a patient at bedside via video call"
                    className="w-full h-[280px] md:h-[320px] lg:h-[380px] object-cover"
                    data-testid="img-bedside-support"
                  />
                  
                  {/* Live Consultation badge on image */}
                  <div className="absolute bottom-4 left-4 z-20">
                    <div className="flex flex-wrap items-center gap-2 bg-red-600/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg">
                      <div className="w-2 h-2 rounded-full bg-white animate-pulse motion-reduce:animate-none" />
                      <span className="text-white text-sm font-medium">Live Consultation</span>
                    </div>
                  </div>
                </div>
                {/* Subtle corner accents */}
                <div className="absolute -top-3 -left-3 w-12 h-12 border-t-2 border-l-2 border-red-600/30 rounded-tl-xl" />
                <div className="absolute -bottom-3 -right-3 w-12 h-12 border-b-2 border-r-2 border-red-600/30 rounded-br-xl" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Advanced Lab Diagnostics Section - Video and Text Layout */}
      <section className="py-24 relative overflow-hidden" data-testid="section-lab-diagnostics">
        <div className="container mx-auto px-6 lg:px-12 relative z-10">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Video side - larger */}
              <div className="relative order-2 lg:order-1">
                <div className="relative rounded-2xl overflow-hidden shadow-2xl">
                  {/* Decorative frame */}
                  <div className="absolute -inset-2 bg-gradient-to-r from-red-600 to-red-400 rounded-3xl opacity-20 blur-md" />
                  <video 
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="relative w-full h-[350px] md:h-[450px] lg:h-[500px] object-cover rounded-2xl bg-gray-900"
                    data-testid="video-lab-diagnostics"
                  >
                    <source src={labVideo} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                </div>
                {/* Corner accents */}
                <div className="absolute -top-4 -left-4 w-20 h-20 border-t-4 border-l-4 border-red-600/50 rounded-tl-3xl" />
                <div className="absolute -bottom-4 -right-4 w-20 h-20 border-b-4 border-r-4 border-red-600/50 rounded-br-3xl" />
              </div>
              
              {/* Text side */}
              <div className="order-1 lg:order-2">
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
                  Advanced Lab <span className="text-red-600">Diagnostics</span>
                </h2>
                
                <p className="text-xl md:text-2xl lg:text-3xl font-light text-gray-600 dark:text-white/70 italic mb-8">
                  "Prescribe what you need, Perfusion will move it"
                </p>
                
                <p className="text-lg text-gray-600 dark:text-white/60 mb-8 leading-relaxed">
                  Our dedicated logistics team ensures samples reach the lab swiftly, so you get results when they matter most.
                </p>
                
                {/* Fast turnaround badge */}
                <div className="flex flex-wrap items-center gap-3 bg-red-600 text-white px-6 py-3 rounded-full shadow-lg w-fit">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6 L12 12 L16 14" />
                  </svg>
                  <span className="font-semibold">Fast Turnaround Time</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Clinician-Led Section - Creative, no boxes */}
      <section className="py-24 relative" data-testid="section-clinician-led">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="max-w-4xl mx-auto text-center">
            {/* Large quote-style presentation */}
            <div className="relative">
              <span className="absolute -top-16 left-1/2 -translate-x-1/2 text-[200px] font-serif text-red-600/10 leading-none select-none" aria-hidden="true">"</span>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-8 relative z-10">
                Built by Clinicians,<br/>for Clinicians
              </h2>
            </div>
            
            <p className="text-xl md:text-2xl text-gray-600 dark:text-white/70 mb-12 leading-relaxed max-w-3xl mx-auto">
              We understand the real impact of delayed investigations and inaccurate reporting. 
              We've experienced it. We're here to change it.
            </p>
            
            {/* Visual stats without boxes */}
            <div className="flex flex-wrap justify-center gap-8 md:gap-16 mt-16">
              <div className="text-center">
                <div className="text-5xl md:text-6xl font-bold text-red-600 mb-2">Fast</div>
                <p className="text-gray-600 dark:text-white/70">Turnaround Times</p>
              </div>
              <div className="w-px bg-gradient-to-b from-transparent via-red-600/50 to-transparent hidden md:block" />
              <div className="text-center">
                <div className="text-5xl md:text-6xl font-bold text-red-600 mb-2">Quality</div>
                <p className="text-gray-600 dark:text-white/70">Accurate Reports</p>
              </div>
              <div className="w-px bg-gradient-to-b from-transparent via-red-600/50 to-transparent hidden md:block" />
              <div className="text-center">
                <div className="text-5xl md:text-6xl font-bold text-red-600 mb-2">Trust</div>
                <p className="text-gray-600 dark:text-white/70">Certified Specialists</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="py-24 relative overflow-hidden" data-testid="section-cta">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-900/10 via-transparent to-transparent dark:from-red-950/20" />
        
        <div className="container mx-auto px-6 lg:px-12 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-8">
              Book a Demo
            </h2>
            
            <div className="flex flex-wrap justify-center gap-4">
              <Button
                size="lg"
                asChild
                className="bg-gradient-to-r from-red-700 to-red-600 text-white shadow-2xl shadow-red-900/40 border border-red-500/30"
                data-testid="button-cta-phone"
              >
                <a href="tel:9244893295" className="flex flex-wrap items-center gap-3">
                  <Phone className="h-6 w-6" />
                  <span className="text-xl font-bold">Call 9244893295</span>
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Footer */}
      <footer className="py-16 border-t border-gray-200/50 dark:border-gray-800/50" data-testid="section-footer">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {/* Logo & tagline */}
            <div>
              <img
                src={logoImage}
                alt="Perfusion"
                className="h-auto w-48 mb-4"
              />
              <p className="text-gray-600 dark:text-white/70">
                Connecting Remote Healthcare
              </p>
            </div>
            
            {/* Contact Details */}
            <div>
              <h4 className="font-semibold text-lg mb-4">Contact Us</h4>
              <ul className="space-y-3">
                <li className="flex flex-wrap items-start gap-3">
                  <MapPin className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-600 dark:text-white/70" data-testid="text-contact-address">Sundernagar, Raipur (CG)</span>
                </li>
                <li className="flex flex-wrap items-center gap-3">
                  <Mail className="h-5 w-5 text-red-500 flex-shrink-0" />
                  <a href="mailto:mail@perfusionhealth.in" className="text-gray-600 dark:text-white/70" data-testid="link-email">
                    mail@perfusionhealth.in
                  </a>
                </li>
                <li className="flex flex-wrap items-center gap-3">
                  <Phone className="h-5 w-5 text-red-500 flex-shrink-0" />
                  <a href="tel:9244893295" className="text-gray-600 dark:text-white/70" data-testid="link-phone-footer">
                    9244893295
                  </a>
                </li>
              </ul>
            </div>
            
            {/* Quick Links */}
            <div>
              <h4 className="font-semibold text-lg mb-4">Quick Access</h4>
              <Link href="/home">
                <Button 
                  className="bg-gradient-to-r from-red-700 to-red-600 text-white"
                  data-testid="button-footer-enter"
                >
                  Enter Perfusion Portal
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
          
          <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800 text-center">
            <p className="text-gray-400 dark:text-white/40 text-sm">
              © {new Date().getFullYear()} Perfusion Healthcare. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
