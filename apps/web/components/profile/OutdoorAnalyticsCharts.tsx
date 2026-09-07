'use client';

import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GradeScaleToggle } from '@/components/map/GradeScaleToggle';
import { formatGrade, type GradeScale } from '@/lib/grades';
import {
  DISCIPLINE_LABELS,
  type DisciplineAnalytics,
  type OutdoorAnalytics,
  type OutdoorDiscipline,
} from '@/lib/types';

// BL-036/037: lifetime completed climbs split by discipline, attempts as a
// separate series alongside completions (both plotted per grade ordinal, so
// one grouped chart carries both), plus a completion rate per discipline.
// Foundation §12, RESOLVED Sprint 0 -- locked as specified.

const DISCIPLINES: OutdoorDiscipline[] = [
  'SPORT_CLIMBING',
  'BOULDERING',
  'TRADITIONAL_CLIMBING',
];

function DisciplinePanel({
  discipline,
  data,
  scale,
}: {
  discipline: OutdoorDiscipline;
  data: DisciplineAnalytics;
  scale: GradeScale;
}) {
  const totalLogs = data.completed + data.attempted;
  const chartData = data.gradeDistribution.map((point) => ({
    grade: formatGrade(point.gradeOrdinal, discipline, scale),
    Completed: point.completed,
    Attempted: point.attempted,
  }));

  return (
    <div
      data-testid={`analytics-discipline-${discipline}`}
      className="card p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-extrabold text-ink">
          {DISCIPLINE_LABELS[discipline]}
        </h3>
        <span
          data-testid={`analytics-summary-${discipline}`}
          className="text-[11px] text-ink-soft"
        >
          {data.completed} sent
          {totalLogs > 0
            ? ` · ${Math.round(data.completionRate * 100)}% completion rate`
            : ''}
        </span>
      </div>

      {chartData.length === 0 ? (
        <p className="mt-3 text-[12px] text-ink-faint">
          No logs yet for this discipline.
        </p>
      ) : (
        <div className="mt-3 h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              barGap={2}
              margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--color-line-soft)" />
              <XAxis
                dataKey="grade"
                tick={{ fontSize: 10, fill: 'var(--color-ink-soft)' }}
                axisLine={{ stroke: 'var(--color-line-soft)' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: 'var(--color-ink-soft)' }}
                axisLine={false}
                tickLine={false}
                width={24}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 8,
                  border: '1.5px solid var(--color-line)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar
                dataKey="Completed"
                fill="var(--color-clay-deep)"
                radius={[4, 4, 0, 0]}
                maxBarSize={18}
              />
              <Bar
                dataKey="Attempted"
                fill="var(--color-chart-attempted)"
                radius={[4, 4, 0, 0]}
                maxBarSize={18}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function OutdoorAnalyticsCharts({
  analytics,
}: {
  analytics: OutdoorAnalytics;
}) {
  const [scale, setScale] = useState<GradeScale>('YOSEMITE');

  return (
    <div data-testid="outdoor-analytics" className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="label-caps text-[9px] text-ink-faint">
          Outdoor Analytics
        </p>
        <GradeScaleToggle scale={scale} onChange={setScale} />
      </div>
      {DISCIPLINES.map((discipline) => (
        <DisciplinePanel
          key={discipline}
          discipline={discipline}
          data={analytics[discipline]}
          scale={scale}
        />
      ))}
    </div>
  );
}
