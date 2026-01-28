import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Phone, Mail, MapPin, ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import logoImage from "@assets/Pitchdeck_logo_1769590061051.png";
import indiaMapImage from "@assets/ChatGPT_Image_Dec_18__2025__08_43_37_PM-removebg-preview_1769521462134.png";
import bedsideImage from "@assets/ChatGPT_Image_Dec_22,_2025,_09_07_53_PM_1769597609254.png";

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
      <section className="py-24 relative overflow-hidden bg-gray-50 dark:bg-gray-950">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              Bridging the Healthcare Gap
            </h2>
            <p className="text-lg text-gray-600 dark:text-white/70 max-w-2xl mx-auto">
              Perfusion connects peripheral hospitals to mainstream healthcare
            </p>
          </div>
          
          {/* Visual Flow Diagram - Not boxes, creative vector style */}
          <div className="relative max-w-6xl mx-auto">
            {/* Connection lines SVG background */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none motion-reduce:hidden" viewBox="0 0 1000 300" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
              {/* Left connection line */}
              <path 
                d="M 150 150 Q 300 100 400 150" 
                fill="none" 
                stroke="rgba(220, 38, 38, 0.3)"
                className="dark:stroke-[rgba(220,38,38,0.4)]"
                strokeWidth="3"
                strokeDasharray="8 4"
              >
                <animate attributeName="stroke-dashoffset" from="24" to="0" dur="1s" repeatCount="indefinite" />
              </path>
              {/* Right connection line */}
              <path 
                d="M 600 150 Q 700 100 850 150" 
                fill="none" 
                stroke="rgba(220, 38, 38, 0.3)"
                className="dark:stroke-[rgba(220,38,38,0.4)]"
                strokeWidth="3"
                strokeDasharray="8 4"
              >
                <animate attributeName="stroke-dashoffset" from="0" to="24" dur="1s" repeatCount="indefinite" />
              </path>
            </svg>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center relative z-10">
              {/* Remote Hospitals */}
              <div className="text-center">
                <div className="relative mx-auto w-40 h-40 rounded-full bg-gradient-to-br from-gray-100 to-white dark:from-gray-800 dark:to-gray-900 shadow-xl flex items-center justify-center border-2 border-gray-200 dark:border-gray-700">
                  <div className="text-center">
                    <svg className="w-16 h-16 mx-auto mb-2" viewBox="0 0 64 64" fill="none" role="img" aria-label="Remote hospital building">
                      <title>Remote Hospital</title>
                      <rect x="16" y="24" width="32" height="32" rx="2" className="fill-gray-200 dark:fill-gray-700" stroke="#dc2626" strokeWidth="2"/>
                      <rect x="26" y="8" width="12" height="24" rx="1" className="fill-gray-100 dark:fill-gray-600" stroke="#dc2626" strokeWidth="2"/>
                      <rect x="28" y="34" width="8" height="12" fill="#dc2626"/>
                      <line x1="32" y1="14" x2="32" y2="26" stroke="#dc2626" strokeWidth="2"/>
                      <line x1="26" y1="20" x2="38" y2="20" stroke="#dc2626" strokeWidth="2"/>
                    </svg>
                  </div>
                </div>
                <h3 className="mt-6 text-xl font-bold">Remote Hospitals</h3>
                <p className="mt-2 text-gray-600 dark:text-white/70 text-sm">Resource-limited facilities seeking quality care</p>
              </div>
              
              {/* Perfusion Platform - Center */}
              <div className="text-center">
                <div className="relative mx-auto w-48 h-48 rounded-full bg-gradient-to-br from-red-700 via-red-600 to-red-800 shadow-2xl shadow-red-900/50 flex items-center justify-center">
                  <div className="absolute inset-2 rounded-full bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center">
                    <img 
                      src={logoImage} 
                      alt="Perfusion" 
                      className="w-32 h-auto drop-shadow-lg"
                    />
                  </div>
                  {/* Pulse rings - uses motion-reduce for accessibility */}
                  <div className="absolute inset-0 rounded-full border-2 border-red-500/30 animate-ping motion-reduce:animate-none" style={{ animationDuration: '2s' }} />
                </div>
                <h3 className="mt-6 text-2xl font-bold">Perfusion Platform</h3>
                <p className="mt-2 text-gray-600 dark:text-white/70 text-sm">Your bridge to quality healthcare</p>
              </div>
              
              {/* Mainstream Healthcare */}
              <div className="text-center">
                <div className="relative mx-auto w-40 h-40 rounded-full bg-gradient-to-br from-gray-100 to-white dark:from-gray-800 dark:to-gray-900 shadow-xl flex items-center justify-center border-2 border-gray-200 dark:border-gray-700">
                  <div className="text-center">
                    <svg className="w-16 h-16 mx-auto mb-2" viewBox="0 0 64 64" fill="none" role="img" aria-label="Mainstream healthcare facility">
                      <title>Mainstream Healthcare</title>
                      <rect x="8" y="20" width="48" height="36" rx="2" className="fill-gray-200 dark:fill-gray-700" stroke="#dc2626" strokeWidth="2"/>
                      <rect x="22" y="8" width="20" height="20" rx="1" className="fill-gray-100 dark:fill-gray-600" stroke="#dc2626" strokeWidth="2"/>
                      <rect x="26" y="36" width="12" height="20" fill="#dc2626"/>
                      <circle cx="32" cy="14" r="4" fill="#dc2626"/>
                      <rect x="14" y="28" width="8" height="8" fill="#dc2626" opacity="0.6"/>
                      <rect x="42" y="28" width="8" height="8" fill="#dc2626" opacity="0.6"/>
                    </svg>
                  </div>
                </div>
                <h3 className="mt-6 text-xl font-bold">Mainstream Healthcare</h3>
                <p className="mt-2 text-gray-600 dark:text-white/70 text-sm">Specialists & advanced diagnostics</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section - Visual Cards with Graphics */}
      <section className="py-24 bg-white dark:bg-gray-900" data-testid="section-services">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              Our Services
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-16">
            {/* Superspeciality Consultations */}
            <div className="text-center" data-testid="card-service-consultations">
              <div className="relative mx-auto w-56 h-56 rounded-3xl bg-white/80 dark:bg-gray-900/50 shadow-xl overflow-hidden mb-8">
                <div className="absolute inset-0 bg-gradient-to-br from-red-600/20 to-transparent" />
                <div className="h-full flex items-center justify-center p-6">
                  <svg className="w-32 h-32" viewBox="0 0 120 120" fill="none" role="img" aria-label="Doctor video consultation">
                    <title>Video Consultation</title>
                    <circle cx="60" cy="35" r="20" fill="#dc2626"/>
                    <ellipse cx="60" cy="80" rx="35" ry="25" fill="#dc2626" opacity="0.8"/>
                    <rect x="75" y="15" width="30" height="25" rx="3" className="fill-gray-100 dark:fill-gray-800" stroke="#dc2626" strokeWidth="2"/>
                    <circle cx="90" cy="27" r="6" fill="#dc2626" opacity="0.6"/>
                    <path d="M85 35 L95 35" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
              <h3 className="text-2xl font-bold mb-3" data-testid="text-service-consultations-title">Superspeciality Consultations</h3>
              <p className="text-gray-600 dark:text-white/70 leading-relaxed max-w-xs mx-auto">
                Video consultations with leading specialists. Expert opinions from anywhere in India.
              </p>
            </div>
            
            {/* Advanced Diagnostics */}
            <div className="text-center" data-testid="card-service-diagnostics">
              <div className="relative mx-auto w-56 h-56 rounded-3xl bg-white/80 dark:bg-gray-900/50 shadow-xl overflow-hidden mb-8">
                <div className="absolute inset-0 bg-gradient-to-br from-red-600/20 to-transparent" />
                <div className="h-full flex items-center justify-center p-6">
                  <svg className="w-32 h-32" viewBox="0 0 120 120" fill="none" role="img" aria-label="Lab diagnostic equipment">
                    <title>Lab Diagnostics</title>
                    <rect x="30" y="40" width="40" height="55" rx="3" fill="#dc2626" opacity="0.9"/>
                    <rect x="35" y="50" width="30" height="35" rx="2" className="fill-gray-100 dark:fill-gray-800"/>
                    <circle cx="50" cy="67" r="10" fill="#dc2626" opacity="0.5"/>
                    <rect x="70" y="25" width="25" height="40" rx="8" fill="#dc2626" opacity="0.7"/>
                    <ellipse cx="82" cy="22" rx="5" ry="3" fill="#dc2626"/>
                    <path d="M20 95 L40 75 L50 85 L80 55 L100 75" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
              <h3 className="text-2xl font-bold mb-3" data-testid="text-service-diagnostics-title">Advanced Diagnostics</h3>
              <p className="text-gray-600 dark:text-white/70 leading-relaxed max-w-xs mx-auto">
                64+ diagnostic tests with doorstep sample pickup. Accurate results, fastest turnaround.
              </p>
            </div>
            
            {/* Teleradiology */}
            <div className="text-center" data-testid="card-service-teleradiology">
              <div className="relative mx-auto w-56 h-56 rounded-3xl bg-white/80 dark:bg-gray-900/50 shadow-xl overflow-hidden mb-8">
                <div className="absolute inset-0 bg-gradient-to-br from-red-600/20 to-transparent" />
                <div className="h-full flex items-center justify-center p-6">
                  <svg className="w-32 h-32" viewBox="0 0 120 120" fill="none" role="img" aria-label="X-ray and radiology imaging">
                    <title>Teleradiology</title>
                    <rect x="20" y="20" width="80" height="80" rx="8" className="fill-gray-200 dark:fill-gray-800" stroke="#dc2626" strokeWidth="3"/>
                    <ellipse cx="60" cy="55" rx="25" ry="30" fill="#dc2626" opacity="0.3"/>
                    <path d="M60 35 L60 75" stroke="#dc2626" strokeWidth="4" strokeLinecap="round"/>
                    <path d="M45 50 L75 50" stroke="#dc2626" strokeWidth="4" strokeLinecap="round"/>
                    <circle cx="85" cy="35" r="10" fill="#dc2626"/>
                    <path d="M82 35 L88 35 M85 32 L85 38" stroke="white" strokeWidth="2"/>
                  </svg>
                </div>
              </div>
              <h3 className="text-2xl font-bold mb-3" data-testid="text-service-teleradiology-title">Teleradiology Services</h3>
              <p className="text-gray-600 dark:text-white/70 leading-relaxed max-w-xs mx-auto">
                28 modalities supported. Expert radiology reports with priority emergency handling.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bedside Assistance Section - Premium visual with integrated image */}
      <section className="py-24 relative overflow-hidden bg-gradient-to-b from-gray-100 via-gray-50 to-white dark:from-gray-900 dark:via-gray-950 dark:to-black" data-testid="section-bedside-assistance">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-5 dark:opacity-10">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        </div>
        
        <div className="container mx-auto px-6 lg:px-12 relative z-10">
          <div className="max-w-6xl mx-auto">
            {/* Section header */}
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                Superspeciality Support at Patient's <span className="text-red-600">Bedside</span>
              </h2>
              <p className="text-lg md:text-xl text-gray-600 dark:text-white/60 max-w-2xl mx-auto">
                When expert guidance matters most, we bring specialists directly to the patient
              </p>
            </div>
            
            {/* Premium image showcase */}
            <div className="relative">
              {/* Main image container with premium framing */}
              <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/20 dark:shadow-black/50">
                {/* Gradient overlay for premium feel */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent z-10" />
                <div className="absolute inset-0 bg-gradient-to-r from-red-900/20 to-transparent z-10" />
                
                {/* The image */}
                <img 
                  src={bedsideImage} 
                  alt="Specialist providing remote consultation to a patient at bedside via video call"
                  className="w-full h-auto object-cover"
                  data-testid="img-bedside-support"
                />
                
                {/* Content overlay at bottom */}
                <div className="absolute bottom-0 left-0 right-0 z-20 p-8 md:p-12">
                  <div className="flex flex-wrap items-center gap-4 mb-4">
                    <div className="flex flex-wrap items-center gap-3 bg-red-600/90 backdrop-blur-sm px-4 py-2 rounded-full">
                      <div className="w-2 h-2 rounded-full bg-white animate-pulse motion-reduce:animate-none" />
                      <span className="text-white text-sm font-medium">Live Consultation</span>
                    </div>
                  </div>
                  <p className="text-white text-xl md:text-2xl font-light max-w-xl leading-relaxed">
                    Real-time specialist guidance for critically ill patients, right where care happens
                  </p>
                </div>
              </div>
              
              {/* Decorative elements */}
              <div className="absolute -top-4 -right-4 w-24 h-24 border-t-4 border-r-4 border-red-600/30 rounded-tr-3xl" />
              <div className="absolute -bottom-4 -left-4 w-24 h-24 border-b-4 border-l-4 border-red-600/30 rounded-bl-3xl" />
              
              {/* Floating accent */}
              <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-1 h-32 bg-gradient-to-b from-transparent via-red-600 to-transparent rounded-full hidden lg:block" />
            </div>
          </div>
        </div>
      </section>

      {/* Advanced Lab Diagnostics Section - Logistics Animation */}
      <section className="py-24 relative overflow-hidden bg-white dark:bg-gray-900" data-testid="section-lab-diagnostics">
        <div className="container mx-auto px-6 lg:px-12 relative z-10">
          <div className="max-w-6xl mx-auto">
            {/* Section header with tagline */}
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
                Advanced Lab <span className="text-red-600">Diagnostics</span>
              </h2>
              <p className="text-2xl md:text-3xl lg:text-4xl font-light text-gray-600 dark:text-white/70 italic">
                "Prescribe once. Everything else moves."
              </p>
            </div>
            
            {/* Animated logistics flow */}
            <div className="relative bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-3xl p-8 md:p-12 shadow-xl overflow-hidden">
              {/* Background grid pattern */}
              <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'linear-gradient(90deg, currentColor 1px, transparent 1px), linear-gradient(currentColor 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
              
              {/* The animated scene */}
              <div className="relative h-[400px] md:h-[500px]">
                
                {/* Hospital/ICU Room Background */}
                <div className="absolute inset-0 flex items-end justify-center">
                  <svg className="w-full h-full" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                    {/* ICU Room walls */}
                    <rect x="50" y="100" width="700" height="280" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.2" rx="4" />
                    
                    {/* Door frame */}
                    <rect x="620" y="120" width="100" height="240" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.3" rx="2" />
                    <rect x="665" y="230" width="8" height="20" fill="currentColor" opacity="0.3" rx="2" />
                    
                    {/* Patient bed */}
                    <rect x="150" y="280" width="180" height="15" fill="#dc2626" opacity="0.3" rx="3" />
                    <rect x="140" y="295" width="10" height="40" fill="#dc2626" opacity="0.2" rx="2" />
                    <rect x="320" y="295" width="10" height="40" fill="#dc2626" opacity="0.2" rx="2" />
                    <ellipse cx="180" cy="265" rx="25" ry="18" fill="currentColor" opacity="0.15" />
                    <rect x="200" y="250" width="100" height="35" fill="currentColor" opacity="0.1" rx="3" />
                    
                    {/* IV stand */}
                    <line x1="350" y1="180" x2="350" y2="300" stroke="currentColor" strokeWidth="2" opacity="0.2" />
                    <rect x="340" y="170" width="20" height="30" fill="currentColor" opacity="0.15" rx="3" />
                  </svg>
                </div>
                
                {/* Doctor with prescription - Left side */}
                <div className="absolute left-[10%] md:left-[15%] top-1/2 -translate-y-1/2">
                  <div className="relative">
                    {/* Doctor figure */}
                    <svg className="w-24 h-36 md:w-32 md:h-48" viewBox="0 0 80 120" fill="none" aria-hidden="true">
                      {/* Head */}
                      <circle cx="40" cy="20" r="15" fill="#f5d0c5" />
                      {/* Hair */}
                      <path d="M28 15 Q40 5 52 15 Q50 10 40 10 Q30 10 28 15" fill="#4a3728" />
                      {/* Body - white coat */}
                      <path d="M25 35 L55 35 L60 100 L20 100 Z" fill="white" stroke="#e5e5e5" strokeWidth="1" />
                      {/* Stethoscope */}
                      <path d="M35 40 Q30 50 35 60" stroke="#374151" strokeWidth="2" fill="none" />
                      <circle cx="35" cy="62" r="4" fill="#374151" />
                      {/* Arms */}
                      <path d="M25 40 L10 70" stroke="#f5d0c5" strokeWidth="6" strokeLinecap="round" />
                      <path d="M55 40 L70 55" stroke="#f5d0c5" strokeWidth="6" strokeLinecap="round" />
                    </svg>
                    
                    {/* Prescription pad with animation */}
                    <div className="absolute -right-16 top-8 md:-right-20 md:top-12">
                      <div className="bg-white dark:bg-gray-100 rounded-lg shadow-lg p-3 w-32 md:w-40 transform rotate-6">
                        <div className="border-b-2 border-red-600 pb-1 mb-2">
                          <span className="text-[8px] md:text-[10px] text-red-600 font-bold">Rx</span>
                        </div>
                        <div className="space-y-1">
                          <div className="h-1.5 bg-gray-300 rounded w-3/4" />
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[10px] md:text-xs text-gray-800 font-medium animate-pulse motion-reduce:animate-none">Serum ANA</span>
                          </div>
                          <div className="h-1 bg-gray-200 rounded w-1/2" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Animated path - dotted line from prescription to door */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet">
                  <path 
                    d="M280 200 C350 200 400 180 500 200 S600 220 670 240"
                    stroke="#dc2626"
                    strokeWidth="3"
                    strokeDasharray="10 10"
                    fill="none"
                    opacity="0.4"
                  >
                    <animate 
                      attributeName="stroke-dashoffset"
                      from="100"
                      to="0"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </path>
                </svg>
                
                {/* Moving sample/package along the path */}
                <div className="absolute motion-reduce:hidden" style={{ animation: 'movePackage 4s ease-in-out infinite' }}>
                  <svg className="w-8 h-8 md:w-10 md:h-10" viewBox="0 0 40 40" fill="none">
                    <rect x="5" y="10" width="30" height="25" rx="3" fill="#dc2626" />
                    <rect x="10" y="15" width="20" height="3" rx="1" fill="white" opacity="0.8" />
                    <path d="M15 5 L20 10 L25 5" stroke="#dc2626" strokeWidth="2" fill="none" />
                  </svg>
                </div>
                
                {/* Delivery agent at door - Right side */}
                <div className="absolute right-[8%] md:right-[12%] top-1/2 -translate-y-1/2">
                  <div className="relative">
                    {/* Agent figure with Perfusion uniform */}
                    <svg className="w-20 h-32 md:w-28 md:h-44" viewBox="0 0 70 110" fill="none" aria-hidden="true">
                      {/* Head with cap */}
                      <circle cx="35" cy="18" r="13" fill="#e8c4b8" />
                      <path d="M22 12 Q35 0 48 12 L48 16 L22 16 Z" fill="#dc2626" />
                      
                      {/* Body - Perfusion red uniform */}
                      <path d="M22 30 L48 30 L52 95 L18 95 Z" fill="#dc2626" />
                      
                      {/* Perfusion logo on chest */}
                      <rect x="28" y="40" width="14" height="8" rx="1" fill="white" opacity="0.9" />
                      <text x="35" y="47" fontSize="5" fill="#dc2626" textAnchor="middle" fontWeight="bold">P</text>
                      
                      {/* Arms */}
                      <path d="M22 35 L8 60" stroke="#dc2626" strokeWidth="8" strokeLinecap="round" />
                      <path d="M48 35 L58 55" stroke="#dc2626" strokeWidth="8" strokeLinecap="round" />
                      
                      {/* Hands */}
                      <circle cx="8" cy="62" r="5" fill="#e8c4b8" />
                      <circle cx="60" cy="57" r="5" fill="#e8c4b8" />
                      
                      {/* Legs */}
                      <rect x="24" y="95" width="10" height="12" fill="#374151" rx="2" />
                      <rect x="38" y="95" width="10" height="12" fill="#374151" rx="2" />
                      
                      {/* Collection bag */}
                      <rect x="0" y="50" width="18" height="22" rx="3" fill="white" stroke="#dc2626" strokeWidth="2" />
                      <text x="9" y="64" fontSize="6" fill="#dc2626" textAnchor="middle" fontWeight="bold">LAB</text>
                    </svg>
                    
                    {/* Speech bubble */}
                    <div className="absolute -top-8 -left-4 md:-top-10 md:-left-8 bg-white dark:bg-gray-100 rounded-xl px-3 py-2 shadow-lg">
                      <p className="text-[10px] md:text-xs text-gray-800 font-medium whitespace-nowrap">Sample pickup!</p>
                      <div className="absolute -bottom-2 left-4 w-0 h-0 border-l-4 border-r-4 border-t-8 border-transparent border-t-white dark:border-t-gray-100" />
                    </div>
                  </div>
                </div>
                
                {/* Fast turnaround badge */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-wrap items-center gap-3 bg-red-600 text-white px-6 py-3 rounded-full shadow-lg">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6 L12 12 L16 14" />
                  </svg>
                  <span className="font-semibold text-sm md:text-base">Fast Turnaround Time</span>
                </div>
              </div>
            </div>
            
            {/* Bottom description */}
            <p className="text-center text-lg md:text-xl text-gray-600 dark:text-white/60 mt-8 max-w-2xl mx-auto">
              Our dedicated logistics team ensures samples reach the lab swiftly, so you get results when they matter most.
            </p>
          </div>
        </div>
        
        {/* CSS animation for package movement */}
        <style>{`
          @keyframes movePackage {
            0% { left: 30%; top: 45%; opacity: 0; }
            10% { opacity: 1; }
            50% { left: 55%; top: 42%; }
            90% { opacity: 1; }
            100% { left: 75%; top: 50%; opacity: 0; }
          }
        `}</style>
      </section>

      {/* Clinician-Led Section - Creative, no boxes */}
      <section className="py-24 relative bg-gray-50 dark:bg-gray-950" data-testid="section-clinician-led">
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
      <section className="py-24 relative overflow-hidden bg-gray-50 dark:bg-gray-950" data-testid="section-cta">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-950/20 via-transparent to-transparent" />
        
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
      <footer className="py-16 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-black" data-testid="section-footer">
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
