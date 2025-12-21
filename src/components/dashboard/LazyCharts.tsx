// src/components/dashboard/LazyCharts.tsx
// Lazy-loaded chart components to reduce initial bundle size
'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// Loading placeholder for charts
const ChartLoading = () => (
    <div className="flex items-center justify-center h-96 bg-gray-50 rounded-xl">
        <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
            <p className="text-sm text-gray-500">جاري تحميل الرسم البياني...</p>
        </div>
    </div>
);

// Dynamically import recharts components
export const LazyAreaChart = dynamic(
    () => import('recharts').then(mod => {
        const { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } = mod;
        // Return a component that uses these
        return function LazyArea({ data, dataKey }: { data: Array<Record<string, unknown>>; dataKey: string }) {
            return (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <defs>
                            <linearGradient id="orderAreaGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
                                <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.4} />
                                <stop offset="100%" stopColor="#ec4899" stopOpacity={0.1} />
                            </linearGradient>
                        </defs>
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                border: 'none',
                                borderRadius: '16px',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            }}
                        />
                        <Area type="monotone" dataKey={dataKey} stroke="#3b82f6" strokeWidth={3} fill="url(#orderAreaGradient)" />
                    </AreaChart>
                </ResponsiveContainer>
            );
        };
    }),
    { loading: ChartLoading, ssr: false }
);

export const LazyBarChart = dynamic(
    () => import('recharts').then(mod => {
        const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } = mod;
        return function LazyBars({ data }: { data: Array<Record<string, unknown>> }) {
            return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <defs>
                            <linearGradient id="positiveBarGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6} />
                            </linearGradient>
                            <linearGradient id="negativeBarGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#ef4444" stopOpacity={1} />
                                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.6} />
                            </linearGradient>
                        </defs>
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                border: 'none',
                                borderRadius: '16px',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            }}
                        />
                        <Bar dataKey="positive" fill="url(#positiveBarGradient)" radius={[8, 8, 0, 0]} />
                        <Bar dataKey="negative" fill="url(#negativeBarGradient)" radius={[8, 8, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            );
        };
    }),
    { loading: ChartLoading, ssr: false }
);

export const LazyPieChart = dynamic(
    () => import('recharts').then(mod => {
        const { PieChart, Pie, Cell, Tooltip } = mod;
        return function LazyPie({ data, positiveRate }: { data: Array<Record<string, unknown>>; positiveRate: number }) {
            return (
                <div className="relative" style={{ width: 350, height: 350 }}>
                    <PieChart width={350} height={350}>
                        <defs>
                            <linearGradient id="positiveGradient" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor="#10b981" />
                                <stop offset="100%" stopColor="#047857" />
                            </linearGradient>
                            <linearGradient id="negativeGradient" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor="#ef4444" />
                                <stop offset="100%" stopColor="#b91c1c" />
                            </linearGradient>
                        </defs>
                        <Pie data={data} cx={175} cy={175} innerRadius={80} outerRadius={140} paddingAngle={8} dataKey="value">
                            {data.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={index === 0 ? 'url(#positiveGradient)' : 'url(#negativeGradient)'} />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                border: 'none',
                                borderRadius: '16px',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            }}
                        />
                    </PieChart>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center bg-white/90 rounded-full w-24 h-24 flex flex-col items-center justify-center shadow-2xl">
                            <p className="text-3xl font-bold text-emerald-600">{positiveRate}%</p>
                            <p className="text-xs text-gray-600">إيجابية</p>
                        </div>
                    </div>
                </div>
            );
        };
    }),
    { loading: ChartLoading, ssr: false }
);
