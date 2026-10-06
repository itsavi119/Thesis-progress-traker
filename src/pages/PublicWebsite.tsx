import React, { useState } from 'react';
import {
  FileCheck2,
  Users2,
  ShieldCheck,
  Search,
  History,
  Archive,
  BarChart3,
  Mail,
  Send,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Lock,
  Building2,
  HelpCircle,
  FileText,
  User,
  Shield,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Logo } from '../components/Logo.js';
import { LegalDocsModal } from './LegalDocsModal.js';
import { api } from '../services/api.js';

export type PublicPage = 'home' | 'about' | 'features' | 'contact' | 'login' | 'signup' | 'org-login';

interface PublicWebsiteProps {
  initialPage?: PublicPage;
  onSelectAuth: (mode: 'login' | 'signup' | 'org-login') => void;
}

export const PublicWebsite: React.FC<PublicWebsiteProps> = ({
  initialPage = 'home',
  onSelectAuth,
}) => {
  const [currentPage, setCurrentPage] = useState<PublicPage>(initialPage);
  const [legalModalOpen, setLegalModalOpen] = useState<boolean>(false);
  const [activeLegalTab, setActiveLegalTab] = useState<string>('privacy-policy');

  // Contact form state
  const [contactName, setContactName] = useState<string>('');
  const [contactEmail, setContactEmail] = useState<string>('');
  const [contactSubject, setContactSubject] = useState<string>('');
  const [contactMessage, setContactMessage] = useState<string>('');
  const [isSubmittingContact, setIsSubmittingContact] = useState<boolean>(false);
  const [contactSuccessMessage, setContactSuccessMessage] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);

  const handleOpenLegal = (policyId: string) => {
    setActiveLegalTab(policyId);
    setLegalModalOpen(true);
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError(null);
    setContactSuccessMessage(null);

    // Frontend validation
    if (!contactName.trim() || contactName.trim().length < 2) {
      setContactError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (!contactEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      setContactError('Please enter a valid email address.');
      return;
    }
    if (!contactSubject.trim() || contactSubject.trim().length < 3) {
      setContactError('Please enter a subject (at least 3 characters).');
      return;
    }
    if (!contactMessage.trim() || contactMessage.trim().length < 10) {
      setContactError('Please enter a message of at least 10 characters.');
      return;
    }

    try {
      setIsSubmittingContact(true);
      const res = await api.submitContact({
        name: contactName.trim(),
        email: contactEmail.trim(),
        subject: contactSubject.trim(),
        message: contactMessage.trim(),
      });

      setContactSuccessMessage(
        res.confirmation || 'Thank you. Your message has been received and our team will review it shortly.'
      );
      // Reset form fields only on success
      setContactName('');
      setContactEmail('');
      setContactSubject('');
      setContactMessage('');
    } catch (err: any) {
      // Retain entered information so the user doesn't lose anything
      setContactError(err.message || 'Failed to submit message. Please check your connection and retry.');
    } finally {
      setIsSubmittingContact(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* PUBLIC TOP NAVIGATION */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <button
              onClick={() => setCurrentPage('home')}
              className="text-left focus:outline-hidden cursor-pointer"
            >
              <Logo size="md" subtitle="Academic & Clinical Thesis Coordination" />
            </button>

            <nav className="hidden md:flex items-center gap-1 text-xs font-semibold text-slate-600">
              <button
                onClick={() => setCurrentPage('home')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  currentPage === 'home' ? 'bg-slate-100 text-blue-700 font-bold' : 'hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                Home
              </button>
              <button
                onClick={() => setCurrentPage('about')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  currentPage === 'about' ? 'bg-slate-100 text-blue-700 font-bold' : 'hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                About
              </button>
              <button
                onClick={() => setCurrentPage('features')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  currentPage === 'features' ? 'bg-slate-100 text-blue-700 font-bold' : 'hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                Features
              </button>
              <button
                onClick={() => setCurrentPage('contact')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  currentPage === 'contact' ? 'bg-slate-100 text-blue-700 font-bold' : 'hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                Contact
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onSelectAuth('org-login')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
              title="Separate Organization & Institutional Login"
            >
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Organization Portal</span>
            </button>

            <button
              onClick={() => onSelectAuth('login')}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <button
              onClick={() => onSelectAuth('signup')}
              className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold transition-all shadow-xs hover:shadow cursor-pointer"
            >
              Create Account
            </button>
          </div>
        </div>

        {/* Mobile secondary navigation */}
        <div className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center justify-around bg-slate-50/70 text-xs font-semibold text-slate-600">
          <button
            onClick={() => setCurrentPage('home')}
            className={`px-2.5 py-1 rounded-md ${currentPage === 'home' ? 'text-blue-700 font-bold' : ''}`}
          >
            Home
          </button>
          <button
            onClick={() => setCurrentPage('about')}
            className={`px-2.5 py-1 rounded-md ${currentPage === 'about' ? 'text-blue-700 font-bold' : ''}`}
          >
            About
          </button>
          <button
            onClick={() => setCurrentPage('features')}
            className={`px-2.5 py-1 rounded-md ${currentPage === 'features' ? 'text-blue-700 font-bold' : ''}`}
          >
            Features
          </button>
          <button
            onClick={() => setCurrentPage('contact')}
            className={`px-2.5 py-1 rounded-md ${currentPage === 'contact' ? 'text-blue-700 font-bold' : ''}`}
          >
            Contact
          </button>
          <button
            onClick={() => onSelectAuth('org-login')}
            className="px-2.5 py-1 text-slate-800 font-bold"
          >
            Org Portal
          </button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* ================= PAGE 1: HOME ================= */}
        {currentPage === 'home' && (
          <div className="space-y-12 animate-in fade-in duration-150">
            {/* Hero Section */}
            <div className="text-center max-w-3xl mx-auto space-y-4 pt-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Dedicated Thesis Research Case Management</span>
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
                Accurate Case Tracking for Clinical & Academic Thesis Studies
              </h1>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl mx-auto">
                Thesis Case Tracker enables academic thesis investigators, postgraduate medical residents, and study teams to coordinate patient records, eliminate duplicate enrollment, and preserve data integrity with automated backups.
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => onSelectAuth('signup')}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                >
                  <span>Start Thesis Tracking</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onSelectAuth('login')}
                  className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs sm:text-sm font-bold transition-all cursor-pointer"
                >
                  <span>Log In to Workspace</span>
                </button>
                <button
                  onClick={() => onSelectAuth('org-login')}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Building2 className="w-4 h-4 text-slate-600" />
                  <span>Organization Portal</span>
                </button>
              </div>
            </div>

            {/* Core Pillars: What Is This? Who Is It For? What Can It Do? */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">What Is This?</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  A purpose-built web tool specifically designed for thesis researchers to manage, organize, and monitor patient case records without the overhead of clinical EHR bloat.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                  <Users2 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Who Is It For?</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Hospital thesis candidates, postgraduate medical and pharmacy students, and collaborative 3-researcher teams collecting data across multiple wards or shifts.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
                  <Archive className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">What Can It Do?</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Real-time duplicate detection, case progress statuses, automatic length-of-stay metrics, immutable chronological history, ZIP backups, and one-click CSV export.
                </p>
              </div>
            </div>

            {/* Key Functional Highlights */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
              <div className="max-w-xl">
                <h2 className="text-lg font-bold text-slate-900">Platform Workflow & Core Capacities</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Everything required to administer study data safely from initial enrollment to thesis defense.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Duplicate Prevention</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Normalizes patient IDs automatically to alert team members before a record is double-counted.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <History className="w-4 h-4 text-blue-600" />
                    <span>Case History Trail</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Every registration, detail edit, and status change creates an immutable chronological audit trail.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <Archive className="w-4 h-4 text-amber-600" />
                    <span>ZIP Backup & Restore</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Download full study packages anytime in standard format and restore them safely in one step.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <BarChart3 className="w-4 h-4 text-purple-600" />
                    <span>Target Progress & Reports</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Monitor target sample sizes, completed records, team distribution, and export data in CSV.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= PAGE 2: ABOUT ================= */}
        {currentPage === 'about' && (
          <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-150">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Platform Objective</span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">About Thesis Case Tracker</h1>
                <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
                  Thesis Case Tracker was created to solve a persistent, practical challenge in academic medical research: data duplication, inconsistent tracking, and loss of records during postgraduate thesis data collection.
                </p>
              </div>

              <div className="border-t border-slate-100 pt-6 space-y-4">
                <h2 className="text-base font-bold text-slate-900">The Problem We Solve</h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  In hospital-based thesis studies, multiple investigators often collect patient data across rotating shifts, different OPD clinics, and inpatient wards. Without a centralized duplicate check, patients who return to the hospital or visit different departments are frequently recorded twice under slightly varied spelling or formatting. This skews study sample sizes, distorts statistical significance, and requires hours of manual cross-referencing.
                </p>
              </div>

              <div className="border-t border-slate-100 pt-6 space-y-4">
                <h2 className="text-base font-bold text-slate-900">Intended Users</h2>
                <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside">
                  <li><strong className="text-slate-800">Postgraduate Thesis Researchers:</strong> MD, MS, PharmD, and PhD candidates needing structured case records.</li>
                  <li><strong className="text-slate-800">Collaborative Study Groups:</strong> Research cohorts of up to 3 investigators sharing a single protocol with role-based coordination.</li>
                  <li><strong className="text-slate-800">Departmental Guides & Coordinators:</strong> Institutional reviewers overseeing target sample size progress and data safety.</li>
                </ul>
              </div>

              <div className="border-t border-slate-100 pt-6 space-y-4">
                <h2 className="text-base font-bold text-slate-900">De-Identification & Ethical Philosophy</h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Thesis Case Tracker is designed with privacy-by-design principles. We encourage the use of anonymized study identification numbers rather than personal identifiers. No sensitive patient contact data is ever required.
                </p>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                  <p className="font-semibold text-slate-800 mb-1">Institutional Oversight Disclosure:</p>
                  <p>
                    Thesis Case Tracker is a workflow tool for thesis data collection. Institutional ethics committee (IRB/IEC) protocol compliance and primary clinical evaluations remain the responsibility of the investigator and affiliated institutions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= PAGE 3: FEATURES ================= */}
        {currentPage === 'features' && (
          <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-150">
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Implemented Functionality</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Platform Features</h1>
              <p className="text-xs text-slate-500">
                A review of all capabilities currently available in Thesis Case Tracker.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Feature 1 */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Case Tracking & Demographics</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Record study cases with custom patient IDs, demographic data (age, gender), department, ward location, clinical diagnosis, medication regimen, admission date, discharge date, and automatic length of stay calculation.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Real-Time Duplicate Prevention</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Automatic normalization of alphanumeric case IDs to instantly flag if a patient has already been registered in the active study group, preventing accidental double-counting before submission.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                  <Search className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Search & Filtering</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Fast search by case ID, participant name, or clinical keywords. Multi-facet filtering by study member, case status (In Progress, Completed, Excluded), and real-time result counts.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <History className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Case History & Event Trail</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Detailed chronological history logging for every case action: creation, field editing, status changes, and deletions, with investigator name, email, and exact timestamp.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-2.5">
                <div className="w-9 h-9 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center font-bold">
                  <Archive className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Backup & Restoration</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Export complete study workspaces into encrypted or portable ZIP archives with manifest metadata, and restore them safely with merge or new study modes.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Users2 className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Collaborative Study Teams</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Create study groups, invite collaborators via secure 6-character codes, manage member roles (owner and researcher), and monitor individual team member enrollment counts.
                </p>
              </div>

              {/* Feature 7 */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                  <Building2 className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Organization Governance</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Dedicated institutional administration workspace with overview metrics, user suspension/activation, audit logs, and customizable legal policy documentation.
                </p>
              </div>

              {/* Feature 8 */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Reports & CSV Export</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Real-time metrics on sample size progress, team distribution, and one-click export of complete case records into UTF-8 CSV for SPSS, R, Excel, or local institutional archiving.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ================= PAGE 4: CONTACT ================= */}
        {currentPage === 'contact' && (
          <div className="max-w-xl mx-auto space-y-6 animate-in fade-in duration-150">
            <div className="text-center space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Get in Touch</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Contact Support & Inquiries</h1>
              <p className="text-xs text-slate-500">
                Have questions regarding institutional study setup, IRB documentation, or technical support? Send us a message below.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
              {contactSuccessMessage ? (
                <div className="p-6 text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">Inquiry Submitted Successfully</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {contactSuccessMessage}
                  </p>
                  <button
                    onClick={() => {
                      setContactSuccessMessage(null);
                      setContactError(null);
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} className="space-y-4">
                  {contactError && (
                    <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{contactError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Your Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Dr. John Doe / Researcher Name"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Email Address <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="investigator@hospital.edu"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Subject <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Question about study backup export"
                      value={contactSubject}
                      onChange={(e) => setContactSubject(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Message <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      required
                      rows={4}
                      placeholder="Describe your question, inquiry, or feedback in detail..."
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors resize-y"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingContact}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingContact ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Sending message...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Send Message</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </main>

      {/* FOOTER WITH LEGAL LINKS */}
      <footer className="bg-white border-t border-slate-200 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Logo size="sm" showText={true} />
              <span className="text-xs text-slate-400">|</span>
              <p className="text-xs text-slate-500">
                Academic & Clinical Thesis Case Coordination
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-slate-600">
              <button
                onClick={() => handleOpenLegal('privacy-policy')}
                className="hover:text-blue-600 transition-colors cursor-pointer"
              >
                Privacy Policy
              </button>
              <span className="text-slate-300">•</span>
              <button
                onClick={() => handleOpenLegal('terms-of-use')}
                className="hover:text-blue-600 transition-colors cursor-pointer"
              >
                Terms & Conditions
              </button>
              <span className="text-slate-300">•</span>
              <button
                onClick={() => handleOpenLegal('disclaimer')}
                className="hover:text-blue-600 transition-colors cursor-pointer"
              >
                Disclaimer
              </button>
              <span className="text-slate-300">•</span>
              <button
                onClick={() => onSelectAuth('org-login')}
                className="hover:text-blue-600 transition-colors font-bold text-slate-800 cursor-pointer"
              >
                Organization Portal
              </button>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-2">
            <p>© {new Date().getFullYear()} Thesis Case Tracker. All rights reserved.</p>
            <p>Designed for academic medical researchers & thesis study groups.</p>
          </div>
        </div>
      </footer>

      {/* LEGAL POLICIES MODAL */}
      <LegalDocsModal
        isOpen={legalModalOpen}
        onClose={() => setLegalModalOpen(false)}
        initialCategory={activeLegalTab}
      />
    </div>
  );
};
