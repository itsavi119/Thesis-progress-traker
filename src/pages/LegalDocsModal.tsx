import React, { useState, useEffect } from 'react';
import { X, Shield, FileText, Lock, HardDrive, Trash2, AlertCircle } from 'lucide-react';
import { api } from '../services/api.js';
import type { LegalPolicyDoc } from '../types/index.js';

interface LegalDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: 'privacy' | 'terms' | 'responsibility' | 'storage' | 'deletion' | 'disclaimer';
}

export const LegalDocsModal: React.FC<LegalDocsModalProps> = ({
  isOpen,
  onClose,
  initialCategory = 'privacy',
}) => {
  const [policies, setPolicies] = useState<LegalPolicyDoc[]>([]);
  const [activeTab, setActiveTab] = useState<string>(initialCategory);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen) return;

    const fetchPolicies = async () => {
      try {
        setIsLoading(true);
        const res = await api.getLegalPolicies();
        setPolicies(res.policies);
        if (initialCategory) {
          const match = res.policies.find((p) => p.category === initialCategory);
          if (match) setActiveTab(match.id);
        } else if (res.policies.length > 0) {
          setActiveTab(res.policies[0].id);
        }
      } catch (err) {
        console.error('Failed to load legal policy documents:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPolicies();
  }, [isOpen, initialCategory]);

  if (!isOpen) return null;

  const activeDoc = policies.find((p) => p.id === activeTab) || policies[0];

  const getTabIcon = (cat: string) => {
    switch (cat) {
      case 'privacy':
        return <Shield className="w-4 h-4 shrink-0" />;
      case 'terms':
        return <FileText className="w-4 h-4 shrink-0" />;
      case 'responsibility':
        return <Lock className="w-4 h-4 shrink-0" />;
      case 'storage':
        return <HardDrive className="w-4 h-4 shrink-0" />;
      case 'deletion':
        return <Trash2 className="w-4 h-4 shrink-0" />;
      case 'disclaimer':
        return <AlertCircle className="w-4 h-4 shrink-0" />;
      default:
        return <FileText className="w-4 h-4 shrink-0" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Legal, Privacy & Compliance Information</h3>
              <p className="text-xs text-slate-500">Official researcher disclosures and institutional guidelines</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Policy Tabs Sidebar */}
          <div className="w-full md:w-60 border-b md:border-b-0 md:border-r border-slate-200 p-3 space-y-1 bg-slate-50/50 overflow-x-auto md:overflow-y-auto shrink-0 flex md:flex-col gap-1 md:gap-0">
            {policies.map((p) => (
              <button
                key={p.id}
                onClick={() => setActiveTab(p.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-left transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === p.id
                    ? 'bg-blue-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {getTabIcon(p.category)}
                <span className="truncate">{p.title}</span>
              </button>
            ))}
          </div>

          {/* Policy Text Pane */}
          <div className="flex-1 p-5 lg:p-6 overflow-y-auto space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-48 text-xs text-slate-400">
                Loading policy document...
              </div>
            ) : activeDoc ? (
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h4 className="text-lg font-extrabold text-slate-900">{activeDoc.title}</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Last updated: {new Date(activeDoc.lastUpdated).toLocaleDateString()}
                  </p>
                </div>

                <div className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line font-normal space-y-3">
                  {activeDoc.content}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">
            For institutional queries or IRB documentation, contact your study coordinator.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
