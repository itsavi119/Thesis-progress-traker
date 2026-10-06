import React, { useState } from 'react';
import { ShieldAlert, FileText } from 'lucide-react';
import { LegalDocsModal } from '../pages/LegalDocsModal.js';

interface PrivacyNoticeProps {
  compact?: boolean;
}

export const PrivacyNotice: React.FC<PrivacyNoticeProps> = ({ compact = false }) => {
  const [legalModalOpen, setLegalModalOpen] = useState(false);

  if (compact) {
    return (
      <>
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-slate-700">
          <div className="flex items-center gap-2 truncate">
            <ShieldAlert className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="truncate font-medium">Privacy Notice: Minimum research case data only.</span>
          </div>
          <button
            onClick={() => setLegalModalOpen(true)}
            className="text-[11px] text-blue-600 font-bold hover:underline shrink-0 cursor-pointer"
          >
            Policies
          </button>
        </div>
        <LegalDocsModal isOpen={legalModalOpen} onClose={() => setLegalModalOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-start justify-between gap-3 text-xs text-slate-600 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="p-1.5 bg-blue-100 text-blue-700 rounded-xl shrink-0 mt-0.5">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 mb-0.5">Patient Information Privacy Notice</p>
            <p className="leading-relaxed text-slate-600">
              Use only the minimum patient information required for research case coordination. Do not enter unnecessary personally identifiable information. Researchers and healthcare institutions remain responsible for institutional ethics approval.
            </p>
          </div>
        </div>

        <button
          onClick={() => setLegalModalOpen(true)}
          className="self-center px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 shrink-0 transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <FileText className="w-3.5 h-3.5 text-blue-600" />
          <span>Policies</span>
        </button>
      </div>

      <LegalDocsModal isOpen={legalModalOpen} onClose={() => setLegalModalOpen(false)} />
    </>
  );
};
