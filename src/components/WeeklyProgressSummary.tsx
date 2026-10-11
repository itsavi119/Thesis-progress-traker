import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  TrendingUp,
  Calendar,
  Activity,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';
import type { CaseRecord, DashboardStats } from '../types/index.js';

interface WeeklyProgressSummaryProps {
  groupId: string;
  groupName: string;
  studyTitle: string;
  cases: CaseRecord[];
  stats: DashboardStats;
  targetSampleSize: number;
  groupCreatedAt?: string;
}

interface WeekDataPoint {
  weekKey: string;
  label: string;
  dateRange: string;
  cumulativeCases: number;
  newCases: number;
  overallCompletion: number;
  enrollmentRate: number;
  verificationRate: number;
  isProjected?: boolean;
}

export const WeeklyProgressSummary: React.FC<WeeklyProgressSummaryProps> = ({
  groupName,
  studyTitle,
  cases,
  stats,
  targetSampleSize,
  groupCreatedAt,
}) => {
  const [viewMode, setViewMode] = useState<'overall' | 'multi' | 'velocity'>('overall');
  const [timeRange, setTimeRange] = useState<'6w' | '10w'>('6w');

  const target = targetSampleSize || stats.targetSampleSize || 100;

  // Generate weekly progression trend data
  const { weeklyData, velocity, weeklyGrowthRate, weeksToTarget } = useMemo(() => {
    const numWeeks = timeRange === '6w' ? 6 : 10;
    const now = new Date();
    const createdDate = groupCreatedAt ? new Date(groupCreatedAt) : new Date(now.getTime() - 42 * 86400000);

    // Calculate weekly intervals leading up to now
    const points: WeekDataPoint[] = [];
    const oneWeekMs = 7 * 86400000;

    for (let i = numWeeks - 1; i >= 0; i--) {
      const weekEnd = new Date(now.getTime() - i * oneWeekMs);
      const weekStart = new Date(weekEnd.getTime() - oneWeekMs);

      // Cases registered on or before weekEnd
      const casesUpToWeek = cases.filter((c) => {
        const regDate = new Date(c.registered_at);
        return regDate <= weekEnd;
      });

      // Cases registered during this specific week window
      const newCasesThisWeek = cases.filter((c) => {
        const regDate = new Date(c.registered_at);
        return regDate > weekStart && regDate <= weekEnd;
      }).length;

      const completedUpToWeek = casesUpToWeek.filter((c) => c.status === 'Completed').length;
      const inProgressUpToWeek = casesUpToWeek.filter((c) => c.status === 'In Progress').length;

      // Calculate milestone rates for this historical week
      // 1. Protocol clearance (100% since group exists)
      const protocol = 100;
      // 2. Enrollment rate against target
      const enrollment = Math.min(100, Math.round((casesUpToWeek.length / target) * 100));
      // 3. Clinical Data Collection rate (active + completed)
      const collection = Math.min(100, Math.round(((inProgressUpToWeek + completedUpToWeek) / target) * 100));
      // 4. Verification rate
      const verification = Math.min(100, Math.round((completedUpToWeek / target) * 100));
      // 5. Synthesis & Defense readiness
      const synthesis = Math.min(100, Math.round(verification * 0.7 + (enrollment >= 100 ? 30 : enrollment * 0.3)));

      // Overall composite milestone completion rate
      const overall = Math.round((protocol + enrollment + collection + verification + synthesis) / 5);

      const weekNum = numWeeks - i;
      const isCurrent = i === 0;
      const startStr = weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const endStr = weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

      points.push({
        weekKey: `w_${weekNum}`,
        label: isCurrent ? 'Current' : `Wk ${weekNum}`,
        dateRange: `${startStr} – ${endStr}`,
        cumulativeCases: casesUpToWeek.length,
        newCases: newCasesThisWeek,
        overallCompletion: overall,
        enrollmentRate: enrollment,
        verificationRate: verification,
      });
    }

    // Ensure realistic baseline visualization: if group has few cases, simulate earlier zero-point trajectory
    if (points.length > 0 && points[points.length - 1].cumulativeCases === 0) {
      // If no cases registered yet, milestone baseline is protocol clearance only (20% overall)
      points.forEach((p, idx) => {
        p.overallCompletion = 20;
        p.enrollmentRate = 0;
        p.verificationRate = 0;
      });
    }

    // Current week vs previous week delta
    const currentWeek = points[points.length - 1];
    const prevWeek = points[points.length - 2] || currentWeek;
    const growth = currentWeek.overallCompletion - prevWeek.overallCompletion;

    // Average weekly registration rate
    const totalNewInPeriod = points.reduce((sum, p) => sum + p.newCases, 0);
    const avgVelocity = Number((totalNewInPeriod / Math.max(1, points.length)).toFixed(1));

    // Remaining cases to target
    const remainingCases = Math.max(0, target - currentWeek.cumulativeCases);
    const estimatedWeeks = avgVelocity > 0 ? Math.ceil(remainingCases / avgVelocity) : null;

    return {
      weeklyData: points,
      velocity: avgVelocity,
      weeklyGrowthRate: growth,
      weeksToTarget: estimatedWeeks,
    };
  }, [cases, target, timeRange, groupCreatedAt]);

  const currentRate = weeklyData.length > 0 ? weeklyData[weeklyData.length - 1].overallCompletion : 0;
  const currentCases = weeklyData.length > 0 ? weeklyData[weeklyData.length - 1].cumulativeCases : 0;

  // Custom Glassmorphic Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data: WeekDataPoint = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-700/80 text-xs space-y-2 min-w-[210px] z-50">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-1.5">
            <span className="font-bold text-slate-200">{data.label}</span>
            <span className="text-[10px] text-slate-400 font-mono">{data.dateRange}</span>
          </div>

          <div className="space-y-1 pt-0.5">
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span>Overall Milestones:</span>
              </span>
              <span className="font-mono font-bold text-white text-sm">
                {data.overallCompletion}%
              </span>
            </div>

            {viewMode === 'multi' && (
              <>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    <span>Enrollment:</span>
                  </span>
                  <span className="font-mono font-semibold text-indigo-300">
                    {data.enrollmentRate}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>Verification:</span>
                  </span>
                  <span className="font-mono font-semibold text-emerald-300">
                    {data.verificationRate}%
                  </span>
                </div>
              </>
            )}

            <div className="flex items-center justify-between text-slate-400 pt-1 border-t border-slate-800/80 text-[11px]">
              <span>Enrolled to Date:</span>
              <span className="font-medium text-slate-200">
                {data.cumulativeCases} / {target}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span>New in Week:</span>
              <span className="font-medium text-emerald-400">
                +{data.newCases} cases
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Weekly Progress Summary
            </h3>
          </div>
          <p className="text-xs text-slate-500">
            Longitudinal trend line of research milestone completion and study velocity.
          </p>
        </div>

        {/* View Switches */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode Switcher */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('overall')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                viewMode === 'overall'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Overall Trend
            </button>
            <button
              type="button"
              onClick={() => setViewMode('multi')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                viewMode === 'multi'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              By Milestone
            </button>
          </div>

          {/* Timeframe Switcher */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTimeRange('6w')}
              className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                timeRange === '6w'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              6 Wks
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('10w')}
              className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                timeRange === '10w'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              10 Wks
            </button>
          </div>
        </div>
      </div>

      {/* High-level Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Current Milestone Rate
          </span>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {currentRate}%
            </span>
            <div
              className={`flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded ${
                weeklyGrowthRate >= 0
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <ArrowUpRight className="w-3 h-3" />
              <span>{weeklyGrowthRate >= 0 ? `+${weeklyGrowthRate}%` : `${weeklyGrowthRate}%`}</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">Composite thesis progress</p>
        </div>

        <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Enrolled Cohort
          </span>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-black text-blue-600 tracking-tight">
              {currentCases}
            </span>
            <span className="text-xs font-semibold text-slate-400">
              of {target} target
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            {Math.min(100, Math.round((currentCases / target) * 100))}% sample reached
          </p>
        </div>

        <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Weekly Velocity
          </span>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-black text-indigo-600 tracking-tight">
              {velocity}
            </span>
            <span className="text-xs font-semibold text-slate-400">cases / wk</span>
          </div>
          <p className="text-[11px] text-slate-400">Average recruitment rate</p>
        </div>

        <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Pacing & Projection
          </span>
          <div className="flex items-center justify-between">
            <span className="text-sm font-black text-slate-800 tracking-tight">
              {currentCases >= target
                ? 'Target Met'
                : weeksToTarget !== null
                ? `~${weeksToTarget} wks to goal`
                : 'Pacing Baseline'}
            </span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-[11px] text-slate-400">
            {currentCases >= target ? 'Sample size completed' : 'Based on current enrollment rate'}
          </p>
        </div>
      </div>

      {/* Recharts Trend Line Chart */}
      <div className="w-full h-72 sm:h-80 pt-2 select-none">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={weeklyData}
            margin={{ top: 12, right: 15, left: -15, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }}
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
            <Tooltip content={<CustomTooltip />} />

            {/* Target 100% Goal Reference Line */}
            <ReferenceLine
              y={100}
              stroke="#10b981"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              label={{
                value: '100% Goal',
                position: 'insideTopRight',
                fill: '#059669',
                fontSize: 10,
                fontWeight: 600,
              }}
            />

            {viewMode === 'overall' ? (
              <Line
                type="monotone"
                dataKey="overallCompletion"
                name="Overall Completion"
                stroke="#2563eb"
                strokeWidth={3}
                dot={{
                  r: 4.5,
                  fill: '#ffffff',
                  stroke: '#2563eb',
                  strokeWidth: 2.5,
                }}
                activeDot={{
                  r: 7,
                  fill: '#2563eb',
                  stroke: '#ffffff',
                  strokeWidth: 2,
                }}
                animationDuration={800}
              />
            ) : (
              <>
                <Line
                  type="monotone"
                  dataKey="overallCompletion"
                  name="Overall Milestone Rate"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: '#2563eb' }}
                  animationDuration={800}
                />
                <Line
                  type="monotone"
                  dataKey="enrollmentRate"
                  name="Subject Enrollment"
                  stroke="#6366f1"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 3, fill: '#6366f1' }}
                  animationDuration={800}
                />
                <Line
                  type="monotone"
                  dataKey="verificationRate"
                  name="Case Verification"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#10b981' }}
                  animationDuration={800}
                />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom Summary & Legend */}
      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-blue-600 rounded-full" />
            <span className="font-medium text-slate-700">Overall Milestone Progress</span>
          </div>
          {viewMode === 'multi' && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t-2 border-dashed border-indigo-500" />
                <span className="font-medium text-slate-700">Enrollment</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-emerald-500 rounded-full" />
                <span className="font-medium text-slate-700">Verification</span>
              </div>
            </>
          )}
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-emerald-500 opacity-60" />
            <span className="font-medium text-slate-500">100% Target</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          <span>Aggregated from case registration and status timestamps</span>
        </div>
      </div>
    </div>
  );
};
