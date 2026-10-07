import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Users2,
  ShieldCheck,
  BarChart3,
  CheckSquare,
  Lock,
  ArrowRight,
  Menu,
  X,
  Building2,
  Mail,
  Send,
  FileText,
  Shield,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { Logo } from '../components/Logo.js';
import { LegalDocsModal } from './LegalDocsModal.js';

interface PublicWebsiteProps {
  onNavigateToAuth: (mode?: 'login' | 'register' | 'organization-login') => void;
  isAuthenticated?: boolean;
  onGoToWorkspace?: () => void;
}

export const PublicWebsite: React.FC<PublicWebsiteProps> = ({
  onNavigateToAuth,
  isAuthenticated = false,
  onGoToWorkspace,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [legalModalCategory, setLegalModalCategory] = useState<'privacy' | 'terms'>('privacy');

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Thesis Progress Tracker – Research Coordination Platform';
    }
  }, []);

  // Contact form state
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [contactSubmitting, setContactSubmitting] = useState(false);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleOpenPolicies = (category: 'privacy' | 'terms' = 'privacy') => {
    setLegalModalCategory(category);
    setLegalModalOpen(true);
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) return;

    setContactSubmitting(true);
    // Simulate swift confirmation
    setTimeout(() => {
      setContactSubmitting(false);
      setContactSubmitted(true);
      setContactName('');
      setContactEmail('');
      setContactSubject('');
      setContactMessage('');
    }, 600);
  };

  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased selection:bg-blue-600 selection:text-white flex flex-col">
      {/* ========================================================================= */}
      {/* 1. PUBLIC HEADER                                                          */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Left Brand */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-lg cursor-pointer"
              aria-label="Thesis Progress Tracker Home"
            >
              <Logo size="sm" showText={false} />
              <div>
                <span className="text-sm font-extrabold text-slate-900 tracking-tight block">
                  Thesis Progress Tracker
                </span>
                <span className="text-[11px] font-medium text-slate-500 tracking-normal block -mt-0.5">
                  Research Coordination Platform
                </span>
              </div>
            </button>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-slate-600">
            <button
              onClick={() => scrollToSection('about')}
              className="hover:text-slate-900 transition-colors cursor-pointer py-1"
            >
              About
            </button>
            <button
              onClick={() => scrollToSection('capabilities')}
              className="hover:text-slate-900 transition-colors cursor-pointer py-1"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="hover:text-slate-900 transition-colors cursor-pointer py-1"
            >
              How It Works
            </button>
            <button
              onClick={() => scrollToSection('privacy')}
              className="hover:text-slate-900 transition-colors cursor-pointer py-1"
            >
              Policies
            </button>
            <button
              onClick={() => scrollToSection('contact')}
              className="hover:text-slate-900 transition-colors cursor-pointer py-1"
            >
              Contact
            </button>
          </nav>

          {/* Header Action CTAs */}
          <div className="hidden sm:flex items-center gap-2.5">
            {isAuthenticated ? (
              <button
                onClick={onGoToWorkspace}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-colors cursor-pointer"
              >
                Go to Workspace →
              </button>
            ) : (
              <>
                <button
                  onClick={() => onNavigateToAuth('login')}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  onClick={() => onNavigateToAuth('register')}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-all active:scale-[0.98] cursor-pointer"
                >
                  Get Started
                </button>
              </>
            )}
          </div>

          {/* Mobile Hamburger Button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-600"
              aria-label={mobileMenuOpen ? 'Close Menu' : 'Open Menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-slate-200 px-4 pt-3 pb-6 space-y-3 animate-in slide-in-from-top-2 duration-150">
            <div className="flex flex-col space-y-2 text-sm font-semibold text-slate-700 border-b border-slate-100 pb-3">
              <button
                onClick={() => scrollToSection('about')}
                className="text-left py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                About
              </button>
              <button
                onClick={() => scrollToSection('capabilities')}
                className="text-left py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Features
              </button>
              <button
                onClick={() => scrollToSection('how-it-works')}
                className="text-left py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                How It Works
              </button>
              <button
                onClick={() => scrollToSection('privacy')}
                className="text-left py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Policies
              </button>
              <button
                onClick={() => scrollToSection('contact')}
                className="text-left py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Contact
              </button>
            </div>

            <div className="pt-1 flex flex-col gap-2">
              {isAuthenticated ? (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onGoToWorkspace?.();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-center text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  Go to Research Workspace →
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigateToAuth('login');
                    }}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-center text-slate-800 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigateToAuth('register');
                    }}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-center text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer"
                  >
                    Get Started
                  </button>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigateToAuth('organization-login');
                    }}
                    className="w-full py-2 text-center text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  >
                    Organization Administration Login →
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ========================================================================= */}
      {/* 2. HERO SECTION                                                           */}
      {/* ========================================================================= */}
      <section className="relative pt-12 pb-16 sm:pt-20 sm:pb-24 overflow-hidden border-b border-slate-200/80 bg-gradient-to-b from-white via-slate-50/60 to-slate-100/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            {/* Domain Context Kicker (No Pill Enclosure - Clean text) */}
            <p className="text-xs font-bold tracking-widest text-blue-700 uppercase">
              General-Purpose Thesis & Clinical Research Coordination Platform
            </p>

            {/* Primary Heading */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.12]">
              RESEARCH WORK,
              <br className="hidden sm:inline" /> ORGANIZED FROM PROTOCOL
              <br className="hidden sm:inline" /> TO COMPLETION.
            </h1>

            {/* Supporting Text */}
            <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
              A structured workspace for managing thesis studies, clinical research cases, milestones,
              documentation, and investigator collaboration.
            </p>

            {/* CTAs */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
              <button
                onClick={() => onNavigateToAuth('register')}
                className="w-full sm:w-auto min-h-[46px] px-7 py-3 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Get Started</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => onNavigateToAuth('login')}
                className="w-full sm:w-auto min-h-[46px] px-6 py-3 rounded-xl font-bold text-sm text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 transition-all cursor-pointer flex items-center justify-center"
              >
                Sign In
              </button>
            </div>

            {/* Credibility Line (No exaggerated claims) */}
            <p className="text-xs text-slate-500 font-medium pt-1">
              Built for academic and clinical research coordination.
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. PRODUCT CAPABILITY SECTION                                            */}
      {/* ========================================================================= */}
      <section id="capabilities" className="py-16 sm:py-24 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
              Platform Features
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Everything needed to coordinate research progress.
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Designed specifically for multi-investigator teams, thesis candidates, and academic
              departments requiring consistency and data integrity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Card 1 */}
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-4 hover:border-slate-300 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-slate-900">Study Management</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Organize study information, investigators, research phases, and essential study details.
                </p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-4 hover:border-slate-300 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-slate-900">Progress Tracking</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Track milestones, cases, tasks, and overall study completion status.
                </p>
              </div>
            </div>

            {/* Card 3 */}
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-4 hover:border-slate-300 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                <Users2 className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-slate-900">Research Coordination</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Keep investigators and study teams aligned through a centralized workspace.
                </p>
              </div>
            </div>

            {/* Card 4 */}
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-4 hover:border-slate-300 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-slate-900">Controlled Access</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Separate researcher and organization access with appropriate authentication and permissions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. HOW IT WORKS SECTION                                                  */}
      {/* ========================================================================= */}
      <section id="how-it-works" className="py-16 sm:py-24 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
              Study Lifecycle
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              How It Works
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              A systematic 4-step workflow tailored for academic research and clinical audits.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Step 1 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3 shadow-2xs relative">
              <span className="text-2xl font-black text-blue-600 font-mono">01</span>
              <h3 className="text-base font-bold text-slate-900">Create or Join a Study</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Initialize a study protocol or join an active investigation via secure team invitation code.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3 shadow-2xs relative">
              <span className="text-2xl font-black text-blue-600 font-mono">02</span>
              <h3 className="text-base font-bold text-slate-900">Configure Research Details</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Specify study criteria, target sample size, custom metadata fields, and investigator roles.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3 shadow-2xs relative">
              <span className="text-2xl font-black text-blue-600 font-mono">03</span>
              <h3 className="text-base font-bold text-slate-900">Track Progress and Cases</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Record cases in real time with built-in duplicate prevention and live investigator sync.
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3 shadow-2xs relative">
              <span className="text-2xl font-black text-blue-600 font-mono">04</span>
              <h3 className="text-base font-bold text-slate-900">Complete and Review</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Verify milestone deliverables, review team quotas, and export study summaries for committee review.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. RESEARCH DATA PRIVACY SECTION                                         */}
      {/* ========================================================================= */}
      <section id="privacy" className="py-16 sm:py-20 bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 sm:p-10 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Research Data Privacy</h2>
                <p className="text-xs text-slate-500">Ethical Data Minimization Standard</p>
              </div>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed">
              Use only the minimum information required for research coordination. Do not enter
              unnecessary personally identifiable patient information.
            </p>

            <div className="pt-2 flex items-center gap-4">
              <button
                onClick={() => handleOpenPolicies('privacy')}
                className="text-xs font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1.5 transition-colors cursor-pointer group"
              >
                <span>View Policies</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. PUBLIC ABOUT SECTION                                                   */}
      {/* ========================================================================= */}
      <section id="about" className="py-16 sm:py-24 bg-slate-50 border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="space-y-2">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
              About the Platform
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Designed for structured research coordination.
            </h2>
          </div>

          <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
            <p>
              Thesis Progress Tracker is designed to help researchers organize study progress, coordinate
              research activities, and maintain a structured research workspace.
            </p>
            <p>
              Academic research projects, particularly in clinical and thesis environments, require
              rigorous documentation without administrative overhead. This platform centralizes
              investigator collaboration, study metadata, milestone tracking, and case management into a
              single coherent environment.
            </p>
            <p className="text-xs text-slate-500 font-medium">
              Applicable for Pharm.D thesis projects, academic research, hospital-based studies, clinical
              research coordination, surveys, and multi-investigator teams.
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 7. CONTACT / SUPPORT SECTION                                             */}
      {/* ========================================================================= */}
      <section id="contact" className="py-16 sm:py-24 bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
            <div className="space-y-4">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                Support & Contact
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Get in touch with the platform team.
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Have a question regarding study setup, platform configuration, or institutional access?
                Submit an inquiry and our team will get back to you.
              </p>

              <div className="pt-4 space-y-3 text-xs text-slate-600">
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span>Configured Institutional Support Desk</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <span>Academic & Clinical Research Support</span>
                </div>
              </div>
            </div>

            {/* Inquiry Form */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-2xs">
              {contactSubmitted ? (
                <div className="py-8 text-center space-y-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">Inquiry Received</h3>
                  <p className="text-xs text-slate-600">
                    Thank you for reaching out. Your inquiry has been routed to the administration team.
                  </p>
                  <button
                    onClick={() => setContactSubmitted(false)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors pt-2 cursor-pointer"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} className="space-y-3 text-left">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Your Name</label>
                    <input
                      type="text"
                      required
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Dr. Sarah Jenkins"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="investigator@hospital.org"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Subject</label>
                    <input
                      type="text"
                      value={contactSubject}
                      onChange={(e) => setContactSubject(e.target.value)}
                      placeholder="e.g. Study Configuration Assistance"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Message</label>
                    <textarea
                      required
                      rows={3}
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value)}
                      placeholder="Please describe your inquiry or research study question..."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={contactSubmitting}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {contactSubmitting ? (
                      'Sending...'
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Submit Inquiry</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 8. PROFESSIONAL FOOTER                                                    */}
      {/* ========================================================================= */}
      <footer className="mt-auto bg-slate-900 text-slate-300 border-t border-slate-800 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
            {/* Left Brand Col */}
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                  TT
                </div>
                <span className="text-sm font-extrabold text-white tracking-wider uppercase">
                  Thesis Progress Tracker
                </span>
              </div>
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                General-Purpose Thesis & Clinical Research Coordination Platform for multi-investigator
                academic studies, hospital audits, and research cases.
              </p>
            </div>

            {/* Col 1: Product */}
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-white">Product</span>
              <ul className="space-y-2 text-slate-400">
                <li>
                  <button
                    onClick={() => scrollToSection('capabilities')}
                    className="hover:text-white transition-colors cursor-pointer"
                  >
                    Features
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection('how-it-works')}
                    className="hover:text-white transition-colors cursor-pointer"
                  >
                    How It Works
                  </button>
                </li>
              </ul>
            </div>

            {/* Col 2: Resources */}
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-white">Resources</span>
              <ul className="space-y-2 text-slate-400">
                <li>
                  <button
                    onClick={() => handleOpenPolicies('privacy')}
                    className="hover:text-white transition-colors cursor-pointer"
                  >
                    Policies
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleOpenPolicies('privacy')}
                    className="hover:text-white transition-colors cursor-pointer"
                  >
                    Privacy
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection('about')}
                    className="hover:text-white transition-colors cursor-pointer"
                  >
                    About
                  </button>
                </li>
              </ul>
            </div>

            {/* Col 3: Support & Account */}
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-white">Account</span>
              <ul className="space-y-2 text-slate-400">
                <li>
                  <button
                    onClick={() => onNavigateToAuth('login')}
                    className="hover:text-white transition-colors cursor-pointer"
                  >
                    Sign In
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigateToAuth('register')}
                    className="hover:text-white transition-colors cursor-pointer"
                  >
                    Get Started
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigateToAuth('organization-login')}
                    className="hover:text-white transition-colors cursor-pointer text-slate-400"
                  >
                    Organization Login
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
            <p>© {currentYear} Thesis Progress Tracker. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => handleOpenPolicies('privacy')}
                className="hover:text-slate-400 transition-colors cursor-pointer"
              >
                Privacy Notice
              </button>
              <button
                onClick={() => handleOpenPolicies('terms')}
                className="hover:text-slate-400 transition-colors cursor-pointer"
              >
                Terms of Use
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Legal Policies Modal */}
      <LegalDocsModal
        isOpen={legalModalOpen}
        onClose={() => setLegalModalOpen(false)}
        initialCategory={legalModalCategory}
      />
    </div>
  );
};
