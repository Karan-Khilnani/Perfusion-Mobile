import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Phone, Mail, MapPin, Stethoscope, FlaskConical, Radio, HeartPulse, Clock, Award, ArrowRight } from "lucide-react";
import logoImage from "@assets/ChatGPT_Image_Dec_18,_2025,_09_45_03_PM_(1)_1766173209038.png";
import indiaMapImage from "@assets/ChatGPT_Image_Dec_18__2025__08_43_37_PM-removebg-preview_1769521462134.png";

export default function LandingPage() {
  return (
    <div className="min-h-screen w-full bg-black text-white overflow-x-hidden">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black" />
        
        {/* Animated artery SVG overlay */}
        <svg 
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
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
          
          {/* Main artery path - flows from India map to logo */}
          <path
            id="arteryPath"
            d="M 1400 200 
               C 1350 250 1300 300 1250 350
               Q 1150 450 1050 500
               C 950 550 850 520 750 540
               Q 650 560 550 540
               C 450 520 400 500 350 480
               L 200 460
               Q 180 455 160 460
               L 100 480"
            fill="none"
            stroke="rgba(180, 50, 50, 0.15)"
            strokeWidth="3"
            className="artery-base"
          />
          
          {/* Animated blood flow */}
          <circle r="8" fill="url(#arteryGradient)" filter="url(#glow)">
            <animateMotion
              dur="4s"
              repeatCount="indefinite"
              path="M 1400 200 
                    C 1350 250 1300 300 1250 350
                    Q 1150 450 1050 500
                    C 950 550 850 520 750 540
                    Q 650 560 550 540
                    C 450 520 400 500 350 480
                    L 200 460
                    Q 180 455 160 460
                    L 100 480"
            />
          </circle>
          
          {/* Secondary pulse */}
          <circle r="6" fill="hsl(0, 70%, 55%)" opacity="0.7" filter="url(#glow)">
            <animateMotion
              dur="4s"
              repeatCount="indefinite"
              begin="1s"
              path="M 1400 200 
                    C 1350 250 1300 300 1250 350
                    Q 1150 450 1050 500
                    C 950 550 850 520 750 540
                    Q 650 560 550 540
                    C 450 520 400 500 350 480
                    L 200 460
                    Q 180 455 160 460
                    L 100 480"
            />
          </circle>
          
          {/* Third pulse */}
          <circle r="5" fill="hsl(0, 60%, 45%)" opacity="0.5" filter="url(#glow)">
            <animateMotion
              dur="4s"
              repeatCount="indefinite"
              begin="2s"
              path="M 1400 200 
                    C 1350 250 1300 300 1250 350
                    Q 1150 450 1050 500
                    C 950 550 850 520 750 540
                    Q 650 560 550 540
                    C 450 520 400 500 350 480
                    L 200 460
                    Q 180 455 160 460
                    L 100 480"
            />
          </circle>
          
          {/* Underline animation at logo */}
          <line x1="80" y1="520" x2="280" y2="520" stroke="transparent" strokeWidth="3">
            <animate
              attributeName="stroke"
              values="transparent;hsl(0, 70%, 50%);hsl(0, 80%, 60%);hsl(0, 70%, 50%);transparent"
              dur="4s"
              repeatCount="indefinite"
              begin="3.5s"
            />
          </line>
        </svg>
        
        <div className="relative z-20 container mx-auto px-6 lg:px-12 grid lg:grid-cols-2 gap-12 items-center">
          {/* Left side - Logo and tagline */}
          <div className="flex flex-col items-start space-y-8">
            <img
              src={logoImage}
              alt="Perfusion"
              className="h-auto w-[20rem] md:w-[26rem] lg:w-[32rem] drop-shadow-2xl"
              data-testid="img-landing-logo"
            />
            
            <p className="text-xl md:text-2xl lg:text-3xl font-light tracking-wide text-white/90">
              Connecting Remote Healthcare
            </p>
            
            <div className="relative mt-6">
              <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-red-600 via-red-500 to-red-700 rounded-full" />
              <blockquote className="pl-6 text-2xl md:text-3xl lg:text-4xl font-semibold italic text-white leading-relaxed">
                "Because geography shouldn't decide survival."
              </blockquote>
            </div>
            
            <Link href="/home">
              <Button 
                size="lg"
                className="mt-8 min-w-56 bg-gradient-to-r from-red-700 via-red-600 to-red-700 text-white font-semibold tracking-wide shadow-lg shadow-red-900/30 border border-red-500/30"
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
                className="h-auto w-[22rem] md:w-[28rem] lg:w-[36rem] drop-shadow-2xl opacity-90"
                data-testid="img-india-map"
              />
              {/* Subtle glow behind map */}
              <div className="absolute inset-0 -z-10 blur-3xl bg-red-900/20 rounded-full scale-75" />
            </div>
          </div>
        </div>
        
        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center animate-bounce" aria-hidden="true">
          <span className="text-white/50 text-sm mb-2">Scroll to explore</span>
          <div className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center">
            <div className="w-1.5 h-3 bg-white/50 rounded-full mt-2 animate-pulse" />
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-24 bg-gradient-to-b from-black via-gray-900 to-black">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
              Bridging the Healthcare Gap
            </h2>
            <p className="text-lg md:text-xl text-white/70 max-w-3xl mx-auto">
              Perfusion connects peripheral hospitals to mainstream healthcare, ensuring every patient has access to quality care
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {/* Superspeciality Consultations */}
            <div className="group relative p-8 rounded-2xl bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700/50 hover:border-red-600/50 transition-all duration-300" data-testid="card-service-consultations">
              <div className="absolute inset-0 bg-gradient-to-br from-red-900/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center mb-6 shadow-lg shadow-red-900/30">
                  <Stethoscope className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-4" data-testid="text-service-consultations-title">Superspeciality Consultations</h3>
                <p className="text-white/70 leading-relaxed">
                  Connect with leading specialists through secure video consultations. Access expert medical opinions from anywhere in India, bringing world-class healthcare to your doorstep.
                </p>
              </div>
            </div>
            
            {/* Advanced Diagnostics */}
            <div className="group relative p-8 rounded-2xl bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700/50 hover:border-red-600/50 transition-all duration-300" data-testid="card-service-diagnostics">
              <div className="absolute inset-0 bg-gradient-to-br from-red-900/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center mb-6 shadow-lg shadow-red-900/30">
                  <FlaskConical className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-4" data-testid="text-service-diagnostics-title">Advanced Diagnostics</h3>
                <p className="text-white/70 leading-relaxed">
                  Comprehensive lab testing with doorstep sample pickup. 64+ diagnostic tests across 9 categories, ensuring accurate results with fastest turnaround times.
                </p>
              </div>
            </div>
            
            {/* Teleradiology */}
            <div className="group relative p-8 rounded-2xl bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700/50 hover:border-red-600/50 transition-all duration-300" data-testid="card-service-teleradiology">
              <div className="absolute inset-0 bg-gradient-to-br from-red-900/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center mb-6 shadow-lg shadow-red-900/30">
                  <Radio className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-4" data-testid="text-service-teleradiology-title">Teleradiology Services</h3>
                <p className="text-white/70 leading-relaxed">
                  Expert medical imaging interpretation with 28 modalities supported. Get accurate radiology reports from certified radiologists, with priority handling for emergencies.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bedside Assistance Section */}
      <section className="py-24 bg-black relative overflow-hidden" data-testid="section-bedside-assistance">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-950/20 via-transparent to-transparent" />
        
        <div className="container mx-auto px-6 lg:px-12 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-900/30 border border-red-700/30 mb-6">
                <HeartPulse className="h-5 w-5 text-red-500" />
                <span className="text-sm font-medium text-red-400">Critical Care Support</span>
              </div>
              
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 leading-tight">
                Bedside Assistance for Critically Ill Patients
              </h2>
              
              <p className="text-lg text-white/70 mb-8 leading-relaxed">
                When every second counts, Perfusion provides real-time expert guidance to healthcare providers treating critically ill patients. Our specialists work alongside your team, ensuring optimal care decisions at the bedside.
              </p>
              
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold">1</span>
                  </div>
                  <span className="text-white/80">24/7 access to critical care specialists</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold">2</span>
                  </div>
                  <span className="text-white/80">Real-time consultation during emergencies</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold">3</span>
                  </div>
                  <span className="text-white/80">Protocol-driven treatment guidance</span>
                </li>
              </ul>
            </div>
            
            <div className="relative">
              <div className="aspect-square rounded-2xl bg-gradient-to-br from-gray-800/50 to-gray-900/80 border border-gray-700/50 p-8 flex items-center justify-center">
                <div className="text-center">
                  <HeartPulse className="h-24 w-24 text-red-500 mx-auto mb-6 animate-pulse" />
                  <p className="text-2xl font-semibold text-white/90">Life-saving support</p>
                  <p className="text-white/60 mt-2">When distance isn't an option</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Clinician-Led Platform Section */}
      <section className="py-24 bg-gradient-to-b from-black to-gray-900" data-testid="section-clinician-led">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-900/30 border border-red-700/30 mb-6">
              <Award className="h-5 w-5 text-red-500" />
              <span className="text-sm font-medium text-red-400">Clinician-Led Excellence</span>
            </div>
            
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
              Built by Clinicians, for Clinicians
            </h2>
            
            <p className="text-lg md:text-xl text-white/70 mb-12 leading-relaxed">
              Perfusion is a clinician-led platform that understands the real impact of delayed investigations and inaccurate reporting. We've experienced it firsthand, and we're here to change it.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="flex items-start gap-4 p-6 rounded-xl bg-gray-800/30 border border-gray-700/30">
              <div className="w-12 h-12 rounded-lg bg-red-600/20 flex items-center justify-center flex-shrink-0">
                <Clock className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <h4 className="font-semibold text-lg mb-2">Fastest Turnaround Times</h4>
                <p className="text-white/60">Critical results delivered when they matter most, not when it's convenient.</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4 p-6 rounded-xl bg-gray-800/30 border border-gray-700/30">
              <div className="w-12 h-12 rounded-lg bg-red-600/20 flex items-center justify-center flex-shrink-0">
                <Award className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <h4 className="font-semibold text-lg mb-2">High-Quality Reports</h4>
                <p className="text-white/60">Accurate, detailed reports from certified specialists you can trust.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="py-24 bg-gradient-to-b from-gray-900 to-black relative overflow-hidden" data-testid="section-cta">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-red-950/30 via-transparent to-transparent" />
        
        <div className="container mx-auto px-6 lg:px-12 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
              Ready to Transform Healthcare Access?
            </h2>
            <p className="text-lg text-white/70 mb-10">
              Join hospitals and healthcare providers across India who are bridging the gap with Perfusion
            </p>
            
            <div className="inline-flex flex-col sm:flex-row items-center gap-4 p-6 rounded-2xl bg-gradient-to-r from-red-900/40 to-red-800/40 border border-red-600/30">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center">
                  <Phone className="h-7 w-7 text-white" />
                </div>
                <div className="text-left">
                  <p className="text-sm text-white/60">Book a Demo</p>
                  <a href="tel:9244893295" className="text-2xl font-bold text-white hover:text-red-400 transition-colors" data-testid="link-phone">
                    9244893295
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Footer */}
      <footer className="py-16 bg-black border-t border-gray-800" data-testid="section-footer">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="grid md:grid-cols-3 gap-12">
            {/* Logo & tagline */}
            <div>
              <img
                src={logoImage}
                alt="Perfusion"
                className="h-auto w-40 mb-4"
              />
              <p className="text-white/60">
                Connecting Remote Healthcare
              </p>
            </div>
            
            {/* Contact Details */}
            <div>
              <h4 className="font-semibold text-lg mb-4">Contact Us</h4>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <span className="text-white/70" data-testid="text-contact-address">Sundernagar, Raipur (CG)</span>
                </li>
                <li className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-red-500 flex-shrink-0" />
                  <a href="mailto:mail@perfusionhealth.in" className="text-white/70 hover:text-red-400 transition-colors" data-testid="link-email">
                    mail@perfusionhealth.in
                  </a>
                </li>
                <li className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-red-500 flex-shrink-0" />
                  <a href="tel:9244893295" className="text-white/70 hover:text-red-400 transition-colors">
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
          
          <div className="mt-12 pt-8 border-t border-gray-800 text-center">
            <p className="text-white/40 text-sm">
              © {new Date().getFullYear()} Perfusion Healthcare. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
