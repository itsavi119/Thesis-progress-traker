import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import {
  Award,
  CheckCircle2,
  Clock,
  Sparkles,
  Edit3,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
} from 'lucide-react';
import type { DashboardStats } from '../types/index.js';

export interface MilestoneItem {
  id: string;
  name: string;
  shortName: string;
  phase: string;
  targetPercent: number;
  completionPercent: number;
  status: 'Completed' | 'In Progress' | 'Pending';
  details: string;
  isManuallyOverridden?: boolean;
}

interface MilestonesBarChartProps {
  groupId: string;
  groupName: string;
  studyTitle: string;
  stats: DashboardStats;
  targetSampleSize: number;
}

const DEFAULT_MILESTONE_DEFINITIONS = [
  {
    id: 'protocol_irb',
    name: 'Protocol & IRB Ethics Clearance',
    shortName: 'Protocol / IRB',
    phase: 'Phase 1: Initiation',
    defaultPercent: 100, // Established upon group creation
    description: 'Institutional Review Board approval and formal research protocol authorization.',
  },
  {
    id: 'recruitment',
    name: 'Participant / Case Enrollment',
    shortName: 'Enrollment',
    phase: 'Phase 2: Recruitment',
    description: 'Recruitment and registration against group target sample size.',
  },
  {
    id: 'data_collection',
    name: 'Clinical Data & Diagnostics',
    shortName: 'Data Collection',
    phase: 'Phase 3: Investigation',
    description: 'Active examination, laboratory workups, and observation records.',
  },
  {
    id: 'case_verification',
    name: 'Case Audit & Outcome Verification',
    shortName: 'Audit & Verification',
    phase: 'Phase 4: Verification',
    description: 'Completed patient dossiers verified and eligible for statistical evaluation.',
  },
  {
    id: 'analysis_defense',
    name: 'Biostatistics & Thesis Defense',
    shortName: 'Analysis & Defense',
    phase: 'Phase 5: Synthesis',
    description: 'Hypothesis testing, final manuscript drafting, and thesis committee defense.',
  },
];

export const MilestonesBarChart: React.FC<MilestonesBarChartProps> = ({
  groupId,
  groupName,
  studyTitle,
  stats,
  targetSampleSize,
}) => {
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('vertical');
  const [showConfig, setShowConfig] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // Restore stored manual milestone overrides per group ID
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`thesis_tracker_milestones_${groupId}`);
      if (stored) {
        setOverrides(JSON.parse(stored));
      } else {
        setOverrides({});
      }
    } catch {
      setOverrides({});
    }
  }, [groupId]);

  const handleUpdateOverride = (id: string, value: number) => {
    const updated = {
      ...overrides,
      [id]: Math.min(100, Math.max(0, value)),
    };
    setOverrides(updated);
    try {
      localStorage.setItem(`thesis_tracker_milestones_${groupId}`, JSON.stringify(updated));
    } catch {}
  };

  const handleResetOverrides = () => {
    setOverrides({});
    try {
      localStorage.removeItem(`thesis_tracker_milestones_${groupId}`);
    } catch {}
  };

  const target = targetSampleSize || stats.targetSampleSize || 100;

  // Dynamically compute live milestone completion rates based on clinical study metrics
  const milestones: MilestoneItem[] = useMemo(() => {
    // 1. Protocol clearance (defaults to 100% or manual override)
    const protocolRate = overrides['protocol_irb'] !== undefined ? overrides['protocol_irb'] : 100;

    // 2. Participant enrollment rate
    const liveRecruitment = Math.min(100, target > 0 ? (stats.totalCases / target) * 100 : 0);
    const recruitmentRate = overrides['recruitment'] !== undefined ? overrides['recruitment'] : Math.round(liveRecruitment);

    // 3. Clinical Data Collection rate (cases actively progressing or completed)
    const activeAndDone = stats.inProgress + stats.completed;
    const liveDataRate = Math.min(100, target > 0 ? (activeAndDone / target) * 100 : 0);
    const dataRate = overrides['data_collection'] !== undefined ? overrides['data_collection'] : Math.round(liveDataRate);

    // 4. Case Verification rate (cases reached completed terminal status)
    const liveVerification = Math.min(100, target > 0 ? (stats.completed / target) * 100 : 0);
    const verificationRate = overrides['case_verification'] !== undefined ? overrides['case_verification'] : Math.round(liveVerification);

    // 5. Biostatistical Analysis & Thesis Defense (weighted synthesis)
    const liveDefense = Math.min(100, Math.round(verificationRate * 0.7 + (recruitmentRate >= 100 ? 30 : recruitmentRate * 0.3)));
    const defenseRate = overrides['analysis_defense'] !== undefined ? overrides['analysis_defense'] : liveDefense;

    return DEFAULT_MILESTONE_DEFINITIONS.map((def) => {
      let rate = 0;
      let details = '';

      if (def.id === 'protocol_irb') {
        rate = protocolRate;
        details = rate >= 100 ? 'IRB cleared and registered' : `${rate}% authorized`;
      } else if (def.id === 'recruitment') {
        rate = recruitmentRate;
        details = `${stats.totalCases} of ${target} subjects enrolled`;
      } else if (def.id === 'data_collection') {
        rate = dataRate;
        details = `${activeAndDone} active or completed profiles`;
      } else if (def.id === 'case_verification') {
        rate = verificationRate;
        details = `${stats.completed} fully verified cases`;
      } else if (def.id === 'analysis_defense') {
        rate = defenseRate;
        details = rate >= 100 ? 'Manuscript submitted & defended' : `${rate}% synthesis complete`;
      }

      let status: 'Completed' | 'In Progress' | 'Pending' = 'Pending';
      if (rate >= 100) status = 'Completed';
      else if (rate > 0) status = 'In Progress';

      return {
        id: def.id,
        name: def.name,
        shortName: def.shortName,
        phase: def.phase,
        targetPercent: 100,
        completionPercent: rate,
        status,
        details,
        isManuallyOverridden: overrides[def.id] !== undefined,
      };
    });
  }, [stats, target, overrides]);

  // Overall milestone statistics
  const completedCount = milestones.filter((m) => m.completionPercent >= 100).length;
  const inProgressCount = milestones.filter((m) => m.completionPercent > 0 && m.completionPercent < 100).length;
  const avgCompletion = Math.round(
    milestones.reduce((acc, curr) => acc + curr.completionPercent, 0) / milestones.length
  );

  // Dynamic bar colors based on achievement level
  const getBarColor = (percent: number) => {
    if (percent >= 100) return '#10b981'; // Emerald 500
    if (percent >= 60) return '#2563eb';  // Blue 600
    if (percent >= 25) return '#6366f1';  // Indigo 500
    if (percent > 0) return '#f59e0b';   // Amber 500
    return '#cbd5e1';                    // Slate 300
  };

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item: MilestoneItem = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-700/80 text-xs space-y-1.5 min-w-[210px] z-50">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
            <span className="font-bold text-slate-200">{item.name}</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                item.status === 'Completed'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : item.status === 'In Progress'
                  ? 'bg-blue-500/20 text-blue-300'
                  : 'bg-slate-700 text-slate-300'
              }`}
            >
              {item.status}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-300 pt-0.5">
            <span>Completion Status:</span>
            <span className="font-mono font-bold text-white text-sm">
              {item.completionPercent}%
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            {item.details}
          </p>
          <span className="text-[10px] text-slate-500 block pt-0.5">{item.phase}</span>
        </div>
      );
    }
    return null;
  };

  // Export current milestone progress as clean CSV file
  const handleExportCSV = () => {
    // Sanitize values to prevent CSV formula injection and adhere to RFC 4180
    const sanitizeCSV = (val: string | number | undefined | null): string => {
      if (val === undefined || val === null) return '""';
      let str = String(val).trim();
      // Neutralize potential spreadsheet formula execution
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const safeGroupName = (groupName || 'thesis-group')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const filename = `${safeGroupName}-milestones-${dateStr}.csv`;

    const headers = [
      'Milestone ID',
      'Milestone Name',
      'Research Phase',
      'Status',
      'Completion (%)',
      'Target (%)',
      'Progress Details',
    ];

    const dataRows = milestones.map((m) => [
      sanitizeCSV(m.id),
      sanitizeCSV(m.name),
      sanitizeCSV(m.phase),
      sanitizeCSV(m.status),
      sanitizeCSV(m.completionPercent),
      sanitizeCSV(m.targetPercent),
      sanitizeCSV(m.details),
    ]);

    // Metadata header containing essential study reference information
    const csvContent = [
      `# Research Group: ${groupName || 'Active Group'}`,
      `# Study Title: ${studyTitle || 'Thesis Study'}`,
      `# Target Sample Size: ${target}`,
      `# Export Date: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`,
      '',
      headers.join(','),
      ...dataRows.map((r) => r.join(',')),
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloadSuccess(true);
    setTimeout(() => {
      setDownloadSuccess(false);
    }, 2500);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Research Milestones & Progress
            </h3>
          </div>
          <p className="text-xs text-slate-500">
            Completion milestones for active protocol, cohort enrollment, and synthesis.
          </p>
        </div>

        {/* View Switchers & Export Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportCSV}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
              downloadSuccess
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
            }`}
            title="Download milestone progress data as CSV"
          >
            {downloadSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Downloaded!</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 text-blue-600" />
                <span>Export CSV</span>
              </>
            )}
          </button>

          <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setOrientation('vertical')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                orientation === 'vertical'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Vertical
            </button>
            <button
              type="button"
              onClick={() => setOrientation('horizontal')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                orientation === 'horizontal'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Horizontal
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-slate-500" />
            <span>Customize</span>
            {showConfig ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Overview Stat Badges */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Completed
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xl font-extrabold text-emerald-600">{completedCount}</span>
            <span className="text-xs text-slate-400">/ {milestones.length}</span>
          </div>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            In Progress
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xl font-extrabold text-blue-600">{inProgressCount}</span>
            <span className="text-xs text-slate-400">active</span>
          </div>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Avg Completion
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xl font-extrabold text-slate-900">{avgCompletion}%</span>
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
          </div>
        </div>
      </div>

      {/* Interactive Customization Drawer */}
      {showConfig && (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900">
              Manual Milestone Adjustment
            </h4>
            {Object.keys(overrides).length > 0 && (
              <button
                type="button"
                onClick={handleResetOverrides}
                className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 transition-colors cursor-pointer"
              >
                Reset to live metrics
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Adjust milestone percentages for external thesis items (e.g. protocol clearance or thesis committee review).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {milestones.map((m) => (
              <div
                key={m.id}
                className="bg-white p-3 rounded-lg border border-slate-200 space-y-2 shadow-2xs"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 truncate" title={m.name}>
                    {m.shortName}
                  </span>
                  <span className="font-mono font-bold text-blue-600">{m.completionPercent}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={m.completionPercent}
                    onChange={(e) => handleUpdateOverride(m.id, Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdateOverride(m.id, m.completionPercent >= 100 ? 0 : 100)}
                    title={m.completionPercent >= 100 ? 'Mark Incomplete' : 'Mark Complete'}
                    className={`p-1 rounded-md text-xs transition-colors cursor-pointer shrink-0 ${
                      m.completionPercent >= 100
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recharts Bar Chart Container */}
      <div className="w-full h-72 sm:h-80 pt-2 select-none">
        <ResponsiveContainer width="100%" height="100%">
          {orientation === 'vertical' ? (
            <BarChart
              data={milestones}
              margin={{ top: 10, right: 10, left: -15, bottom: 25 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="shortName"
                tick={{ fill: '#64748b', fontSize: 11 }}
                interval={0}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickFormatter={(val) => `${val}%`}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(241, 245, 249, 0.6)' }} />
              <Bar
                dataKey="completionPercent"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
                animationDuration={600}
              >
                {milestones.map((entry) => (
                  <Cell key={`cell-${entry.id}`} fill={getBarColor(entry.completionPercent)} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <BarChart
              data={milestones}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 15, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickFormatter={(val) => `${val}%`}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis
                type="category"
                dataKey="shortName"
                tick={{ fill: '#475569', fontSize: 11, fontWeight: 500 }}
                width={110}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(241, 245, 249, 0.6)' }} />
              <Bar
                dataKey="completionPercent"
                radius={[0, 6, 6, 0]}
                maxBarSize={28}
                animationDuration={600}
              >
                {milestones.map((entry) => (
                  <Cell key={`cell-h-${entry.id}`} fill={getBarColor(entry.completionPercent)} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend & Milestone Status Row */}
      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="font-medium text-slate-700">100% Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
            <span className="font-medium text-slate-700">In Progress</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            <span className="font-medium text-slate-700">Pending</span>
          </div>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-slate-400">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Synchronized with active clinical cases</span>
        </div>
      </div>
    </div>
  );
};
